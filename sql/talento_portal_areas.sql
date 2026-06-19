-- ════════════════════════════════════════════════════════════════
-- Portal del Talento — Áreas extra (Exclusivos, Billetera, Ideas)
-- ════════════════════════════════════════════════════════════════
-- Ejecutar en Supabase SQL editor.

-- 1) Talentos exclusivos ───────────────────────────────────────────
--    Solo los marcados como exclusivos ven Billetera + Ideas en el portal.
ALTER TABLE talentos
  ADD COLUMN IF NOT EXISTS es_exclusivo boolean DEFAULT false;

-- 2) Días de pago de la marca (para la fecha estimada de cobro) ─────
--    Fecha estimada de cobro = fecha_fin de campaña + dias_pago_marca + 15.
ALTER TABLE campanas
  ADD COLUMN IF NOT EXISTS dias_pago_marca integer;

-- 3) Ideas de contenido del talento ────────────────────────────────
CREATE TABLE IF NOT EXISTS talento_ideas (
  id           serial PRIMARY KEY,
  talent_id    integer REFERENCES talentos(id) ON DELETE CASCADE,
  titulo       text NOT NULL DEFAULT '',
  descripcion  text DEFAULT '',
  categoria    text DEFAULT '',
  plataformas  text[] DEFAULT '{}',          -- ['tiktok','instagram','youtube']
  estado       text DEFAULT 'idea',          -- idea | en_proceso | publicada
  created_by   uuid DEFAULT auth.uid(),
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_talento_ideas_talent ON talento_ideas(talent_id);

-- Categorías de contenido propias del talento ──────────────────────
CREATE TABLE IF NOT EXISTS talento_idea_categorias (
  id           serial PRIMARY KEY,
  talent_id    integer REFERENCES talentos(id) ON DELETE CASCADE,
  nombre       text NOT NULL,
  created_by   uuid DEFAULT auth.uid(),
  created_at   timestamptz DEFAULT now(),
  UNIQUE (created_by, nombre)
);

-- bump updated_at en talento_ideas
CREATE OR REPLACE FUNCTION trg_talento_ideas_touch() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_talento_ideas_touch ON talento_ideas;
CREATE TRIGGER trg_talento_ideas_touch
  BEFORE UPDATE ON talento_ideas
  FOR EACH ROW EXECUTE FUNCTION trg_talento_ideas_touch();

-- 4) RLS — cada talento sólo ve/edita lo suyo (created_by = auth.uid)
--    Sin referencias a user_profiles → no hay recursión 42P17.
ALTER TABLE talento_ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE talento_idea_categorias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS own_ideas ON talento_ideas;
CREATE POLICY own_ideas ON talento_ideas
  FOR ALL USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS own_idea_cats ON talento_idea_categorias;
CREATE POLICY own_idea_cats ON talento_idea_categorias
  FOR ALL USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());
