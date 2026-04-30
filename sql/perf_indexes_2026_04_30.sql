-- ════════════════════════════════════════════════════════════════
-- Performance: índices compuestos para listados y conteos
-- Fecha: 2026-04-30
-- ════════════════════════════════════════════════════════════════
-- Estos índices NO duplican los existentes en schema_unificado.sql.
-- Aceleran patrones específicos: filtro por estado/borrado + orden,
-- conteos de prospeccion_contactos por etapa, lectura de chat ordenada.
-- Todos usan IF NOT EXISTS, así que es seguro re-ejecutar.

-- ── Listado de campañas ──────────────────────────────────────────
-- campanas.html: WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 50
-- El compuesto evita un sort separado tras el filtro.
CREATE INDEX IF NOT EXISTS idx_campanas_deleted_created
  ON campanas(deleted_at, created_at DESC);

-- ── Prospección: contadores por etapa ────────────────────────────
-- prospecciones.html: agrupar por prospeccion_id + filtrar por etapa.
CREATE INDEX IF NOT EXISTS idx_prospeccion_contactos_prosp_etapa
  ON prospeccion_contactos(prospeccion_id, etapa);

-- Índice parcial para la lista global de "no interesados".
CREATE INDEX IF NOT EXISTS idx_prospeccion_contactos_no_interesado
  ON prospeccion_contactos(prospeccion_id)
  WHERE etapa = 'no_interesado';

-- ── Chat de campaña ──────────────────────────────────────────────
-- campana-detalle.html: SELECT * FROM campana_mensajes
--   WHERE campana_id = $1 ORDER BY created_at ASC
CREATE INDEX IF NOT EXISTS idx_campana_mensajes_campana_created
  ON campana_mensajes(campana_id, created_at);
