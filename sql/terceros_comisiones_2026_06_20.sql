-- ══════════════════════════════════════════════════════════════════
-- TERCEROS + COMISIONES DE TERCEROS (2026-06-20)
-- Ejecutar en Supabase SQL Editor (proyecto ngstqwbzvnpggpklifat).
-- Idempotente: se puede re-ejecutar sin romper.
--
-- Qué agrega:
--   1. terceros            → catálogo de personas (agentes, referidos, etc.)
--   2. comisiones_terceros → comisión asignada a una campaña o a un talento.
--      Puede ser un MONTO FIJO o un PORCENTAJE sobre el fee_marca.
--        · nivel TALENTO  (campana_talento_id set) → % sobre el fee_marca de ese talento.
--        · nivel CAMPAÑA  (campana_talento_id null) → % sobre la suma de fee_marca
--          de todos los talentos no cancelados de la campaña.
--   3. pagos_tercero       → pagos (parciales) de cada comisión, igual que pagos_talento.
--
--   Las comisiones aparecen en Finanzas → CxP como una entrada a pagar.
-- ══════════════════════════════════════════════════════════════════

-- ┌──────────────────────────────────────────────────────────────┐
-- │ 1. TERCEROS — catálogo de personas                           │
-- └──────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS terceros (
  id         serial PRIMARY KEY,
  nombre     text NOT NULL,
  rol        text DEFAULT '',          -- agente, referido, corredor, etc. (libre)
  email      text DEFAULT '',
  telefono   text DEFAULT '',
  notas      text DEFAULT '',
  activo     boolean DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz DEFAULT now()
);

-- ┌──────────────────────────────────────────────────────────────┐
-- │ 2. COMISIONES_TERCEROS                                        │
-- └──────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS comisiones_terceros (
  id                 serial PRIMARY KEY,
  tercero_id         integer NOT NULL REFERENCES terceros(id) ON DELETE RESTRICT,
  campana_id         integer REFERENCES campanas(id) ON DELETE CASCADE,
  campana_talento_id integer REFERENCES campana_talentos(id) ON DELETE CASCADE, -- null = nivel campaña
  tipo               text NOT NULL DEFAULT 'porcentaje',   -- 'porcentaje' | 'fijo'
  valor              numeric NOT NULL DEFAULT 0,           -- % (si porcentaje) o monto (si fijo)
  moneda             text DEFAULT 'USD',
  monto_calculado    numeric DEFAULT 0,                    -- snapshot calculado por trigger
  pago_estado        text DEFAULT 'pendiente',             -- pendiente | parcial | pagado
  pago_fecha         date,
  notas              text DEFAULT '',
  created_by         uuid DEFAULT auth.uid(),
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now(),
  CONSTRAINT comisiones_tipo_chk CHECK (tipo IN ('porcentaje','fijo'))
);
CREATE INDEX IF NOT EXISTS idx_comisiones_campana ON comisiones_terceros(campana_id);
CREATE INDEX IF NOT EXISTS idx_comisiones_ct      ON comisiones_terceros(campana_talento_id);
CREATE INDEX IF NOT EXISTS idx_comisiones_tercero ON comisiones_terceros(tercero_id);

-- ┌──────────────────────────────────────────────────────────────┐
-- │ 3. PAGOS_TERCERO — pagos (parciales) de cada comisión        │
-- └──────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS pagos_tercero (
  id              serial PRIMARY KEY,
  comision_id     integer NOT NULL REFERENCES comisiones_terceros(id) ON DELETE CASCADE,
  monto           numeric NOT NULL DEFAULT 0,
  moneda          text DEFAULT 'USD',
  fecha_pago      date,
  corredor        text DEFAULT '',
  comprobante_url text DEFAULT '',
  notas           text DEFAULT '',
  created_by      uuid DEFAULT auth.uid(),
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pagos_tercero_comision ON pagos_tercero(comision_id);

-- ┌──────────────────────────────────────────────────────────────┐
-- │ 4. TRIGGER — calcular monto_calculado de una comisión        │
-- │    fijo       → valor                                         │
-- │    porcentaje → base * valor/100                             │
-- │      base talento = fee_marca de ese campana_talento          │
-- │      base campaña = SUM(fee_marca) de talentos no cancelados  │
-- └──────────────────────────────────────────────────────────────┘
CREATE OR REPLACE FUNCTION comision_base(p_camp integer, p_ct integer) RETURNS numeric AS $$
DECLARE v numeric := 0;
BEGIN
  IF p_ct IS NOT NULL THEN
    SELECT COALESCE(fee_marca,0) INTO v FROM campana_talentos WHERE id = p_ct;
  ELSIF p_camp IS NOT NULL THEN
    SELECT COALESCE(SUM(fee_marca),0) INTO v
      FROM campana_talentos
      WHERE campana_id = p_camp AND COALESCE(estado,'') <> 'cancelada';
  END IF;
  RETURN COALESCE(v,0);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_comision_calc() RETURNS trigger AS $$
DECLARE v_base numeric;
BEGIN
  -- Si viene a nivel talento, deriva la campaña automáticamente
  IF NEW.campana_talento_id IS NOT NULL THEN
    SELECT campana_id INTO NEW.campana_id FROM campana_talentos WHERE id = NEW.campana_talento_id;
  END IF;
  IF NEW.tipo = 'fijo' THEN
    NEW.monto_calculado := COALESCE(NEW.valor,0);
  ELSE
    v_base := comision_base(NEW.campana_id, NEW.campana_talento_id);
    NEW.monto_calculado := round(v_base * COALESCE(NEW.valor,0) / 100.0, 2);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_comision_calc ON comisiones_terceros;
CREATE TRIGGER trg_comision_calc
  BEFORE INSERT OR UPDATE ON comisiones_terceros
  FOR EACH ROW EXECUTE FUNCTION trg_comision_calc();

-- ┌──────────────────────────────────────────────────────────────┐
-- │ 5. TRIGGER — si cambia fee_marca de un talento, recalcular    │
-- │    las comisiones porcentuales afectadas (de ese talento y    │
-- │    las de nivel campaña).                                     │
-- └──────────────────────────────────────────────────────────────┘
CREATE OR REPLACE FUNCTION trg_recalc_comisiones_from_ct() RETURNS trigger AS $$
DECLARE v_camp integer;
BEGIN
  v_camp := COALESCE(NEW.campana_id, OLD.campana_id);
  -- Tocar (UPDATE no-op) las comisiones porcentuales de esa campaña → dispara trg_comision_calc
  UPDATE comisiones_terceros
     SET valor = valor
   WHERE tipo = 'porcentaje'
     AND (campana_id = v_camp OR campana_talento_id = COALESCE(NEW.id, OLD.id));
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ct_recalc_comisiones ON campana_talentos;
CREATE TRIGGER trg_ct_recalc_comisiones
  AFTER UPDATE OF fee_marca, estado ON campana_talentos
  FOR EACH ROW EXECUTE FUNCTION trg_recalc_comisiones_from_ct();

-- ┌──────────────────────────────────────────────────────────────┐
-- │ 6. TRIGGER — sincronizar pago_estado de la comisión          │
-- │    según la suma de pagos_tercero vs monto_calculado.        │
-- └──────────────────────────────────────────────────────────────┘
CREATE OR REPLACE FUNCTION trg_pagos_tercero_sync() RETURNS trigger AS $$
DECLARE cid integer; total numeric; meta numeric; ultima date;
BEGIN
  cid := COALESCE(NEW.comision_id, OLD.comision_id);
  SELECT COALESCE(SUM(monto),0), MAX(fecha_pago) INTO total, ultima
    FROM pagos_tercero WHERE comision_id = cid;
  SELECT COALESCE(monto_calculado,0) INTO meta FROM comisiones_terceros WHERE id = cid;
  UPDATE comisiones_terceros SET
    pago_estado = CASE
      WHEN meta > 0 AND total >= meta THEN 'pagado'
      WHEN total > 0 THEN 'parcial'
      ELSE 'pendiente'
    END,
    pago_fecha = ultima,
    updated_at = now()
  WHERE id = cid;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pagos_tercero_sync ON pagos_tercero;
CREATE TRIGGER trg_pagos_tercero_sync
  AFTER INSERT OR UPDATE OR DELETE ON pagos_tercero
  FOR EACH ROW EXECUTE FUNCTION trg_pagos_tercero_sync();

-- ┌──────────────────────────────────────────────────────────────┐
-- │ 7. RLS — solo equipo interno (admin / campaign_manager)      │
-- │    Reusa el helper is_internal() (SECURITY DEFINER).         │
-- └──────────────────────────────────────────────────────────────┘
ALTER TABLE terceros            ENABLE ROW LEVEL SECURITY;
ALTER TABLE comisiones_terceros ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_tercero       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS terceros_internal ON terceros;
CREATE POLICY terceros_internal ON terceros
  FOR ALL USING (is_internal()) WITH CHECK (is_internal());

DROP POLICY IF EXISTS comisiones_internal ON comisiones_terceros;
CREATE POLICY comisiones_internal ON comisiones_terceros
  FOR ALL USING (is_internal()) WITH CHECK (is_internal());

DROP POLICY IF EXISTS pagos_tercero_internal ON pagos_tercero;
CREATE POLICY pagos_tercero_internal ON pagos_tercero
  FOR ALL USING (is_internal()) WITH CHECK (is_internal());

-- ┌──────────────────────────────────────────────────────────────┐
-- │ 8. Backfill: recalcular monto de comisiones existentes        │
-- └──────────────────────────────────────────────────────────────┘
UPDATE comisiones_terceros SET valor = valor;  -- no-op que dispara trg_comision_calc

-- ───────────────────────────────────────────────────────────────
-- LISTO. El bucket `comprobantes` (o el que se use para pagos) ya existe.
-- Los comprobantes de pago de terceros se suben a la misma ruta de pagos.
-- ───────────────────────────────────────────────────────────────
