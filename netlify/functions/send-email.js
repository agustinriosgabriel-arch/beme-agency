const nodemailer = require('nodemailer');
const { buildEmailContent } = require('./lib/email-signature');

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

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://bemeagency.netlify.app';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
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

  try {
    const { to, subject, body, replyTo } = JSON.parse(event.body || '{}');

    if (!to || !subject || !body) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Faltan campos: to, subject, body' }) };
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
