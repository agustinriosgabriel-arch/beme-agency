// lib/mailer.js — transporte SMTP compartido (Hostinger), mismo canal que
// send-email.js / brand-notify.js. Se usa para avisos best-effort (p. ej.
// facturas → finanzas@bemeagency.com) sin acoplar una función a otra por HTTP.
//
// Env vars (Netlify): SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.

const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.hostinger.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || 'contacto@bemeagency.com';
const SMTP_PASS = process.env.SMTP_PASS;

let _transporter = null;
function transporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return _transporter;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function htmlToText(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

// Envoltorio con branding mínimo de BEME (mismo estilo que brand-notify).
function wrap(title, bodyHTML) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="text-align:center;margin-bottom:20px">
    <span style="font-size:24px;font-weight:800;background:linear-gradient(135deg,#b2005d,#9414E0);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">beme</span><span style="color:#b2005d;font-size:24px;font-weight:800">.</span>
  </div>
  <div style="background:#fff;border:1px solid #e8e8e8;border-radius:12px;padding:20px">
    <div style="font-size:16px;font-weight:700;color:#111;margin-bottom:12px">${esc(title)}</div>
    ${bodyHTML}
  </div>
  <div style="text-align:center;margin-top:12px;font-size:10px;color:#bbb">Beme Agency — Notificación automática</div>
</div></body></html>`;
}

// Envío genérico best-effort. Nunca lanza: devuelve {ok:false} si falla o falta SMTP.
async function sendMail({ to, subject, html, text, replyTo }) {
  if (!SMTP_PASS) { console.log('[mailer] SMTP_PASS no configurada — DRY RUN:', to, '—', subject); return { ok: false, dryRun: true }; }
  try {
    const info = await transporter().sendMail({
      from: `"BEME Agency" <${SMTP_USER}>`,
      to,
      subject,
      html,
      text: text || htmlToText(html),
      replyTo: replyTo || SMTP_USER,
    });
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    console.error('[mailer] error:', e.message || e);
    return { ok: false, error: e.message || String(e) };
  }
}

// Aviso a Finanzas cuando un talento sube/genera su factura.
async function sendInvoiceToFinanzas({ talentoNombre, campanaNombre, invoiceUrl, tipo, monto, moneda }) {
  const finanzas = process.env.FINANZAS_EMAIL || 'finanzas@bemeagency.com';
  const montoTxt = (monto != null && monto !== '') ? `${Number(monto).toLocaleString()} ${esc(moneda || '')}` : '—';
  const body = `
    <div style="font-size:13px;color:#666;margin-bottom:12px">Se cargó una factura de talento para revisión y pago.</div>
    <table style="width:100%;font-size:13px;color:#111;border-collapse:collapse">
      <tr><td style="padding:4px 0;color:#888">Talento</td><td style="padding:4px 0;font-weight:700">${esc(talentoNombre || '—')}</td></tr>
      <tr><td style="padding:4px 0;color:#888">Campaña</td><td style="padding:4px 0;font-weight:700">${esc(campanaNombre || '—')}</td></tr>
      <tr><td style="padding:4px 0;color:#888">Origen</td><td style="padding:4px 0">${tipo === 'generada' ? 'Generada en la app' : 'Subida por el talento'}</td></tr>
      <tr><td style="padding:4px 0;color:#888">Monto</td><td style="padding:4px 0">${montoTxt}</td></tr>
    </table>
    ${invoiceUrl ? `<div style="margin-top:16px"><a href="${esc(invoiceUrl)}" style="display:inline-block;padding:10px 20px;background:linear-gradient(135deg,#b2005d,#9414E0);color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:700">Ver / descargar factura →</a></div>` : ''}`;
  const subject = `Nueva factura — ${talentoNombre || 'Talento'} (${campanaNombre || 'campaña'})`;
  return sendMail({ to: finanzas, subject, html: wrap('Factura de talento (CxP)', body) });
}

module.exports = { sendMail, sendInvoiceToFinanzas, wrap, esc };
