-- ════════════════════════════════════════════════════════════════
-- ROSTERS ARCHIVADOS: columna `archived`
-- Fecha: 2026-10-20
-- ════════════════════════════════════════════════════════════════
-- Objetivo:
--   El dashboard (archiveRoster/unarchiveRoster en dashboard.js) hacía
--   UPDATE rosters SET archived = true/false, pero la columna nunca se
--   creó en producción. Como el frontend no chequeaba el `error` del
--   update, el roster se veía archivado hasta recargar la página y
--   después volvía a la pestaña Rosters. Reporte de Neftali, 19-oct-2026.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE rosters ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

-- La pestaña "Rosters archivados" filtra por esta columna en cada carga.
CREATE INDEX IF NOT EXISTS rosters_archived_idx ON rosters (archived) WHERE archived;
