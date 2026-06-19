-- ═══════════════════════════════════════════════════════════════
-- CONTRATOS — adjuntar PDF externo y vincularlo a la campaña
-- ═══════════════════════════════════════════════════════════════
-- Idempotente / re-ejecutable.
--
-- Muchas veces el contrato lo manda la contraparte desde afuera. Estas
-- columnas permiten subir ese archivo (al bucket público `contratos`) y
-- dejarlo vinculado a la campaña / talento, sin pasar por la plantilla.
-- ───────────────────────────────────────────────────────────────

ALTER TABLE contratos ADD COLUMN IF NOT EXISTS archivo_url    text DEFAULT '';
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS archivo_nombre text DEFAULT '';
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS es_externo     boolean DEFAULT false;

-- Nota: el bucket `contratos` ya existe y es público. Si no estuviera,
-- crealo en Supabase → Storage (public = true).
