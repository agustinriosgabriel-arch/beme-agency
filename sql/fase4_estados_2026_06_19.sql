-- ══════════════════════════════════════════════════════════════════
-- FASE 4 — REDEFINICIÓN DE ESTADOS (2026-06-19)
-- Ejecutar en Supabase SQL Editor (proyecto ngstqwbzvnpggpklifat).
-- Idempotente: se puede re-ejecutar sin romper.
--
-- CAMBIO DE REGLAS (pedido del negocio):
--
--   General de campaña (campanas.estado):
--     → finalizada cuando se TERMINAN TODOS LOS CONTENIDOS de todas las
--       sub-campañas, INDEPENDIENTE del cobro (CxC) y del pago (CxP).
--       Es decir: todos los talentos quedaron en etapa_finanzas o finalizada.
--
--   Sub-campaña por talento (campana_talentos.estado):
--     → finalizada cuando el talento está PAGADO (pago_estado=pagado)
--       Y sus acciones/contenidos están TERMINADOS (paso_actual >= 8).
--     → etapa_finanzas: acciones terminadas pero falta el pago.
--
--   cancelada / pausada siguen siendo manuales (no se auto-pisan).
-- ══════════════════════════════════════════════════════════════════

-- ── Recalcular estado de un talento (sub-campaña) ──
-- finalizada = pagado Y todas las acciones terminadas.
CREATE OR REPLACE FUNCTION recompute_talento_estado(p_ct_id integer) RETURNS void AS $$
DECLARE
  v_ct          campana_talentos%ROWTYPE;
  v_total_cont  int;
  v_pendientes  int;
  v_nuevo       text;
BEGIN
  SELECT * INTO v_ct FROM campana_talentos WHERE id = p_ct_id;
  IF NOT FOUND THEN RETURN; END IF;
  -- Estados manuales son fijos (no se auto-pisan)
  IF v_ct.estado IN ('cancelada','pausada') THEN RETURN; END IF;

  SELECT count(*), count(*) FILTER (WHERE COALESCE(paso_actual,0) < 8)
    INTO v_total_cont, v_pendientes
    FROM contenidos WHERE campana_talento_id = p_ct_id;

  IF v_total_cont > 0 AND v_pendientes = 0 AND v_ct.pago_estado = 'pagado' THEN
    v_nuevo := 'finalizada';                 -- pagado Y todas las acciones terminadas
  ELSIF v_total_cont > 0 AND v_pendientes = 0 THEN
    v_nuevo := 'etapa_finanzas';             -- acciones terminadas, falta el pago
  ELSIF v_total_cont = 0 THEN
    v_nuevo := 'sin_iniciar';                -- sin contenidos cargados
  ELSE
    v_nuevo := 'en_curso';
  END IF;

  UPDATE campana_talentos SET estado = v_nuevo, updated_at = now()
    WHERE id = p_ct_id AND estado IS DISTINCT FROM v_nuevo
      AND estado NOT IN ('cancelada','pausada');
END;
$$ LANGUAGE plpgsql;

-- ── Recalcular estado GENERAL de la campaña ──
-- finalizada = TODOS los contenidos terminados (todos los talentos en
-- etapa_finanzas o finalizada), INDEPENDIENTE del cobro y del pago.
CREATE OR REPLACE FUNCTION recompute_campana_estado(p_camp_id integer) RETURNS void AS $$
DECLARE
  v_estado      text;
  v_tal_total   int;
  v_tal_done    int;
  v_tal_sin     int;
  v_nuevo       text;
BEGIN
  IF p_camp_id IS NULL THEN RETURN; END IF;
  SELECT estado INTO v_estado FROM campanas WHERE id = p_camp_id;
  IF v_estado IS NULL OR v_estado IN ('cancelada','pausada') THEN RETURN; END IF;

  -- Denominador: talentos no cancelados (un talento cancelado no bloquea).
  SELECT count(*) FILTER (WHERE estado <> 'cancelada'),
         count(*) FILTER (WHERE estado IN ('etapa_finanzas','finalizada')),
         count(*) FILTER (WHERE estado = 'sin_iniciar')
    INTO v_tal_total, v_tal_done, v_tal_sin
    FROM campana_talentos WHERE campana_id = p_camp_id;

  IF v_tal_total > 0 AND v_tal_done = v_tal_total THEN
    v_nuevo := 'finalizada';                 -- todos los contenidos terminados (independiente del cobro)
  ELSIF v_tal_total = 0 OR v_tal_sin = v_tal_total THEN
    v_nuevo := 'sin_iniciar';
  ELSE
    v_nuevo := 'en_curso';
  END IF;

  UPDATE campanas SET estado = v_nuevo, updated_at = now()
    WHERE id = p_camp_id AND estado IS DISTINCT FROM v_nuevo
      AND estado NOT IN ('cancelada','pausada');
END;
$$ LANGUAGE plpgsql;

-- (Los triggers trg_cont_recompute / trg_fact_recompute / trg_ct_recompute
--  de la fase 3 siguen vigentes y ahora usan estas nuevas definiciones.)

-- ── Backfill: re-aplica las nuevas reglas a todo lo existente ──
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id FROM campana_talentos LOOP PERFORM recompute_talento_estado(r.id); END LOOP;
  FOR r IN SELECT id FROM campanas LOOP PERFORM recompute_campana_estado(r.id); END LOOP;
END $$;
