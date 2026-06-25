-- ══════════════════════════════════════════════════════════════════
-- FACTURA DEL TALENTO → INVOICE DE CxP (2026-06-25)
-- Ejecutar en Supabase SQL Editor (proyecto ngstqwbzvnpggpklifat).
-- Idempotente: se puede re-ejecutar sin romper.
--
-- Qué agrega:
--   Cuando ya se subieron TODOS los contenidos de la campaña (paso ≥ 7),
--   el talento puede, desde su magic link:
--     a) SUBIR su propia factura (PDF/imagen), o
--     b) CREARLA rellenando datos (Nombre/Razón Social, Dirección, monto)
--        + elegir su cuenta de pago → se genera un PDF.
--   En AMBOS casos el resultado queda en campana_talentos.invoice_url
--   (el Invoice de Cuentas por Pagar que ya lee finanzas.html).
--
--   invoice_url ya existe (sql/fase3_finanzas_2026_06_19.sql). Acá solo
--   guardamos los datos estructurados de la factura creada y el tipo.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE campana_talentos ADD COLUMN IF NOT EXISTS factura_datos jsonb DEFAULT '{}'::jsonb;
ALTER TABLE campana_talentos ADD COLUMN IF NOT EXISTS factura_tipo  text  DEFAULT '';  -- 'subida' | 'generada'

COMMENT ON COLUMN campana_talentos.factura_datos IS 'Datos de la factura creada por el talento (nombre/razón social, dirección, cuenta snapshot, monto, moneda, número, fecha).';
COMMENT ON COLUMN campana_talentos.factura_tipo  IS 'Origen del invoice_url: subida (archivo del talento) | generada (PDF creado en la app).';

-- ┌──────────────────────────────────────────────────────────────┐
-- │ Bucket `finanzas` — debe existir y ser público para que el    │
-- │ talento suba/genere su factura y se vea el chip en CxP.       │
-- └──────────────────────────────────────────────────────────────┘
INSERT INTO storage.buckets (id, name, public)
VALUES ('finanzas', 'finanzas', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Permite que el equipo interno (sesión auth) suba/borre desde finanzas.html.
-- El talento sube vía magic-api (service_role → omite RLS). Lectura pública
-- porque el bucket es público.
DROP POLICY IF EXISTS finanzas_auth_all ON storage.objects;
CREATE POLICY finanzas_auth_all ON storage.objects
  FOR ALL USING (bucket_id = 'finanzas' AND auth.uid() IS NOT NULL)
  WITH CHECK (bucket_id = 'finanzas' AND auth.uid() IS NOT NULL);
