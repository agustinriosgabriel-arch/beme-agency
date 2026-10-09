-- ════════════════════════════════════════════════════════════════
-- HISTORIAL DE COTIZACIONES DE TALENTOS
-- Fecha: 2026-10-09
-- ════════════════════════════════════════════════════════════════
-- Objetivo:
--   Cada vez que se guardan "Valores Extras" de un contacto que ya es
--   talento (o cuando se gradúa uno con valores cargados), queda una fila
--   acá con la fecha, la marca de la prospección y quién la cargó.
--
--   La cotización de una prospección NO pisa `talentos.valores`: un precio
--   negociado para una marca puntual no es la tarifa general. El perfil se
--   actualiza a mano; esto es solo el registro. Se lee desde el botón "$"
--   (Historial de precios) del dashboard, junto con los precios de rosters.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS talento_cotizaciones (
  id              bigserial PRIMARY KEY,
  talento_id      integer NOT NULL REFERENCES talentos(id) ON DELETE CASCADE,
  prospeccion_id  integer REFERENCES prospecciones(id) ON DELETE SET NULL,
  contacto_id     integer REFERENCES prospeccion_contactos(id) ON DELETE SET NULL,
  marca           text DEFAULT '',       -- copia de prospecciones.marca: sobrevive si se borra la prospección
  valores         text NOT NULL,
  autor_email     text DEFAULT '',
  created_by      uuid DEFAULT auth.uid(),
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS talento_cotizaciones_talento_idx
  ON talento_cotizaciones (talento_id, created_at DESC);

ALTER TABLE talento_cotizaciones ENABLE ROW LEVEL SECURITY;

-- Lectura y alta: equipo interno (admin + campaign_manager). Sin UPDATE:
-- un registro histórico no se edita. Borrar solo admin.
DROP POLICY IF EXISTS talento_cotizaciones_select ON talento_cotizaciones;
CREATE POLICY talento_cotizaciones_select ON talento_cotizaciones
  FOR SELECT USING (is_internal());

DROP POLICY IF EXISTS talento_cotizaciones_insert ON talento_cotizaciones;
CREATE POLICY talento_cotizaciones_insert ON talento_cotizaciones
  FOR INSERT WITH CHECK (is_internal());

DROP POLICY IF EXISTS talento_cotizaciones_delete ON talento_cotizaciones;
CREATE POLICY talento_cotizaciones_delete ON talento_cotizaciones
  FOR DELETE USING (is_admin());
