-- ============================================================
-- Identificador de Campaña (Cliente/Marca/Talento/OrdenTrabajo)
-- ============================================================
-- Cada Cliente, Marca y Talento recibe un número secuencial.
-- Cada relación campana_talento recibe una "orden de trabajo".
-- Se calcula un identificador compuesto cliente/marca/talento/orden
-- que se usa como Orden de Compra en facturas y para vincular
-- contratos.
--
-- Rangos:
--   Cliente:        0–200    (3 dígitos: 001)
--   Marca:          0–2000   (4 dígitos: 0042)
--   Talento:        0–90000  (5 dígitos: 00125)
--   Orden trabajo:  0–100    (2 dígitos: 01)
-- ============================================================

-- 1) Columnas numero --------------------------------------------------
ALTER TABLE clientes  ADD COLUMN IF NOT EXISTS numero integer;
ALTER TABLE marcas    ADD COLUMN IF NOT EXISTS numero integer;
ALTER TABLE talentos  ADD COLUMN IF NOT EXISTS numero integer;

-- Constraints de rango
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='clientes_numero_range') THEN
    ALTER TABLE clientes ADD CONSTRAINT clientes_numero_range CHECK (numero IS NULL OR (numero >= 0 AND numero <= 200));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='marcas_numero_range') THEN
    ALTER TABLE marcas ADD CONSTRAINT marcas_numero_range CHECK (numero IS NULL OR (numero >= 0 AND numero <= 2000));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='talentos_numero_range') THEN
    ALTER TABLE talentos ADD CONSTRAINT talentos_numero_range CHECK (numero IS NULL OR (numero >= 0 AND numero <= 90000));
  END IF;
END $$;

-- Índices únicos (sólo cuando hay valor)
CREATE UNIQUE INDEX IF NOT EXISTS clientes_numero_unique ON clientes (numero) WHERE numero IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS marcas_numero_unique   ON marcas   (numero) WHERE numero IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS talentos_numero_unique ON talentos (numero) WHERE numero IS NOT NULL;

-- 2) Backfill de numeros para registros existentes -------------------
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn FROM clientes WHERE numero IS NULL
)
UPDATE clientes c SET numero = r.rn + COALESCE((SELECT MAX(numero) FROM clientes), 0)
FROM ranked r WHERE c.id = r.id;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn FROM marcas WHERE numero IS NULL
)
UPDATE marcas m SET numero = r.rn + COALESCE((SELECT MAX(numero) FROM marcas), 0)
FROM ranked r WHERE m.id = r.id;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn FROM talentos WHERE numero IS NULL
)
UPDATE talentos t SET numero = r.rn + COALESCE((SELECT MAX(numero) FROM talentos), 0)
FROM ranked r WHERE t.id = r.id;

-- 3) Triggers para auto-asignar numero al insertar -------------------
CREATE OR REPLACE FUNCTION assign_cliente_numero() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.numero IS NULL THEN
    NEW.numero := COALESCE((SELECT MAX(numero) FROM clientes), 0) + 1;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_cliente_numero ON clientes;
CREATE TRIGGER trg_cliente_numero BEFORE INSERT ON clientes
  FOR EACH ROW EXECUTE FUNCTION assign_cliente_numero();

CREATE OR REPLACE FUNCTION assign_marca_numero() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.numero IS NULL THEN
    NEW.numero := COALESCE((SELECT MAX(numero) FROM marcas), 0) + 1;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_marca_numero ON marcas;
CREATE TRIGGER trg_marca_numero BEFORE INSERT ON marcas
  FOR EACH ROW EXECUTE FUNCTION assign_marca_numero();

CREATE OR REPLACE FUNCTION assign_talento_numero() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.numero IS NULL THEN
    NEW.numero := COALESCE((SELECT MAX(numero) FROM talentos), 0) + 1;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_talento_numero ON talentos;
CREATE TRIGGER trg_talento_numero BEFORE INSERT ON talentos
  FOR EACH ROW EXECUTE FUNCTION assign_talento_numero();

-- 4) Orden de trabajo + identificador en campana_talentos ------------
ALTER TABLE campana_talentos ADD COLUMN IF NOT EXISTS orden_trabajo integer;
ALTER TABLE campana_talentos ADD COLUMN IF NOT EXISTS identificador text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ct_orden_trabajo_range') THEN
    ALTER TABLE campana_talentos ADD CONSTRAINT ct_orden_trabajo_range CHECK (orden_trabajo IS NULL OR (orden_trabajo >= 0 AND orden_trabajo <= 100));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS campana_talentos_identificador_unique
  ON campana_talentos (identificador) WHERE identificador IS NOT NULL;

-- Función: construir el identificador compuesto a partir de los IDs
CREATE OR REPLACE FUNCTION build_campana_identificador(p_ct_id int)
RETURNS text AS $$
DECLARE
  cli_num int; mar_num int; tal_num int; ord int;
BEGIN
  SELECT cli.numero, m.numero, t.numero, ct.orden_trabajo
    INTO cli_num, mar_num, tal_num, ord
  FROM campana_talentos ct
  JOIN campanas ca   ON ca.id  = ct.campana_id
  LEFT JOIN marcas m   ON m.id  = ca.marca_id
  LEFT JOIN clientes cli ON cli.id = m.cliente_id
  LEFT JOIN talentos t ON t.id  = ct.talent_id
  WHERE ct.id = p_ct_id;

  IF cli_num IS NULL OR mar_num IS NULL OR tal_num IS NULL OR ord IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN lpad(cli_num::text,3,'0')||'/'||
         lpad(mar_num::text,4,'0')||'/'||
         lpad(tal_num::text,5,'0')||'/'||
         lpad(ord::text,2,'0');
END $$ LANGUAGE plpgsql;

-- Trigger: asigna orden_trabajo (próximo disponible para esa marca+talento)
-- y construye el identificador automáticamente.
CREATE OR REPLACE FUNCTION assign_orden_trabajo() RETURNS TRIGGER AS $$
DECLARE
  v_marca_id int;
  v_next int;
BEGIN
  SELECT marca_id INTO v_marca_id FROM campanas WHERE id = NEW.campana_id;

  IF NEW.orden_trabajo IS NULL THEN
    SELECT COALESCE(MAX(ct.orden_trabajo),0)+1
      INTO v_next
    FROM campana_talentos ct
    JOIN campanas ca ON ca.id = ct.campana_id
    WHERE ca.marca_id = v_marca_id AND ct.talent_id = NEW.talent_id;
    NEW.orden_trabajo := v_next;
  END IF;

  NEW.identificador := (
    SELECT lpad(cli.numero::text,3,'0')||'/'||
           lpad(m.numero::text,4,'0')||'/'||
           lpad(t.numero::text,5,'0')||'/'||
           lpad(NEW.orden_trabajo::text,2,'0')
    FROM marcas m
    LEFT JOIN clientes cli ON cli.id = m.cliente_id
    LEFT JOIN talentos t ON t.id = NEW.talent_id
    WHERE m.id = v_marca_id
  );

  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_assign_orden_trabajo ON campana_talentos;
CREATE TRIGGER trg_assign_orden_trabajo
  BEFORE INSERT ON campana_talentos
  FOR EACH ROW EXECUTE FUNCTION assign_orden_trabajo();

-- Backfill identificadores para registros existentes
DO $$
DECLARE r record; v_marca_id int; v_next int;
BEGIN
  FOR r IN SELECT id, campana_id, talent_id FROM campana_talentos
           WHERE identificador IS NULL ORDER BY id LOOP
    SELECT marca_id INTO v_marca_id FROM campanas WHERE id = r.campana_id;
    SELECT COALESCE(MAX(ct.orden_trabajo),0)+1
      INTO v_next
    FROM campana_talentos ct
    JOIN campanas ca ON ca.id = ct.campana_id
    WHERE ca.marca_id = v_marca_id AND ct.talent_id = r.talent_id
      AND ct.orden_trabajo IS NOT NULL;
    UPDATE campana_talentos SET orden_trabajo = v_next WHERE id = r.id;
    UPDATE campana_talentos SET identificador = build_campana_identificador(id) WHERE id = r.id;
  END LOOP;
END $$;

-- 5) Orden de compra en facturas (ya existe campana_talento_id?) -----
-- Si facturas no tiene campana_talento_id la dejamos a nivel campaña;
-- agregamos una columna orden_compra (texto) que guarda el identificador
-- elegido (puede ser uno o varios separados por coma si hay varios talentos).
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS orden_compra text;

-- 6) Vincular contratos a un campana_talento_id (ya existe en schema)
-- contratos.numero_contrato sigue siendo MMYYNN. El identificador
-- compuesto se obtiene vía join con campana_talentos.

COMMENT ON COLUMN clientes.numero IS '0–200 secuencial autogenerado';
COMMENT ON COLUMN marcas.numero   IS '0–2000 secuencial autogenerado';
COMMENT ON COLUMN talentos.numero IS '0–90000 secuencial autogenerado';
COMMENT ON COLUMN campana_talentos.orden_trabajo IS '0–100 secuencial por (marca, talento)';
COMMENT ON COLUMN campana_talentos.identificador IS 'Cliente/Marca/Talento/Orden — Orden de Compra en facturas';
COMMENT ON COLUMN facturas.orden_compra IS 'Identificador(es) de campana_talento — formato 001/0042/00125/01';
