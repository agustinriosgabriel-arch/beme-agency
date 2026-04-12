// Netlify Function: Campaign Step Notifications + Daily Pending Reminders
//
// Two modes:
// 1. POST /.netlify/functions/campaign-notifications
//    Body: {action: "paso_cambio", contenido_id, paso_nuevo, paso_anterior, autor_nombre}
//    → Sends email to relevant users when a content step changes
//
// 2. Scheduled (cron) or GET /.netlify/functions/campaign-notifications
//    → Sends personalized daily pending reminders per user/role

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ngstqwbzvnpggpklifat.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const PASO_LABELS = {
  1:'Esperando Brief', 2:'Esperando Script', 3:'Aprobación Script',
  4:'Producción', 5:'Aprobación Contenido', 6:'Publicar',
  7:'Estadísticas', 8:'Completado', 9:'Pagado'
};

const PASO_ACCIONES = {
  2: 'Necesita subir el script',
  3: 'Necesita aprobar el script',
  4: 'Necesita subir el contenido/draft',
  5: 'Necesita aprobar el contenido',
  6: 'Necesita cargar el link de publicación',
  7: 'Necesita subir estadísticas',
};

// ── Supabase helpers ──────────────────────────────────────────

async function sbQuery(table, select, filters = {}) {
  let url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}`;
  for (const [k, v] of Object.entries(filters)) url += `&${k}=${encodeURIComponent(v)}`;
  const res = await fetch(url, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbInsert(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json', 'Prefer': 'return=minimal'
    },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`Insert ${res.status}: ${await res.text()}`);
}

// ── Email helper ──────────────────────────────────────────────

async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY) {
    console.log(`[DRY-RUN] To: ${to}, Subject: ${subject}`);
    return { success: true, mode: 'dry-run' };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'Beme Agency <notifications@bemeagency.com>',
      to: Array.isArray(to) ? to : [to],
      subject, html
    })
  });
  if (!res.ok) console.error(`Resend error: ${res.status} ${await res.text()}`);
  return res.ok;
}

// ── Email templates ───────────────────────────────────────────

function emailWrap(title, body) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="text-align:center;margin-bottom:20px">
    <span style="font-size:24px;font-weight:800;background:linear-gradient(135deg,#b2005d,#9414E0);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">beme</span><span style="color:#b2005d;font-size:24px;font-weight:800">.</span>
  </div>
  <div style="background:#fff;border:1px solid #e8e8e8;border-radius:12px;padding:20px;margin-bottom:16px">
    <div style="font-size:16px;font-weight:700;color:#111;margin-bottom:12px">${title}</div>
    ${body}
  </div>
  <div style="text-align:center">
    <a href="https://bemeagency.netlify.app/campanas.html" style="display:inline-block;padding:10px 20px;background:linear-gradient(135deg,#b2005d,#9414E0);color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:700">Ir a Beme →</a>
  </div>
  <div style="text-align:center;margin-top:12px;font-size:10px;color:#bbb">Beme Agency — Notificación automática</div>
</div></body></html>`;
}

// ══════════════════════════════════════════════════════════════
// MODE 1: PASO CHANGE NOTIFICATION
// ══════════════════════════════════════════════════════════════

async function handlePasoCambio(payload) {
  const { contenido_id, paso_nuevo, paso_anterior, autor_nombre } = payload;
  if (!contenido_id || !paso_nuevo) return { sent: 0, reason: 'missing params' };

  // Step 1: Get the contenido
  const contenidos = await sbQuery('contenidos', 'id,tipo,titulo,paso_actual,campana_talento_id', { 'id': `eq.${contenido_id}` });
  const cont = contenidos[0];
  if (!cont) return { sent: 0, reason: 'contenido not found' };

  // Step 2: Get campana_talento
  const cts = await sbQuery('campana_talentos', 'id,talent_id,campana_id', { 'id': `eq.${cont.campana_talento_id}` });
  const ct = cts[0];
  if (!ct) return { sent: 0, reason: 'campana_talento not found' };

  // Step 3: Get talento info
  const talentos = await sbQuery('talentos', 'id,nombre,email', { 'id': `eq.${ct.talent_id}` });
  const talento = talentos[0] || {};

  // Step 4: Get campana info
  const campanas = await sbQuery('campanas', 'id,nombre', { 'id': `eq.${ct.campana_id}` });
  const campana = campanas[0] || {};

  const campanaName = campana.nombre || 'Campaña';
  const talentoName = talento.nombre || 'Talento';
  const talentoEmail = talento.email || '';
  const contTitle = cont.titulo || cont.tipo || 'Contenido';
  const pasoLabel = PASO_LABELS[paso_nuevo] || `Paso ${paso_nuevo}`;
  const campanaId = ct.campana_id;

  // Load all user profiles once (for looking up emails by user_id)
  const allProfiles = await sbQuery('user_profiles', 'id,nombre,email,role');
  const profileMap = Object.fromEntries(allProfiles.map(p => [p.id, p]));

  // Determine who to notify based on the new step
  const recipients = [];

  // Steps where talent needs to act (2: upload script, 4: upload draft, 6: upload link)
  if ([2, 4, 6].includes(paso_nuevo) && talentoEmail) {
    recipients.push({ email: talentoEmail, name: talentoName, role: 'talent' });
  }

  // Steps where handler/manager need to act (3: approve script, 5: approve content)
  if ([3, 5].includes(paso_nuevo)) {
    const handlers = await sbQuery('campana_handlers', 'user_id', { 'campana_id': `eq.${campanaId}` });
    handlers.forEach(h => {
      const p = profileMap[h.user_id];
      if (p?.email) recipients.push({ email: p.email, name: p.nombre, role: 'handler' });
    });

    const managers = await sbQuery('campana_managers', 'user_id', { 'campana_id': `eq.${campanaId}` });
    managers.forEach(m => {
      const p = profileMap[m.user_id];
      if (p?.email) recipients.push({ email: p.email, name: p.nombre, role: 'manager' });
    });
  }

  // Step 8: completed — notify managers
  if (paso_nuevo >= 8) {
    const managers = await sbQuery('campana_managers', 'user_id', { 'campana_id': `eq.${campanaId}` });
    managers.forEach(m => {
      const p = profileMap[m.user_id];
      if (p?.email) recipients.push({ email: p.email, name: p.nombre, role: 'manager' });
    });
  }

  // Deduplicate by email
  const unique = [...new Map(recipients.map(r => [r.email, r])).values()];

  let sent = 0;
  for (const r of unique) {
    const accion = PASO_ACCIONES[paso_nuevo] || `Nuevo estado: ${pasoLabel}`;
    const body = `
      <div style="font-size:13px;color:#666;margin-bottom:12px">${autor_nombre || 'Alguien'} avanzó un contenido en <strong>${campanaName}</strong></div>
      <div style="background:#f8f8f8;border:1px solid #eee;border-radius:8px;padding:12px;margin-bottom:12px">
        <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px">Contenido</div>
        <div style="font-size:14px;font-weight:700;color:#111">${contTitle} — ${talentoName}</div>
        <div style="margin-top:6px;font-size:12px;color:#666">Paso ${paso_anterior || '?'} → <strong style="color:#b2005d">${pasoLabel}</strong></div>
      </div>
      ${r.role === 'talent' ? `<div style="font-size:13px;color:#111;font-weight:600">👉 ${accion}</div>` :
        paso_nuevo >= 8 ? '<div style="font-size:13px;color:#16a34a;font-weight:600">✓ Contenido completado</div>' :
        `<div style="font-size:13px;color:#111;font-weight:600">👉 ${accion}</div>`}
      <div style="margin-top:10px">
        <a href="https://bemeagency.netlify.app/campana-detalle.html?id=${campanaId}" style="color:#b2005d;font-size:13px;font-weight:600;text-decoration:none">Ver campaña →</a>
      </div>`;

    await sendEmail(r.email, `${campanaName} — ${contTitle} → ${pasoLabel}`, emailWrap('Actualización de Contenido', body));
    sent++;
  }

  // Log notifications
  for (const r of unique) {
    try {
      await sbInsert('notificaciones_enviadas', { tipo: 'paso_cambio', ref_id: contenido_id, user_email: r.email });
    } catch(e) { /* ignore log errors */ }
  }

  return { sent, recipients: unique.map(r => r.email) };
}


// ══════════════════════════════════════════════════════════════
// MODE 2: DAILY PENDING REMINDERS
// ══════════════════════════════════════════════════════════════

async function sendDailyReminders() {
  // Load all active campaigns with contenidos
  const campanas = await sbQuery('campanas',
    'id,nombre,estado,marcas(nombre),campana_managers(user_id),campana_handlers(user_id),campana_talentos(id,talent_id,talentos(nombre,email),contenidos(id,tipo,titulo,paso_actual,fecha_publicacion,updated_at))',
    { 'estado': 'in.(en_curso,etapa_finanzas)', 'deleted_at': 'is.null' }
  );

  if (!campanas.length) return { sent: 0, reason: 'no active campaigns' };

  // Load user profiles for managers/handlers
  const profiles = await sbQuery('user_profiles', 'id,nombre,email,role', { 'activo': 'eq.true' });
  const profileMap = Object.fromEntries(profiles.map(p => [p.id, p]));

  // Build pending items per user email
  const pendingByUser = {}; // email -> { name, role, items: [{campana, contenido, talento, paso, accion, days_waiting}] }

  for (const camp of campanas) {
    const talentos = camp.campana_talentos || [];

    for (const ct of talentos) {
      const contenidos = ct.contenidos || [];

      for (const c of contenidos) {
        if (c.paso_actual >= 8) continue; // completed

        const daysWaiting = Math.floor((Date.now() - new Date(c.updated_at).getTime()) / 86400000);
        const item = {
          campana: camp.nombre,
          campana_id: camp.id,
          contenido: c.titulo || c.tipo,
          talento: ct.talentos?.nombre || '',
          paso: c.paso_actual,
          pasoLabel: PASO_LABELS[c.paso_actual] || `Paso ${c.paso_actual}`,
          accion: PASO_ACCIONES[c.paso_actual] || '',
          daysWaiting,
          fecha_pub: c.fecha_publicacion
        };

        // Who should be notified based on paso?
        if ([2, 4, 6].includes(c.paso_actual) && ct.talentos?.email) {
          // Talent needs to act
          const email = ct.talentos.email;
          if (!pendingByUser[email]) pendingByUser[email] = { name: ct.talentos.nombre, role: 'talent', items: [] };
          pendingByUser[email].items.push(item);
        }

        if ([1, 3, 5, 7].includes(c.paso_actual)) {
          // Internal/handler needs to act
          const managerIds = (camp.campana_managers || []).map(m => m.user_id);
          const handlerIds = (camp.campana_handlers || []).map(h => h.user_id);

          for (const uid of [...managerIds, ...handlerIds]) {
            const prof = profileMap[uid];
            if (!prof?.email) continue;
            if (!pendingByUser[prof.email]) pendingByUser[prof.email] = { name: prof.nombre, role: prof.role, items: [] };
            pendingByUser[prof.email].items.push(item);
          }
        }
      }
    }
  }

  // Send personalized emails
  let sent = 0;
  for (const [email, userData] of Object.entries(pendingByUser)) {
    if (!userData.items.length) continue;

    // Sort by days waiting (most urgent first)
    userData.items.sort((a, b) => b.daysWaiting - a.daysWaiting);

    const urgent = userData.items.filter(i => i.daysWaiting >= 3);
    const normal = userData.items.filter(i => i.daysWaiting < 3);

    let itemsHTML = '';

    if (urgent.length) {
      itemsHTML += `<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#dc2626;letter-spacing:0.5px;margin-bottom:6px;margin-top:12px">⚠ Urgente (${urgent.length})</div>`;
      itemsHTML += urgent.map(i => renderPendingItem(i, true)).join('');
    }

    if (normal.length) {
      itemsHTML += `<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#888;letter-spacing:0.5px;margin-bottom:6px;margin-top:12px">Pendientes (${normal.length})</div>`;
      itemsHTML += normal.map(i => renderPendingItem(i, false)).join('');
    }

    const body = `
      <div style="font-size:13px;color:#666;margin-bottom:4px">Hola <strong>${userData.name}</strong>,</div>
      <div style="font-size:13px;color:#666;margin-bottom:12px">Tienes <strong>${userData.items.length} contenido${userData.items.length!==1?'s':''}</strong> pendiente${userData.items.length!==1?'s':''} de acción:</div>
      ${itemsHTML}
    `;

    await sendEmail(email, `📋 ${userData.items.length} pendiente${userData.items.length!==1?'s':''} en Beme`, emailWrap('Tus Pendientes de Hoy', body));
    sent++;
  }

  return { sent, users: Object.keys(pendingByUser).length };
}

function renderPendingItem(item, urgent) {
  const borderColor = urgent ? '#fecaca' : '#eee';
  const bgColor = urgent ? '#fef2f2' : '#f8f8f8';
  const daysText = item.daysWaiting === 0 ? 'hoy' : item.daysWaiting === 1 ? 'hace 1 día' : `hace ${item.daysWaiting} días`;

  return `<div style="background:${bgColor};border:1px solid ${borderColor};border-radius:8px;padding:10px 12px;margin-bottom:6px">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:13px;font-weight:700;color:#111">${item.contenido} — ${item.talento}</div>
        <div style="font-size:12px;color:#666;margin-top:2px">${item.campana}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;margin-left:12px">
        <div style="font-size:11px;font-weight:700;color:#b2005d">${item.pasoLabel}</div>
        <div style="font-size:10px;color:${urgent?'#dc2626':'#888'}">${daysText}</div>
      </div>
    </div>
    ${item.accion ? `<div style="font-size:12px;color:#444;margin-top:4px">→ ${item.accion}</div>` : ''}
  </div>`;
}


// ══════════════════════════════════════════════════════════════
// HANDLER
// ══════════════════════════════════════════════════════════════

exports.handler = async (event) => {
  try {
    // POST = step change notification (called from frontend)
    if (event.httpMethod === 'POST' && event.body) {
      const payload = JSON.parse(event.body);
      if (payload.action === 'paso_cambio') {
        const result = await handlePasoCambio(payload);
        return { statusCode: 200, body: JSON.stringify(result) };
      }
    }

    // GET or scheduled = daily reminders
    const result = await sendDailyReminders();
    return { statusCode: 200, body: JSON.stringify({ ok: true, ...result }) };

  } catch (err) {
    console.error('Notification error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
