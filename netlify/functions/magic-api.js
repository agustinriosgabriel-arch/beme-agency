// Netlify Function: magic-api
// POST /.netlify/functions/magic-api
// Body: { action, token, ...params }
//
// Puerta de entrada ÚNICA para los "magic links" (acceso sin login):
//   - tipo 'talent' : 1 link por talento → ve todas sus campañas activas,
//                     sube scripts/videos, ve SOLO su fee_talento + estado de pago.
//   - tipo 'brand'  : 1 link por campaña → ve a todos los talentos, aprueba/
//                     rechaza/comenta y ve el fee_marca (lo que paga por talento).
//
// Toda la validación de token y las lecturas/escrituras se hacen acá con el
// service_role key (RLS no aplica), filtrando SIEMPRE por el alcance del token.
//
// Env vars (Netlify):
//   SUPABASE_URL          — ya configurada
//   SUPABASE_SERVICE_KEY  — service_role key

const { createClient } = require('@supabase/supabase-js');
const { corsOrigin } = require('./lib/cors');

const SB_URL = process.env.SUPABASE_URL || 'https://ngstqwbzvnpggpklifat.supabase.co';
const SB_SERVICE = process.env.SUPABASE_SERVICE_KEY;

const ALLOWED_BUCKETS = ['content-scripts', 'content-drafts', 'content-stats'];
const EXPIRY_DAYS = 10; // días tras campaña finalizada + pago completado

// Selects reutilizados (mismos joins que el portal del talento)
const CONT_SELECT = 'contenidos(*,contenido_observaciones(*),contenido_scripts(*),contenido_borradores(*),contenido_historial(*),contenido_briefs(*),contenido_estadisticas(*))';
const CT_SELECT_TALENT = `*,talentos(id,nombre,foto),${CONT_SELECT},campanas(*,marcas(id,nombre,clientes(nombre)),campana_briefs(*))`;
const CAMPANA_SELECT_BRAND = `*,marcas(id,nombre,clientes(nombre)),campana_briefs(*),campana_talentos(*,talentos(id,nombre,foto),${CONT_SELECT})`;

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

// Fecha de cierre de un (talento × campaña): 10 días tras finalizada + pagado.
// Devuelve Date de expiración, o null si todavía no está cerrado.
function ctExpiry(camp, ct) {
  if (!camp || camp.estado !== 'finalizada') return null;
  if (ct.pago_estado !== 'pagado') return null;
  const base = ct.pago_fecha ? new Date(ct.pago_fecha + 'T00:00:00') : new Date(ct.updated_at || ct.created_at);
  return new Date(base.getTime() + EXPIRY_DAYS * 86400000);
}

exports.handler = async (event) => {
  const origin = corsOrigin(event);
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true }, origin);
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' }, origin);
  if (!SB_SERVICE) return json(500, { error: 'Falta SUPABASE_SERVICE_KEY en Netlify env vars' }, origin);

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'JSON inválido' }, origin); }

  const { action, token } = body;
  if (!action) return json(400, { error: 'Falta action' }, origin);
  if (!token) return json(400, { error: 'Falta token' }, origin);

  const sb = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

  // 1) Validar token
  const { data: link, error: lErr } = await sb
    .from('magic_links')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  if (lErr) return json(500, { error: lErr.message }, origin);
  if (!link || !link.activo) return json(401, { error: 'Link inválido o revocado', invalid: true }, origin);

  // Datos de autoría según tipo de link (sin uuid de auth)
  let autorNombre = 'Talento';
  if (link.tipo === 'brand') autorNombre = 'Marca';

  // Helper: verificar que un contenido pertenece al alcance del token
  async function assertContenidoScope(contId) {
    const { data, error } = await sb
      .from('contenidos')
      .select('id,campana_talento_id,campana_talentos(talent_id,campana_id)')
      .eq('id', contId)
      .maybeSingle();
    if (error || !data) return { ok: false };
    const ct = data.campana_talentos || {};
    if (link.tipo === 'talent' && ct.talent_id === link.talent_id) return { ok: true, ct };
    if (link.tipo === 'brand' && ct.campana_id === link.campana_id) return { ok: true, ct };
    return { ok: false };
  }

  try {
    switch (action) {

      // ── LOAD ────────────────────────────────────────────────
      case 'load': {
        if (link.tipo === 'talent') {
          const { data: cts, error } = await sb
            .from('campana_talentos')
            .select(CT_SELECT_TALENT)
            .eq('talent_id', link.talent_id)
            .order('created_at', { ascending: false });
          if (error) throw error;

          const now = Date.now();
          const visible = (cts || []).filter(ct => {
            if (!ct.campanas || ct.campanas.deleted_at) return false;
            const exp = ctExpiry(ct.campanas, ct);
            return !(exp && exp.getTime() < now); // ocultar las cerradas hace +10 días
          });

          // El talento NO ve fee_marca ni la ganancia de la agencia
          const safe = visible.map(ct => {
            const { fee, fee_marca, ...rest } = ct;
            return rest; // conserva fee_talento, moneda, pago_estado, pago_fecha
          });

          const talento = (cts && cts[0] && cts[0].talentos) || null;
          return json(200, {
            tipo: 'talent',
            talento: talento ? { id: talento.id, nombre: talento.nombre, foto: talento.foto } : null,
            campaigns: safe,
            anyClosed: (cts || []).length > visible.length,
          }, origin);
        }

        // brand
        const { data: camp, error } = await sb
          .from('campanas')
          .select(CAMPANA_SELECT_BRAND)
          .eq('id', link.campana_id)
          .maybeSingle();
        if (error) throw error;
        if (!camp || camp.deleted_at) return json(404, { error: 'Campaña no disponible', invalid: true }, origin);

        // Caducidad del link de marca: campaña finalizada + TODOS pagados → +10 días
        const cts = camp.campana_talentos || [];
        const allPaid = cts.length > 0 && cts.every(ct => ct.pago_estado === 'pagado');
        if (camp.estado === 'finalizada' && allPaid) {
          const exps = cts.map(ct => ctExpiry(camp, ct)).filter(Boolean);
          const last = exps.length ? Math.max(...exps.map(d => d.getTime())) : null;
          if (last && last < Date.now()) {
            return json(200, { tipo: 'brand', expired: true, campana: { nombre: camp.nombre } }, origin);
          }
        }

        // La marca NO ve fee_talento (lo que realmente recibe el talento)
        camp.campana_talentos = cts.map(ct => {
          const { fee, fee_talento, ...rest } = ct;
          return rest; // conserva fee_marca, moneda, pago_estado
        });
        return json(200, { tipo: 'brand', campana: camp }, origin);
      }

      // ── SIGNED UPLOAD URL ───────────────────────────────────
      case 'signed-upload': {
        const { bucket, contenido_id, filename } = body;
        if (!ALLOWED_BUCKETS.includes(bucket)) return json(400, { error: 'Bucket no permitido' }, origin);
        const scope = await assertContenidoScope(contenido_id);
        if (!scope.ok) return json(403, { error: 'Contenido fuera de alcance' }, origin);
        const safeName = String(filename || 'file').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${link.tipo}-${link.talent_id || link.campana_id}/contenido-${contenido_id}/${Date.now()}-${safeName}`;
        const { data, error } = await sb.storage.from(bucket).createSignedUploadUrl(path);
        if (error) throw error;
        const { data: pub } = sb.storage.from(bucket).getPublicUrl(path);
        return json(200, { path, token: data.token, signedUrl: data.signedUrl, publicUrl: pub.publicUrl }, origin);
      }

      // ── REGISTRAR ARCHIVOS (tras subir con la signed URL) ───
      case 'record-script': {
        if (link.tipo !== 'talent') return json(403, { error: 'Solo el talento sube scripts' }, origin);
        const { contenido_id, url_archivo, replace_id } = body;
        const scope = await assertContenidoScope(contenido_id);
        if (!scope.ok) return json(403, { error: 'Fuera de alcance' }, origin);
        if (replace_id) {
          const { error } = await sb.from('contenido_scripts').update({ url_archivo }).eq('id', replace_id).eq('contenido_id', contenido_id);
          if (error) throw error;
        } else {
          const { error } = await sb.from('contenido_scripts').insert({ contenido_id, url_archivo });
          if (error) throw error;
        }
        return json(200, { ok: true }, origin);
      }

      case 'record-draft': {
        if (link.tipo !== 'talent') return json(403, { error: 'Solo el talento sube contenido' }, origin);
        const { contenido_id, url_archivo, nombre_archivo, size_bytes, replace_id } = body;
        const scope = await assertContenidoScope(contenido_id);
        if (!scope.ok) return json(403, { error: 'Fuera de alcance' }, origin);
        if (replace_id) {
          const { error } = await sb.from('contenido_borradores').update({ url_archivo, nombre_archivo, size_bytes }).eq('id', replace_id).eq('contenido_id', contenido_id);
          if (error) throw error;
        } else {
          const { error } = await sb.from('contenido_borradores').insert({ contenido_id, url_archivo, nombre_archivo, size_bytes });
          if (error) throw error;
        }
        return json(200, { ok: true }, origin);
      }

      case 'record-stats': {
        if (link.tipo !== 'talent') return json(403, { error: 'Solo el talento sube estadísticas' }, origin);
        const { contenido_id, periodo, url_screenshot, nombre_archivo } = body;
        const scope = await assertContenidoScope(contenido_id);
        if (!scope.ok) return json(403, { error: 'Fuera de alcance' }, origin);
        const { error } = await sb.from('contenido_estadisticas').insert({ contenido_id, periodo, url_screenshot, nombre_archivo });
        if (error) throw error;
        return json(200, { ok: true }, origin);
      }

      // ── CAMPOS DE CONTENIDO (talento) ───────────────────────
      case 'set-publish-link': {
        if (link.tipo !== 'talent') return json(403, { error: 'No permitido' }, origin);
        const { contenido_id, url_publicacion } = body;
        const scope = await assertContenidoScope(contenido_id);
        if (!scope.ok) return json(403, { error: 'Fuera de alcance' }, origin);
        const { error } = await sb.from('contenidos').update({ url_publicacion }).eq('id', contenido_id);
        if (error) throw error;
        return json(200, { ok: true }, origin);
      }

      case 'save-copy': {
        if (link.tipo !== 'talent') return json(403, { error: 'No permitido' }, origin);
        const { contenido_id, copy_texto } = body;
        const scope = await assertContenidoScope(contenido_id);
        if (!scope.ok) return json(403, { error: 'Fuera de alcance' }, origin);
        const { error } = await sb.from('contenidos').update({ copy_texto }).eq('id', contenido_id);
        if (error) throw error;
        return json(200, { ok: true }, origin);
      }

      case 'save-spark': {
        if (link.tipo !== 'talent') return json(403, { error: 'No permitido' }, origin);
        const { contenido_id, spark_code_texto } = body;
        const scope = await assertContenidoScope(contenido_id);
        if (!scope.ok) return json(403, { error: 'Fuera de alcance' }, origin);
        const { error } = await sb.from('contenidos').update({ spark_code_texto }).eq('id', contenido_id);
        if (error) throw error;
        return json(200, { ok: true }, origin);
      }

      // ── AVANZAR PASO (talento envía a revisión) ─────────────
      case 'advance': {
        const { contenido_id, accion } = body;
        const scope = await assertContenidoScope(contenido_id);
        if (!scope.ok) return json(403, { error: 'Fuera de alcance' }, origin);
        const { data, error } = await sb.rpc('avanzar_paso_contenido', {
          p_contenido_id: contenido_id, p_autor_id: null,
          p_autor_nombre: accion ? `${autorNombre}` : autorNombre,
          p_accion: accion || 'Enviado por talento',
        });
        if (error) throw error;
        return json(200, { ok: true, paso: data }, origin);
      }

      // ── MARCA: aprobar (paso 3 script / paso 5 contenido) ───
      case 'approve': {
        if (link.tipo !== 'brand') return json(403, { error: 'Solo la marca aprueba' }, origin);
        const { contenido_id, observacion } = body;
        const scope = await assertContenidoScope(contenido_id);
        if (!scope.ok) return json(403, { error: 'Fuera de alcance' }, origin);
        const { data: cont, error: cErr } = await sb.from('contenidos').select('paso_actual').eq('id', contenido_id).maybeSingle();
        if (cErr || !cont) return json(404, { error: 'Contenido no encontrado' }, origin);
        if (![3, 5].includes(cont.paso_actual)) return json(400, { error: 'Este paso no requiere aprobación' }, origin);
        const tipo = cont.paso_actual === 3 ? 'script' : 'borrador';
        const obsTxt = '✓ Aprobado' + (observacion ? ': ' + observacion : '');
        const { error: oErr } = await sb.from('contenido_observaciones').insert({
          contenido_id, paso: cont.paso_actual, tipo, observacion: obsTxt, autor_id: null, autor_nombre: autorNombre,
        });
        if (oErr) throw oErr;
        const { data, error } = await sb.rpc('avanzar_paso_contenido', {
          p_contenido_id: contenido_id, p_autor_id: null, p_autor_nombre: autorNombre, p_accion: 'Aprobado por marca',
        });
        if (error) throw error;
        return json(200, { ok: true, paso: data }, origin);
      }

      // ── MARCA: rechazar (vuelve al paso anterior) ───────────
      case 'reject': {
        if (link.tipo !== 'brand') return json(403, { error: 'Solo la marca rechaza' }, origin);
        const { contenido_id, observacion } = body;
        if (!observacion || !observacion.trim()) return json(400, { error: 'Escribí el motivo del rechazo' }, origin);
        const scope = await assertContenidoScope(contenido_id);
        if (!scope.ok) return json(403, { error: 'Fuera de alcance' }, origin);
        const { data, error } = await sb.rpc('rechazar_contenido', {
          p_contenido_id: contenido_id, p_observacion: observacion.trim(), p_autor_id: null, p_autor_nombre: autorNombre,
        });
        if (error) throw error;
        return json(200, { ok: true, paso: data }, origin);
      }

      // ── COMENTAR (marca deja feedback sin cambiar de paso) ──
      case 'comment': {
        if (link.tipo !== 'brand') return json(403, { error: 'No permitido' }, origin);
        const { contenido_id, observacion } = body;
        if (!observacion || !observacion.trim()) return json(400, { error: 'Comentario vacío' }, origin);
        const scope = await assertContenidoScope(contenido_id);
        if (!scope.ok) return json(403, { error: 'Fuera de alcance' }, origin);
        const { data: cont } = await sb.from('contenidos').select('paso_actual').eq('id', contenido_id).maybeSingle();
        const paso = cont ? cont.paso_actual : 0;
        const tipo = paso >= 4 ? 'borrador' : 'script';
        const { error } = await sb.from('contenido_observaciones').insert({
          contenido_id, paso, tipo, observacion: observacion.trim(), autor_id: null, autor_nombre: autorNombre,
        });
        if (error) throw error;
        return json(200, { ok: true }, origin);
      }

      default:
        return json(400, { error: 'Acción desconocida: ' + action }, origin);
    }
  } catch (e) {
    console.error('magic-api error:', action, e);
    return json(500, { error: e.message || 'Error desconocido' }, origin);
  }
};
