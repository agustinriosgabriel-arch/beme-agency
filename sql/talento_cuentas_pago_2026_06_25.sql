-- ══════════════════════════════════════════════════════════════════
-- DATOS DE PAGO DEL TALENTO — CUENTAS POR PAÍS (2026-06-25)
-- Ejecutar en Supabase SQL Editor (proyecto ngstqwbzvnpggpklifat).
-- Idempotente: se puede re-ejecutar sin romper.
--
-- Qué agrega:
--   El talento guarda una o varias cuentas de pago reutilizables desde
--   su magic link (talento-link.html). Cada cuenta tiene "Nombre
--   completo" del titular (común a todos los países), país, banco y
--   campos variables por país (CLABE / CBU / IBAN+BIC / routing, etc.)
--   y dirección variable. Los campos variables van en JSONB para no
--   inflar el esquema: el front los renderiza con un mapa por país.
--
--   Países soportados: Mexico, Colombia, Argentina, USA, España,
--   Italia, Holanda, Alemania.
--
--   Escritura: el talento escribe vía magic-api (service_role → sin RLS).
--   Lectura: el equipo interno (admin / campaign_manager) la ve en el
--   panel para saber a qué cuenta pagar.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS talento_cuentas_pago (
  id              serial PRIMARY KEY,
  talent_id       integer NOT NULL REFERENCES talentos(id) ON DELETE CASCADE,
  pais            text DEFAULT '',          -- mexico | colombia | argentina | usa | espana | italia | holanda | alemania
  nombre_completo text DEFAULT '',          -- titular de la cuenta (común a todos los países)
  banco           text DEFAULT '',
  datos_cuenta    jsonb DEFAULT '{}'::jsonb, -- campos bancarios variables por país (clabe, cbu, iban, bic, routing, account, tipo_cuenta, documento, ...)
  direccion       jsonb DEFAULT '{}'::jsonb, -- campos de dirección variables por país (calle, num_ext, num_int, estado, ciudad, cp, ...)
  moneda          text DEFAULT '',
  alias           text DEFAULT '',          -- etiqueta libre para que el talento la reconozca
  es_default      boolean DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS talento_cuentas_pago_talent_idx ON talento_cuentas_pago (talent_id);

COMMENT ON TABLE talento_cuentas_pago IS 'Cuentas de pago reutilizables del talento (una por país posible). Editadas por el talento vía magic-api; leídas por el equipo interno.';

-- updated_at automático
DROP TRIGGER IF EXISTS trg_tcp_updated ON talento_cuentas_pago;
CREATE TRIGGER trg_tcp_updated BEFORE UPDATE ON talento_cuentas_pago
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: el equipo interno gestiona/lee desde el panel. El talento NO tiene
-- sesión auth → escribe a través de magic-api con service_role (omite RLS).
ALTER TABLE talento_cuentas_pago ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tcp_internal_all ON talento_cuentas_pago;
CREATE POLICY tcp_internal_all ON talento_cuentas_pago
  FOR ALL USING (is_internal()) WITH CHECK (is_internal());
