// CORS allowlist compartido por todas las functions.
// El sitio corre en app.bemeagency.com (dominio custom) y bemeagency.netlify.app —
// devolvemos el Origin del request solo si está en la lista; si no, el primero.
// Se puede sobreescribir con ALLOWED_ORIGIN (separado por comas) en Netlify env vars.

const DEFAULT_ORIGINS = [
  'https://app.bemeagency.com',
  'https://bemeagency.netlify.app',
];

function corsOrigin(event) {
  const fromEnv = (process.env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  const list = fromEnv.length ? fromEnv : DEFAULT_ORIGINS;
  const h = (event && event.headers) || {};
  const origin = h.origin || h.Origin || '';
  return list.includes(origin) ? origin : list[0];
}

module.exports = { corsOrigin };
