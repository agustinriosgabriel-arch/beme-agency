-- ══════════════════════════════════════════════════════════════════
-- FACTURA ↔ TALENTOS DE CAMPAÑA (2026-06-24)
-- Ejecutar en Supabase SQL Editor (proyecto ngstqwbzvnpggpklifat).
-- Idempotente: se puede re-ejecutar sin romper.
--
-- Qué agrega:
--   factura_talentos → tabla de enlace que indica QUÉ talentos (sub-campañas)
--   cubre cada factura. Antes la relación era 1 talento por factura vía el
--   string facturas.orden_compra = campana_talentos.identificador.
--
--   Ahora una factura puede agrupar VARIOS talentos de la MISMA campaña en
--   una sola factura (monto = suma de fee_marca, editable). El front usa esta
--   tabla como fuente de verdad para mostrar el/los talento(s) y para agrupar.
--
--   facturas.orden_compra se mantiene como referencia legible (no se borra).
-- ══════════════════════════════════════════════════════════════════

-- ┌──────────────────────────────────────────────────────────────┐
-- │ 1. Tabla de enlace                                           │
-- └──────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS factura_talentos (
  id                 serial PRIMARY KEY,
  factura_id         integer NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
  campana_talento_id integer NOT NULL REFERENCES campana_talentos(id) ON DELETE CASCADE,
  created_at         timestamp DEFAULT now(),
  UNIQUE (factura_id, campana_talento_id)
);

CREATE INDEX IF NOT EXISTS factura_talentos_factura_idx ON factura_talentos (factura_id);
CREATE INDEX IF NOT EXISTS factura_talentos_ct_idx      ON factura_talentos (campana_talento_id);

COMMENT ON TABLE factura_talentos IS 'Enlace factura ↔ talentos de campaña (sub-campañas) que cubre. Permite agrupar varios talentos de una campaña en una sola factura.';

-- ┌──────────────────────────────────────────────────────────────┐
-- │ 2. RLS — admin only (igual que facturas / pagos_marca)       │
-- └──────────────────────────────────────────────────────────────┘
ALTER TABLE factura_talentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS factura_talentos_admin ON factura_talentos;
CREATE POLICY factura_talentos_admin ON factura_talentos
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ┌──────────────────────────────────────────────────────────────┐
-- │ 3. Backfill — enlaza facturas existentes a su talento por OC │
-- │    (mismo match que editFactura(): orden_compra, luego folio)│
-- └──────────────────────────────────────────────────────────────┘
INSERT INTO factura_talentos (factura_id, campana_talento_id)
SELECT f.id, ct.id
FROM facturas f
JOIN campana_talentos ct
  ON ct.campana_id = f.campana_id
 AND ct.identificador IS NOT NULL
 AND ct.identificador = NULLIF(btrim(f.orden_compra), '')
ON CONFLICT (factura_id, campana_talento_id) DO NOTHING;

-- Fallback: facturas sin orden_compra pero cuyo folio (numero_factura) coincide
INSERT INTO factura_talentos (factura_id, campana_talento_id)
SELECT f.id, ct.id
FROM facturas f
JOIN campana_talentos ct
  ON ct.campana_id = f.campana_id
 AND ct.identificador IS NOT NULL
 AND ct.identificador = NULLIF(btrim(f.numero_factura), '')
WHERE NOT EXISTS (
  SELECT 1 FROM factura_talentos ft WHERE ft.factura_id = f.id
)
ON CONFLICT (factura_id, campana_talento_id) DO NOTHING;

-- ┌──────────────────────────────────────────────────────────────┐
-- │ 4. QB por FACTURA (registro en QuickBooks por cada factura,  │
-- │    no por campaña). La contadora marca cada factura/cobro.   │
-- └──────────────────────────────────────────────────────────────┘
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS qb_factura boolean DEFAULT false;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS qb_cobro   boolean DEFAULT false;

-- ┌──────────────────────────────────────────────────────────────┐
-- │ 5. Cobro estimado cuenta desde el ENVÍO al cliente           │
-- │    (no desde la emisión/carga): los días de crédito corren   │
-- │    desde que el cliente recibe la factura. + plataforma envío│
-- └──────────────────────────────────────────────────────────────┘
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS plataforma_envio text DEFAULT ''; -- mail | chat | plataforma

-- Vencimiento = (fecha_envio si existe, si no fecha_emision) + dias_credito
CREATE OR REPLACE FUNCTION trg_factura_vencimiento() RETURNS trigger AS $$
DECLARE base date;
BEGIN
  base := COALESCE(NEW.fecha_envio, NEW.fecha_emision);
  IF base IS NOT NULL THEN
    NEW.fecha_vencimiento := base + COALESCE(NEW.dias_credito, 0);
  ELSE
    NEW.fecha_vencimiento := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recalcular vencimientos existentes priorizando la fecha de envío
UPDATE facturas
  SET fecha_vencimiento = COALESCE(fecha_envio, fecha_emision) + COALESCE(dias_credito, 45)
  WHERE COALESCE(fecha_envio, fecha_emision) IS NOT NULL;
