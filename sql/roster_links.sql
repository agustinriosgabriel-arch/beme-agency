-- Multi-link roster: one roster, multiple client links with separate selections

-- 1. Create roster_links table
CREATE TABLE IF NOT EXISTS roster_links (
  id          serial PRIMARY KEY,
  roster_id   integer NOT NULL,
  client_name text NOT NULL DEFAULT '',
  token       text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  compact     boolean DEFAULT false,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(token)
);

-- 2. Add link_id to roster_selecciones (0 = legacy/direct token access)
ALTER TABLE roster_selecciones ADD COLUMN IF NOT EXISTS link_id integer NOT NULL DEFAULT 0;

-- 3. Recreate PK to include link_id
-- First drop old PK (may fail if name differs — ignore error)
ALTER TABLE roster_selecciones DROP CONSTRAINT IF EXISTS roster_selecciones_pkey;
-- Create new composite unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS roster_selecciones_pkey_v2
  ON roster_selecciones (roster_id, talent_id, link_id);

-- 4. RLS for roster_links
ALTER TABLE roster_links ENABLE ROW LEVEL SECURITY;

-- Authenticated (agency team) can do everything
CREATE POLICY rl_auth_all ON roster_links FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Anon can read (to resolve link token → roster)
CREATE POLICY rl_anon_read ON roster_links FOR SELECT TO anon USING (true);

-- 5. Update anon policies on roster_selecciones to allow link_id
-- Drop old policies if they exist (names may vary)
DROP POLICY IF EXISTS rs_anon_select ON roster_selecciones;
DROP POLICY IF EXISTS rs_anon_insert ON roster_selecciones;
DROP POLICY IF EXISTS rs_anon_update ON roster_selecciones;
DROP POLICY IF EXISTS "anon can select roster_selecciones" ON roster_selecciones;
DROP POLICY IF EXISTS "anon can insert roster_selecciones" ON roster_selecciones;
DROP POLICY IF EXISTS "anon can update roster_selecciones" ON roster_selecciones;

CREATE POLICY rs_anon_select_v2 ON roster_selecciones FOR SELECT TO anon USING (true);
CREATE POLICY rs_anon_insert_v2 ON roster_selecciones FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY rs_anon_update_v2 ON roster_selecciones FOR UPDATE TO anon USING (true);
