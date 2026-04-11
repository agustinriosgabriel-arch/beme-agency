-- ══════════════════════════════════════════════════════
-- CONTRATOS MODULE — Supabase SQL
-- Run this in Supabase SQL Editor
-- ══════════════════════════════════════════════════════

-- 1. Contratos table
CREATE TABLE IF NOT EXISTS contratos (
  id                serial PRIMARY KEY,
  campana_id        integer REFERENCES campanas(id),
  campana_talento_id integer REFERENCES campana_talentos(id),
  tipo              text NOT NULL DEFAULT 'marca',        -- 'marca' (Marca↔Agencia) | 'talento' (Agencia↔Talento)
  idioma            text NOT NULL DEFAULT 'es',           -- 'es' | 'en'
  numero_contrato   text NOT NULL DEFAULT '',
  estado            text NOT NULL DEFAULT 'borrador',     -- borrador | enviado | firmado | cancelado

  -- Parte A
  parte_a_nombre    text DEFAULT '',
  parte_a_rfc       text DEFAULT '',
  parte_a_domicilio text DEFAULT '',

  -- Parte B
  parte_b_nombre    text DEFAULT '',
  parte_b_rfc       text DEFAULT '',
  parte_b_domicilio text DEFAULT '',

  -- Datos del contrato
  influencer_nombre text DEFAULT '',
  servicios         text DEFAULT '',                      -- "1 reel + 1 historia"
  canales           text DEFAULT '',                      -- "Instagram, TikTok"
  hashtags          text DEFAULT 'A Definir en Brief',
  marca_producto    text DEFAULT '',
  tarifa_tipo       text DEFAULT 'pago',                  -- 'pago' | 'canje' | 'mixto'
  monto             numeric DEFAULT 0,
  moneda            text DEFAULT 'MXN',
  monto_texto       text DEFAULT '',                      -- "Cuarenta y tres mil pesos mexicanos"
  metodo_pago       text DEFAULT '',
  plazo_pago_dias   integer DEFAULT 45,
  comentarios       text DEFAULT '',

  -- Derechos de imagen
  derechos_imagen   boolean DEFAULT false,
  derechos_dias     integer,
  derechos_valor    numeric,
  derechos_desde    date,

  -- Fechas
  fecha_contrato    date DEFAULT CURRENT_DATE,
  ciudad_contrato   text DEFAULT 'Mexico City',

  -- Contenido generado por IA
  contenido_html    text DEFAULT '',                      -- HTML completo del contrato para preview/PDF

  -- Metadata
  created_by        uuid,
  created_at        timestamp DEFAULT now(),
  updated_at        timestamp DEFAULT now()
);

-- 2. RLS Policy
ALTER TABLE contratos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_contratos" ON contratos
  FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- 3. Storage bucket for contract PDFs (optional, for future use)
INSERT INTO storage.buckets (id, name, public)
VALUES ('contratos', 'contratos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "auth_all_contratos_storage" ON storage.objects
  FOR ALL USING (bucket_id = 'contratos' AND auth.uid() IS NOT NULL)
  WITH CHECK (bucket_id = 'contratos' AND auth.uid() IS NOT NULL);

-- 4. Auto-generate contract number sequence
CREATE OR REPLACE FUNCTION generate_contract_number()
RETURNS trigger AS $$
DECLARE
  yr text;
  mn text;
  seq integer;
BEGIN
  yr := to_char(NEW.fecha_contrato, 'YY');
  mn := to_char(NEW.fecha_contrato, 'MM');
  SELECT COALESCE(MAX(
    CAST(NULLIF(regexp_replace(numero_contrato, '[^0-9]', '', 'g'), '') AS integer)
  ), 0) + 1
  INTO seq
  FROM contratos
  WHERE numero_contrato LIKE mn || yr || '%';

  NEW.numero_contrato := mn || yr || LPAD(seq::text, 2, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_contract_number
  BEFORE INSERT ON contratos
  FOR EACH ROW
  WHEN (NEW.numero_contrato = '' OR NEW.numero_contrato IS NULL)
  EXECUTE FUNCTION generate_contract_number();
