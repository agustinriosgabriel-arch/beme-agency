// Netlify Scheduled Function: Daily Campaign Summary Email
// Runs every day at 5:00 AM (UTC-6 / Mexico City) = 11:00 UTC
// Endpoint: /.netlify/functions/campaign-summary (can also be triggered manually)

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ngstqwbzvnpggpklifat.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFY_EMAILS = (process.env.CAMPAIGN_SUMMARY_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

const PASO_LABELS = {
  1:'Esperando Brief', 2:'Esperando Script', 3:'Aprobación Script',
  4:'Producción', 5:'Aprobación Contenido', 6:'Publicar',
  7:'Estadísticas', 8:'Completado'
};
const ESTADO_LABELS = {
  sin_iniciar:'Sin iniciar', en_curso:'En curso',
  etapa_finanzas:'Etapa Finanzas', finalizada:'Finalizada', cancelada:'Cancelada'
};
const ESTADO_EMOJI = {
  sin_iniciar:'⚪', en_curso:'🔵', etapa_finanzas:'🟡', finalizada:'🟢', cancelada:'🔴'
};

async function supabaseQuery(table, select, filters = {}) {
  let url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}`;
  for (const [k, v] of Object.entries(filters)) {
    url += `&${k}=${encodeURIComponent(v)}`;
  }
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) throw new Error(`Supabase error: ${res.status} ${await res.text()}`);
  return res.json();
}

async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY) {
    console.log('RESEND_API_KEY not set — logging email instead:');
    console.log(`To: ${to.join(', ')}\nSubject: ${subject}\n---\n${html.substring(0, 500)}...`);
    return { success: true, mode: 'dry-run' };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Beme Agency <notifications@bemeagency.com>',
      to,
      subject,
      html
    })
  });
  if (!res.ok) throw new Error(`Resend error: ${res.status} ${await res.text()}`);
  return res.json();
}

function buildEmailHTML(campaigns, today) {
  const active = campaigns.filter(c => ['en_curso','etapa_finanzas'].includes(c.estado));
  const pending = campaigns.filter(c => c.estado === 'sin_iniciar');

  // Build per-campaign breakdown
  let campaignRows = '';

  for (const camp of [...active, ...pending]) {
    const talentos = camp.campana_talentos || [];
    const allConts = talentos.flatMap(ct => (ct.contenidos || []).map(c => ({...c, talent_name: ct.talentos?.nombre || 'N/A'})));
    const totalConts = allConts.length;
    const doneConts = allConts.filter(c => c.paso_actual >= 8).length;
    const pct = totalConts ? Math.round(doneConts / totalConts * 100) : 0;

    // Group contents by paso
    const byPaso = {};
    for (const c of allConts) {
      if (c.paso_actual >= 8) continue; // skip completed
      if (!byPaso[c.paso_actual]) byPaso[c.paso_actual] = [];
      byPaso[c.paso_actual].push(c);
    }

    // Items needing action
    let actionItems = '';
    for (const [paso, conts] of Object.entries(byPaso).sort((a,b) => a[0]-b[0])) {
      const label = PASO_LABELS[paso] || `Paso ${paso}`;
      const names = conts.map(c => c.talent_name).join(', ');
      actionItems += `<tr>
        <td style="padding:4px 10px;font-size:13px;border-bottom:1px solid #f0f0f0;color:#666">${label}</td>
        <td style="padding:4px 10px;font-size:13px;border-bottom:1px solid #f0f0f0;font-weight:600">${conts.length} contenido${conts.length > 1 ? 's' : ''}</td>
        <td style="padding:4px 10px;font-size:13px;border-bottom:1px solid #f0f0f0;color:#888">${names}</td>
      </tr>`;
    }

    const emoji = ESTADO_EMOJI[camp.estado] || '⚪';
    const estadoLabel = ESTADO_LABELS[camp.estado] || camp.estado;
    const marcaNombre = camp.marcas?.nombre || '';
    const clienteNombre = camp.marcas?.clientes?.nombre || '';

    campaignRows += `
    <div style="margin-bottom:20px;background:#fff;border:1px solid #e8e8e8;border-radius:12px;overflow:hidden">
      <div style="padding:14px 16px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;gap:10px">
        <span style="font-size:16px">${emoji}</span>
        <div>
          <div style="font-size:15px;font-weight:700;color:#111">${camp.nombre}</div>
          <div style="font-size:12px;color:#888">${clienteNombre}${marcaNombre ? ' · ' + marcaNombre : ''} — ${estadoLabel}</div>
        </div>
        <div style="margin-left:auto;text-align:right">
          <div style="font-size:20px;font-weight:800;color:${pct>=100?'#16a34a':'#b2005d'}">${pct}%</div>
          <div style="font-size:11px;color:#888">${doneConts}/${totalConts} listos</div>
        </div>
      </div>
      ${actionItems ? `<table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="padding:6px 10px;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#aaa;text-align:left;background:#fafafa">Etapa</th>
          <th style="padding:6px 10px;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#aaa;text-align:left;background:#fafafa">Cant.</th>
          <th style="padding:6px 10px;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#aaa;text-align:left;background:#fafafa">Talentos</th>
        </tr></thead>
        <tbody>${actionItems}</tbody>
      </table>` : '<div style="padding:12px 16px;font-size:13px;color:#22c55e;font-weight:600">✓ Todos los contenidos completados</div>'}
    </div>`;
  }

  // Stats summary
  const totalActive = active.length;
  const totalPending = pending.length;
  const totalFinished = campaigns.filter(c => c.estado === 'finalizada').length;
  const allContsGlobal = campaigns.flatMap(c => (c.campana_talentos||[]).flatMap(ct => ct.contenidos||[]));
  const waitingAction = allContsGlobal.filter(c => [3, 5].includes(c.paso_actual)).length;
  const waitingUpload = allContsGlobal.filter(c => [1, 2, 4].includes(c.paso_actual)).length;
  const waitingPublish = allContsGlobal.filter(c => c.paso_actual === 6).length;

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:640px;margin:0 auto;padding:24px 16px">

  <div style="text-align:center;margin-bottom:24px">
    <div style="font-family:serif;font-size:28px;font-weight:800;letter-spacing:-0.5px">
      <span style="background:linear-gradient(135deg,#b2005d,#9414E0);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">beme</span><span style="color:#b2005d">.</span>
    </div>
    <div style="font-size:13px;color:#888;margin-top:4px">Resumen diario de campañas — ${today}</div>
  </div>

  <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap;justify-content:center">
    <div style="background:#fff;border:1px solid #e8e8e8;border-radius:10px;padding:12px 18px;text-align:center;min-width:100px">
      <div style="font-size:22px;font-weight:800;color:#0ea5e9">${totalActive}</div>
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#888">Activas</div>
    </div>
    <div style="background:#fff;border:1px solid #e8e8e8;border-radius:10px;padding:12px 18px;text-align:center;min-width:100px">
      <div style="font-size:22px;font-weight:800;color:#888">${totalPending}</div>
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#888">Pendientes</div>
    </div>
    <div style="background:#fff;border:1px solid #e8e8e8;border-radius:10px;padding:12px 18px;text-align:center;min-width:100px">
      <div style="font-size:22px;font-weight:800;color:#f59e0b">${waitingAction}</div>
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#888">Esperan Aprobación</div>
    </div>
    <div style="background:#fff;border:1px solid #e8e8e8;border-radius:10px;padding:12px 18px;text-align:center;min-width:100px">
      <div style="font-size:22px;font-weight:800;color:#b2005d">${waitingUpload}</div>
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#888">Esperan Archivos</div>
    </div>
  </div>

  ${campaignRows || '<div style="text-align:center;color:#888;padding:40px">No hay campañas activas</div>'}

  <div style="text-align:center;margin-top:24px;padding:16px">
    <a href="https://bemeagency.netlify.app/campanas.html" style="display:inline-block;padding:10px 24px;background:linear-gradient(135deg,#b2005d,#9414E0);color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:700">Ir a Campañas →</a>
  </div>

  <div style="text-align:center;margin-top:16px;font-size:11px;color:#bbb">
    Beme Agency — Resumen automático generado el ${today}
  </div>
</div>
</body>
</html>`;
}

exports.handler = async (event) => {
  try {
    // Allow manual trigger via GET/POST, or scheduled via Netlify
    const today = new Date().toLocaleDateString('es-MX', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'America/Mexico_City'
    });

    // Fetch all non-cancelled campaigns with talentos and contenidos
    const campaigns = await supabaseQuery(
      'campanas',
      '*, marcas(nombre,clientes(nombre)), campana_talentos(*, talentos(nombre), contenidos(*))',
      { 'estado': 'neq.cancelada', 'order': 'created_at.desc' }
    );

    if (!campaigns.length) {
      return { statusCode: 200, body: JSON.stringify({ message: 'No campaigns found' }) };
    }

    const html = buildEmailHTML(campaigns, today);

    if (!NOTIFY_EMAILS.length) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: html // Return HTML preview when no emails configured
      };
    }

    const result = await sendEmail(
      NOTIFY_EMAILS,
      `📊 Resumen Campañas Beme — ${new Date().toLocaleDateString('es-MX', {day:'2-digit',month:'short',timeZone:'America/Mexico_City'})}`,
      html
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, emails: NOTIFY_EMAILS.length, ...result })
    };
  } catch (err) {
    console.error('Campaign summary error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
