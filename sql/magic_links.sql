-- ═══════════════════════════════════════════════════════════════
-- MAGIC LINKS — acceso sin login para talentos y marcas
-- ═══════════════════════════════════════════════════════════════
-- Idempotente / re-ejecutable.
--
-- Modelo:
--   tipo='talent' → 1 link por talento (talent_id). Agrega TODAS sus
--      campañas activas. El talento sube scripts/videos, ve su fee_talento
--      y el estado de su pago.
--   tipo='brand'  → 1 link por campaña (campana_id). Incluye a TODOS los
--      talentos de la campaña. La marca aprueba/rechaza/comenta y ve el
--      fee_marca (lo que paga por cada talento).
--
-- La validación del token y toda lectura/escritura pública pasan por la
-- Netlify Function `magic-api` (service_role) — esta tabla NO se expone al
-- anon key. Las policies de abajo solo permiten que el equipo interno
-- (admin / campaign_manager) genere, liste y revoque links desde el panel.
-- ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS magic_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        text NOT NULL CHECK (tipo IN ('talent','brand')),
  token       text NOT NULL UNIQUE,
  talent_id   integer REFERENCES talentos(id) ON DELETE CASCADE,
  campana_id  integer REFERENCES campanas(id) ON DELETE CASCADE,
  activo      boolean NOT NULL DEFAULT true,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz,
  -- coherencia: talent-link apunta a un talento; brand-link a una campaña
  CONSTRAINT magic_links_scope_chk CHECK (
    (tipo = 'talent' AND talent_id IS NOT NULL AND campana_id IS NULL) OR
    (tipo = 'brand'  AND campana_id IS NOT NULL AND talent_id IS NULL)
  )
);

-- Un solo link ACTIVO por talento y por campaña (regenerar = revocar el viejo)
CREATE UNIQUE INDEX IF NOT EXISTS magic_links_talent_active_idx
  ON magic_links (talent_id) WHERE tipo = 'talent' AND activo;
CREATE UNIQUE INDEX IF NOT EXISTS magic_links_brand_active_idx
  ON magic_links (campana_id) WHERE tipo = 'brand' AND activo;

CREATE INDEX IF NOT EXISTS magic_links_token_idx ON magic_links (token);

-- Emails que la marca registra para recibir notificaciones (solo links 'brand').
-- Se dispara cuando un contenido entra a una etapa que le compete revisar:
-- script listo (paso 3), contenido listo (paso 5), spark code y estadísticas.
ALTER TABLE magic_links ADD COLUMN IF NOT EXISTS notify_emails text[] NOT NULL DEFAULT '{}';

-- ── RLS ────────────────────────────────────────────────────────
ALTER TABLE magic_links ENABLE ROW LEVEL SECURITY;

-- Solo equipo interno gestiona los links desde el panel (admin + campaign_manager).
-- La función magic-api usa service_role y NO pasa por estas policies.
DROP POLICY IF EXISTS ml_internal_all ON magic_links;
CREATE POLICY ml_internal_all ON magic_links
  FOR ALL USING (is_internal()) WITH CHECK (is_internal());

-- ───────────────────────────────────────────────────────────────
-- LISTO. La lógica de caducidad (10 días tras campaña finalizada + pago
-- completado) se calcula en la función magic-api, no en la BD, para no
-- borrar tokens que podrían reactivarse con una campaña nueva.
-- ───────────────────────────────────────────────────────────────
