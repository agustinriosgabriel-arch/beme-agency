// lib/registrar-cambio.js
//
// Registra un "cambio externo" en una campaña: algo que hizo el TALENTO o la MARCA
// (subir script, cargar archivo, enviar a revisión, aprobar/rechazar, comentar, etc.).
// Crea/actualiza una alerta in-app por cada usuario INTERNO de la campaña
// (admins + managers + handlers asignados), excluyendo al autor del cambio.
//
// Reutiliza la tabla `alertas` con tipo='cambio_externo'. Se "colapsa" en UNA alerta
// sin leer por (usuario × campaña): si ya hay una pendiente, se actualiza con el último
// cambio en vez de acumular. Así el Dashboard muestra un único badge por campaña que
// no se borra hasta que el usuario entra a la campaña (ahí se marca leída).
//
// Los cambios hechos internamente (admin / campaign_manager logueados) NO deben llamar
// a esta función: solo talento y marca generan notificación.

async function registrarCambio(sb, { campana_id, contenido_id = null, actor_tipo, actor_nombre, accion, exclude_user_id = null }) {
  if (!campana_id || !accion) return { ok: false, reason: 'missing params' };

  // Nombre de la campaña (título de la alerta). Si no existe, abortamos: evita
  // crear alertas para admins con un campana_id inválido.
  let campanaNombre = 'Campaña';
  try {
    const { data: c } = await sb.from('campanas').select('nombre').eq('id', campana_id).maybeSingle();
    if (!c) return { ok: false, reason: 'campana not found' };
    if (c.nombre) campanaNombre = c.nombre;
  } catch (e) { return { ok: false, reason: 'campana lookup failed' }; }

  // Destinatarios internos: managers + handlers de la campaña + admins activos
  const recipientIds = new Set();
  try {
    const [mgrs, hdlrs, admins] = await Promise.all([
      sb.from('campana_managers').select('user_id').eq('campana_id', campana_id),
      sb.from('campana_handlers').select('user_id').eq('campana_id', campana_id),
      sb.from('user_profiles').select('id').eq('role', 'admin').eq('activo', true),
    ]);
    (mgrs.data || []).forEach(m => m.user_id && recipientIds.add(m.user_id));
    (hdlrs.data || []).forEach(h => h.user_id && recipientIds.add(h.user_id));
    (admins.data || []).forEach(a => a.id && recipientIds.add(a.id));
  } catch (e) { /* si falla, recipientIds puede quedar vacío */ }

  if (exclude_user_id) recipientIds.delete(exclude_user_id);
  if (!recipientIds.size) return { ok: true, created: 0 };

  const tipoLabel = actor_tipo === 'marca' ? 'Marca' : 'Talento';
  const descripcion = `${actor_nombre || tipoLabel} (${tipoLabel}) — ${accion}`;
  const nowIso = new Date().toISOString();

  let created = 0;
  for (const uid of recipientIds) {
    try {
      // ¿Ya hay una alerta de cambio sin leer para esta campaña/usuario? → actualizarla
      const { data: existing } = await sb.from('alertas')
        .select('id')
        .eq('user_id', uid)
        .eq('campana_id', campana_id)
        .eq('tipo', 'cambio_externo')
        .eq('leida', false)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        await sb.from('alertas').update({
          titulo: campanaNombre, descripcion, contenido_id, created_at: nowIso,
        }).eq('id', existing.id);
      } else {
        await sb.from('alertas').insert({
          user_id: uid, campana_id, contenido_id, tipo: 'cambio_externo',
          titulo: campanaNombre, descripcion, leida: false,
        });
      }
      created++;
    } catch (e) { /* ignoramos errores por-usuario para no romper la acción principal */ }
  }

  return { ok: true, created };
}

module.exports = { registrarCambio };
