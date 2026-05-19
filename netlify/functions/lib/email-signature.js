// Firma + membrete BEME para emails enviados por SMTP.
// Se inyecta en send-email.js y process-email-queue.js para reemplazar
// la firma del webmail de Hostinger (que solo aplica desde la UI web).

const SITE_URL = 'https://bemeagency.netlify.app';
const LOGO_URL = `${SITE_URL}/assets/brand/logos/Beme1Color.png`;

const SIGNER = {
  nombre: 'Florencia Cafure',
  cargo: 'Directora',
  email: 'contacto@bemeagency.com',
  telefono: '+54 9 3515 60-2867',
  telefonoLink: 'https://wa.me/5493515602867',
  web: 'bemeagency.com',
  webLink: 'https://bemeagency.com',
  instagram: '@beme.agency',
  instagramLink: 'https://www.instagram.com/beme.agency/',
};

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Convierte texto plano en HTML preservando saltos de línea y autolinkeando URLs/emails básicos.
function bodyToHtml(text) {
  const escaped = escapeHtml(text || '');
  const linked = escaped
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#b2005d;text-decoration:underline">$1</a>')
    .replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '<a href="mailto:$1" style="color:#b2005d;text-decoration:underline">$1</a>');
  return linked.replace(/\r?\n/g, '<br>');
}

function signatureHtml() {
  return `
  <table cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;border-collapse:collapse;font-family:Arial,Helvetica,sans-serif">
    <tr>
      <td style="padding:0 0 12px 0">
        <div style="height:3px;width:120px;background:linear-gradient(135deg,#b2005d,#9414E0);border-radius:2px"></div>
      </td>
    </tr>
    <tr>
      <td style="padding:0">
        <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
          <tr>
            <td style="vertical-align:middle;padding-right:18px">
              <img src="${LOGO_URL}" alt="BEME Agency" width="96" style="display:block;width:96px;height:auto;border:0;outline:0">
            </td>
            <td style="vertical-align:middle;border-left:2px solid #ececec;padding-left:18px;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;line-height:1.45">
              <div style="font-size:15px;font-weight:700;color:#1a1a1a">${escapeHtml(SIGNER.nombre)}</div>
              <div style="font-size:12px;color:#666;margin-bottom:6px">${escapeHtml(SIGNER.cargo)} · BEME Agency</div>
              <div style="font-size:12px;color:#444">
                <a href="${SIGNER.telefonoLink}" style="color:#444;text-decoration:none">${escapeHtml(SIGNER.telefono)}</a><br>
                <a href="mailto:${SIGNER.email}" style="color:#444;text-decoration:none">${escapeHtml(SIGNER.email)}</a><br>
                <a href="${SIGNER.webLink}" style="color:#444;text-decoration:none">${escapeHtml(SIGNER.web)}</a>
                &nbsp;·&nbsp;
                <a href="${SIGNER.instagramLink}" style="color:#444;text-decoration:none">${escapeHtml(SIGNER.instagram)}</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

function signatureText() {
  return [
    '',
    '--',
    `${SIGNER.nombre}`,
    `${SIGNER.cargo} · BEME Agency`,
    `${SIGNER.telefono}`,
    `${SIGNER.email}`,
    `${SIGNER.web} · ${SIGNER.instagram}`,
  ].join('\n');
}

// Envuelve cuerpo (texto plano) + firma en un HTML completo con membrete.
function wrapHtml(bodyText) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#ffffff">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#ffffff">
    <tr>
      <td align="left" style="padding:24px">
        <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%">
          <tr>
            <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1a1a1a">
              ${bodyToHtml(bodyText)}
              ${signatureHtml()}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildEmailContent(bodyText) {
  return {
    text: `${bodyText || ''}${signatureText()}`,
    html: wrapHtml(bodyText || ''),
  };
}

module.exports = {
  buildEmailContent,
  signatureHtml,
  signatureText,
  wrapHtml,
};
