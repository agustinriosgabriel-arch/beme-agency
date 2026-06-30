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
const MODEL = process.env.INBOX_MODEL || 'claude-haiku-4-5-20251001';

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
  if (!ids.length) return new Set();
  const inList = ids.map(id => `"${id.replace(/"/g, '')}"`).join(',');
  const rows = await sbSelect(`bandeja_mensajes?select=message_id&message_id=in.(${encodeURIComponent(inList)})`);
  return new Set(rows.map(r => r.message_id));
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
async function classify({ casilla, fromName, fromEmail, subject, body, talento }) {
  const hint = casilla === 'contacto'
    ? 'Casilla "contacto": son talentos/creadores prospectados que responden con el PRECIO (cotización) para una campaña.'
    : `Casilla "management": mails reenviados de un talento exclusivo nuestro${talento ? ' ("' + talento.nombre + '")' : ''}. Pueden ser propuestas, temas de finanzas/pagos, logística o cotizaciones.`;
  const userPrompt = `Clasificá y resumí este correo de una agencia de talentos (BEME). Respondé SOLO JSON válido.

${hint}

DE: ${fromName || ''} <${fromEmail || ''}>
ASUNTO: ${subject || '(sin asunto)'}
CUERPO:
"""
${String(body || '').slice(0, 6000)}
"""

Formato:
{
  "tag": "cotizacion" | "propuesta" | "finanzas" | "logistica" | "spam",
  "resumen": "2 o 3 frases en español con lo importante (montos, plazos, qué pide).",
  "datos": { "precio": "", "moneda": "", "campana": "", "plataformas": [], "tipo_contenido": "", "deadline": "", "monto": "", "asunto_finanzas": "", "telefono": "", "nota": "" }
}
Reglas de tag: 'cotizacion'=pasa un precio/tarifa para una campaña; 'propuesta'=propone idea/colaboración/contenido; 'finanzas'=pagos, facturas, datos bancarios, cobros; 'logistica'=envíos, fechas, dudas operativas/administrativas; 'spam'=basura/promoción no solicitada. Dejá vacío lo que no aparezca. No inventes.`;

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 700, messages: [{ role: 'user', content: userPrompt }] }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const txt = (data.content || []).map(c => c.text || '').join('');
  try {
    const p = JSON.parse(stripJson(txt));
    const tags = ['cotizacion', 'propuesta', 'finanzas', 'logistica', 'spam'];
    if (!tags.includes(p.tag)) p.tag = casilla === 'contacto' ? 'cotizacion' : 'propuesta';
    return p;
  } catch (e) {
    return { tag: casilla === 'contacto' ? 'cotizacion' : 'propuesta', resumen: txt.slice(0, 300), datos: {} };
  }
}

// ── Procesa una carpeta (INBOX=recibido / Sent=enviado) ──
async function processFolder(client, mb, folderPath, direccion, sinceDays, maxPer, dry) {
  const result = { casilla: mb.casilla, carpeta: folderPath, direccion, vistos: 0, nuevos: 0, guardados: 0, errores: 0, omitidos: 0 };
  let lock;
  try { lock = await client.getMailboxLock(folderPath); }
  catch (e) { result.error = `No se pudo abrir ${folderPath}: ${e.message}`; return result; }

  try {
    const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000);
    let uids = [];
    try { uids = await client.search({ since }, { uid: true }); } catch (e) { uids = []; }
    if (!uids || !uids.length) return result;

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
    let fresh = candidates.filter(c => !known.has(c.messageId));
    result.nuevos = fresh.length;
    fresh = fresh.slice(0, maxPer);

    for (const c of fresh) {
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

        // Talento: en management SIEMPRE intentamos vincular por el mail original del reenvío.
        let talento = null;
        const fwd = extractForwardedSender(bodyText);
        const replyTo = (parsed.replyTo && parsed.replyTo.value && parsed.replyTo.value[0] && parsed.replyTo.value[0].address) || '';
        const otherParty = direccion === 'enviado' ? c.toEmail : c.fromEmail;
        const candEmails = [fwd, replyTo.toLowerCase(), otherParty, ...extractEmails(bodyText)].filter(Boolean);
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

async function processMailbox(mb, sinceDays, maxPer, dry) {
  const out = [];
  const client = new ImapFlow({ host: IMAP_HOST, port: IMAP_PORT, secure: true, auth: { user: mb.user, pass: mb.pass }, logger: false });
  await client.connect();
  try {
    out.push(await processFolder(client, mb, 'INBOX', 'recibido', sinceDays, maxPer, dry));
    const sentPath = await findSentFolder(client);
    if (sentPath) out.push(await processFolder(client, mb, sentPath, 'enviado', sinceDays, maxPer, dry));
  } finally { await client.logout().catch(() => {}); }
  return out;
}

exports.handler = async (event) => {
  if (!SUPABASE_KEY) return { statusCode: 500, body: JSON.stringify({ error: 'SUPABASE_SERVICE_KEY no configurada' }) };
  if (!ANTHROPIC_API_KEY) return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY no configurada' }) };

  const q = (event && event.queryStringParameters) || {};
  const sinceDays = Number(q.days || SINCE_DAYS_DEFAULT);
  const maxPer = Number(q.max || MAX_PER_FOLDER);
  const dry = q.dry === '1' || q.dry === 'true';

  const boxes = mailboxes();
  if (!boxes.length) return { statusCode: 200, body: JSON.stringify({ message: 'Sin casillas configuradas (faltan SMTP_PASS / IMAP_MGMT_PASS)' }) };

  let results = [];
  for (const mb of boxes) {
    try { results = results.concat(await processMailbox(mb, sinceDays, maxPer, dry)); }
    catch (e) { console.error(`Casilla ${mb.casilla} falló:`, e.message); results.push({ casilla: mb.casilla, error: e.message }); }
  }
  const guardados = results.reduce((a, r) => a + (r.guardados || 0), 0);
  return { statusCode: 200, body: JSON.stringify({ success: true, dry, sinceDays, maxPer, guardados, results }) };
};
