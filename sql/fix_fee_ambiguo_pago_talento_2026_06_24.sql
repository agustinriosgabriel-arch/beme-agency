-- ════════════════════════════════════════════════════════════════
-- FIX: "column reference \"fee\" is ambiguous" al registrar un pago a talento
-- Fecha: 2026-06-24
-- Idempotente: se puede re-ejecutar.
-- ════════════════════════════════════════════════════════════════
-- PROBLEMA REPORTADO:
--   Al registrar un pago a talento en Finanzas → CxP, Supabase devuelve:
--     ERROR: column reference "fee" is ambiguous (SQLSTATE 42702)
--   y el pago no se guarda.
--
-- CAUSA:
--   La tabla `campana_talentos` tiene una columna LEGACY llamada `fee`
--   (ver schema_unificado.sql: "fee numeric, -- legacy").
--   El trigger trg_sync_ct_pago() (fase2_finanzas_2026_06_12.sql) declara
--   una variable PL/pgSQL TAMBIÉN llamada `fee`, y luego hace:
--       UPDATE campana_talentos SET
--         pago_estado = CASE WHEN total >= fee AND fee > 0 ...
--   Dentro de ese UPDATE, `fee` es ambiguo entre la variable y la columna
--   campana_talentos.fee → Postgres aborta (plpgsql.variable_conflict=error).
--
-- FIX:
--   Renombrar la variable `fee` → `v_fee` (sin colisión con ninguna columna).
--   CREATE OR REPLACE conserva el OID, así que el trigger sigue apuntando aquí.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION trg_sync_ct_pago() RETURNS trigger AS $$
DECLARE
  cid integer;
  total numeric;
  v_fee numeric;
  ultima date;
BEGIN
  cid := COALESCE(NEW.campana_talento_id, OLD.campana_talento_id);
  IF cid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT COALESCE(SUM(monto), 0), MAX(fecha_pago) INTO total, ultima
    FROM pagos_talento WHERE campana_talento_id = cid;
  SELECT COALESCE(fee_talento, 0) INTO v_fee FROM campana_talentos WHERE id = cid;
  UPDATE campana_talentos SET
    pago_estado = CASE
      WHEN total >= v_fee AND v_fee > 0 THEN 'pagado'
      WHEN total > 0 THEN 'parcial'
      ELSE 'pendiente'
    END,
    pago_fecha = ultima,
    updated_at = now()
  WHERE id = cid;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
