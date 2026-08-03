// lib/auth.js — verificación de sesión para las functions que actúan en nombre
// de un usuario interno (envío de mail, tareas de admin, etc).
//
// Toda function que pueda mandar correo DEBE pasar por acá. Sin esto el endpoint
// queda como open relay: cualquiera en internet puede hacer POST y mandar mails
// desde contacto@bemeagency.com. El CORS no protege nada — un POST desde curl o
// desde un script en un servidor ignora por completo los headers de CORS.
//
// El token viaja en `Authorization: Bearer <access_token>` (el JWT de la sesión
// de Supabase del usuario logueado). Se acepta `callerToken` en el body como
// compatibilidad con admin-set-password.
//
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY.

const { createClient } = require('@supabase/supabase-js');

const SB_URL = process.env.SUPABASE_URL || 'https://ngstqwbzvnpggpklifat.supabase.co';
const SB_SERVICE = process.env.SUPABASE_SERVICE_KEY;

const INTERNAL_ROLES = ['admin', 'campaign_manager'];

function bearerToken(event) {
  const h = (event && event.headers) || {};
  const raw = h.authorization || h.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim());
  if (m) return m[1].trim();
  if (event && event.body) {
    try {
      const b = JSON.parse(event.body);
      if (b && typeof b.callerToken === 'string') return b.callerToken;
    } catch { /* body no-JSON: sin token */ }
  }
  return '';
}

// Devuelve { ok:true, user, role } o { ok:false, status, error }.
async function requireInternalUser(event) {
  if (!SB_SERVICE) {
    return { ok: false, status: 500, error: 'Falta SUPABASE_SERVICE_KEY en Netlify env vars' };
  }

  const token = bearerToken(event);
  if (!token) return { ok: false, status: 401, error: 'Falta el token de sesión' };

  const sbAdmin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

  const { data: userData, error: uErr } = await sbAdmin.auth.getUser(token);
  if (uErr || !userData?.user) return { ok: false, status: 401, error: 'Token de sesión inválido' };

  const { data: profile } = await sbAdmin
    .from('user_profiles').select('role').eq('id', userData.user.id).single();

  if (!profile || !INTERNAL_ROLES.includes(profile.role)) {
    return { ok: false, status: 403, error: 'No tenés permiso para esta acción' };
  }

  return { ok: true, user: userData.user, role: profile.role };
}

// Secreto compartido para invocaciones manuales sin sesión (pruebas, cron externo).
// Se pasa por header `x-beme-admin-secret` o query `?secret=`. Si la env var no
// está definida el modo queda deshabilitado — nunca "abierto por defecto".
function hasAdminSecret(event) {
  const expected = process.env.ADMIN_TASK_SECRET;
  if (!expected) return false;
  const h = (event && event.headers) || {};
  const q = (event && event.queryStringParameters) || {};
  const given = h['x-beme-admin-secret'] || h['X-Beme-Admin-Secret'] || q.secret || '';
  return Boolean(given) && given === expected;
}

// Un solo destinatario, sintaxis válida y sin CRLF (evita header injection).
const EMAIL_RE = /^[^\s@,;<>"']+@[^\s@,;<>"'.]+(\.[^\s@,;<>"'.]+)+$/;

function isValidEmail(v) {
  return typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v.trim());
}

module.exports = { requireInternalUser, hasAdminSecret, isValidEmail, INTERNAL_ROLES };
