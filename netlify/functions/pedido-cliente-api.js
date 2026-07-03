// Netlify Function: pedido-cliente-api
// POST /.netlify/functions/pedido-cliente-api
// Body: { action: 'submit', ...datos del pedido }
//
// Puerta de entrada para el "auto-armado de roster" del cliente (sin login):
// el cliente navega el catálogo público (view talentos_publicos), arma una
// selección de talentos + líneas de acción/paquete comunes, y la ENVÍA acá.
// La escritura se hace con service_role (RLS no aplica), validando SIEMPRE el
// input porque viene de un origen anónimo/público.
//
// Env vars (Netlify):
//   SUPABASE_URL          — ya configurada
//   SUPABASE_SERVICE_KEY  — service_role key

const { createClient } = require('@supabase/supabase-js');
const { corsOrigin } = require('./lib/cors');

const SB_URL = process.env.SUPABASE_URL || 'https://ngstqwbzvnpggpklifat.supabase.co';
const SB_SERVICE = process.env.SUPABASE_SERVICE_KEY;

// Límites defensivos (input anónimo = no confiable)
const MAX_ITEMS = 200;              // talentos por pedido
const MAX_LINEAS = 20;              // líneas por talento / comunes
const MAX_DESC = 500;               // largo de una descripción de línea
const MAX_TXT = 200;                // largo de campos de texto cortos (marca, contacto…)
const MAX_NOTAS = 2000;
const MAX_BODY = 1_000_000;         // ~1 MB (el cliente no manda fotos, solo texto+ids)
const TIPOS = ['accion', 'paquete'];

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

function clampStr(v, max) {
  return (typeof v === 'string' ? v : '').trim().slice(0, max);
}

// Normaliza un array de líneas [{tipo, descripcion}] → [{tipo, descripcion, precio:null}]
// Descarta líneas sin descripción. Fuerza precio=null (el cliente NUNCA fija precio).
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

exports.handler = async (event) => {
  const origin = corsOrigin(event);
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true }, origin);
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' }, origin);
  if (!SB_SERVICE) return json(500, { error: 'Falta SUPABASE_SERVICE_KEY en Netlify env vars' }, origin);

  if (event.body && event.body.length > MAX_BODY) {
    return json(413, { error: 'Payload demasiado grande' }, origin);
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'JSON inválido' }, origin); }

  const { action } = body;
  if (action !== 'submit') return json(400, { error: 'Acción desconocida' }, origin);

  // Honeypot anti-spam: si el campo oculto viene relleno, es un bot.
  // Respondemos 200 (para que el bot crea que funcionó) pero no insertamos nada.
  if (typeof body.hp === 'string' && body.hp.trim() !== '') {
    return json(200, { ok: true, ignored: true }, origin);
  }

  // ── Validar header ──
  const marca_nombre = clampStr(body.marca_nombre, MAX_TXT);
  if (!marca_nombre) return json(400, { error: 'Falta el nombre de la marca' }, origin);
  const contacto_nombre = clampStr(body.contacto_nombre, MAX_TXT);
  const contacto_email = clampStr(body.contacto_email, MAX_TXT);
  if (contacto_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contacto_email)) {
    return json(400, { error: 'Email inválido' }, origin);
  }
  const notas = clampStr(body.notas, MAX_NOTAS);

  // ── Validar líneas comunes ──
  const lineas_comunes = cleanLineas(body.lineas_comunes);

  // ── Validar items ──
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return json(400, { error: 'Seleccioná al menos un talento' }, origin);
  }
  if (body.items.length > MAX_ITEMS) {
    return json(400, { error: `Máximo ${MAX_ITEMS} talentos por pedido` }, origin);
  }

  // Recolectar talento_ids válidos (enteros positivos), sin duplicar
  const reqIds = [];
  const seen = new Set();
  for (const it of body.items) {
    const id = parseInt(it && it.talento_id, 10);
    if (Number.isInteger(id) && id > 0 && !seen.has(id)) { seen.add(id); reqIds.push(id); }
  }
  if (reqIds.length === 0) return json(400, { error: 'Talentos inválidos' }, origin);

  const sb = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

  // Confirmar que los talentos existen y tomar el nombre real (no confiar en el cliente)
  const { data: talExist, error: tErr } = await sb
    .from('talentos')
    .select('id,nombre')
    .in('id', reqIds);
  if (tErr) return json(500, { error: tErr.message }, origin);
  const nameById = new Map((talExist || []).map(t => [t.id, t.nombre]));

  // Construir items finales: expandir líneas comunes salvo override por talento
  const rows = [];
  let orden = 0;
  for (const it of body.items) {
    const id = parseInt(it && it.talento_id, 10);
    if (!nameById.has(id)) continue; // descarta ids fantasma
    const override = cleanLineas(it.lineas_override);
    const lineas = override.length ? override : lineas_comunes.map(l => ({ ...l }));
    rows.push({
      talento_id: id,
      talento_nombre: nameById.get(id) || '',
      lineas,
      orden: orden++,
    });
  }
  if (rows.length === 0) return json(400, { error: 'No hay talentos válidos en la selección' }, origin);

  // ── Insert header ──
  const { data: pedido, error: e1 } = await sb
    .from('pedidos_cliente')
    .insert({
      marca_nombre,
      contacto_nombre,
      contacto_email,
      notas,
      lineas_comunes,
      estado: 'enviado',
    })
    .select('id, token')
    .single();
  if (e1) return json(500, { error: e1.message }, origin);

  // ── Insert items (batch atómico) ──
  const { error: e2 } = await sb
    .from('pedido_cliente_items')
    .insert(rows.map(r => ({ ...r, pedido_id: pedido.id })));
  if (e2) {
    // Compensar: borrar el header para no dejar un pedido huérfano sin items
    await sb.from('pedidos_cliente').delete().eq('id', pedido.id);
    return json(500, { error: e2.message }, origin);
  }

  return json(200, { ok: true, pedido_id: pedido.id, token: pedido.token }, origin);
};
