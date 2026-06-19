-- ══════════════════════════════════════════════════════════════════
-- FASE 3 — FINANZAS UX (2026-06-19)
-- Ejecutar en Supabase SQL Editor (proyecto ngstqwbzvnpggpklifat).
-- Idempotente: se puede re-ejecutar sin romper.
--
-- Qué agrega:
--   A. facturas.dias_habiles → la fecha de cobro estimada (fecha_vencimiento)
--      puede contar días NATURALES (default) o HÁBILES (salta sáb/dom).
--   B. campana_talentos.fecha_pago_estimada → fecha estimada de pago al talento
--      (default sugerido en UI = cobro estimado de la campaña + 15 días).
--   C. campana_talentos.invoice_url → invoice cargado por/para el talento (CxP).
-- ══════════════════════════════════════════════════════════════════

-- ┌──────────────────────────────────────────────────────────────┐
-- │ A. FACTURAS — días hábiles vs naturales                      │
-- └──────────────────────────────────────────────────────────────┘
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS dias_habiles boolean DEFAULT false;

-- Suma N días hábiles a una fecha (salta sábado y domingo; ignora feriados)
CREATE OR REPLACE FUNCTION add_business_days(start_date date, n integer)
RETURNS date AS $$
DECLARE
  d date := start_date;
  added integer := 0;
BEGIN
  IF start_date IS NULL THEN RETURN NULL; END IF;
  IF n IS NULL OR n <= 0 THEN RETURN start_date; END IF;
  WHILE added < n LOOP
    d := d + 1;
    -- isodow: 6 = sábado, 7 = domingo
    IF EXTRACT(ISODOW FROM d) < 6 THEN
      added := added + 1;
    END IF;
  END LOOP;
  RETURN d;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Vencimiento (= fecha de cobro estimada): naturales o hábiles según dias_habiles
CREATE OR REPLACE FUNCTION trg_factura_vencimiento() RETURNS trigger AS $$
BEGIN
  IF NEW.fecha_emision IS NOT NULL THEN
    IF COALESCE(NEW.dias_habiles, false) THEN
      NEW.fecha_vencimiento := add_business_days(NEW.fecha_emision, COALESCE(NEW.dias_credito, 0));
    ELSE
      NEW.fecha_vencimiento := NEW.fecha_emision + COALESCE(NEW.dias_credito, 0);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- (el trigger trg_factura_venc de fase2 ya invoca esta función; no hay que recrearlo)

-- Backfill: recalcula vencimientos de facturas con días hábiles ya marcados
UPDATE facturas SET fecha_vencimiento = add_business_days(fecha_emision, COALESCE(dias_credito, 0))
  WHERE fecha_emision IS NOT NULL AND COALESCE(dias_habiles, false) = true;

-- ┌──────────────────────────────────────────────────────────────┐
-- │ B + C. CAMPANA_TALENTOS — pago estimado + invoice (CxP)       │
-- └──────────────────────────────────────────────────────────────┘
ALTER TABLE campana_talentos ADD COLUMN IF NOT EXISTS fecha_pago_estimada date;
ALTER TABLE campana_talentos ADD COLUMN IF NOT EXISTS invoice_url text DEFAULT '';

-- ┌──────────────────────────────────────────────────────────────┐
-- │ D. CAMPANA_TALENTOS — moneda separada marca (CxC) vs talento  │
-- │    El fee que cobra la marca puede estar en una moneda        │
-- │    distinta del fee que se paga al talento.                   │
-- └──────────────────────────────────────────────────────────────┘
ALTER TABLE campana_talentos ADD COLUMN IF NOT EXISTS moneda_marca text;
ALTER TABLE campana_talentos ADD COLUMN IF NOT EXISTS moneda_talento text;

-- Backfill: ambas heredan la moneda única existente (o USD)
UPDATE campana_talentos
   SET moneda_marca   = COALESCE(moneda_marca, moneda, 'USD'),
       moneda_talento = COALESCE(moneda_talento, moneda, 'USD');

-- ┌──────────────────────────────────────────────────────────────┐
-- │ E. CONTABILIDAD — casillas QuickBooks (control de la contadora)│
-- │    Marca si el movimiento ya fue cargado en QuickBooks.       │
-- │    Permanentes en la fila (no dependen de que exista factura, │
-- │    porque a veces la contadora crea/sube la factura después). │
-- └──────────────────────────────────────────────────────────────┘
-- CxC: a nivel CAMPAÑA (la fila de CxC es por campaña) → factura y cobro en QB.
-- Clickeables siempre, aunque la factura todavía no exista (la contadora la
-- carga/sube después).
ALTER TABLE campanas ADD COLUMN IF NOT EXISTS qb_factura boolean DEFAULT false;
ALTER TABLE campanas ADD COLUMN IF NOT EXISTS qb_cobro   boolean DEFAULT false;
-- CxP: a nivel talento de la campaña → invoice del talento en QB y pago en QB
ALTER TABLE campana_talentos ADD COLUMN IF NOT EXISTS qb_factura boolean DEFAULT false;
ALTER TABLE campana_talentos ADD COLUMN IF NOT EXISTS qb_pago    boolean DEFAULT false;

-- ┌──────────────────────────────────────────────────────────────┐
-- │ F. ESTADOS EN DOS NIVELES (general de campaña + por talento)  │
-- │                                                              │
-- │  General de campaña (campanas.estado):                       │
-- │    sin_iniciar · en_curso · finalizada · cancelada · pausada │
-- │    - finalizada: TODAS las facturas cobradas (CxC) y TODOS   │
-- │      los talentos finalizados (= pagados en CxP).            │
-- │    - cancelada / pausada: manuales (kanban), no se auto-pisan.│
-- │                                                              │
-- │  Sub-campaña por talento (campana_talentos.estado):          │
-- │    sin_iniciar · en_curso · etapa_finanzas · finalizada ·    │
-- │    cancelada · pausada                                       │
-- │    - etapa_finanzas: el talento completó todos sus contenidos│
-- │      (paso_actual >= 8).                                     │
-- │    - finalizada: se le pagó al talento (pago_estado=pagado). │
-- │    - cancelada / pausada: manuales, no se auto-pisan.        │
-- │                                                              │
-- │  Finanzas filtra por el estado del TALENTO.                  │
-- └──────────────────────────────────────────────────────────────┘

-- Estado por talento (sub-campaña)
ALTER TABLE campana_talentos ADD COLUMN IF NOT EXISTS estado text DEFAULT 'en_curso';

-- Migración del estado GENERAL: 'etapa_finanzas' ya no es estado general → en_curso.
-- (Se conserva 'sin_iniciar'.)
UPDATE campanas SET estado = 'en_curso' WHERE estado = 'etapa_finanzas';

-- ── Recalcular estado de un talento ──
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

  IF v_ct.pago_estado = 'pagado' THEN
    v_nuevo := 'finalizada';                 -- se le pagó al talento → finalizada
  ELSIF v_total_cont > 0 AND v_pendientes = 0 THEN
    v_nuevo := 'etapa_finanzas';             -- todos sus contenidos completados
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
CREATE OR REPLACE FUNCTION recompute_campana_estado(p_camp_id integer) RETURNS void AS $$
DECLARE
  v_estado      text;
  v_tal_total   int;
  v_tal_fin     int;
  v_tal_sin     int;
  v_facts_act   int;
  v_facts_cob   int;
  v_nuevo       text;
BEGIN
  IF p_camp_id IS NULL THEN RETURN; END IF;
  SELECT estado INTO v_estado FROM campanas WHERE id = p_camp_id;
  IF v_estado IS NULL OR v_estado IN ('cancelada','pausada') THEN RETURN; END IF;

  SELECT count(*),
         count(*) FILTER (WHERE estado = 'finalizada'),
         count(*) FILTER (WHERE estado = 'sin_iniciar')
    INTO v_tal_total, v_tal_fin, v_tal_sin
    FROM campana_talentos WHERE campana_id = p_camp_id;

  SELECT count(*) FILTER (WHERE estado <> 'cancelada'),
         count(*) FILTER (WHERE estado = 'cobrada')
    INTO v_facts_act, v_facts_cob
    FROM facturas WHERE campana_id = p_camp_id;

  IF v_tal_total > 0 AND v_tal_fin = v_tal_total
     AND v_facts_act > 0 AND v_facts_cob = v_facts_act THEN
    v_nuevo := 'finalizada';                 -- todo cobrado (CxC) y pagado (CxP)
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

-- ── Triggers que disparan los recálculos ──
-- Contenido cambia (paso_actual) → recalcula su talento y la campaña
CREATE OR REPLACE FUNCTION trg_recompute_from_contenido() RETURNS trigger AS $$
DECLARE v_ct int; v_camp int;
BEGIN
  v_ct := COALESCE(NEW.campana_talento_id, OLD.campana_talento_id);
  PERFORM recompute_talento_estado(v_ct);
  SELECT campana_id INTO v_camp FROM campana_talentos WHERE id = v_ct;
  PERFORM recompute_campana_estado(v_camp);
  RETURN NULL;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_cont_recompute ON contenidos;
CREATE TRIGGER trg_cont_recompute AFTER INSERT OR UPDATE OR DELETE ON contenidos
  FOR EACH ROW EXECUTE FUNCTION trg_recompute_from_contenido();

-- Factura cambia (p.ej. pasa a 'cobrada') → recalcula todos los talentos + campaña
CREATE OR REPLACE FUNCTION trg_recompute_from_factura() RETURNS trigger AS $$
DECLARE v_camp int; r record;
BEGIN
  v_camp := COALESCE(NEW.campana_id, OLD.campana_id);
  FOR r IN SELECT id FROM campana_talentos WHERE campana_id = v_camp LOOP
    PERFORM recompute_talento_estado(r.id);
  END LOOP;
  PERFORM recompute_campana_estado(v_camp);
  RETURN NULL;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_fact_recompute ON facturas;
CREATE TRIGGER trg_fact_recompute AFTER INSERT OR UPDATE OR DELETE ON facturas
  FOR EACH ROW EXECUTE FUNCTION trg_recompute_from_factura();

-- Talento cambia (pago_estado, etc.) → recalcula su estado y el de la campaña.
-- El guard "estado IS DISTINCT FROM" en los recompute evita bucles infinitos.
CREATE OR REPLACE FUNCTION trg_recompute_from_ct() RETURNS trigger AS $$
DECLARE v_camp int;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    PERFORM recompute_talento_estado(NEW.id);
  END IF;
  v_camp := COALESCE(NEW.campana_id, OLD.campana_id);
  PERFORM recompute_campana_estado(v_camp);
  RETURN NULL;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_ct_recompute ON campana_talentos;
CREATE TRIGGER trg_ct_recompute AFTER INSERT OR UPDATE OR DELETE ON campana_talentos
  FOR EACH ROW EXECUTE FUNCTION trg_recompute_from_ct();

-- ── Backfill inicial de estados ──
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id FROM campana_talentos LOOP PERFORM recompute_talento_estado(r.id); END LOOP;
  FOR r IN SELECT id FROM campanas LOOP PERFORM recompute_campana_estado(r.id); END LOOP;
END $$;
