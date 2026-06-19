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
