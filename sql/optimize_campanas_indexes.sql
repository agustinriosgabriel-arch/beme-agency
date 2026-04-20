-- Índices para optimizar la carga de la sección Campañas
-- Ejecutar en Supabase SQL Editor

-- Índice para filtrar campañas activas vs eliminadas (soft delete)
CREATE INDEX IF NOT EXISTS idx_campanas_deleted_at ON campanas (deleted_at);

-- Índice para ordenar por fecha de creación (usado en ORDER BY)
CREATE INDEX IF NOT EXISTS idx_campanas_created_at ON campanas (created_at DESC);

-- Índice para filtrar por estado
CREATE INDEX IF NOT EXISTS idx_campanas_estado ON campanas (estado);

-- Índice compuesto: el más útil — cubre la query principal
-- (filtro deleted_at IS NULL + ORDER BY created_at DESC)
CREATE INDEX IF NOT EXISTS idx_campanas_active_sorted ON campanas (deleted_at, created_at DESC)
  WHERE deleted_at IS NULL;

-- Índice para JOINs de campana_talentos por campana_id
CREATE INDEX IF NOT EXISTS idx_campana_talentos_campana ON campana_talentos (campana_id);

-- Índice para contenidos por campana_talento_id
CREATE INDEX IF NOT EXISTS idx_contenidos_campana_talento ON contenidos (campana_talento_id);

-- Índice para campana_managers por campana_id
CREATE INDEX IF NOT EXISTS idx_campana_managers_campana ON campana_managers (campana_id);
