// Netlify Function: notify-cambio
// POST /.netlify/functions/notify-cambio
// Body: { campana_id, contenido_id?, actor_tipo:'talento'|'marca', actor_nombre, accion, exclude_user_id? }
//
// Endpoint para los flujos CON login (talento-portal.html, campana-detalle.html como handler).
// Esos frontends escriben con la sesión del usuario (RLS), pero NO pueden insertar `alertas`
// para otros usuarios (la policy exige is_internal()). Por eso delegan acá, que corre con el
// service_role y crea las alertas in-app vía lib/registrar-cambio.
//
// Los flujos por magic-link (sin login) NO usan este endpoint: magic-api.js llama a
// registrarCambio() directamente.

const { createClient } = require('@supabase/supabase-js');
const { corsOrigin } = require('./lib/cors');
const { registrarCambio } = require('./lib/registrar-cambio');

const SB_URL = process.env.SUPABASE_URL || 'https://ngstqwbzvnpggpklifat.supabase.co';
const SB_SERVICE = process.env.SUPABASE_SERVICE_KEY;

function json(statusCode, body, origin) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin',
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  const origin = corsOrigin(event);
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true }, origin);
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' }, origin);
  if (!SB_SERVICE) return json(500, { error: 'Falta SUPABASE_SERVICE_KEY en Netlify env vars' }, origin);

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'JSON inválido' }, origin); }

  const { campana_id, contenido_id, actor_tipo, actor_nombre, accion, exclude_user_id } = body;
  if (!campana_id || !accion) return json(400, { error: 'Faltan campana_id o accion' }, origin);
  if (!['talento', 'marca'].includes(actor_tipo)) return json(400, { error: 'actor_tipo inválido' }, origin);

  const sb = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

  try {
    const result = await registrarCambio(sb, {
      campana_id, contenido_id: contenido_id || null, actor_tipo,
      actor_nombre, accion, exclude_user_id: exclude_user_id || null,
    });
    return json(200, result, origin);
  } catch (e) {
    console.error('notify-cambio error:', e);
    return json(500, { error: e.message || 'Error desconocido' }, origin);
  }
};
