-- ══════════════════════════════════════════════════════════════════
-- PEDIDOS DE CLIENTES — auto-armado de roster por el cliente (2026-07-03)
-- Ejecutar en Supabase SQL Editor (proyecto ngstqwbzvnpggpklifat).
-- Idempotente: se puede re-ejecutar sin romper.
--
-- QUÉ HABILITA:
--   1) Un catálogo PÚBLICO y SEGURO de talentos (view talentos_publicos) que
--      el anon key puede leer COMPLETO (+1000) pero SOLO con columnas de perfil
--      (sin telefono/email/notas_internas/etc.).
--   2) Dos tablas para las solicitudes de cotización que arma el cliente:
--      pedidos_cliente (header: marca, contacto, acciones comunes, estado) y
--      pedido_cliente_items (un talento con sus líneas de acción/paquete).
--
-- SEGURIDAD:
--   - talentos_anon_read (schema_unificado.sql:768) es row-level y solo deja al
--     anon ver talentos que ya están en algún roster (~432). La VIEW de abajo
--     corre con permisos del owner (security_invoker OFF = default) → expone el
--     pool COMPLETO pero acotado a las columnas whitelisteadas. NO exponer PII.
--   - Las tablas nuevas NO tienen policy anon. Las escrituras del cliente pasan
--     por la Netlify function pedido-cliente-api.js (service_role, valida input).
-- ══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- 1. Catálogo público seguro
--    SOLO columnas de perfil. NUNCA: telefono, email, marcas_previas,
--    notas_internas, direccion_entrega, needs_review/review_*, calidad,
--    es_exclusivo, engagement, avg_views, social_meta.
--    OJO: la página NO debe traer `foto` en el select masivo (base64 pesado):
--    se carga lazy por id solo para las tarjetas visibles.
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW talentos_publicos AS
  SELECT
    id,
    nombre,
    paises,
    ciudad,
    tiktok,
    instagram,
    youtube,
    categorias,
    seguidores,
    genero,
    keywords,
    tipo_contenido,
    valores,
    idioma,
    foto
  FROM talentos;

-- ⚠️ NO agregar `WITH (security_invoker = true)`: eso re-aplicaría
--    talentos_anon_read y volvería a capar el anon en ~432 filas.
GRANT SELECT ON talentos_publicos TO anon, authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 2. Tablas de pedidos del cliente
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pedidos_cliente (
  id              serial PRIMARY KEY,
  token           text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(12), 'hex'),
  marca_nombre    text NOT NULL DEFAULT '',
  contacto_nombre text DEFAULT '',
  contacto_email  text DEFAULT '',
  notas           text DEFAULT '',
  -- Plantilla de acciones que el cliente definió UNA vez y aplica a todos:
  -- [{ "tipo": "accion"|"paquete", "descripcion": "..." }]
  lineas_comunes  jsonb NOT NULL DEFAULT '[]'::jsonb,
  estado          text NOT NULL DEFAULT 'enviado',  -- enviado | cotizado | cerrado
  created_by      uuid,                             -- null en envíos anónimos
  submitted_at    timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Moneda con la que BEME cotiza el pedido (se completa en el dashboard).
ALTER TABLE pedidos_cliente ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'USD';

CREATE TABLE IF NOT EXISTS pedido_cliente_items (
  id              serial PRIMARY KEY,
  pedido_id       integer NOT NULL REFERENCES pedidos_cliente(id) ON DELETE CASCADE,
  talento_id      integer REFERENCES talentos(id),
  talento_nombre  text NOT NULL DEFAULT '',          -- snapshot
  -- Líneas efectivas de ESTE talento (comunes o override):
  -- [{ "tipo": "accion"|"paquete", "descripcion": "...", "precio": null }]
  -- precio queda null hasta que BEME lo completa.
  lineas          jsonb NOT NULL DEFAULT '[]'::jsonb,
  orden           integer DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedido_items_pedido ON pedido_cliente_items(pedido_id);

-- Moneda por talento (override opcional; si es NULL hereda la moneda del pedido).
ALTER TABLE pedido_cliente_items ADD COLUMN IF NOT EXISTS moneda text;

-- ──────────────────────────────────────────────────────────────────
-- 3. RLS — solo el equipo interno (authenticated). SIN policy anon.
--    (El anon escribe únicamente vía la function con service_role.)
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE pedidos_cliente      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_cliente_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pc_auth_all  ON pedidos_cliente;
DROP POLICY IF EXISTS pci_auth_all ON pedido_cliente_items;

CREATE POLICY pc_auth_all ON pedidos_cliente
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY pci_auth_all ON pedido_cliente_items
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ──────────────────────────────────────────────────────────────────
-- 4. Trigger updated_at (mismo patrón que sql/presupuestos.sql:97)
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_pedido_cliente_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pedido_cliente_touch ON pedidos_cliente;
CREATE TRIGGER trg_pedido_cliente_touch
  BEFORE UPDATE ON pedidos_cliente
  FOR EACH ROW EXECUTE FUNCTION touch_pedido_cliente_updated_at();

-- ──────────────────────────────────────────────────────────────────
-- 5. VERIFICACIÓN (correr y revisar salida)
-- ──────────────────────────────────────────────────────────────────
-- a) La view NO debe tener columnas sensibles:
--    SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'talentos_publicos' ORDER BY 1;
-- b) La view NO debe ser security_invoker (para ver el pool completo):
--    SELECT relname, reloptions FROM pg_class WHERE relname = 'talentos_publicos';
-- c) Con el anon key: SELECT count(*) FROM talentos_publicos;  → +1000
