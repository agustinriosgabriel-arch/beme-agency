// Netlify Function: send-email
// POST /.netlify/functions/send-email
// Body: { to, subject, body, replyTo? }  +  Authorization: Bearer <access_token>
//
// SEGURIDAD: este endpoint manda correo desde contacto@bemeagency.com. Es
// obligatorio validar la sesión del usuario interno que lo invoca. Sin esa
// validación queda como open relay abierto a internet y se usa para spam
// (el CORS no protege: un POST desde curl o desde un servidor lo ignora).
// No quitar `requireInternalUser`.

const nodemailer = require('nodemailer');
const { buildEmailContent } = require('./lib/email-signature');
const { requireInternalUser, isValidEmail } = require('./lib/auth');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.hostinger.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || 'contacto@bemeagency.com';
const SMTP_PASS = process.env.SMTP_PASS; // configurar en Netlify → Environment variables

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: true,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

const { corsOrigin } = require('./lib/cors');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': corsOrigin(event),
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (!SMTP_PASS) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'SMTP_PASS no configurada en Netlify env vars' }) };
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Solo usuarios internos logueados (admin / campaign_manager).
  const auth = await requireInternalUser(event);
  if (!auth.ok) {
    return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };
  }

  try {
    const { to, subject, body, replyTo } = JSON.parse(event.body || '{}');

    if (!to || !subject || !body) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Faltan campos: to, subject, body' }) };
    }

    // Un único destinatario válido. Bloquea listas ("a@x,b@y") y CRLF en los
    // headers, que permitirían inyectar Bcc y convertir esto en un difusor.
    if (!isValidEmail(to)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Destinatario inválido: debe ser un único email' }) };
    }
    if (replyTo && !isValidEmail(replyTo)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'replyTo inválido' }) };
    }
    if (/[\r\n]/.test(String(subject))) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Asunto inválido' }) };
    }

    const { text, html } = buildEmailContent(body);

    const mailOptions = {
      from: `"BEME Agency" <${SMTP_USER}>`,
      to,
      bcc: SMTP_USER,
      subject,
      text,
      html,
      replyTo: replyTo || SMTP_USER,
    };

    const info = await transporter.sendMail(mailOptions);

    // Trazabilidad: queda en los logs de Netlify quién disparó cada envío.
    console.log(`[send-email] ${auth.user.email} → ${to} — "${subject}"`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        messageId: info.messageId,
        accepted: info.accepted || [],
        rejected: info.rejected || [],
        response: info.response || '',
      }),
    };
  } catch (err) {
    console.error('send-email error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
