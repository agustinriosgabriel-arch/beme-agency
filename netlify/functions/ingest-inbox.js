// Netlify Scheduled Function: Ingest Inbox v2 (hilos + recibido/enviado + tags)
// Lee por IMAP, de cada casilla, la carpeta INBOX (recibido) y Enviados (enviado),
// arma hilos (thread_key), clasifica los recibidos con Claude (tag + resumen + datos)
// y, en management@, vincula SIEMPRE el mensaje a un talento exclusivo según el mail
// original del reenvío. Guarda todo en bandeja_mensajes.
//
// Schedule: cada 15 min (netlify.toml). Manual:
//   GET /.netlify/functions/ingest-inbox?days=14&max=12&dry=1
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY,
//      IMAP_HOST (def imap.hostinger.com), IMAP_PORT (def 993),
//      SMTP_USER/SMTP_PASS (contacto@), IMAP_MGMT_USER/IMAP_MGMT_PASS (management@)

const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ngstqwbzvnpggpklifat.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.INBOX_MODEL || 'claude-sonnet-4-6';
const MODEL_FALLBACK = process.env.INBOX_MODEL_FALLBACK || 'claude-sonnet-4-20250514'; // probado en la app

const IMAP_HOST = process.env.IMAP_HOST || 'imap.hostinger.com';
const IMAP_PORT = Number(process.env.IMAP_PORT || 993);

const MAX_PER_FOLDER = Number(process.env.INBOX_MAX_PER_RUN || 8);
const SINCE_DAYS_DEFAULT = Number(process.env.INBOX_SINCE_DAYS || 3);

// Remitentes propios/automáticos que NO son conversaciones reales con talentos.
const SYSTEM_SENDER = /^(contacto|management|notifications?|finanzas|no-?reply|mailer-daemon|postmaster|info|hola|admin)@bemeagency\.com$/i;
const OWN_DOMAIN = /@bemeagency\.com$/i;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function mailboxes() {
  return [
    { casilla: 'contacto',   user: process.env.SMTP_USER || 'contacto@bemeagency.com',   pass: process.env.SMTP_PASS },
    { casilla: 'management', user: process.env.IMAP_MGMT_USER || 'management@bemeagency.com', pass: process.env.IMAP_MGMT_PASS },
  ].filter(m => m.pass);
}

// ── Supabase REST ──
function sbHeaders() {
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
}
async function sbSelect(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders() });
  if (!res.ok) throw new Error(`Supabase select ${res.status}: ${await res.text()}`);
  return res.json();
}
async function sbInsert(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/bandeja_mensajes`, {
    method: 'POST', headers: { ...sbHeaders(), Prefer: 'return=minimal' }, body: JSON.stringify(row),
  });
  if (!res.ok && res.status !== 409) { console.error('insert error:', res.status, await res.text()); return false; }
  return true;
}
async function existingMessageIds(ids) {
  const out = new Set();
  for (let i = 0; i < ids.length; i += 60) { // chunk para no romper el largo de la URL
    const chunk = ids.slice(i, i + 60);
    if (!chunk.length) continue;
    const inList = chunk.map(id => `"${id.replace(/"/g, '')}"`).join(',');
    const rows = await sbSelect(`bandeja_mensajes?select=message_id&message_id=in.(${encodeURIComponent(inList)})`);
    rows.forEach(r => out.add(r.message_id));
  }
  return out;
}
async function threadHasRecibido(casilla, threadKey) {
  if (!threadKey) return false;
  const rows = await sbSelect(`bandeja_mensajes?select=id&casilla=eq.${casilla}&direccion=eq.recibido&thread_key=eq.${encodeURIComponent(threadKey)}&limit=1`);
  return rows.length > 0;
}

const talentCache = new Map();
async function findTalentByEmail(email) {
  if (!email) return null;
  const key = email.toLowerCase().trim();
  if (talentCache.has(key)) return talentCache.get(key);
  let found = null;
  try {
    const rows = await sbSelect(`talentos?select=id,nombre,email&email=ilike.${encodeURIComponent(key)}&limit=1`);
    if (rows && rows.length) found = { id: rows[0].id, nombre: rows[0].nombre };
  } catch (e) { /* ignore */ }
  talentCache.set(key, found);
  return found;
}

// ── Parseo ──
// Saca el remitente ORIGINAL de un mail reenviado (el del talento).
function extractForwardedSender(body) {
  const t = String(body || '');
  const marker = t.search(/-{2,}\s*(forwarded message|mensaje reenviado|original message|mensaje original)|begin forwarded message/i);
  const scope = marker !== -1 ? t.slice(marker, marker + 1200) : t.slice(0, 1200);
  const m = scope.match(/(?:^|\n)\s*(?:From|De|Remitente)\s*:[^\n]*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  return m ? m[1].toLowerCase() : null;
}
function extractEmails(text) {
  const out = new Set();
  (String(text || '').match(EMAIL_RE) || []).forEach(e => { const l = e.toLowerCase(); if (!OWN_DOMAIN.test(l)) out.add(l); });
  return [...out];
}
function headerEmails(parsed, name) {
  try { const v = parsed.headers && parsed.headers.get(name); if (!v) return []; return (String(v).match(EMAIL_RE) || []).map(e => e.toLowerCase()); } catch (e) { return []; }
}
// Junta TODOS los emails posibles (envelope, headers de reenvío, cuerpo) para
// vincular el mensaje a uno de nuestros talentos exclusivos.
function collectCandidateEmails(parsed, bodyText, c, direccion) {
  const set = new Set();
  const add = e => { if (e) { const l = String(e).toLowerCase().trim(); if (l.includes('@') && !OWN_DOMAIN.test(l)) set.add(l); } };
  add(direccion === 'enviado' ? c.toEmail : c.fromEmail);
  ['from', 'to', 'cc', 'replyTo'].forEach(k => { const a = parsed[k]; if (a && a.value) a.value.forEach(v => add(v.address)); });
  ['delivered-to', 'return-path', 'x-forwarded-for', 'x-forwarded-to', 'x-original-to'].forEach(h => headerEmails(parsed, h).forEach(add));
  add(extractForwardedSender(bodyText));
  extractEmails(bodyText).forEach(add);
  return [...set];
}
function refsToString(parsed) {
  const parts = [];
  if (parsed.references) parts.push(...(Array.isArray(parsed.references) ? parsed.references : [parsed.references]));
  if (parsed.inReplyTo) parts.push(parsed.inReplyTo);
  return [...new Set(parts.filter(Boolean))].join(' ').trim();
}
function threadKeyOf(parsed, messageId) {
  let refs = parsed.references;
  if (refs) { refs = Array.isArray(refs) ? refs : [refs]; if (refs.length) return refs[0]; }
  if (parsed.inReplyTo) return Array.isArray(parsed.inReplyTo) ? parsed.inReplyTo[0] : parsed.inReplyTo;
  return messageId;
}

// ── Clasificación (solo recibidos) ──
function stripJson(s) {
  let t = String(s || '').trim();
  const f = t.match(/```(?:json)?\s*([\s\S]*?)```/i); if (f) t = f[1].trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a !== -1 && b !== -1) t = t.slice(a, b + 1);
  return t;
}
async function anthropic(userPrompt) {
  const callModel = async (model) => fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 900, messages: [{ role: 'user', content: userPrompt }] }),
  });
  let res = await callModel(MODEL);
  if (!res.ok && MODEL_FALLBACK && MODEL_FALLBACK !== MODEL) {
    const errTxt = await res.text();
    console.error(`Modelo ${MODEL} falló (${res.status}: ${errTxt.slice(0, 120)}) — uso ${MODEL_FALLBACK}`);
    res = await callModel(MODEL_FALLBACK);
  }
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.content || []).map(c => c.text || '').join('');
}

async function classify({ casilla, fromName, fromEmail, subject, body, talento }) {
  const ctx = casilla === 'contacto'
    ? 'CASILLA CONTACTO: acá RECIBIMOS las cotizaciones de creadores que prospectamos. Nosotros les escribimos pidiendo su PRECIO para una campaña y ellos responden con su tarifa.'
    : 'CASILLA MANAGEMENT: bandeja de nuestros 3 talentos EXCLUSIVOS (Fer Goñi, Brenda Jair, Vicca). Llegan (reenviadas) las PROPUESTAS de marcas para esos talentos y toda su negociación, cierre y pago.';
  const tHint = talento ? `Este mail está vinculado a nuestro talento: "${talento.nombre}".` : '';

  const userPrompt = `Sos analista de una agencia de talentos e influencers (BEME). Leé el CONTENIDO del correo y clasificá según de qué se está hablando realmente. Respondé SOLO con JSON válido.

${ctx}
${tHint}

DE: ${fromName || ''} <${fromEmail || ''}>
ASUNTO: ${subject || '(sin asunto)'}
CUERPO:
"""
${String(body || '').slice(0, 7000)}
"""

ETIQUETAS (elegí UNA según el contenido):
- "cotizacion": SOLO en contacto — un creador prospectado nos pasa o negocia su PRECIO/tarifa para una campaña.
- "propuesta": un negocio entre una MARCA y un talento exclusivo nuestro, EN CUALQUIER ETAPA: la marca propone; la negociación; cuando NOSOTROS le mandamos nuestra cotización/presupuesto a la marca (sigue siendo propuesta); y el CIERRE, cuando la marca acepta y manda el precio final o las condiciones de pago. El cierre SIGUE siendo 'propuesta', NO es finanzas.
- "finanzas": SOLO la ejecución de un pago YA cerrado: facturas, comprobantes de transferencia, datos bancarios, cobros o recordatorios de pago.
- "logistica": envíos de producto, fechas/agenda, coordinación operativa o dudas administrativas.
- "spam": no solicitado, promociones, newsletters.

EJEMPLOS:
- "Somos [Marca], queremos que [talento] participe en nuestra campaña..." → propuesta (etapa: nueva)
- (nosotros→marca) "Les paso nuestra cotización: 1 reel + 2 historias = $X" → propuesta (etapa: negociacion)
- (marca→nosotros) "Aprobado, $X, el pago es a 30 días contra factura" → propuesta (etapa: cierre)
- "Adjunto la factura / el comprobante de transferencia / los datos bancarios" → finanzas
- (creador prospectado en contacto) "Mi tarifa por el reel es $X" → cotizacion

Devolvé:
{
  "tag": "cotizacion|propuesta|finanzas|logistica|spam",
  "etapa": "nueva|negociacion|cierre|"  (solo si tag=propuesta; si no, ""),
  "resumen": "2-3 frases concretas: marca o creador, qué se pide/ofrece, montos y plazos si los hay.",
  "datos": { "marca": "", "talento": "", "monto": "", "moneda": "", "campana": "", "plataformas": [], "deadline": "", "tipo_contenido": "", "telefono": "", "nota": "" }
}
No inventes; dejá vacío lo que no aparezca.`;

  const txt = await anthropic(userPrompt);
  let p;
  try { p = JSON.parse(stripJson(txt)); }
  catch (e) { p = { tag: casilla === 'contacto' ? 'cotizacion' : 'propuesta', resumen: txt.slice(0, 300), datos: {} }; }
  const tags = ['cotizacion', 'propuesta', 'finanzas', 'logistica', 'spam'];
  if (!tags.includes(p.tag)) p.tag = casilla === 'contacto' ? 'cotizacion' : 'propuesta';
  if (!p.datos) p.datos = {};
  if (p.etapa) p.datos.etapa = p.etapa;
  return p;
}

// ── Procesa una carpeta (INBOX=recibido / Sent=enviado) ──
async function processFolder(client, mb, folderPath, direccion, sinceDays, dry, state) {
  const result = { casilla: mb.casilla, carpeta: folderPath, direccion, vistos: 0, nuevos: 0, guardados: 0, errores: 0, omitidos: 0, diferidos: 0 };
  let lock;
  try { lock = await client.getMailboxLock(folderPath); }
  catch (e) { result.error = `No se pudo abrir ${folderPath}: ${e.message}`; return result; }

  try {
    const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000);
    let uids = [];
    try { uids = await client.search({ since }, { uid: true }); } catch (e) { uids = []; }
    if (!uids || !uids.length) return result;
    if (uids.length > 200) uids = uids.slice(-200); // solo los más recientes

    const candidates = [];
    for await (const msg of client.fetch(uids, { envelope: true }, { uid: true })) {
      const env = msg.envelope || {};
      if (!env.messageId) continue;
      const fromAddr = (env.from && env.from[0]) || {};
      const toAddr = (env.to && env.to[0]) || {};
      const fromEmail = (fromAddr.address || '').toLowerCase();
      result.vistos++;
      if (direccion === 'recibido' && SYSTEM_SENDER.test(fromEmail)) { result.omitidos++; continue; }
      candidates.push({
        uid: msg.uid, messageId: env.messageId,
        fromName: fromAddr.name || '', fromEmail,
        toEmail: (toAddr.address || '').toLowerCase(),
        subject: env.subject || '', date: env.date || null,
      });
    }

    const known = await existingMessageIds(candidates.map(c => c.messageId));
    const fresh = candidates.filter(c => !known.has(c.messageId));
    result.nuevos = fresh.length;

    for (const c of fresh) {
      // Presupuesto global + deadline para no pasarnos del timeout de Netlify
      if (state.budget <= 0 || (Date.now() - state.startedAt) > state.deadlineMs) { result.diferidos++; continue; }
      state.budget--;
      try {
        const full = await client.fetchOne(c.uid, { source: true }, { uid: true });
        const parsed = await simpleParser(full.source);
        const bodyText = (parsed.text || (parsed.html ? String(parsed.html).replace(/<[^>]+>/g, ' ') : '') || '').trim();
        const threadKey = threadKeyOf(parsed, c.messageId);

        // Para Enviados: solo guardamos si el hilo ya tiene un recibido (evita
        // arrastrar TODO el saliente de prospección que no tuvo respuesta).
        if (direccion === 'enviado') {
          const belongs = await threadHasRecibido(mb.casilla, threadKey);
          if (!belongs) { result.omitidos++; continue; }
        }

        // Talento: vincular por cualquier email que aparezca (headers + reenvío + cuerpo).
        let talento = null;
        const candEmails = collectCandidateEmails(parsed, bodyText, c, direccion);
        for (const em of candEmails) { talento = await findTalentByEmail(em); if (talento) break; }

        let tag = '', resumen = '', datos = {};
        if (direccion === 'recibido') {
          const ai = await classify({ casilla: mb.casilla, fromName: c.fromName, fromEmail: c.fromEmail, subject: c.subject, body: bodyText, talento });
          tag = ai.tag || ''; resumen = ai.resumen || ''; datos = ai.datos || {};
        }

        const row = {
          message_id: c.messageId,
          thread_key: threadKey,
          thread_references: refsToString(parsed),
          casilla: mb.casilla,
          direccion,
          de_nombre: direccion === 'enviado' ? 'BEME Agency' : (c.fromName || ''),
          de_email: direccion === 'enviado' ? mb.user : c.fromEmail,
          para_email: direccion === 'enviado' ? c.toEmail : mb.user,
          asunto: c.subject,
          fecha: (c.date ? new Date(c.date) : (parsed.date || new Date())).toISOString(),
          resumen, tag, datos,
          cuerpo_preview: bodyText.slice(0, 3000),
          es_talento_exclusivo: !!talento,
          talento_id: talento ? talento.id : null,
          talento_nombre: talento ? talento.nombre : '',
          estado: direccion === 'enviado' ? 'gestionado' : 'nuevo',
        };

        if (dry) { console.log('[dry]', mb.casilla, direccion, c.fromEmail, '→', tag, talento ? '['+talento.nombre+']' : ''); result.guardados++; }
        else if (await sbInsert(row)) result.guardados++;
      } catch (e) { result.errores++; console.error(`Error ${c.messageId}:`, e.message); }
    }
  } finally { lock.release(); }
  return result;
}

async function findSentFolder(client) {
  try {
    const list = await client.list();
    const sent = list.find(m => m.specialUse === '\\Sent') || list.find(m => /(^|[./])sent$|enviado/i.test(m.path));
    return sent ? sent.path : null;
  } catch (e) { return null; }
}

async function processMailbox(mb, sinceDays, dry, state) {
  const out = [];
  if (state.budget <= 0) return out;
  const client = new ImapFlow({ host: IMAP_HOST, port: IMAP_PORT, secure: true, auth: { user: mb.user, pass: mb.pass }, logger: false });
  await client.connect();
  try {
    out.push(await processFolder(client, mb, 'INBOX', 'recibido', sinceDays, dry, state));
    const sentPath = await findSentFolder(client);
    if (sentPath && state.budget > 0) out.push(await processFolder(client, mb, sentPath, 'enviado', sinceDays, dry, state));
  } finally { await client.logout().catch(() => {}); }
  return out;
}

exports.handler = async (event) => {
  if (!SUPABASE_KEY) return { statusCode: 500, body: JSON.stringify({ error: 'SUPABASE_SERVICE_KEY no configurada' }) };
  if (!ANTHROPIC_API_KEY) return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY no configurada' }) };

  try {
    const q = (event && event.queryStringParameters) || {};
    const sinceDays = Number(q.days || SINCE_DAYS_DEFAULT);
    const budgetTotal = Number(q.max || MAX_PER_FOLDER); // tope TOTAL de mensajes nuevos por corrida
    const dry = q.dry === '1' || q.dry === 'true';
    const state = { budget: budgetTotal, startedAt: Date.now(), deadlineMs: Number(process.env.INBOX_DEADLINE_MS || 22000) };

    const boxes = mailboxes();
    if (!boxes.length) return { statusCode: 200, body: JSON.stringify({ message: 'Sin casillas configuradas (faltan SMTP_PASS / IMAP_MGMT_PASS)' }) };

    let results = [];
    for (const mb of boxes) {
      try { results = results.concat(await processMailbox(mb, sinceDays, dry, state)); }
      catch (e) { console.error(`Casilla ${mb.casilla} falló:`, e.message); results.push({ casilla: mb.casilla, error: e.message }); }
    }
    const guardados = results.reduce((a, r) => a + (r.guardados || 0), 0);
    const diferidos = results.reduce((a, r) => a + (r.diferidos || 0), 0);
    return { statusCode: 200, body: JSON.stringify({ success: true, dry, sinceDays, guardados, diferidos, results }) };
  } catch (err) {
    console.error('ingest-inbox fatal:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || String(err) }) };
  }
};
