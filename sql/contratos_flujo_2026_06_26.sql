-- ══════════════════════════════════════════════════════════════════
-- CONTRATOS — ORDEN DEL FLUJO DE FIRMA (2026-06-26 bis)
-- Ejecutar en Supabase SQL Editor (proyecto ngstqwbzvnpggpklifat).
-- Idempotente.
--
-- Flujo correcto:
--   1) Equipo completa los datos de la empresa emisora y envía.
--   2) El talento (o la marca) rellena SUS propios datos en su link
--      → el contrato se re-arma con esos datos. (datos_contraparte_ok = true)
--   3) Recién entonces la contraparte puede firmar.
--   4) Una vez firmado por la contraparte, firma la agencia (nosotros).
--   5) Con ambas firmas, la contraparte descarga el PDF firmado.
-- ══════════════════════════════════════════════════════════════════

-- ¿La contraparte ya completó sus datos del contrato? Gate previo a la firma.
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS datos_contraparte_ok boolean DEFAULT false;

COMMENT ON COLUMN contratos.datos_contraparte_ok IS 'true cuando el talento/marca rellenó sus propios datos (nombre/RFC/domicilio) en su link. Requisito para poder firmar.';
