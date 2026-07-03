-- ══════════════════════════════════════════════════════════════════
-- PAPELERA DE ROSTERS — soft delete + restaurar (2026-07-03)
-- Ejecutar en Supabase SQL Editor (proyecto ngstqwbzvnpggpklifat).
-- Idempotente: se puede re-ejecutar sin romper.
--
-- MISMO PATRÓN que sql/add_soft_delete_campanas.sql:
--   - "Eliminar" ya NO borra la fila; marca deleted_at (va a la papelera).
--   - Se puede restaurar (deleted_at = NULL) o borrar definitivo.
--   - Un purge opcional limpia lo que lleve +30 días en la papelera.
--
-- BUG QUE ESTO CORRIGE:
--   Antes, deleteRoster() hacía un DELETE físico. Si el roster tenía filas
--   en roster_selecciones (el cliente ya había abierto el link y marcado
--   algo), la FK roster_selecciones.roster_id → rosters(id) SIN cascade
--   RECHAZABA el DELETE, pero la UI lo ocultaba igual (no chequeaba el
--   error). Resultado: el roster "desaparecía" pero seguía en la base.
--   Con soft delete esto ya no pasa: eliminar solo setea deleted_at.
-- ══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- 1. Columna de papelera + índice
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE rosters ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_rosters_deleted ON rosters(deleted_at);

-- ──────────────────────────────────────────────────────────────────
-- 2. FK a cascade — para que el "borrar definitivo" desde la papelera
--    funcione sin quedar bloqueado por roster_selecciones.
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE roster_selecciones DROP CONSTRAINT IF EXISTS roster_selecciones_roster_id_fkey;
ALTER TABLE roster_selecciones
  ADD CONSTRAINT roster_selecciones_roster_id_fkey
  FOREIGN KEY (roster_id) REFERENCES rosters(id) ON DELETE CASCADE;

-- ──────────────────────────────────────────────────────────────────
-- 3. Purge: elimina definitivamente lo que lleve +30 días en papelera
--    (mismo patrón que purge_deleted_campanas).
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION purge_deleted_rosters() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM rosters
  WHERE deleted_at IS NOT NULL
    AND deleted_at < now() - interval '30 days';
END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- 4. VERIFICACIÓN
--    SELECT id, name, deleted_at FROM rosters WHERE deleted_at IS NOT NULL;
-- ──────────────────────────────────────────────────────────────────
