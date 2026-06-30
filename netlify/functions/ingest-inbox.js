// Netlify Scheduled Function: Ingest Inbox
// Lee por IMAP las casillas contacto@ (cotizaciones de marcas) y management@
// (propuestas / cotizaciones de creadores), clasifica + resume + extrae datos
// con Claude, detecta si el remitente es un talento exclusivo nuestro y guarda
// un resumen en la tabla bandeja_emails.
//
// Schedule: cada 15 min (ver netlify.toml). También se puede disparar manual:
//   GET /.netlify/functions/ingest-inbox?days=3&dry=1
//
// Env vars (Netlify):
//   SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY
//   IMAP_HOST (def imap.hostinger.com), IMAP_PORT (def 993)
//   SMTP_USER / SMTP_PASS                 → casilla contacto@
//   IMAP_MGMT_USER / IMAP_MGMT_PASS       → casilla management@

const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ngstqwbzvnpggpklifat.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // requerido para bypass RLS
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.INBOX_MODEL || 'claude-haiku-4-5-20251001';

const IMAP_HOST = process.env.IMAP_HOST || 'imap.hostinger.com';
const IMAP_PORT = Number(process.env.IMAP_PORT || 993);

const MAX_PER_MAILBOX = Number(process.env.INBOX_MAX_PER_RUN || 5); // cap por casilla por corrida
const SINCE_DAYS_DEFAULT = Number(process.env.INBOX_SINCE_DAYS || 3);

// Casillas a procesar. Si no hay pass configurada, se omite (p. ej. management
// hasta que se cargue IMAP_MGMT_PASS).
function mailboxes() {
  return [
    {
      casilla: 'contacto',
      user: process.env.SMTP_USER || 'contacto@bemeagency.com',
      pass: process.env.SMTP_PASS,
    },
    {
      casilla: 'management',
      user: process.env.IMAP_MGMT_USER || 'management@bemeagency.com',
      pass: process.env.IMAP_MGMT_PASS,
    },
  ].filter(m => m.pass);
}

// ── Supabase REST helpers (service key) ──────────────────
function sbHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function sbSelect(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders() });
  if (!res.ok) throw new Error(`Supabase select ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbInsert(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/bandeja_emails`, {
    method: 'POST',
    headers: { ...sbHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });
  // 409 = duplicate message_id (carrera) → lo ignoramos
  if (!res.ok && res.status !== 409) {
    console.error('Supabase insert error:', res.status, await res.text());
    return false;
  }
  return true;
}

// Devuelve el set de message_ids ya guardados de entre los candidatos.
async function existingMessageIds(ids) {
  if (!ids.length) return new Set();
  const inList = ids.map(id => `"${id.replace(/"/g, '')}"`).join(',');
  const rows = await sbSelect(`bandeja_emails?select=message_id&message_id=in.(${encodeURIComponent(inList)})`);
  return new Set(rows.map(r => r.message_id));
}

// Busca un talento por email (case-insensitive). Cachea resultados.
const talentCache = new Map();
async function findTalentByEmail(email) {
  if (!email) return null;
  const key = email.toLowerCase().trim();
  if (talentCache.has(key)) return talentCache.get(key);
  let found = null;
  try {
    const rows = await sbSelect(`talentos?select=id,nombre,email&email=ilike.${encodeURIComponent(key)}&limit=1`);
    if (rows && rows.length) found = { id: rows[0].id, nombre: rows[0].nombre };
  } catch (e) { console.log('findTalentByEmail error:', e.message); }
  talentCache.set(key, found);
  return found;
}

// ── Utilidades de parseo ─────────────────────────────────
const OWN_DOMAIN = /@bemeagency\.com$/i;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function extractEmails(text) {
  const out = new Set();
  (String(text || '').match(EMAIL_RE) || []).forEach(e => {
    const low = e.toLowerCase();
    if (!OWN_DOMAIN.test(low)) out.add(low);
  });
  return [...out];
}

function refsToString(parsed) {
  const parts = [];
  if (parsed.references) parts.push(...(Array.isArray(parsed.references) ? parsed.references : [parsed.references]));
  if (parsed.inReplyTo) parts.push(parsed.inReplyTo);
  return [...new Set(parts)].join(' ').trim();
}

// ── Clasificación con Claude ─────────────────────────────
function stripJson(s) {
  let t = String(s || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const a = t.indexOf('{'); const b = t.lastIndexOf('}');
  if (a !== -1 && b !== -1) t = t.slice(a, b + 1);
  return t;
}

async function classifyEmail({ casilla, fromName, fromEmail, subject, body, talento }) {
  const hintTalento = talento
    ? `El remitente ES un talento exclusivo nuestro: "${talento.nombre}". Suele estar cotizando su tarifa para una campaña (tipo "cotizacion").`
    : 'El remitente no figura como talento nuestro.';
  const hintCasilla = casilla === 'contacto'
    ? 'Casilla "contacto": suelen ser marcas/agencias pidiendo una cotización para una colaboración.'
    : 'Casilla "management": suelen ser propuestas de creadores que quieren sumarse, o cotizaciones reenviadas de nuestros talentos.';

  const userPrompt = `Clasificá y resumí este correo entrante de una agencia de talentos e influencers (BEME). Respondé SOLO con JSON válido, sin texto extra.

${hintCasilla}
${hintTalento}

DE: ${fromName || ''} <${fromEmail || ''}>
ASUNTO: ${subject || '(sin asunto)'}
CUERPO:
"""
${String(body || '').slice(0, 6000)}
"""

Devolvé exactamente este formato:
{
  "tipo": "cotizacion" | "propuesta",
  "resumen": "2 o 3 frases en español: qué piden u ofrecen y los datos clave (montos, plazos, redes).",
  "datos": {
    "marca": "",
    "campana": "",
    "contacto_nombre": "",
    "telefono": "",
    "producto": "",
    "plataformas": [],
    "tipo_contenido": "",
    "presupuesto": "",
    "moneda": "",
    "deadline": "",
    "creador": "",
    "instagram": "",
    "tiktok": "",
    "youtube": "",
    "seguidores": "",
    "categorias": [],
    "ubicacion": "",
    "tarifa": ""
  }
}
Reglas: dejá vacío "" o [] lo que no aparezca. "tipo"='cotizacion' si alguien pide o entrega un precio/tarifa para una campaña; 'propuesta' si un creador se ofrece para sumarse al roster. No inventes datos.`;

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 800,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const txt = (data.content || []).map(c => c.text || '').join('');
  let parsed;
  try { parsed = JSON.parse(stripJson(txt)); }
  catch (e) { parsed = { tipo: casilla === 'contacto' ? 'cotizacion' : 'propuesta', resumen: txt.slice(0, 400), datos: {} }; }
  return parsed;
}

// ── Procesa una casilla ──────────────────────────────────
async function processMailbox(mb, sinceDays, dry) {
  const result = { casilla: mb.casilla, vistos: 0, nuevos: 0, guardados: 0, errores: 0 };
  const client = new ImapFlow({
    host: IMAP_HOST, port: IMAP_PORT, secure: true,
    auth: { user: mb.user, pass: mb.pass },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  try {
    const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000);

    // 1) Buscar UIDs recientes y traer su envelope (liviano)
    let uids = [];
    try { uids = await client.search({ since }, { uid: true }); } catch (e) { uids = []; }
    const candidates = [];
    if (uids && uids.length) {
      for await (const msg of client.fetch(uids, { envelope: true }, { uid: true })) {
        const env = msg.envelope || {};
        const fromAddr = (env.from && env.from[0]) || {};
        const fromEmail = (fromAddr.address || '').toLowerCase();
        result.vistos++;
        if (!env.messageId) continue;
        if (OWN_DOMAIN.test(fromEmail)) continue; // ignora correos internos / propios
        candidates.push({
          uid: msg.uid,
          messageId: env.messageId,
          fromName: fromAddr.name || '',
          fromEmail,
          subject: env.subject || '',
          date: env.date || null,
        });
      }
    }

    // 2) Quitar los que ya están en la base
    const known = await existingMessageIds(candidates.map(c => c.messageId));
    let fresh = candidates.filter(c => !known.has(c.messageId));
    result.nuevos = fresh.length;
    fresh = fresh.slice(0, MAX_PER_MAILBOX); // cap por corrida (el resto entra en la próxima)

    // 3) Procesar cada nuevo: bajar cuerpo, match talento, clasificar, guardar
    for (const c of fresh) {
      try {
        const full = await client.fetchOne(c.uid, { source: true }, { uid: true });
        const parsed = await simpleParser(full.source);
        const bodyText = (parsed.text || (parsed.html ? String(parsed.html).replace(/<[^>]+>/g, ' ') : '') || '').trim();

        // Match talento: remitente + emails dentro del reenvío
        const candidateEmails = [c.fromEmail, ...extractEmails(bodyText)].filter(Boolean);
        let talento = null;
        for (const em of candidateEmails) {
          talento = await findTalentByEmail(em);
          if (talento) break;
        }

        const ai = await classifyEmail({
          casilla: mb.casilla,
          fromName: c.fromName, fromEmail: c.fromEmail,
          subject: c.subject, body: bodyText, talento,
        });

        const row = {
          message_id: c.messageId,
          thread_references: refsToString(parsed),
          casilla: mb.casilla,
          tipo: (ai.tipo === 'propuesta' || ai.tipo === 'cotizacion') ? ai.tipo : (mb.casilla === 'contacto' ? 'cotizacion' : 'propuesta'),
          remitente_nombre: c.fromName || (parsed.from && parsed.from.value && parsed.from.value[0] && parsed.from.value[0].name) || '',
          remitente_email: c.fromEmail,
          asunto: c.subject,
          recibido_en: (c.date ? new Date(c.date) : (parsed.date || new Date())).toISOString(),
          resumen: ai.resumen || '',
          datos: ai.datos || {},
          cuerpo_preview: bodyText.slice(0, 3000),
          es_talento_exclusivo: !!talento,
          talento_id: talento ? talento.id : null,
          talento_nombre: talento ? talento.nombre : '',
          estado: 'nuevo',
        };

        if (dry) { console.log('[dry]', mb.casilla, c.fromEmail, '→', row.tipo, '|', row.resumen.slice(0, 80)); result.guardados++; }
        else if (await sbInsert(row)) result.guardados++;
      } catch (e) {
        result.errores++;
        console.error(`Error procesando ${c.messageId}:`, e.message);
      }
    }
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
  return result;
}

exports.handler = async (event) => {
  if (!SUPABASE_KEY) return { statusCode: 500, body: JSON.stringify({ error: 'SUPABASE_SERVICE_KEY no configurada' }) };
  if (!ANTHROPIC_API_KEY) return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY no configurada' }) };

  const q = (event && event.queryStringParameters) || {};
  const sinceDays = Number(q.days || SINCE_DAYS_DEFAULT);
  const dry = q.dry === '1' || q.dry === 'true';

  const boxes = mailboxes();
  if (!boxes.length) {
    return { statusCode: 200, body: JSON.stringify({ message: 'Sin casillas configuradas (faltan SMTP_PASS / IMAP_MGMT_PASS)' }) };
  }

  const results = [];
  for (const mb of boxes) {
    try { results.push(await processMailbox(mb, sinceDays, dry)); }
    catch (e) { console.error(`Casilla ${mb.casilla} falló:`, e.message); results.push({ casilla: mb.casilla, error: e.message }); }
  }

  return { statusCode: 200, body: JSON.stringify({ success: true, dry, sinceDays, results }) };
};
