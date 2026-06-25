-- ══════════════════════════════════════════════════════════════════
-- IDIOMA DEL TALENTO (2026-06-25)
-- Ejecutar en Supabase SQL Editor (proyecto ngstqwbzvnpggpklifat).
-- Idempotente: se puede re-ejecutar sin romper.
--
-- Qué agrega:
--   El equipo elige el idioma del talento para que su magic link
--   (talento-link.html) se muestre en su idioma. El talento también
--   puede cambiarlo desde la vista (se guarda en localStorage).
--
--   Idiomas soportados: es | en | it | de | nl
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE talentos ADD COLUMN IF NOT EXISTS idioma text DEFAULT 'es';

COMMENT ON COLUMN talentos.idioma IS 'Idioma preferido del talento para su portal/magic link: es | en | it | de | nl.';
