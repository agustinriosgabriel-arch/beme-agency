-- ══════════════════════════════════════════════════════════════════
-- FIX REAL — "No veo talentos / Reconectando" en el dashboard (2026-06-12)
-- Ejecutar en Supabase SQL Editor (proyecto ngstqwbzvnpggpklifat).
--
-- CAUSA (confirmada): dashboard.js pide la columna `direccion_entrega`
-- en TALENT_COLS (línea 384), pero la columna NUNCA se creó en la tabla.
-- La query devolvía HTTP 400 (42703: column does not exist) → loadTalentosWithRetry
-- reintentaba 3 veces y mostraba "Reconectando…" → no se veía ningún talento.
-- NO era RLS ni seguridad: era una columna faltante.
--
-- direccion_entrega se usa como objeto JSON en el código
-- (destinatario, telefono, calle, ciudad, provincia, cp, pais, notas) → jsonb.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE talentos ADD COLUMN IF NOT EXISTS direccion_entrega jsonb DEFAULT '{}'::jsonb;
