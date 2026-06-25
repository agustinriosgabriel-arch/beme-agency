-- ══════════════════════════════════════════════════════════════════
-- CONTRATO — FIRMA DEL TALENTO (2026-06-25)
-- Ejecutar en Supabase SQL Editor (proyecto ngstqwbzvnpggpklifat).
-- Idempotente: se puede re-ejecutar sin romper.
--
-- Qué agrega:
--   El talento firma su contrato (contratos.tipo='talento') desde su
--   magic link (talento-link.html), dibujando la firma en un canvas.
--   La firma se sube como imagen al bucket público `contratos` y se
--   registran nombre del firmante + timestamp + IP.
--
--   Flujo: el equipo crea el contrato y lo pone en estado 'enviado'.
--   Al firmar, magic-api lo pasa a 'firmado' y completa estos campos.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE contratos ADD COLUMN IF NOT EXISTS firma_url        text DEFAULT '';
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS firmante_nombre  text DEFAULT '';
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS firmado_at       timestamptz;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS firma_ip         text DEFAULT '';

COMMENT ON COLUMN contratos.firma_url       IS 'URL pública de la imagen de la firma dibujada por el talento (bucket contratos).';
COMMENT ON COLUMN contratos.firmante_nombre IS 'Nombre completo con el que el talento firmó.';
COMMENT ON COLUMN contratos.firmado_at      IS 'Fecha/hora en que el talento firmó.';
COMMENT ON COLUMN contratos.firma_ip        IS 'IP desde la que se firmó (auditoría liviana).';

-- El bucket `contratos` ya existe y es público (ver sql/contratos.sql).
-- magic-api usa service_role para subir la firma → no depende de RLS.
