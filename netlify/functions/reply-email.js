// Netlify Function: Reply Email (en el hilo, firma BEME, copia en Enviados)
// POST /.netlify/functions/reply-email  { mensaje_id, body, to?, subject? }
//
// - Carga el mensaje recibido de bandeja_mensajes para tomar hilo/remitente/casilla.
// - Responde DESDE la misma casilla (contacto@ / management@) con In-Reply-To +
//   References → queda en el hilo. Firma/membrete BEME (lib/email-signature.js).
// - Sube copia a la carpeta Enviados (IMAP append).
// - Inserta el mensaje 'enviado' en bandeja_mensajes (mismo thread_key) → visible
//   en la conversación. Marca los recibidos del hilo como gestionados.

const nodemailer = require('nodemailer');
const MailComposer = require('nodemailer/lib/mail-composer');
const { corsOrigin } = require('./lib/cors');
const { buildEmailContent } = require('./lib/email-signature');

let ImapFlow, DEP_ERROR = null;
try { ({ ImapFlow } = require('imapflow')); }
catch (e) { DEP_ERROR = e.message || String(e); }

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ngstqwbzvnpggpklifat.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.hostinger.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const IMAP_HOST = process.env.IMAP_HOST || 'imap.hostinger.com';
const IMAP_PORT = Number(process.env.IMAP_PORT || 993);

function credsFor(casilla) {
  if (casilla === 'management') return { user: process.env.IMAP_MGMT_USER || 'management@bemeagency.com', pass: process.env.IMAP_MGMT_PASS };
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
async function appendToSent(creds, raw) {
  if (!ImapFlow) return false; // sin imapflow: igual se envía, solo no se copia a Enviados
  const client = new ImapFlow({ host: IMAP_HOST, port: IMAP_PORT, secure: true, auth: { user: creds.user, pass: creds.pass }, logger: false });
  await client.connect();
  try {
    let mailbox = 'Sent';
    try {
      const list = await client.list();
      const sent = list.find(m => m.specialUse === '\\Sent') || list.find(m => /(^|[./])sent$|enviado/i.test(m.path));
      if (sent) mailbox = sent.path;
    } catch (e) { /* default */ }
    await client.append(mailbox, raw, ['\\Seen']);
    return true;
  } finally { await client.logout().catch(() => {}); }
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
    const { mensaje_id, body, to, subject } = JSON.parse(event.body || '{}');
    if (!mensaje_id || !body) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Faltan campos: mensaje_id, body' }) };

    const rows = await (await fetch(`${SUPABASE_URL}/rest/v1/bandeja_mensajes?id=eq.${encodeURIComponent(mensaje_id)}&select=*&limit=1`, { headers: sbHeaders() })).json();
    const msg = rows && rows[0];
    if (!msg) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Mensaje no encontrado' }) };

    const creds = credsFor(msg.casilla);
    if (!creds.pass) return { statusCode: 500, headers, body: JSON.stringify({ error: `Falta la contraseña de la casilla ${msg.casilla}` }) };

    const dest = to || msg.de_email;
    if (!dest) return { statusCode: 400, headers, body: JSON.stringify({ error: 'El mensaje no tiene remitente para responder' }) };

    let subj = subject || msg.asunto || '';
    if (!/^re:/i.test(subj)) subj = `Re: ${subj}`;

    const references = [msg.thread_references || '', msg.message_id || ''].join(' ').trim();
    const { text, html } = buildEmailContent(body);

    const mailOptions = {
      from: `"BEME Agency" <${creds.user}>`, to: dest, subject: subj, text, html,
      replyTo: creds.user, inReplyTo: msg.message_id || undefined, references: references || undefined,
    };

    const raw = await compileRaw(mailOptions);
    const sentMessageId = (String(raw).match(/^message-id:\s*(<[^>]+>)/im) || [])[1] || '';

    const transporter = nodemailer.createTransport({ host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465, auth: { user: creds.user, pass: creds.pass } });
    await transporter.sendMail({ envelope: { from: creds.user, to: [dest] }, raw });

    let savedToSent = false;
    try { savedToSent = await appendToSent(creds, raw); } catch (e) { console.error('appendToSent:', e.message); }

    // Insertar el mensaje enviado en el mismo hilo
    await fetch(`${SUPABASE_URL}/rest/v1/bandeja_mensajes`, {
      method: 'POST', headers: { ...sbHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        message_id: sentMessageId || `app-${mensaje_id}-${Math.random().toString(36).slice(2)}`,
        thread_key: msg.thread_key || msg.message_id,
        thread_references: references,
        casilla: msg.casilla, direccion: 'enviado',
        de_nombre: 'BEME Agency', de_email: creds.user, para_email: dest,
        asunto: subj, fecha: new Date().toISOString(),
        resumen: '', tag: '', datos: {}, cuerpo_preview: body.slice(0, 3000),
        es_talento_exclusivo: msg.es_talento_exclusivo, talento_id: msg.talento_id, talento_nombre: msg.talento_nombre,
        estado: 'gestionado',
      }),
    }).catch(() => {});

    // Marcar los recibidos del hilo como gestionados
    await fetch(`${SUPABASE_URL}/rest/v1/bandeja_mensajes?casilla=eq.${msg.casilla}&thread_key=eq.${encodeURIComponent(msg.thread_key || msg.message_id)}&direccion=eq.recibido`, {
      method: 'PATCH', headers: { ...sbHeaders(), Prefer: 'return=minimal' }, body: JSON.stringify({ estado: 'gestionado' }),
    }).catch(() => {});

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, messageId: sentMessageId, to: dest, from: creds.user, savedToSent }) };
  } catch (err) {
    console.error('reply-email error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
