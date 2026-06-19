// Netlify Function: brand-notify
// Scheduled (cada 10 min) o GET/POST manual.
//
// Notifica por email a las marcas (emails registrados en magic_links.notify_emails)
// cuando un contenido de SU campaña entra a una etapa que les compete revisar:
//   - paso 3 (script listo para revisar)
//   - paso 5 (contenido listo para aprobar)
//   - spark code cargado
//   - estadísticas cargadas
//
// Es un "barrido" independiente del origen del cambio (link de marca, panel
// interno o portal del talento). Usa notificaciones_enviadas para no repetir,
// y una ventana de tiempo para no spamear eventos históricos en el primer run.
//
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY,
//           PUBLIC_APP_URL (opcional, default app.bemeagency.com)

const nodemailer = require('nodemailer');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ngstqwbzvnpggpklifat.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const APP_URL = (process.env.PUBLIC_APP_URL || 'https://app.bemeagency.com').replace(/\/$/, '');

// Email por SMTP (Hostinger) — mismo canal que prospección, que ya funciona.
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.hostinger.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || 'contacto@bemeagency.com'; // buzón autenticado
const SMTP_PASS = process.env.SMTP_PASS;
// Remitente visible — DEBE ser un buzón/alias propiedad del usuario autenticado
// (Hostinger rechaza con 553 si no). Por defecto usa el mismo buzón autenticado.
// Para usar notifications@..., creá ese buzón en Hostinger y apuntá SMTP_USER/SMTP_PASS
// a él (o agregalo como alias de contacto@), y seteá BRAND_NOTIFY_FROM.
const NOTIFY_FROM = process.env.BRAND_NOTIFY_FROM || `Beme Agency <${SMTP_USER}>`;
const NOTIFY_FROM_ADDR = (NOTIFY_FROM.match(/<([^>]+)>/) || [, NOTIFY_FROM])[1];

const transporter = nodemailer.createTransport({
  host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

const WINDOW_HOURS = 3; // solo eventos de las últimas N horas (evita backfill masivo)

const TIPO_LABELS = {
  tiktok_video: 'TikTok Video', reel: 'Reel', reel_tiktok_espejo: 'Reel/TikTok',
  ig_story: 'IG Story', youtube_video: 'YouTube Video', youtube_short: 'YouTube Short',
};

async function sbQuery(table, select, filters = {}) {
  let url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}`;
  for (const [k, v] of Object.entries(filters)) url += `&${k}=${encodeURIComponent(v)}`;
  const res = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbInsert(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Insert ${res.status}: ${await res.text()}`);
}

async function sendEmail(to, subject, html) {
  if (!SMTP_PASS) { console.log(`[DRY-RUN] To: ${to} — ${subject}`); return true; }
  try {
    await transporter.sendMail({ from: NOTIFY_FROM, to, subject, html, replyTo: NOTIFY_FROM_ADDR });
    return true;
  } catch (e) {
    console.error('SMTP error:', e.message || e);
    return false;
  }
}

function emailWrap(title, bodyHTML, ctaUrl) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="text-align:center;margin-bottom:20px">
    <span style="font-size:24px;font-weight:800;background:linear-gradient(135deg,#b2005d,#9414E0);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">beme</span><span style="color:#b2005d;font-size:24px;font-weight:800">.</span>
  </div>
  <div style="background:#fff;border:1px solid #e8e8e8;border-radius:12px;padding:20px;margin-bottom:16px">
    <div style="font-size:16px;font-weight:700;color:#111;margin-bottom:12px">${title}</div>
    ${bodyHTML}
  </div>
  <div style="text-align:center">
    <a href="${ctaUrl}" style="display:inline-block;padding:10px 20px;background:linear-gradient(135deg,#b2005d,#9414E0);color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:700">Revisar en Beme →</a>
  </div>
  <div style="text-align:center;margin-top:12px;font-size:10px;color:#bbb">Beme Agency — Notificación automática</div>
</div></body></html>`;
}

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

async function alreadySent(tipo, refId, email) {
  const rows = await sbQuery('notificaciones_enviadas', 'id', {
    tipo: `eq.${tipo}`, ref_id: `eq.${refId}`, user_email: `eq.${email}`, limit: '1',
  });
  return rows.length > 0;
}

// Cuerpo de email para un evento (reutilizado por preview y por el envío real)
function buildEventEmail({ campName, label, contTitle, talentName, reason }, ctaUrl) {
  const body = `
    <div style="font-size:13px;color:#666;margin-bottom:12px">Novedad en <strong>${esc(campName)}</strong></div>
    <div style="background:#f8f8f8;border:1px solid #eee;border-radius:8px;padding:12px;margin-bottom:12px">
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px">${esc(label)}</div>
      <div style="font-size:14px;font-weight:700;color:#111">${esc(contTitle)} — ${esc(talentName)}</div>
    </div>
    <div style="font-size:13px;color:#111;font-weight:600">👉 ${esc(reason)}</div>`;
  return emailWrap(label, body, ctaUrl);
}

const SAMPLE_STATES = [
  { label: 'Script para revisar', reason: 'El script está listo para tu revisión.', subject: 'Script para revisar' },
  { label: 'Contenido para aprobar', reason: 'El contenido está listo para tu aprobación.', subject: 'Contenido para aprobar' },
  { label: 'Spark Code disponible', reason: 'Se cargó el Spark Code.', subject: 'Spark Code disponible' },
  { label: 'Estadísticas disponibles', reason: 'Se cargaron las estadísticas.', subject: 'Estadísticas disponibles' },
];

exports.handler = async (event) => {
  // ── Modo preview: /.netlify/functions/brand-notify?preview=1 → muestra los 4 mails ──
  if (event?.queryStringParameters?.preview) {
    const ctaUrl = `${APP_URL}/marca-link.html`;
    const blocks = SAMPLE_STATES.map(s => `
      <div style="max-width:600px;margin:0 auto 8px;padding:8px 16px;font:700 12px/1.4 -apple-system,sans-serif;color:#9414E0;text-transform:uppercase;letter-spacing:1px">▼ Asunto: "Campaña Demo — ${s.subject}"</div>
      ${buildEventEmail({ campName: 'Campaña Demo', label: s.label, contTitle: 'TikTok Video', talentName: 'Talento de ejemplo', reason: s.reason }, ctaUrl)}
      <hr style="max-width:600px;margin:24px auto;border:none;border-top:2px dashed #ccc">`).join('');
    return { statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: `<div style="background:#e9e9ee;padding:20px 0">${blocks}</div>` };
  }

  // ── Modo prueba: /.netlify/functions/brand-notify?test=email@dominio.com ──
  let testEmail = event?.queryStringParameters?.test || '';
  if (!testEmail && event?.body) { try { testEmail = JSON.parse(event.body).test_email || ''; } catch {} }
  if (testEmail) {
    const body = `
      <div style="font-size:13px;color:#666;margin-bottom:12px">Esto es un <strong>email de prueba</strong> del sistema de avisos a marcas.</div>
      <div style="background:#f8f8f8;border:1px solid #eee;border-radius:8px;padding:12px;margin-bottom:12px">
        <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px">Ejemplo de aviso</div>
        <div style="font-size:14px;font-weight:700;color:#111">TikTok Video — Talento de ejemplo</div>
      </div>
      <div style="font-size:13px;color:#111;font-weight:600">👉 El contenido está listo para tu aprobación.</div>`;
    if (!SMTP_PASS) return { statusCode: 200, body: JSON.stringify({ ok: false, test: true, to: testEmail, mode: 'dry-run (falta SMTP_PASS)' }) };
    // Permite forzar el remitente para probar (ej. ?from=notifications@bemeagency.com)
    const fromOverride = event?.queryStringParameters?.from || '';
    const fromUse = fromOverride ? `Beme Agency <${fromOverride}>` : NOTIFY_FROM;
    const replyUse = fromOverride || NOTIFY_FROM_ADDR;
    let ok = false, error = null, messageId = null;
    try {
      const info = await transporter.sendMail({
        from: fromUse, to: testEmail, replyTo: replyUse,
        subject: 'Beme — Email de prueba ✅',
        html: emailWrap('Email de prueba', body, `${APP_URL}/marca-link.html`),
      });
      ok = true; messageId = info.messageId;
    } catch (e) { error = e.message || String(e); }
    return { statusCode: 200, body: JSON.stringify({ ok, test: true, to: testEmail, from: fromUse, via: 'smtp', messageId, error }) };
  }

  if (!SUPABASE_KEY) return { statusCode: 500, body: JSON.stringify({ error: 'Falta SUPABASE_SERVICE_KEY' }) };

  try {
    const cutoff = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString();

    // Links de marca activos con al menos un email
    const links = (await sbQuery('magic_links', 'id,token,campana_id,notify_emails', { tipo: 'eq.brand', activo: 'eq.true' }))
      .filter(l => Array.isArray(l.notify_emails) && l.notify_emails.length);

    let sent = 0;
    for (const link of links) {
      const emails = link.notify_emails;
      const campRows = await sbQuery('campanas', 'id,nombre', { id: `eq.${link.campana_id}`, deleted_at: 'is.null' });
      const camp = campRows[0];
      if (!camp) continue;
      const ctaUrl = `${APP_URL}/marca-link.html?t=${link.token}`;

      // Contenidos de la campaña + nombre del talento
      const cts = await sbQuery('campana_talentos',
        'id,talentos(nombre),contenidos(id,titulo,tipo,paso_actual,spark_code_texto,updated_at)',
        { campana_id: `eq.${link.campana_id}` });
      const conts = [];
      for (const ct of cts) for (const c of (ct.contenidos || [])) conts.push({ ...c, talentName: ct.talentos?.nombre || 'Talento' });
      if (!conts.length) continue;
      const byId = Object.fromEntries(conts.map(c => [c.id, c]));
      const ids = conts.map(c => c.id).join(',');

      // ── Eventos a notificar ──────────────────────────────────
      const events = []; // {tipo, refId, cont, reason}

      // Reviews: entradas a paso 3 / 5 (desde historial, dentro de la ventana)
      const hist = await sbQuery('contenido_historial', 'id,contenido_id,paso_nuevo,created_at', {
        contenido_id: `in.(${ids})`, paso_nuevo: 'in.(3,5)', created_at: `gt.${cutoff}`,
      });
      for (const h of hist) {
        const cont = byId[h.contenido_id]; if (!cont) continue;
        events.push({
          tipo: 'brand_review', refId: h.id, cont,
          reason: h.paso_nuevo === 3 ? 'El script está listo para tu revisión.' : 'El contenido está listo para tu aprobación.',
          label: h.paso_nuevo === 3 ? 'Script para revisar' : 'Contenido para aprobar',
        });
      }

      // Spark code cargado (campo no vacío, actualizado dentro de la ventana)
      for (const c of conts) {
        if (c.spark_code_texto && String(c.spark_code_texto).trim() && c.updated_at > cutoff) {
          events.push({ tipo: 'brand_spark', refId: c.id, cont: c, reason: 'Se cargó el Spark Code.', label: 'Spark Code disponible' });
        }
      }

      // Estadísticas cargadas (dentro de la ventana) — una vez por contenido
      const stats = await sbQuery('contenido_estadisticas', 'id,contenido_id,created_at', {
        contenido_id: `in.(${ids})`, created_at: `gt.${cutoff}`,
      });
      const statConts = new Set();
      for (const s of stats) {
        if (statConts.has(s.contenido_id)) continue;
        statConts.add(s.contenido_id);
        const cont = byId[s.contenido_id]; if (!cont) continue;
        events.push({ tipo: 'brand_stats', refId: s.contenido_id, cont, reason: 'Se cargaron las estadísticas.', label: 'Estadísticas disponibles' });
      }

      // ── Enviar (con dedup por email) ─────────────────────────
      for (const ev of events) {
        const contTitle = ev.cont.titulo || TIPO_LABELS[ev.cont.tipo] || 'Contenido';
        for (const email of emails) {
          if (await alreadySent(ev.tipo, ev.refId, email)) continue;
          const body = `
            <div style="font-size:13px;color:#666;margin-bottom:12px">Novedad en <strong>${esc(camp.nombre)}</strong></div>
            <div style="background:#f8f8f8;border:1px solid #eee;border-radius:8px;padding:12px;margin-bottom:12px">
              <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px">${esc(ev.label)}</div>
              <div style="font-size:14px;font-weight:700;color:#111">${esc(contTitle)} — ${esc(ev.cont.talentName)}</div>
            </div>
            <div style="font-size:13px;color:#111;font-weight:600">👉 ${esc(ev.reason)}</div>`;
          await sendEmail(email, `${camp.nombre} — ${ev.label}`, emailWrap(ev.label, body, ctaUrl));
          await sbInsert('notificaciones_enviadas', { tipo: ev.tipo, ref_id: ev.refId, user_email: email }).catch(() => {});
          sent++;
        }
      }
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, links: links.length, sent }) };
  } catch (e) {
    console.error('brand-notify error:', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
