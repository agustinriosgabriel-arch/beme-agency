-- ════════════════════════════════════════════════════════════════
-- FECHA DE ÚLTIMA CARGA DE VALORES DEL TALENTO
-- Fecha: 2026-10-16
-- ════════════════════════════════════════════════════════════════
-- Objetivo:
--   El equipo comercial necesita saber qué tan vieja es la tarifa que
--   figura en la ficha (talentos.valores). Se agrega
--   `valores_updated_at` y un trigger que la pone en now() cada vez que
--   el texto de `valores` cambia, venga de donde venga (modal de edición
--   del dashboard, "Valores Extras" de prospección, importaciones).
--   Si `valores` queda vacío, la fecha se limpia.
--
--   Backfill: para los talentos que ya tienen valores, se toma la última
--   cotización registrada en talento_cotizaciones. Los que no tienen
--   registro quedan en NULL y la ficha muestra "sin fecha registrada"
--   hasta la próxima carga.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE talentos ADD COLUMN IF NOT EXISTS valores_updated_at timestamptz;

CREATE OR REPLACE FUNCTION talentos_touch_valores() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.valores, '') <> '' AND NEW.valores_updated_at IS NULL THEN
      NEW.valores_updated_at := now();
    END IF;
  ELSIF coalesce(NEW.valores, '') IS DISTINCT FROM coalesce(OLD.valores, '') THEN
    NEW.valores_updated_at := CASE WHEN coalesce(NEW.valores, '') = '' THEN NULL ELSE now() END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_talentos_touch_valores ON talentos;
CREATE TRIGGER trg_talentos_touch_valores
  BEFORE INSERT OR UPDATE ON talentos
  FOR EACH ROW EXECUTE FUNCTION talentos_touch_valores();

-- Backfill desde el historial de cotizaciones de prospección.
UPDATE talentos t
SET valores_updated_at = c.last_at
FROM (
  SELECT talento_id, max(created_at) AS last_at
  FROM talento_cotizaciones
  GROUP BY talento_id
) c
WHERE c.talento_id = t.id
  AND t.valores_updated_at IS NULL
  AND coalesce(t.valores, '') <> '';

NOTIFY pgrst, 'reload schema';
