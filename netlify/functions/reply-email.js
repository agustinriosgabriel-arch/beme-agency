// Netlify Function: Reply Email (en el hilo, con firma BEME, copia en Enviados)
// POST /.netlify/functions/reply-email  { bandeja_id, body, to?, subject? }
//
// - Carga el mail de bandeja_emails (service key) para tomar message_id /
//   references / remitente / casilla.
// - Responde DESDE la misma casilla que lo recibió (contacto@ o management@),
//   con In-Reply-To + References → queda en el hilo (seguimiento de campaña).
// - Inyecta la firma/membrete BEME (lib/email-signature.js), igual que Hostinger.
// - Sube una copia a la carpeta "Enviados" por IMAP (para que aparezca en webmail).
// - Registra la respuesta en bandeja_respuestas (visible en la app).

const nodemailer = require('nodemailer');
const MailComposer = require('nodemailer/lib/mail-composer');
const { ImapFlow } = require('imapflow');
const { corsOrigin } = require('./lib/cors');
const { buildEmailContent } = require('./lib/email-signature');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ngstqwbzvnpggpklifat.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.hostinger.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const IMAP_HOST = process.env.IMAP_HOST || 'imap.hostinger.com';
const IMAP_PORT = Number(process.env.IMAP_PORT || 993);

// Credenciales SMTP/IMAP por casilla (en Hostinger, IMAP y SMTP comparten contraseña por cuenta).
function credsFor(casilla) {
  if (casilla === 'management') {
    return { user: process.env.IMAP_MGMT_USER || 'management@bemeagency.com', pass: process.env.IMAP_MGMT_PASS };
  }
  return { user: process.env.SMTP_USER || 'contacto@bemeagency.com', pass: process.env.SMTP_PASS };
}

function sbHeaders() {
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
}

function compileRaw(mailOptions) {
  return new Promise((resolve, reject) => {
    new MailComposer(mailOptions).compile().build((err, message) => err ? reject(err) : resolve(message));
  });
}

// Sube una copia a la carpeta Enviados/Sent. Best-effort (no rompe el envío).
async function appendToSent(creds, raw) {
  const client = new ImapFlow({ host: IMAP_HOST, port: IMAP_PORT, secure: true, auth: { user: creds.user, pass: creds.pass }, logger: false });
  await client.connect();
  try {
    let mailbox = 'Sent';
    try {
      const list = await client.list();
      const sent = list.find(m => m.specialUse === '\\Sent') || list.find(m => /(^|[./])sent$|enviado/i.test(m.path));
      if (sent) mailbox = sent.path;
    } catch (e) { /* usa 'Sent' por defecto */ }
    await client.append(mailbox, raw, ['\\Seen']);
    return true;
  } finally {
    await client.logout().catch(() => {});
  }
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': corsOrigin(event),
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!SUPABASE_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'SUPABASE_SERVICE_KEY no configurada' }) };

  try {
    const { bandeja_id, body, to, subject } = JSON.parse(event.body || '{}');
    if (!bandeja_id || !body) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Faltan campos: bandeja_id, body' }) };
    }

    // Cargar el mail original
    const res = await fetch(`${SUPABASE_URL}/rest/v1/bandeja_emails?id=eq.${encodeURIComponent(bandeja_id)}&select=*&limit=1`, { headers: sbHeaders() });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    const mail = (await res.json())[0];
    if (!mail) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Mail no encontrado' }) };

    const creds = credsFor(mail.casilla);
    if (!creds.pass) return { statusCode: 500, headers, body: JSON.stringify({ error: `Falta la contraseña de la casilla ${mail.casilla}` }) };

    const dest = to || mail.remitente_email;
    if (!dest) return { statusCode: 400, headers, body: JSON.stringify({ error: 'El mail no tiene remitente para responder' }) };

    let subj = subject || mail.asunto || '';
    if (!/^re:/i.test(subj)) subj = `Re: ${subj}`;

    // Threading: In-Reply-To = message_id original; References = cadena previa + original
    const references = [mail.thread_references || '', mail.message_id || ''].join(' ').trim();
    const { text, html } = buildEmailContent(body);

    const mailOptions = {
      from: `"BEME Agency" <${creds.user}>`,
      to: dest,
      subject: subj,
      text, html,
      replyTo: creds.user,
      inReplyTo: mail.message_id || undefined,
      references: references || undefined,
    };

    // Compilar una sola vez para usar el mismo mensaje en SMTP y en Enviados.
    const raw = await compileRaw(mailOptions);
    const sentMessageId = (String(raw).match(/^message-id:\s*(<[^>]+>)/im) || [])[1] || '';

    const transporter = nodemailer.createTransport({ host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465, auth: { user: creds.user, pass: creds.pass } });
    await transporter.sendMail({ envelope: { from: creds.user, to: [dest] }, raw });

    let savedToSent = false;
    try { savedToSent = await appendToSent(creds, raw); }
    catch (e) { console.error('appendToSent error:', e.message); }

    // Registrar la respuesta + marcar gestionado
    await fetch(`${SUPABASE_URL}/rest/v1/bandeja_respuestas`, {
      method: 'POST',
      headers: { ...sbHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        bandeja_id, direccion: 'saliente', from_email: creds.user, to_email: dest,
        asunto: subj, cuerpo: body, message_id: sentMessageId, guardado_en_enviados: savedToSent,
      }),
    }).catch(() => {});

    await fetch(`${SUPABASE_URL}/rest/v1/bandeja_emails?id=eq.${encodeURIComponent(bandeja_id)}`, {
      method: 'PATCH',
      headers: { ...sbHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({ estado: 'gestionado', respondido_en: new Date().toISOString() }),
    }).catch(() => {});

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, messageId: sentMessageId, to: dest, from: creds.user, savedToSent }) };
  } catch (err) {
    console.error('reply-email error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
