// Netlify Scheduled Function: Process Email Queue
//
// - Runs every 15 minutes (see netlify.toml).
// - Picks pending rows in prospeccion_email_cola where scheduled_at <= now()
//   and the contact is still in "esperando_respuesta".
// - Sends the email via SMTP (Hostinger, same as send-email.js).
// - Writes a row to prospeccion_email_log and updates the queue row.
//
// Also responds to POST {cola_id: X} for "Forzar siguiente envío" from the UI.

const nodemailer = require('nodemailer');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ngstqwbzvnpggpklifat.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

const SMTP_HOST = 'smtp.hostinger.com';
const SMTP_PORT = 465;
const SMTP_USER = 'contacto@bemeagency.com';
const SMTP_PASS = '1234-Beme';

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: true,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

// ── Supabase REST helpers ─────────────────────────────────────

const sbHeaders = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders });
  if (!res.ok) throw new Error(`Supabase GET ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbPatch(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...sbHeaders, 'Prefer': 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase PATCH ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbInsert(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: { ...sbHeaders, 'Prefer': 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase INSERT ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Template variable substitution (mirrors prospeccion-detalle.html replaceVars) ──

function replaceVars(text, contacto, prospeccion) {
  let t = String(text || '');
  t = t.replace(/\{\{nombre\}\}/gi, contacto.nombre || '');
  t = t.replace(/\{\{nombreprospeccion\}\}/gi, prospeccion.marca || '');
  t = t.replace(/\{\{marca\}\}/gi, prospeccion.marca || '');
  t = t.replace(/\{\{producto\}\}/gi, prospeccion.producto || '');
  t = t.replace(/\{\{paises\}\}/gi, (prospeccion.paises || []).join(', '));
  t = t.replace(/\{\{plataformas\}\}/gi, (prospeccion.plataformas || []).join(', '));
  t = t.replace(/\{\{email\}\}/gi, contacto.email || '');
  t = t.replace(/\{\{telefono\}\}/gi, contacto.telefono || '');
  t = t.replace(/\{\{tiktok\}\}/gi, contacto.tiktok || '');
  t = t.replace(/\{\{instagram\}\}/gi, contacto.instagram || '');
  return t;
}

// ── Core: process a single queue row ──────────────────────────

async function processColaRow(row) {
  // Load contacto
  const contactos = await sbGet(`prospeccion_contactos?id=eq.${row.contacto_id}&select=*`);
  const contacto = contactos[0];
  if (!contacto) {
    await sbPatch(`prospeccion_email_cola?id=eq.${row.id}`, { status: 'error', error: 'contacto no existe' });
    return { id: row.id, result: 'error', reason: 'contacto missing' };
  }

  // Idempotency: if contacto left "esperando_respuesta", cancel.
  if (contacto.etapa !== 'esperando_respuesta') {
    await sbPatch(`prospeccion_email_cola?id=eq.${row.id}`, {
      status: 'cancelado',
      error: `cancelado: etapa actual ${contacto.etapa}`,
    });
    return { id: row.id, result: 'cancelado', reason: `etapa ${contacto.etapa}` };
  }

  if (!contacto.email) {
    await sbPatch(`prospeccion_email_cola?id=eq.${row.id}`, {
      status: 'error',
      error: 'contacto sin email',
    });
    return { id: row.id, result: 'error', reason: 'sin email' };
  }

  // Load prospección
  const prospecciones = await sbGet(`prospecciones?id=eq.${row.prospeccion_id}&select=*`);
  const prospeccion = prospecciones[0];
  if (!prospeccion) {
    await sbPatch(`prospeccion_email_cola?id=eq.${row.id}`, { status: 'error', error: 'prospección no existe' });
    return { id: row.id, result: 'error', reason: 'prospeccion missing' };
  }

  // Load template
  if (!row.template_id) {
    await sbPatch(`prospeccion_email_cola?id=eq.${row.id}`, { status: 'error', error: 'sin template_id' });
    return { id: row.id, result: 'error', reason: 'no template_id' };
  }
  const templates = await sbGet(`prospeccion_email_templates?id=eq.${row.template_id}&select=*`);
  const template = templates[0];
  if (!template) {
    await sbPatch(`prospeccion_email_cola?id=eq.${row.id}`, { status: 'error', error: 'template no existe' });
    return { id: row.id, result: 'error', reason: 'template missing' };
  }

  const asunto = replaceVars(template.asunto || '', contacto, prospeccion);
  const cuerpo = replaceVars(template.cuerpo || '', contacto, prospeccion);

  // Send via SMTP
  let smtpResult, smtpError;
  try {
    const info = await transporter.sendMail({
      from: `"BEME Agency" <${SMTP_USER}>`,
      to: contacto.email,
      bcc: SMTP_USER,
      subject: asunto || `(sin asunto)`,
      text: cuerpo,
      replyTo: SMTP_USER,
    });
    smtpResult = info;
  } catch (e) {
    smtpError = e.message || String(e);
  }

  // Log
  const logRows = await sbInsert('prospeccion_email_log', [{
    contacto_id: contacto.id,
    prospeccion_id: prospeccion.id,
    email_to: contacto.email,
    asunto,
    cuerpo,
    status: smtpError ? 'failed' : ((smtpResult && smtpResult.rejected && smtpResult.rejected.length) ? 'rejected' : 'sent'),
    message_id: smtpResult ? (smtpResult.messageId || '') : '',
    smtp_response: smtpResult ? (smtpResult.response || '') : '',
    error: smtpError || '',
    template_id: row.template_id,
  }]);
  const logId = logRows && logRows[0] ? logRows[0].id : null;

  // Update queue
  if (smtpError) {
    await sbPatch(`prospeccion_email_cola?id=eq.${row.id}`, {
      status: 'error',
      error: smtpError,
      email_log_id: logId,
    });
    return { id: row.id, result: 'error', reason: smtpError };
  } else {
    await sbPatch(`prospeccion_email_cola?id=eq.${row.id}`, {
      status: 'enviado',
      sent_at: new Date().toISOString(),
      email_log_id: logId,
    });
    return { id: row.id, result: 'enviado' };
  }
}

// ── Handler ───────────────────────────────────────────────────

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event && event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    let rowsToProcess = [];

    // Manual force: POST {cola_id: X}
    if (event && event.httpMethod === 'POST' && event.body) {
      const body = JSON.parse(event.body || '{}');
      if (body.cola_id) {
        const rows = await sbGet(`prospeccion_email_cola?id=eq.${body.cola_id}&status=eq.pendiente&select=*`);
        rowsToProcess = rows;
      }
    }

    // Scheduled / GET: pick all pending rows whose scheduled_at <= now
    if (!rowsToProcess.length) {
      const nowIso = new Date().toISOString();
      const path = `prospeccion_email_cola?status=eq.pendiente&scheduled_at=lte.${encodeURIComponent(nowIso)}&order=scheduled_at.asc&limit=100&select=*`;
      rowsToProcess = await sbGet(path);
    }

    const results = [];
    for (const row of rowsToProcess) {
      try {
        const r = await processColaRow(row);
        results.push(r);
      } catch (e) {
        results.push({ id: row.id, result: 'error', reason: e.message || String(e) });
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        processed: results.length,
        results,
      }),
    };
  } catch (err) {
    console.error('process-email-queue error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || String(err) }),
    };
  }
};
