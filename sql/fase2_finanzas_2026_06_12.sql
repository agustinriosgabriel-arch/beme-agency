-- ══════════════════════════════════════════════════════════════════
-- FASE 2 — FINANZAS CONFIABLE (2026-06-12)
-- Ejecutar en Supabase SQL Editor (proyecto ngstqwbzvnpggpklifat).
-- Idempotente: se puede re-ejecutar sin romper.
--
-- Qué agrega:
--   A. facturas: ciclo de vida completo (días de crédito, vencimiento,
--      esquema de pago contado/50-50/anticipo/financiado, folio fiscal,
--      monto_pagado, estado 'pagada_parcial')
--   B. Pagos parciales con sincronización automática por trigger:
--      pagos_marca → facturas.monto_pagado/estado
--      pagos_talento → campana_talentos.pago_estado (pendiente/parcial/pagado)
--   C. Auditoría: facturas_auditoria registra quién cambió qué y cuándo
-- ══════════════════════════════════════════════════════════════════

-- ┌──────────────────────────────────────────────────────────────┐
-- │ A. FACTURAS — CICLO DE VIDA COMPLETO                         │
-- └──────────────────────────────────────────────────────────────┘
-- Estados: pendiente → emitida → enviada → pagada_parcial → cobrada | cancelada
-- (pagada_parcial y cobrada los maneja el trigger según los pagos registrados)

ALTER TABLE facturas ADD COLUMN IF NOT EXISTS dias_credito integer DEFAULT 45;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS fecha_vencimiento date;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS esquema_pago text DEFAULT 'contado';      -- contado | 50_50 | anticipo | financiado
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS anticipo_porcentaje numeric;              -- ej: 50 para 50/50, 30 para anticipo 30%
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS monto_pagado numeric DEFAULT 0;           -- mantenido por trigger
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS uuid_fiscal text DEFAULT '';              -- folio fiscal CFDI (UUID del SAT)
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS forma_pago text DEFAULT '';               -- 03 Transferencia, etc.
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS orden_compra text DEFAULT '';             -- por si falta en el live DB

-- Vencimiento automático: fecha_emision + dias_credito (contado = 0 días)
CREATE OR REPLACE FUNCTION trg_factura_vencimiento() RETURNS trigger AS $$
BEGIN
  IF NEW.fecha_emision IS NOT NULL THEN
    NEW.fecha_vencimiento := NEW.fecha_emision + COALESCE(NEW.dias_credito, 0);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_factura_venc ON facturas;
CREATE TRIGGER trg_factura_venc
  BEFORE INSERT OR UPDATE ON facturas
  FOR EACH ROW EXECUTE FUNCTION trg_factura_vencimiento();

-- Backfill de vencimientos para facturas existentes con fecha de emisión
UPDATE facturas SET fecha_vencimiento = fecha_emision + COALESCE(dias_credito, 45)
  WHERE fecha_emision IS NOT NULL AND fecha_vencimiento IS NULL;

-- ┌──────────────────────────────────────────────────────────────┐
-- │ B1. PAGOS DE MARCA → FACTURA (parciales, 50/50, anticipos)   │
-- └──────────────────────────────────────────────────────────────┘
-- Cada pago en pagos_marca recalcula monto_pagado y el estado:
--   suma >= monto  → cobrada
--   suma > 0       → pagada_parcial
--   suma = 0       → vuelve a 'enviada' si estaba en parcial/cobrada (pago borrado)
-- 'cancelada' nunca se pisa.

CREATE OR REPLACE FUNCTION trg_sync_factura_pago() RETURNS trigger AS $$
DECLARE
  fid integer;
  total numeric;
BEGIN
  fid := COALESCE(NEW.factura_id, OLD.factura_id);
  IF fid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT COALESCE(SUM(monto), 0) INTO total FROM pagos_marca WHERE factura_id = fid;
  UPDATE facturas SET
    monto_pagado = total,
    estado = CASE
      WHEN estado = 'cancelada' THEN estado
      WHEN total >= monto AND monto > 0 THEN 'cobrada'
      WHEN total > 0 THEN 'pagada_parcial'
      WHEN estado IN ('pagada_parcial','cobrada') THEN 'enviada'
      ELSE estado
    END,
    updated_at = now()
  WHERE id = fid;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pagos_marca_sync ON pagos_marca;
CREATE TRIGGER trg_pagos_marca_sync
  AFTER INSERT OR UPDATE OR DELETE ON pagos_marca
  FOR EACH ROW EXECUTE FUNCTION trg_sync_factura_pago();

-- Backfill: recalcular monto_pagado de todas las facturas con pagos existentes
UPDATE facturas f SET monto_pagado = sub.total
FROM (SELECT factura_id, COALESCE(SUM(monto),0) AS total FROM pagos_marca GROUP BY factura_id) sub
WHERE f.id = sub.factura_id;

-- ┌──────────────────────────────────────────────────────────────┐
-- │ B2. PAGOS A TALENTO (parciales: pendiente/parcial/pagado)    │
-- └──────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION trg_sync_ct_pago() RETURNS trigger AS $$
DECLARE
  cid integer;
  total numeric;
  fee numeric;
  ultima date;
BEGIN
  cid := COALESCE(NEW.campana_talento_id, OLD.campana_talento_id);
  IF cid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT COALESCE(SUM(monto), 0), MAX(fecha_pago) INTO total, ultima
    FROM pagos_talento WHERE campana_talento_id = cid;
  SELECT COALESCE(fee_talento, 0) INTO fee FROM campana_talentos WHERE id = cid;
  UPDATE campana_talentos SET
    pago_estado = CASE
      WHEN total >= fee AND fee > 0 THEN 'pagado'
      WHEN total > 0 THEN 'parcial'
      ELSE 'pendiente'
    END,
    pago_fecha = ultima,
    updated_at = now()
  WHERE id = cid;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pagos_talento_sync ON pagos_talento;
CREATE TRIGGER trg_pagos_talento_sync
  AFTER INSERT OR UPDATE OR DELETE ON pagos_talento
  FOR EACH ROW EXECUTE FUNCTION trg_sync_ct_pago();

-- ┌──────────────────────────────────────────────────────────────┐
-- │ C. AUDITORÍA DE FACTURAS                                     │
-- └──────────────────────────────────────────────────────────────┘
-- Cada cambio en campos sensibles queda registrado: quién, qué, cuándo.

CREATE TABLE IF NOT EXISTS facturas_auditoria (
  id              bigserial PRIMARY KEY,
  factura_id      integer REFERENCES facturas(id) ON DELETE CASCADE,
  usuario_id      uuid,
  campo           text NOT NULL,
  valor_anterior  text,
  valor_nuevo     text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE facturas_auditoria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fa_admin ON facturas_auditoria;
CREATE POLICY fa_admin ON facturas_auditoria FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE OR REPLACE FUNCTION trg_facturas_audit() RETURNS trigger AS $$
BEGIN
  IF NEW.monto IS DISTINCT FROM OLD.monto THEN
    INSERT INTO facturas_auditoria(factura_id, usuario_id, campo, valor_anterior, valor_nuevo)
    VALUES (OLD.id, auth.uid(), 'monto', OLD.monto::text, NEW.monto::text);
  END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    INSERT INTO facturas_auditoria(factura_id, usuario_id, campo, valor_anterior, valor_nuevo)
    VALUES (OLD.id, auth.uid(), 'estado', OLD.estado, NEW.estado);
  END IF;
  IF NEW.moneda IS DISTINCT FROM OLD.moneda THEN
    INSERT INTO facturas_auditoria(factura_id, usuario_id, campo, valor_anterior, valor_nuevo)
    VALUES (OLD.id, auth.uid(), 'moneda', OLD.moneda, NEW.moneda);
  END IF;
  IF NEW.fecha_emision IS DISTINCT FROM OLD.fecha_emision THEN
    INSERT INTO facturas_auditoria(factura_id, usuario_id, campo, valor_anterior, valor_nuevo)
    VALUES (OLD.id, auth.uid(), 'fecha_emision', OLD.fecha_emision::text, NEW.fecha_emision::text);
  END IF;
  IF NEW.dias_credito IS DISTINCT FROM OLD.dias_credito THEN
    INSERT INTO facturas_auditoria(factura_id, usuario_id, campo, valor_anterior, valor_nuevo)
    VALUES (OLD.id, auth.uid(), 'dias_credito', OLD.dias_credito::text, NEW.dias_credito::text);
  END IF;
  IF NEW.esquema_pago IS DISTINCT FROM OLD.esquema_pago THEN
    INSERT INTO facturas_auditoria(factura_id, usuario_id, campo, valor_anterior, valor_nuevo)
    VALUES (OLD.id, auth.uid(), 'esquema_pago', OLD.esquema_pago, NEW.esquema_pago);
  END IF;
  IF NEW.numero_factura IS DISTINCT FROM OLD.numero_factura THEN
    INSERT INTO facturas_auditoria(factura_id, usuario_id, campo, valor_anterior, valor_nuevo)
    VALUES (OLD.id, auth.uid(), 'numero_factura', OLD.numero_factura, NEW.numero_factura);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_facturas_audit ON facturas;
CREATE TRIGGER trg_facturas_audit
  AFTER UPDATE ON facturas
  FOR EACH ROW EXECUTE FUNCTION trg_facturas_audit();

-- Índices para las vistas de finanzas
CREATE INDEX IF NOT EXISTS idx_facturas_campana ON facturas(campana_id);
CREATE INDEX IF NOT EXISTS idx_facturas_vencimiento ON facturas(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_pagos_marca_factura ON pagos_marca(factura_id);
CREATE INDEX IF NOT EXISTS idx_pagos_marca_fecha ON pagos_marca(fecha_pago);
CREATE INDEX IF NOT EXISTS idx_pagos_talento_ct ON pagos_talento(campana_talento_id);
CREATE INDEX IF NOT EXISTS idx_pagos_talento_fecha ON pagos_talento(fecha_pago);
CREATE INDEX IF NOT EXISTS idx_facturas_auditoria_factura ON facturas_auditoria(factura_id, created_at DESC);
