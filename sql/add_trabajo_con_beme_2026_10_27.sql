-- ════════════════════════════════════════════════════════════════
-- TALENTOS: distintivo "Ya trabajamos" (columna `trabajo_con_beme`)
-- Fecha: 2026-10-27
-- ════════════════════════════════════════════════════════════════
-- Objetivo:
--   El dashboard marca con un distintivo a los talentos con los que BEME
--   ya trabajó. Se calcula solo desde campana_talentos, pero muchas
--   campañas son anteriores al software: esta columna es la marca manual
--   para esos casos (checkbox en el modal de edición del talento).
--
--   OJO: dashboard.js pide esta columna en TALENT_COLS. Sin ella la carga
--   de talentos falla con 42703 y la lista queda vacía. Correr ANTES de
--   deployar el frontend.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE public.talentos
  ADD COLUMN IF NOT EXISTS trabajo_con_beme boolean NOT NULL DEFAULT false;
