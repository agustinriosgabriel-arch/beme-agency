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
const { registrarCambio } = require('./lib/registrar-cambio');
const { sendInvoiceToFinanzas } = require('./lib/mailer');
const { renderContract } = require('./contract-agent');

const SB_URL = process.env.SUPABASE_URL || 'https://ngstqwbzvnpggpklifat.supabase.co';
const SB_SERVICE = process.env.SUPABASE_SERVICE_KEY;

const ALLOWED_BUCKETS = ['content-scripts', 'content-drafts', 'content-stats', 'campaign-briefs'];
const EXPIRY_DAYS = 10; // días tras campaña finalizada + pago completado
const INVOICE_MIN_PASO = 7; // el talento factura recién cuando TODOS sus contenidos están en paso ≥ 7

// Selects reutilizados (mismos joins que el portal del talento)
const CONT_SELECT = 'contenidos(*,contenido_observaciones(*),contenido_scripts(*),contenido_borradores(*),contenido_historial(*),contenido_briefs(*),contenido_estadisticas(*))';
const CT_SELECT_TALENT = `*,talentos(id,nombre,foto,idioma),${CONT_SELECT},campanas(*,marcas(id,nombre,clientes(nombre)),campana_briefs(*))`;
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
  const actorTipo = link.tipo === 'brand' ? 'marca' : 'talento';

  // Registra el cambio como notificación in-app para el equipo interno (no rompe la acción si falla)
  async function regCambio(campana_id, contenido_id, accion) {
    if (!campana_id) return;
    try {
      await registrarCambio(sb, { campana_id, contenido_id: contenido_id || null, actor_tipo: actorTipo, actor_nombre: autorNombre, accion });
    } catch (e) { console.warn('regCambio:', e.message); }
  }

  // Aviso best-effort a Finanzas cuando se carga una factura (no rompe la acción).
  async function notifyFinanzasInvoice(ct, invoice_url, tipo, factura_datos) {
    try {
      const { data } = await sb.from('campana_talentos')
        .select('fee_talento,moneda,talentos(nombre),campanas(nombre)')
        .eq('id', ct.id).maybeSingle();
      await sendInvoiceToFinanzas({
        talentoNombre: data?.talentos?.nombre || 'Talento',
        campanaNombre: data?.campanas?.nombre || '',
        invoiceUrl: invoice_url,
        tipo,
        monto: (factura_datos && factura_datos.monto) || data?.fee_talento,
        moneda: (factura_datos && factura_datos.moneda) || data?.moneda,
      });
    } catch (e) { console.warn('notifyFinanzasInvoice:', e.message); }
  }

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

  // Helper: verificar que un campana_talento pertenece al talento del token
  async function assertTalentCt(ctId) {
    const { data, error } = await sb
      .from('campana_talentos')
      .select('id,talent_id,campana_id,contenidos(paso_actual)')
      .eq('id', ctId)
      .maybeSingle();
    if (error || !data) return { ok: false };
    if (link.tipo !== 'talent' || data.talent_id !== link.talent_id) return { ok: false };
    return { ok: true, ct: data };
  }
  // Verifica que un contrato pertenezca al alcance del token (talento o marca)
  async function assertContratoScope(contratoId) {
    const { data, error } = await sb
      .from('contratos')
      .select('id,tipo,estado,campana_id,campana_talento_id,bloqueado,contenido_html,datos_contraparte_ok,empresa_id')
      .eq('id', contratoId)
      .maybeSingle();
    if (error || !data) return { ok: false };
    if (link.tipo === 'talent') {
      if (data.tipo !== 'talento') return { ok: false };
      const s = await assertTalentCt(data.campana_talento_id);
      if (!s.ok) return { ok: false };
      return { ok: true, con: data, ct: s.ct };
    }
    if (link.tipo === 'brand') {
      if (data.tipo !== 'marca') return { ok: false };
      if (data.campana_id !== link.campana_id) return { ok: false };
      return { ok: true, con: data };
    }
    return { ok: false };
  }
  // Re-arma el contenido_html con los datos actuales (tras completar datos la
  // contraparte). No toca externos, mirrors (IA) ni contratos sin html.
  async function regenerarContenido(contratoId) {
    const { data: con } = await sb.from('contratos').select('*').eq('id', contratoId).maybeSingle();
    if (!con || con.es_externo || !con.contenido_html || con.mirror_origen_id) return null;
    let emp = null;
    if (con.empresa_id) { const { data } = await sb.from('empresas_facturacion').select('*').eq('id', con.empresa_id).maybeSingle(); emp = data; }
    const data = {
      ...con,
      agencia_nombre: emp ? emp.nombre : (con.tipo === 'marca' ? con.parte_b_nombre : con.parte_a_nombre),
      signatory_nombre: emp ? (emp.signatory_nombre || '') : '',
      signatory_cargo: emp ? (emp.signatory_cargo || '') : '',
    };
    let html = renderContract(data, con.idioma || 'es');
    html = html.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '').replace(/\son\w+\s*=\s*(['"])[\s\S]*?\1/gi, '');
    await sb.from('contratos').update({ contenido_html: html, updated_at: new Date().toISOString() }).eq('id', contratoId);
    return html;
  }
  // Factura habilitada sólo cuando TODOS los contenidos están en paso ≥ INVOICE_MIN_PASO
  function invoiceUnlocked(ct) {
    const conts = ct.contenidos || [];
    if (!conts.length) return false;
    return conts.every(c => (c.paso_actual || 0) >= INVOICE_MIN_PASO);
  }
  // IP del cliente (auditoría liviana de la firma)
  function clientIp() {
    const h = event.headers || {};
    return (h['x-nf-client-connection-ip'] || (h['x-forwarded-for'] || '').split(',')[0] || '').trim();
  }
  // Nombre de archivo seguro para storage
  function safeFile(name) {
    return String(name || 'file').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
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

          // Contratos del talento (tipo='talento') para firmar/ver en la campaña
          const visibleCtIds = safe.map(ct => ct.id);
          let contratos = [];
          if (visibleCtIds.length) {
            const { data: cons, error: consErr } = await sb
              .from('contratos')
              .select('*')
              .in('campana_talento_id', visibleCtIds)
              .eq('tipo', 'talento')
              .in('estado', ['enviado', 'firmado']);
            if (consErr) console.warn('talent contratos load:', consErr.message);
            contratos = cons || [];
          }
          // Comentarios + documentos requeridos por contrato (para el portal)
          if (contratos.length) {
            const conIds = contratos.map(c => c.id);
            const { data: coms } = await sb.from('contrato_comentarios').select('*').in('contrato_id', conIds).order('created_at');
            const { data: docs } = await sb.from('contrato_documentos').select('id,contrato_id,parte,tipo_doc').in('contrato_id', conIds);
            contratos.forEach(c => {
              c.comentarios = (coms || []).filter(x => x.contrato_id === c.id);
              c.docs = (docs || []).filter(x => x.contrato_id === c.id && x.parte === 'talento');
            });
          }
          const conByCt = {};
          contratos.forEach(c => { if (!conByCt[c.campana_talento_id]) conByCt[c.campana_talento_id] = c; });
          safe.forEach(ct => { ct.contrato = conByCt[ct.id] || null; });

          // Datos de pago reutilizables del talento (cuentas por país)
          const { data: cuentas } = await sb
            .from('talento_cuentas_pago')
            .select('*')
            .eq('talent_id', link.talent_id)
            .order('es_default', { ascending: false })
            .order('created_at', { ascending: true });

          const talento = (cts && cts[0] && cts[0].talentos) || null;
          return json(200, {
            tipo: 'talent',
            talento: talento ? { id: talento.id, nombre: talento.nombre, foto: talento.foto, idioma: talento.idioma || 'es' } : null,
            campaigns: safe,
            cuentas: cuentas || [],
            invoiceMinPaso: INVOICE_MIN_PASO,
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

        // Contrato de marca (tipo='marca') de esta campaña, para ver/firmar
        const { data: bcons } = await sb
          .from('contratos')
          .select('id,campana_id,tipo,idioma,estado,numero_contrato,contenido_html,archivo_url,archivo_nombre,es_externo,firma_url,firmante_nombre,firmado_at,firma_agencia_url,firma_agencia_nombre,firmado_agencia_at,pdf_firmado_url,bloqueado,parte_a_nombre,parte_a_rfc,parte_a_domicilio,datos_contraparte_ok')
          .eq('campana_id', link.campana_id).eq('tipo', 'marca')
          .in('estado', ['enviado', 'firmado'])
          .order('created_at', { ascending: false });
        let contrato = (bcons && bcons[0]) || null;
        if (contrato) {
          const { data: coms } = await sb.from('contrato_comentarios').select('*').eq('contrato_id', contrato.id).order('created_at');
          const { data: docs } = await sb.from('contrato_documentos').select('id,parte,tipo_doc').eq('contrato_id', contrato.id).eq('parte', 'marca');
          contrato.comentarios = coms || [];
          contrato.docs = docs || [];
        }
        return json(200, { tipo: 'brand', campana: camp, contrato, notifyEmails: link.notify_emails || [] }, origin);
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
        await regCambio(scope.ct.campana_id, contenido_id, replace_id ? 'Reemplazó un script' : 'Subió un script');
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
        await regCambio(scope.ct.campana_id, contenido_id, replace_id ? 'Reemplazó el contenido' : 'Subió contenido');
        return json(200, { ok: true }, origin);
      }

      case 'record-stats': {
        if (link.tipo !== 'talent') return json(403, { error: 'Solo el talento sube estadísticas' }, origin);
        const { contenido_id, periodo, url_screenshot, nombre_archivo } = body;
        const scope = await assertContenidoScope(contenido_id);
        if (!scope.ok) return json(403, { error: 'Fuera de alcance' }, origin);
        const { error } = await sb.from('contenido_estadisticas').insert({ contenido_id, periodo, url_screenshot, nombre_archivo });
        if (error) throw error;
        await regCambio(scope.ct.campana_id, contenido_id, 'Subió estadísticas');
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
        await regCambio(scope.ct.campana_id, contenido_id, 'Cargó el link de publicación');
        return json(200, { ok: true }, origin);
      }

      case 'save-copy': {
        if (link.tipo !== 'talent') return json(403, { error: 'No permitido' }, origin);
        const { contenido_id, copy_texto } = body;
        const scope = await assertContenidoScope(contenido_id);
        if (!scope.ok) return json(403, { error: 'Fuera de alcance' }, origin);
        const { error } = await sb.from('contenidos').update({ copy_texto }).eq('id', contenido_id);
        if (error) throw error;
        await regCambio(scope.ct.campana_id, contenido_id, 'Guardó el copy/caption');
        return json(200, { ok: true }, origin);
      }

      case 'save-spark': {
        if (link.tipo !== 'talent') return json(403, { error: 'No permitido' }, origin);
        const { contenido_id, spark_code_texto } = body;
        const scope = await assertContenidoScope(contenido_id);
        if (!scope.ok) return json(403, { error: 'Fuera de alcance' }, origin);
        const { error } = await sb.from('contenidos').update({ spark_code_texto }).eq('id', contenido_id);
        if (error) throw error;
        await regCambio(scope.ct.campana_id, contenido_id, 'Guardó el Spark Code');
        return json(200, { ok: true }, origin);
      }

      // ── AVANZAR PASO (talento envía a revisión) ─────────────
      case 'advance': {
        const { contenido_id, accion } = body;
        const scope = await assertContenidoScope(contenido_id);
        if (!scope.ok) return json(403, { error: 'Fuera de alcance' }, origin);
        const { data, error } = await sb.rpc('avanzar_paso_contenido', {
          p_contenido_id: contenido_id, p_autor_id: null,
          p_autor_nombre: autorNombre,
          p_accion: accion || 'Enviado por talento',
        });
        if (error) throw error;
        await regCambio(scope.ct.campana_id, contenido_id, 'Envió a revisión');
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
        await regCambio(scope.ct.campana_id, contenido_id, tipo === 'script' ? 'Aprobó el script' : 'Aprobó el contenido');
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
        await regCambio(scope.ct.campana_id, contenido_id, 'Rechazó el contenido');
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
        await regCambio(scope.ct.campana_id, contenido_id, 'Dejó un comentario');
        return json(200, { ok: true }, origin);
      }

      // ── MARCA: URL firmada para subir briefs ────────────────
      case 'signed-upload-brief': {
        if (link.tipo !== 'brand') return json(403, { error: 'Solo la marca sube briefs' }, origin);
        const { kind, contenido_id, filename } = body;
        const safeName = String(filename || 'file').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
        let path;
        if (kind === 'content') {
          const scope = await assertContenidoScope(contenido_id);
          if (!scope.ok) return json(403, { error: 'Contenido fuera de alcance' }, origin);
          path = `contenido-${contenido_id}/brief-${Date.now()}-${safeName}`;
        } else {
          path = `campana-${link.campana_id}/${Date.now()}-${safeName}`;
        }
        const { data, error } = await sb.storage.from('campaign-briefs').createSignedUploadUrl(path);
        if (error) throw error;
        const { data: pub } = sb.storage.from('campaign-briefs').getPublicUrl(path);
        return json(200, { path, token: data.token, signedUrl: data.signedUrl, publicUrl: pub.publicUrl }, origin);
      }

      // ── MARCA: registrar brief GENERAL de campaña ───────────
      case 'record-brief-general': {
        if (link.tipo !== 'brand') return json(403, { error: 'Solo la marca sube briefs' }, origin);
        const { url, nombre, size_bytes } = body;
        if (!url) return json(400, { error: 'Falta el archivo' }, origin);
        const { error } = await sb.from('campana_briefs').insert({
          campana_id: link.campana_id, nombre: nombre || 'Brief', url, size_bytes: size_bytes || 0, uploaded_by: null,
        });
        if (error) throw error;
        // Auto-avanzar contenidos en paso 1 → "Esperando Script" (igual que el panel interno)
        const { data: cts } = await sb.from('campana_talentos').select('contenidos(id,paso_actual)').eq('campana_id', link.campana_id);
        const en1 = (cts || []).flatMap(ct => ct.contenidos || []).filter(c => c.paso_actual === 1);
        for (const c of en1) {
          await sb.rpc('avanzar_paso_contenido', { p_contenido_id: c.id, p_autor_id: null, p_autor_nombre: autorNombre, p_accion: 'Brief cargado por marca' });
        }
        await regCambio(link.campana_id, null, 'Cargó el brief de la campaña');
        return json(200, { ok: true, avanzados: en1.length }, origin);
      }

      // ── MARCA: registrar brief de un CONTENIDO ──────────────
      case 'record-brief-content': {
        if (link.tipo !== 'brand') return json(403, { error: 'Solo la marca sube briefs' }, origin);
        const { contenido_id, url, nombre, size_bytes } = body;
        if (!url) return json(400, { error: 'Falta el archivo' }, origin);
        const scope = await assertContenidoScope(contenido_id);
        if (!scope.ok) return json(403, { error: 'Fuera de alcance' }, origin);
        const { error } = await sb.from('contenido_briefs').insert({
          contenido_id, nombre: nombre || 'Brief', url, size_bytes: size_bytes || 0, uploaded_by: null,
        });
        if (error) throw error;
        await regCambio(scope.ct.campana_id, contenido_id, 'Cargó un brief de contenido');
        return json(200, { ok: true }, origin);
      }

      // ── MARCA: registrar/actualizar emails de notificación ──
      case 'set-emails': {
        if (link.tipo !== 'brand') return json(403, { error: 'No permitido' }, origin);
        let { emails } = body;
        if (!Array.isArray(emails)) emails = [];
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const clean = [...new Set(emails.map(e => String(e || '').trim().toLowerCase()).filter(e => re.test(e)))].slice(0, 10);
        const { error } = await sb.from('magic_links').update({ notify_emails: clean }).eq('id', link.id);
        if (error) throw error;
        return json(200, { ok: true, notifyEmails: clean }, origin);
      }

      // ── MARCA: comentario general de campaña (extra) ────────
      case 'campaign-comment': {
        if (link.tipo !== 'brand') return json(403, { error: 'No permitido' }, origin);
        const { mensaje } = body;
        if (!mensaje || !mensaje.trim()) return json(400, { error: 'Comentario vacío' }, origin);
        const { error } = await sb.from('campana_mensajes').insert({
          campana_id: link.campana_id, autor_id: null, autor_nombre: autorNombre, mensaje: mensaje.trim(),
        });
        if (error) throw error;
        await regCambio(link.campana_id, null, 'Envió un mensaje');
        return json(200, { ok: true }, origin);
      }

      // ── COMPLETAR DATOS PROPIOS (paso previo a la firma) ────
      case 'save-party-info': {
        const { contrato_id, nombre, rfc, domicilio } = body;
        if (!contrato_id) return json(400, { error: 'Falta contrato_id' }, origin);
        if (!nombre || !nombre.trim()) return json(400, { error: 'Falta tu nombre / razón social' }, origin);
        const scope = await assertContratoScope(contrato_id);
        if (!scope.ok) return json(403, { error: 'Contrato fuera de alcance' }, origin);
        if (scope.con.bloqueado || scope.con.estado === 'firmado') return json(400, { error: 'El contrato ya está firmado' }, origin);
        // talento = parte_b ; marca = parte_a
        const fields = actorTipo === 'marca'
          ? { parte_a_nombre: nombre.trim(), parte_a_rfc: (rfc || '').trim(), parte_a_domicilio: (domicilio || '').trim() }
          : { parte_b_nombre: nombre.trim(), parte_b_rfc: (rfc || '').trim(), parte_b_domicilio: (domicilio || '').trim() };
        fields.datos_contraparte_ok = true;
        fields.updated_at = new Date().toISOString();
        const { error } = await sb.from('contratos').update(fields).eq('id', contrato_id);
        if (error) throw error;
        const html = await regenerarContenido(contrato_id);
        await regCambio(scope.con.campana_id, null, 'Completó sus datos del contrato');
        return json(200, { ok: true, contenido_html: html }, origin);
      }

      // ── ID + SELFIE: subir documento de validación (bucket privado) ──
      case 'doc-upload': {
        const { contrato_id, tipo_doc, file_dataurl, nombre_archivo } = body;
        if (!contrato_id) return json(400, { error: 'Falta contrato_id' }, origin);
        if (!['identificacion', 'selfie'].includes(tipo_doc)) return json(400, { error: 'Tipo de documento inválido' }, origin);
        const m = /^data:(image\/(?:png|jpeg|jpg|webp)|application\/pdf);base64,(.+)$/.exec(file_dataurl || '');
        if (!m) return json(400, { error: 'Archivo inválido (imagen o PDF)' }, origin);
        const scope = await assertContratoScope(contrato_id);
        if (!scope.ok) return json(403, { error: 'Contrato fuera de alcance' }, origin);
        const buf = Buffer.from(m[2], 'base64');
        const ext = m[1] === 'application/pdf' ? 'pdf' : (m[1].split('/')[1] === 'jpeg' ? 'jpg' : m[1].split('/')[1]);
        const parte = actorTipo; // 'talento' | 'marca'
        const path = `contrato-${contrato_id}/${parte}-${tipo_doc}-${Date.now()}.${ext}`;
        const { error: upErr } = await sb.storage.from('contrato-docs').upload(path, buf, { contentType: m[1], upsert: true });
        if (upErr) throw upErr;
        // Reemplazar doc previo del mismo tipo/parte (mantener uno vigente)
        await sb.from('contrato_documentos').delete().eq('contrato_id', contrato_id).eq('parte', parte).eq('tipo_doc', tipo_doc);
        const { error } = await sb.from('contrato_documentos').insert({
          contrato_id, parte, tipo_doc, archivo_path: path, nombre_archivo: (nombre_archivo || '').toString().slice(0, 160),
        });
        if (error) throw error;
        await regCambio(scope.con.campana_id, null, `Cargó ${tipo_doc === 'selfie' ? 'su selfie' : 'su identificación'}`);
        return json(200, { ok: true }, origin);
      }

      // ── FIRMAR CONTRATO (talento o marca; gate ID+selfie; auditoría) ──
      case 'sign-contract': {
        const { contrato_id, firma_dataurl, firmante_nombre, consentimiento } = body;
        if (!contrato_id) return json(400, { error: 'Falta contrato_id' }, origin);
        if (!firmante_nombre || !firmante_nombre.trim()) return json(400, { error: 'Escribí tu nombre completo' }, origin);
        if (!consentimiento || !String(consentimiento).trim()) return json(400, { error: 'Tenés que aceptar la declaración para firmar' }, origin);
        const m = /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/.exec(firma_dataurl || '');
        if (!m) return json(400, { error: 'Firma inválida' }, origin);

        const scope = await assertContratoScope(contrato_id);
        if (!scope.ok) return json(403, { error: 'Contrato fuera de alcance' }, origin);
        const con = scope.con;
        if (con.estado === 'firmado') return json(400, { error: 'Este contrato ya está firmado' }, origin);
        if (con.estado !== 'enviado') return json(400, { error: 'Este contrato todavía no está disponible para firmar' }, origin);

        // Gate 1: la contraparte tiene que haber completado sus datos primero.
        if (!con.datos_contraparte_ok) return json(400, { error: 'Primero completá tus datos del contrato.', needsData: true }, origin);

        // Gate 2: requiere identificación + selfie de esta parte antes de firmar.
        const parte = actorTipo;
        const { data: docs } = await sb.from('contrato_documentos').select('tipo_doc').eq('contrato_id', contrato_id).eq('parte', parte);
        const have = new Set((docs || []).map(d => d.tipo_doc));
        if (!have.has('identificacion') || !have.has('selfie')) {
          return json(400, { error: 'Antes de firmar tenés que subir tu identificación y una selfie.', needsDocs: true }, origin);
        }

        const buf = Buffer.from(m[2], 'base64');
        const ext = m[1].split('/')[1] === 'jpeg' ? 'jpg' : m[1].split('/')[1];
        const path = `firmas/contrato-${contrato_id}/${parte}-${Date.now()}.${ext}`;
        const { error: upErr } = await sb.storage.from('contratos').upload(path, buf, { contentType: m[1], upsert: true });
        if (upErr) throw upErr;
        const { data: pub } = sb.storage.from('contratos').getPublicUrl(path);

        // Hash del documento firmado (congela el contenido para auditoría).
        const crypto = require('crypto');
        const contenidoHash = crypto.createHash('sha256').update(String(con.contenido_html || '')).digest('hex');
        const ua = (event.headers || {})['user-agent'] || '';
        const nowIso = new Date().toISOString();

        // ¿Ya firmó la agencia? Si sí, este es el segundo lado → bloquear.
        const { data: full } = await sb.from('contratos').select('firma_agencia_url').eq('id', contrato_id).maybeSingle();
        const ambasFirmas = !!(full && full.firma_agencia_url);

        const { error: uErr } = await sb.from('contratos').update({
          estado: 'firmado',
          firma_url: pub.publicUrl,
          firmante_nombre: firmante_nombre.trim(),
          firmado_at: nowIso,
          firma_ip: clientIp(),
          firma_user_agent: ua,
          firma_consentimiento_texto: String(consentimiento).slice(0, 500),
          contenido_hash: contenidoHash,
          bloqueado: ambasFirmas ? true : con.bloqueado || false,
          updated_at: nowIso,
        }).eq('id', contrato_id);
        if (uErr) throw uErr;

        // Bitácora inmutable de auditoría
        await sb.from('contrato_firma_eventos').insert({
          contrato_id, lado: parte, evento: 'firmado',
          firmante_nombre: firmante_nombre.trim(), ip: clientIp(), user_agent: ua,
          hash: contenidoHash, consentimiento: String(consentimiento).slice(0, 500),
        }).then(() => {}, () => {});

        await regCambio(con.campana_id, null, 'Firmó el contrato');
        return json(200, { ok: true, firma_url: pub.publicUrl }, origin);
      }

      // ── COMENTAR UN CONTRATO (talento o marca pide cambios) ──
      case 'contrato-comment': {
        const { contrato_id, mensaje, autor_nombre } = body;
        if (!contrato_id) return json(400, { error: 'Falta contrato_id' }, origin);
        if (!mensaje || !mensaje.trim()) return json(400, { error: 'Escribí tu comentario' }, origin);
        const scope = await assertContratoScope(contrato_id);
        if (!scope.ok) return json(403, { error: 'Contrato fuera de alcance' }, origin);
        const { data, error } = await sb.from('contrato_comentarios').insert({
          contrato_id,
          autor_tipo: actorTipo,            // 'talento' | 'marca'
          autor_nombre: (autor_nombre || autorNombre || '').toString().slice(0, 120),
          mensaje: mensaje.trim(),
        }).select().maybeSingle();
        if (error) throw error;
        await regCambio(scope.con.campana_id, null, 'Comentó el contrato');
        return json(200, { ok: true, comentario: data }, origin);
      }

      // ── TALENTO: guardar/actualizar una cuenta de pago ──────
      case 'save-cuenta': {
        if (link.tipo !== 'talent') return json(403, { error: 'No permitido' }, origin);
        const { cuenta } = body;
        if (!cuenta || !cuenta.pais) return json(400, { error: 'Elegí el país' }, origin);
        if (!cuenta.nombre_completo || !cuenta.nombre_completo.trim()) return json(400, { error: 'Falta el nombre completo del titular' }, origin);
        const row = {
          talent_id: link.talent_id,
          pais: String(cuenta.pais),
          nombre_completo: String(cuenta.nombre_completo).trim(),
          banco: String(cuenta.banco || ''),
          datos_cuenta: cuenta.datos_cuenta && typeof cuenta.datos_cuenta === 'object' ? cuenta.datos_cuenta : {},
          direccion: cuenta.direccion && typeof cuenta.direccion === 'object' ? cuenta.direccion : {},
          moneda: String(cuenta.moneda || ''),
          alias: String(cuenta.alias || ''),
          es_default: !!cuenta.es_default,
        };
        // Si se marca como default, desmarcar las demás del talento
        if (row.es_default) {
          await sb.from('talento_cuentas_pago').update({ es_default: false }).eq('talent_id', link.talent_id);
        }
        let saved;
        if (cuenta.id) {
          const { data, error } = await sb.from('talento_cuentas_pago')
            .update(row).eq('id', cuenta.id).eq('talent_id', link.talent_id).select().maybeSingle();
          if (error) throw error;
          saved = data;
        } else {
          // primera cuenta del talento → default automático
          const { count } = await sb.from('talento_cuentas_pago').select('id', { count: 'exact', head: true }).eq('talent_id', link.talent_id);
          if (!count) row.es_default = true;
          const { data, error } = await sb.from('talento_cuentas_pago').insert(row).select().maybeSingle();
          if (error) throw error;
          saved = data;
        }
        return json(200, { ok: true, cuenta: saved }, origin);
      }

      case 'delete-cuenta': {
        if (link.tipo !== 'talent') return json(403, { error: 'No permitido' }, origin);
        const { cuenta_id } = body;
        if (!cuenta_id) return json(400, { error: 'Falta cuenta_id' }, origin);
        const { error } = await sb.from('talento_cuentas_pago').delete().eq('id', cuenta_id).eq('talent_id', link.talent_id);
        if (error) throw error;
        return json(200, { ok: true }, origin);
      }

      case 'set-default-cuenta': {
        if (link.tipo !== 'talent') return json(403, { error: 'No permitido' }, origin);
        const { cuenta_id } = body;
        if (!cuenta_id) return json(400, { error: 'Falta cuenta_id' }, origin);
        await sb.from('talento_cuentas_pago').update({ es_default: false }).eq('talent_id', link.talent_id);
        const { error } = await sb.from('talento_cuentas_pago').update({ es_default: true }).eq('id', cuenta_id).eq('talent_id', link.talent_id);
        if (error) throw error;
        return json(200, { ok: true }, origin);
      }

      // ── TALENTO: URL firmada para subir la factura (CxP) ────
      case 'invoice-signed-upload': {
        if (link.tipo !== 'talent') return json(403, { error: 'No permitido' }, origin);
        const { campana_talento_id, filename } = body;
        const scope = await assertTalentCt(campana_talento_id);
        if (!scope.ok) return json(403, { error: 'Fuera de alcance' }, origin);
        if (!invoiceUnlocked(scope.ct)) return json(400, { error: 'Podés facturar recién cuando todos los contenidos estén listos' }, origin);
        const path = `campana-${scope.ct.campana_id}/invoice-talento-${scope.ct.talent_id}/${Date.now()}-${safeFile(filename)}`;
        const { data, error } = await sb.storage.from('finanzas').createSignedUploadUrl(path);
        if (error) throw error;
        const { data: pub } = sb.storage.from('finanzas').getPublicUrl(path);
        return json(200, { path, token: data.token, signedUrl: data.signedUrl, publicUrl: pub.publicUrl }, origin);
      }

      // ── TALENTO: registrar factura SUBIDA (archivo propio) ──
      case 'set-invoice': {
        if (link.tipo !== 'talent') return json(403, { error: 'No permitido' }, origin);
        const { campana_talento_id, invoice_url } = body;
        if (!invoice_url) return json(400, { error: 'Falta el archivo' }, origin);
        const scope = await assertTalentCt(campana_talento_id);
        if (!scope.ok) return json(403, { error: 'Fuera de alcance' }, origin);
        if (!invoiceUnlocked(scope.ct)) return json(400, { error: 'Podés facturar recién cuando todos los contenidos estén listos' }, origin);
        const { error } = await sb.from('campana_talentos').update({ invoice_url, factura_tipo: 'subida' }).eq('id', campana_talento_id);
        if (error) throw error;
        await regCambio(scope.ct.campana_id, null, 'Subió su factura (invoice)');
        await notifyFinanzasInvoice(scope.ct, invoice_url, 'subida', null);
        return json(200, { ok: true }, origin);
      }

      // ── TALENTO: registrar factura GENERADA (PDF + datos) ───
      case 'create-invoice': {
        if (link.tipo !== 'talent') return json(403, { error: 'No permitido' }, origin);
        const { campana_talento_id, invoice_url, factura_datos } = body;
        if (!invoice_url) return json(400, { error: 'Falta el PDF generado' }, origin);
        const scope = await assertTalentCt(campana_talento_id);
        if (!scope.ok) return json(403, { error: 'Fuera de alcance' }, origin);
        if (!invoiceUnlocked(scope.ct)) return json(400, { error: 'Podés facturar recién cuando todos los contenidos estén listos' }, origin);
        const { error } = await sb.from('campana_talentos').update({
          invoice_url,
          factura_tipo: 'generada',
          factura_datos: factura_datos && typeof factura_datos === 'object' ? factura_datos : {},
        }).eq('id', campana_talento_id);
        if (error) throw error;
        await regCambio(scope.ct.campana_id, null, 'Generó su factura (invoice)');
        await notifyFinanzasInvoice(scope.ct, invoice_url, 'generada', factura_datos);
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
