-- ─────────────────────────────────────────────────────────────
-- Rosters: líneas acción→precio múltiples + acción común + total opcional
-- Fecha: 2026-06-04
-- Idempotente: se puede correr más de una vez sin problema.
-- ─────────────────────────────────────────────────────────────

-- R1: líneas acción→precio por talento (array de {accion, precio})
ALTER TABLE roster_selecciones ADD COLUMN IF NOT EXISTS lineas jsonb DEFAULT '[]'::jsonb;

-- R2: acciones comunes (multi-línea) a nivel roster + toggle de total sumado
ALTER TABLE rosters ADD COLUMN IF NOT EXISTS lineas_comunes jsonb DEFAULT '[]'::jsonb;
ALTER TABLE rosters ADD COLUMN IF NOT EXISTS mostrar_total boolean NOT NULL DEFAULT false;

-- Backfill compatible: convierte el accion/precio existente en una línea única.
-- Solo toca filas con lineas vacío Y con contenido legacy, así que es seguro re-correr.
UPDATE roster_selecciones
SET lineas = jsonb_build_array(
  jsonb_build_object(
    'accion', COALESCE(accion, ''),
    'precio', precio
  )
)
WHERE (lineas IS NULL OR lineas = '[]'::jsonb)
  AND (COALESCE(accion, '') <> '' OR precio IS NOT NULL);

-- NOTA: las columnas contraoferta / allow_counteroffer SE CONSERVAN (no se dropean).
-- La UI de "Contraoferta" se elimina, pero el campo "Comentarios" del cliente
-- sigue usando la columna `contraoferta` para guardar su texto.
