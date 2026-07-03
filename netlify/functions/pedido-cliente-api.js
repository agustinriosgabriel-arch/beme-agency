// Netlify Function: pedido-cliente-api
// POST /.netlify/functions/pedido-cliente-api
// Body: { action, token, ...params }
//
// Portal por cliente (sin login), accedido por un token único que genera BEME.
// El cliente navega el catálogo público (view talentos_publicos), arma su
// selección de talentos + líneas de acción/paquete, la guarda, ve los precios
// que BEME va cargando y deja comentarios. Todo por token, con service_role.
//
// Acciones:
//   open    → devuelve el pedido (marca, moneda, estado, comentarios, líneas
//             comunes) + sus items (con precios si BEME ya cotizó).
//   save    → guarda/actualiza la selección del cliente (bloqueado si ya se cotizó).
//   comment → agrega un comentario del cliente al hilo.
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

// [{tipo,descripcion}] → [{tipo,descripcion,precio:null}] (descarta vacíos, fuerza precio null)
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

// Item devuelto al cliente (incluye precios si existen)
function publicItem(it) {
  return {
    id: it.id,
    talento_id: it.talento_id,
    talento_nombre: it.talento_nombre,
    moneda: it.moneda || null,
    lineas: Array.isArray(it.lineas) ? it.lineas.map(l => ({ tipo: l.tipo || 'accion', descripcion: l.descripcion || '', precio: (l.precio == null ? null : l.precio) })) : [],
  };
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

  // Validar token → pedido
  const { data: pedido, error: pErr } = await sb
    .from('pedidos_cliente')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  if (pErr) return json(500, { error: pErr.message }, origin);
  if (!pedido) return json(404, { error: 'Link inválido o vencido', invalid: true }, origin);

  // ── OPEN ──
  if (action === 'open') {
    const { data: items, error: iErr } = await sb
      .from('pedido_cliente_items')
      .select('*')
      .eq('pedido_id', pedido.id)
      .order('orden', { ascending: true });
    if (iErr) return json(500, { error: iErr.message }, origin);
    return json(200, {
      ok: true,
      pedido: {
        marca_nombre: pedido.marca_nombre || '',
        contacto_nombre: pedido.contacto_nombre || '',
        contacto_email: pedido.contacto_email || '',
        notas: pedido.notas || '',
        moneda: pedido.moneda || 'USD',
        estado: pedido.estado || 'borrador',
        lineas_comunes: Array.isArray(pedido.lineas_comunes) ? pedido.lineas_comunes : [],
        comentarios: Array.isArray(pedido.comentarios) ? pedido.comentarios : [],
      },
      items: (items || []).map(publicItem),
    }, origin);
  }

  // ── COMMENT ──
  if (action === 'comment') {
    const texto = clampStr(body.texto, MAX_NOTAS);
    if (!texto) return json(400, { error: 'Escribí un comentario' }, origin);
    const comentarios = Array.isArray(pedido.comentarios) ? pedido.comentarios : [];
    comentarios.push({ autor: 'cliente', texto, ts: new Date().toISOString() });
    const { error: cErr } = await sb.from('pedidos_cliente').update({ comentarios }).eq('id', pedido.id);
    if (cErr) return json(500, { error: cErr.message }, origin);
    return json(200, { ok: true, comentarios }, origin);
  }

  // ── SAVE ──
  if (action === 'save') {
    if (pedido.estado === 'cotizado' || pedido.estado === 'cerrado') {
      return json(409, { error: 'Beme ya envió la cotización. Usá los comentarios para pedir cambios.', locked: true }, origin);
    }

    const lineas_comunes = cleanLineas(body.lineas_comunes);
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return json(400, { error: 'Seleccioná al menos un talento' }, origin);
    }
    if (body.items.length > MAX_ITEMS) return json(400, { error: `Máximo ${MAX_ITEMS} talentos` }, origin);

    // talento_ids válidos, sin duplicar
    const reqIds = [];
    const seen = new Set();
    for (const it of body.items) {
      const id = parseInt(it && it.talento_id, 10);
      if (Number.isInteger(id) && id > 0 && !seen.has(id)) { seen.add(id); reqIds.push(id); }
    }
    if (reqIds.length === 0) return json(400, { error: 'Talentos inválidos' }, origin);

    const { data: talExist, error: tErr } = await sb.from('talentos').select('id,nombre').in('id', reqIds);
    if (tErr) return json(500, { error: tErr.message }, origin);
    const nameById = new Map((talExist || []).map(t => [t.id, t.nombre]));

    const rows = [];
    let orden = 0;
    for (const it of body.items) {
      const id = parseInt(it && it.talento_id, 10);
      if (!nameById.has(id)) continue;
      const override = cleanLineas(it.lineas_override);
      const lineas = override.length ? override : lineas_comunes.map(l => ({ ...l }));
      rows.push({ pedido_id: pedido.id, talento_id: id, talento_nombre: nameById.get(id) || '', lineas, orden: orden++ });
    }
    if (rows.length === 0) return json(400, { error: 'No hay talentos válidos' }, origin);

    // Actualizar header del pedido (sin pisar la marca si el cliente la deja vacía)
    const upd = {
      contacto_nombre: clampStr(body.contacto_nombre, MAX_TXT),
      contacto_email: clampStr(body.contacto_email, MAX_TXT),
      notas: clampStr(body.notas, MAX_NOTAS),
      moneda: MONEDAS.includes(body.moneda) ? body.moneda : (pedido.moneda || 'USD'),
      lineas_comunes,
      estado: 'enviado',
    };
    const marca = clampStr(body.marca_nombre, MAX_TXT);
    if (marca) upd.marca_nombre = marca;
    if (upd.contacto_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(upd.contacto_email)) {
      return json(400, { error: 'Email inválido' }, origin);
    }
    const { error: uErr } = await sb.from('pedidos_cliente').update(upd).eq('id', pedido.id);
    if (uErr) return json(500, { error: uErr.message }, origin);

    // Reemplazar items (aún no hay precios en estado borrador/enviado)
    const { error: dErr } = await sb.from('pedido_cliente_items').delete().eq('pedido_id', pedido.id);
    if (dErr) return json(500, { error: dErr.message }, origin);
    const { error: e2 } = await sb.from('pedido_cliente_items').insert(rows);
    if (e2) return json(500, { error: e2.message }, origin);

    return json(200, { ok: true }, origin);
  }

  return json(400, { error: 'Acción desconocida' }, origin);
};
