-- ══════════════════════════════════════════════════════
-- PRESUPUESTOS MODULE — Supabase SQL
-- Run this in Supabase SQL Editor
-- ══════════════════════════════════════════════════════

-- 1. Presupuestos table (header / "invoice")
CREATE TABLE IF NOT EXISTS presupuestos (
  id                 serial PRIMARY KEY,
  numero_presupuesto text NOT NULL DEFAULT '',          -- auto-generated: P-MMYYNN
  estado             text NOT NULL DEFAULT 'borrador',  -- borrador | enviado | aceptado | rechazado | vencido

  -- Cliente / marca receptora
  marca_nombre       text NOT NULL DEFAULT '',
  marca_contacto     text DEFAULT '',
  marca_email        text DEFAULT '',
  marca_telefono     text DEFAULT '',

  -- Detalle general
  titulo             text DEFAULT '',                   -- ej. "Campana Summer 2026"
  producto           text DEFAULT '',
  descripcion        text DEFAULT '',
  notas              text DEFAULT '',                   -- terminos / comentarios que van en el documento

  -- Moneda y validez
  moneda             text DEFAULT 'MXN',
  validez_dias       integer DEFAULT 15,
  fecha              date DEFAULT CURRENT_DATE,
  ciudad             text DEFAULT 'Mexico City',

  -- Metadata
  created_by         uuid,
  created_at         timestamp DEFAULT now(),
  updated_at         timestamp DEFAULT now()
);

-- 2. Presupuesto items (lineas: talento + contenido + precio)
CREATE TABLE IF NOT EXISTS presupuesto_items (
  id              serial PRIMARY KEY,
  presupuesto_id  integer NOT NULL REFERENCES presupuestos(id) ON DELETE CASCADE,
  talento_id      integer REFERENCES talentos(id),
  talento_nombre  text NOT NULL DEFAULT '',             -- snapshot por si se elimina el talento
  talento_foto    text DEFAULT '',                      -- snapshot de avatar
  contenido       text DEFAULT '',                      -- ej. "1 Reel + 2 Historias IG"
  precio          numeric DEFAULT 0,
  orden           integer DEFAULT 0,
  created_at      timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_presupuesto_items_presupuesto ON presupuesto_items(presupuesto_id);

-- 3. RLS Policies
ALTER TABLE presupuestos ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuesto_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_presupuestos" ON presupuestos
  FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "auth_all_presupuesto_items" ON presupuesto_items
  FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- 4. Auto-generate numero_presupuesto (P-MMYYNN)
CREATE OR REPLACE FUNCTION generate_presupuesto_number()
RETURNS trigger AS $$
DECLARE
  yr text;
  mn text;
  seq integer;
  prefix text;
BEGIN
  yr := to_char(COALESCE(NEW.fecha, CURRENT_DATE), 'YY');
  mn := to_char(COALESCE(NEW.fecha, CURRENT_DATE), 'MM');
  prefix := 'P-' || mn || yr;
  SELECT COALESCE(MAX(
    CAST(NULLIF(regexp_replace(substring(numero_presupuesto FROM 7), '[^0-9]', '', 'g'), '') AS integer)
  ), 0) + 1
  INTO seq
  FROM presupuestos
  WHERE numero_presupuesto LIKE prefix || '%';

  NEW.numero_presupuesto := prefix || LPAD(seq::text, 2, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_presupuesto_number ON presupuestos;
CREATE TRIGGER trg_presupuesto_number
  BEFORE INSERT ON presupuestos
  FOR EACH ROW
  WHEN (NEW.numero_presupuesto = '' OR NEW.numero_presupuesto IS NULL)
  EXECUTE FUNCTION generate_presupuesto_number();

-- 5. updated_at trigger
CREATE OR REPLACE FUNCTION touch_presupuesto_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_presupuesto_touch ON presupuestos;
CREATE TRIGGER trg_presupuesto_touch
  BEFORE UPDATE ON presupuestos
  FOR EACH ROW
  EXECUTE FUNCTION touch_presupuesto_updated_at();
