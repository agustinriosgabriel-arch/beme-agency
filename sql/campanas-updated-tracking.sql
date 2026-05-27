-- Agrega tracking de "última actualización" en campañas.
-- updated_at se autocompleta con trigger; updated_by lo setea la app (currentUser.id).
-- Ejecutar una sola vez en Supabase SQL editor.

ALTER TABLE campanas
  ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);

-- Backfill: para filas existentes, copiamos created_at como punto de partida
UPDATE campanas
  SET updated_at = COALESCE(updated_at, created_at)
  WHERE updated_at IS NULL;

-- Trigger: en cada UPDATE, bumpea updated_at a now()
CREATE OR REPLACE FUNCTION trg_campanas_touch()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_campanas_touch ON campanas;
CREATE TRIGGER trg_campanas_touch
  BEFORE UPDATE ON campanas
  FOR EACH ROW EXECUTE FUNCTION trg_campanas_touch();
