-- ════════════════════════════════════════════════════════════════
-- Fix: actualizar CHECK constraint de contenidos.tipo
-- Fecha: 2026-04-30
-- ════════════════════════════════════════════════════════════════
-- El frontend ya soporta 'reel_tiktok_espejo' pero el constraint viejo
-- en la DB lo rechaza con:
--   "new row for relation 'contenidos' violates check constraint
--    'contenidos_tipo_check'"
-- Este script reemplaza el constraint con la lista completa.

ALTER TABLE contenidos DROP CONSTRAINT IF EXISTS contenidos_tipo_check;

ALTER TABLE contenidos ADD CONSTRAINT contenidos_tipo_check
  CHECK (tipo IN (
    'tiktok_video',
    'reel',
    'reel_tiktok_espejo',
    'ig_story',
    'youtube_video',
    'youtube_short'
  ));
