// Netlify Function: pedido-cliente-api
// POST /.netlify/functions/pedido-cliente-api
// Body: { action, token, ...params }
//
// Portal por MARCA (sin login), accedido por el token de un clientes_link.
// El cliente navega el catálogo público (view talentos_publicos) y arma VARIAS
// propuestas (pedidos_cliente). Cada propuesta guarda su selección + líneas, ve
// los precios que BEME carga y tiene su propio hilo de comentarios.
//
// Acciones (token = clientes_link.token):
//   open    → link (marca/contacto) + todas sus propuestas (con precios/comentarios).
//   save    → crea o actualiza una propuesta (bloqueada si ya se cotizó).
//   comment → agrega un comentario del cliente a una propuesta.
//   delete  → elimina una propuesta del cliente (si no está cotizada).
//
// Env vars (Netlify): SUPABASE_URL, SUPABASE_SERVICE_KEY

const { createClient } = require('@supabase/supabase-js');
const { corsOrigin } = require('./lib/cors');

const SB_URL = process.env.SUPABASE_URL || 'https://ngstqwbzvnpggpklifat.supabase.co';
const SB_SERVICE = process.env.SUPABASE_SERVICE_KEY;

const MAX_ITEMS = 200;
const MAX_LINEAS = 20;
const MAX_DESC = 500;
const MAX_TXT = 200;
const MAX_NOTAS = 2000;
const MAX_BODY = 1_000_000;
const TIPOS = ['accion', 'paquete'];
const MONEDAS = ['USD', 'MXN', 'ARS', 'EUR'];
const LOCKED_STATES = ['cotizado', 'cerrado'];

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

function clampStr(v, max) { return (typeof v === 'string' ? v : '').trim().slice(0, max); }

function cleanLineas(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const l of raw.slice(0, MAX_LINEAS)) {
    if (!l || typeof l !== 'object') continue;
    const descripcion = clampStr(l.descripcion, MAX_DESC);
    if (!descripcion) continue;
    const tipo = TIPOS.includes(l.tipo) ? l.tipo : 'accion';
    out.push({ tipo, descripcion, precio: null });
  }
  return out;
}

function publicItem(it) {
  return {
    id: it.id,
    talento_id: it.talento_id,
    talento_nombre: it.talento_nombre,
    moneda: it.moneda || null,
    lineas: Array.isArray(it.lineas) ? it.lineas.map(l => ({ tipo: l.tipo || 'accion', descripcion: l.descripcion || '', precio: (l.precio == null ? null : l.precio) })) : [],
  };
}

function publicPropuesta(p, items) {
  return {
    id: p.id,
    nombre: p.nombre || '',
    moneda: p.moneda || 'USD',
    estado: p.estado || 'borrador',
    lineas_comunes: Array.isArray(p.lineas_comunes) ? p.lineas_comunes : [],
    comentarios: Array.isArray(p.comentarios) ? p.comentarios : [],
    items: (items || []).map(publicItem),
  };
}

// Valida + expande items del cliente → filas de pedido_cliente_items
async function buildItemRows(sb, propuestaId, bodyItems, lineas_comunes) {
  if (!Array.isArray(bodyItems) || bodyItems.length === 0) return { error: 'Seleccioná al menos un talento' };
  if (bodyItems.length > MAX_ITEMS) return { error: `Máximo ${MAX_ITEMS} talentos` };
  const reqIds = [];
  const seen = new Set();
  for (const it of bodyItems) {
    const id = parseInt(it && it.talento_id, 10);
    if (Number.isInteger(id) && id > 0 && !seen.has(id)) { seen.add(id); reqIds.push(id); }
  }
  if (reqIds.length === 0) return { error: 'Talentos inválidos' };
  const { data: talExist, error: tErr } = await sb.from('talentos').select('id,nombre').in('id', reqIds);
  if (tErr) return { error: tErr.message };
  const nameById = new Map((talExist || []).map(t => [t.id, t.nombre]));
  const rows = [];
  let orden = 0;
  for (const it of bodyItems) {
    const id = parseInt(it && it.talento_id, 10);
    if (!nameById.has(id)) continue;
    const override = cleanLineas(it.lineas_override);
    const lineas = override.length ? override : lineas_comunes.map(l => ({ ...l }));
    rows.push({ pedido_id: propuestaId, talento_id: id, talento_nombre: nameById.get(id) || '', lineas, orden: orden++ });
  }
  if (rows.length === 0) return { error: 'No hay talentos válidos' };
  return { rows };
}

exports.handler = async (event) => {
  const origin = corsOrigin(event);
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true }, origin);
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' }, origin);
  if (!SB_SERVICE) return json(500, { error: 'Falta SUPABASE_SERVICE_KEY en Netlify env vars' }, origin);
  if (event.body && event.body.length > MAX_BODY) return json(413, { error: 'Payload demasiado grande' }, origin);

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'JSON inválido' }, origin); }

  const { action, token } = body;
  if (!action) return json(400, { error: 'Falta action' }, origin);
  if (!token) return json(400, { error: 'Falta token' }, origin);

  const sb = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

  // Validar token → link de marca
  const { data: link, error: lErr } = await sb.from('clientes_link').select('*').eq('token', token).maybeSingle();
  if (lErr) return json(500, { error: lErr.message }, origin);
  if (!link) return json(404, { error: 'Link inválido o vencido', invalid: true }, origin);

  // ── OPEN ──
  if (action === 'open') {
    const { data: props, error: pErr } = await sb
      .from('pedidos_cliente').select('*').eq('cliente_link_id', link.id).order('created_at', { ascending: true });
    if (pErr) return json(500, { error: pErr.message }, origin);
    const ids = (props || []).map(p => p.id);
    let itemsByProp = {};
    if (ids.length) {
      const { data: items, error: iErr } = await sb.from('pedido_cliente_items').select('*').in('pedido_id', ids).order('orden', { ascending: true });
      if (iErr) return json(500, { error: iErr.message }, origin);
      (items || []).forEach(it => { (itemsByProp[it.pedido_id] = itemsByProp[it.pedido_id] || []).push(it); });
    }
    return json(200, {
      ok: true,
      link: { marca_nombre: link.marca_nombre || '', contacto_nombre: link.contacto_nombre || '', contacto_email: link.contacto_email || '' },
      propuestas: (props || []).map(p => publicPropuesta(p, itemsByProp[p.id] || [])),
    }, origin);
  }

  // ── COMMENT ──
  if (action === 'comment') {
    const pid = parseInt(body.propuesta_id, 10);
    const texto = clampStr(body.texto, MAX_NOTAS);
    if (!texto) return json(400, { error: 'Escribí un comentario' }, origin);
    const { data: prop } = await sb.from('pedidos_cliente').select('id,comentarios,cliente_link_id').eq('id', pid).maybeSingle();
    if (!prop || prop.cliente_link_id !== link.id) return json(404, { error: 'Propuesta no encontrada' }, origin);
    const comentarios = Array.isArray(prop.comentarios) ? prop.comentarios : [];
    comentarios.push({ autor: 'cliente', texto, ts: new Date().toISOString() });
    const { error: cErr } = await sb.from('pedidos_cliente').update({ comentarios }).eq('id', pid);
    if (cErr) return json(500, { error: cErr.message }, origin);
    return json(200, { ok: true, comentarios }, origin);
  }

  // ── DELETE ──
  if (action === 'delete') {
    const pid = parseInt(body.propuesta_id, 10);
    const { data: prop } = await sb.from('pedidos_cliente').select('id,estado,cliente_link_id').eq('id', pid).maybeSingle();
    if (!prop || prop.cliente_link_id !== link.id) return json(404, { error: 'Propuesta no encontrada' }, origin);
    if (LOCKED_STATES.includes(prop.estado)) return json(409, { error: 'No podés borrar una propuesta ya cotizada.' }, origin);
    const { error: dErr } = await sb.from('pedidos_cliente').delete().eq('id', pid);
    if (dErr) return json(500, { error: dErr.message }, origin);
    return json(200, { ok: true }, origin);
  }

  // ── SAVE (crear o actualizar propuesta) ──
  if (action === 'save') {
    const lineas_comunes = cleanLineas(body.lineas_comunes);
    const nombre = clampStr(body.nombre, MAX_TXT) || 'Propuesta';
    const moneda = MONEDAS.includes(body.moneda) ? body.moneda : 'USD';
    const notas = clampStr(body.notas, MAX_NOTAS);

    // Actualizar contacto del link (best-effort) si vino
    const contacto_nombre = clampStr(body.contacto_nombre, MAX_TXT);
    const contacto_email = clampStr(body.contacto_email, MAX_TXT);
    if (contacto_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contacto_email)) return json(400, { error: 'Email inválido' }, origin);
    if (contacto_nombre || contacto_email) {
      await sb.from('clientes_link').update({
        contacto_nombre: contacto_nombre || link.contacto_nombre,
        contacto_email: contacto_email || link.contacto_email,
      }).eq('id', link.id);
    }

    const pid = body.propuesta_id ? parseInt(body.propuesta_id, 10) : null;

    if (pid) {
      // Actualizar propuesta existente
      const { data: prop } = await sb.from('pedidos_cliente').select('id,estado,cliente_link_id').eq('id', pid).maybeSingle();
      if (!prop || prop.cliente_link_id !== link.id) return json(404, { error: 'Propuesta no encontrada' }, origin);
      if (LOCKED_STATES.includes(prop.estado)) return json(409, { error: 'Esta propuesta ya fue cotizada por Beme. Creá una nueva para cambiarla.', locked: true }, origin);
      const built = await buildItemRows(sb, pid, body.items, lineas_comunes);
      if (built.error) return json(400, { error: built.error }, origin);
      const { error: uErr } = await sb.from('pedidos_cliente').update({ nombre, notas, moneda, lineas_comunes, estado: 'enviado' }).eq('id', pid);
      if (uErr) return json(500, { error: uErr.message }, origin);
      await sb.from('pedido_cliente_items').delete().eq('pedido_id', pid);
      const { error: e2 } = await sb.from('pedido_cliente_items').insert(built.rows);
      if (e2) return json(500, { error: e2.message }, origin);
      return json(200, { ok: true, propuesta_id: pid }, origin);
    }

    // Crear propuesta nueva
    const { data: nueva, error: nErr } = await sb.from('pedidos_cliente').insert({
      cliente_link_id: link.id, nombre, marca_nombre: link.marca_nombre || '',
      contacto_nombre: contacto_nombre || link.contacto_nombre || '', contacto_email: contacto_email || link.contacto_email || '',
      notas, moneda, lineas_comunes, estado: 'enviado',
    }).select('id').single();
    if (nErr) return json(500, { error: nErr.message }, origin);
    const built = await buildItemRows(sb, nueva.id, body.items, lineas_comunes);
    if (built.error) { await sb.from('pedidos_cliente').delete().eq('id', nueva.id); return json(400, { error: built.error }, origin); }
    const { error: e2 } = await sb.from('pedido_cliente_items').insert(built.rows);
    if (e2) { await sb.from('pedidos_cliente').delete().eq('id', nueva.id); return json(500, { error: e2.message }, origin); }
    return json(200, { ok: true, propuesta_id: nueva.id }, origin);
  }

  return json(400, { error: 'Acción desconocida' }, origin);
};
