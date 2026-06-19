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
-- │ F. ESTADO AUTOMÁTICO — campaña → 'finalizada'                 │
-- │    Cuando TODAS las facturas están 'cobrada' (CxC) y TODOS    │
-- │    los talentos 'pagado' (CxP), la campaña pasa a finalizada. │
-- └──────────────────────────────────────────────────────────────┘
CREATE OR REPLACE FUNCTION check_campana_finalizada(p_campana_id integer) RETURNS void AS $$
DECLARE
  v_estado          text;
  v_facts_activas   int;
  v_facts_cobradas  int;
  v_tal_total       int;
  v_tal_pagados     int;
BEGIN
  IF p_campana_id IS NULL THEN RETURN; END IF;
  SELECT estado INTO v_estado FROM campanas WHERE id = p_campana_id;
  IF v_estado IS NULL OR v_estado IN ('finalizada','cancelada') THEN RETURN; END IF;

  SELECT count(*) FILTER (WHERE estado <> 'cancelada'),
         count(*) FILTER (WHERE estado = 'cobrada')
    INTO v_facts_activas, v_facts_cobradas
    FROM facturas WHERE campana_id = p_campana_id;

  SELECT count(*),
         count(*) FILTER (WHERE pago_estado = 'pagado' OR COALESCE(fee_talento,0) = 0)
    INTO v_tal_total, v_tal_pagados
    FROM campana_talentos WHERE campana_id = p_campana_id;

  -- Debe haber al menos una factura activa, todas cobradas, y todos los talentos pagados
  IF v_facts_activas > 0 AND v_facts_cobradas = v_facts_activas
     AND (v_tal_total = 0 OR v_tal_pagados = v_tal_total) THEN
    UPDATE campanas SET estado = 'finalizada', updated_at = now()
      WHERE id = p_campana_id AND estado NOT IN ('finalizada','cancelada');
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Dispara la verificación cuando cambia una factura (p.ej. pasa a 'cobrada')
CREATE OR REPLACE FUNCTION trg_chk_camp_fin_fact() RETURNS trigger AS $$
BEGIN
  PERFORM check_campana_finalizada(NEW.campana_id);
  RETURN NULL;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_camp_fin_fact ON facturas;
CREATE TRIGGER trg_camp_fin_fact AFTER INSERT OR UPDATE ON facturas
  FOR EACH ROW EXECUTE FUNCTION trg_chk_camp_fin_fact();

-- Dispara la verificación cuando cambia el pago de un talento (p.ej. pasa a 'pagado')
CREATE OR REPLACE FUNCTION trg_chk_camp_fin_ct() RETURNS trigger AS $$
BEGIN
  PERFORM check_campana_finalizada(COALESCE(NEW.campana_id, OLD.campana_id));
  RETURN NULL;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_camp_fin_ct ON campana_talentos;
CREATE TRIGGER trg_camp_fin_ct AFTER INSERT OR UPDATE OR DELETE ON campana_talentos
  FOR EACH ROW EXECUTE FUNCTION trg_chk_camp_fin_ct();
