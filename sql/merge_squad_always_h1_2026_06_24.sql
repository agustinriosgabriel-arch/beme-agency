-- ============================================================================
--  FUSIÓN DE CAMPAÑAS  →  "Squad Always H1"
--  Une  "Garnier Classic Micellar -Mother's Day- Hot Sale - Mayo"
--   +   "Garnier - Junio"
--  en UNA sola campaña. Es el MISMO talento en las dos, así que se consolida
--  en una única sub-campaña (una fila de talento) que se queda con TODAS las
--  acciones / contenidos de mayo y junio.
--
--  Fee de marca final: 160000   ·   Pago al talento final: 128000
--
--  Cómo correrlo:  Supabase → SQL Editor → pegar y "Run".
--  (El SQL Editor corre como superusuario y saltea RLS, por eso funciona.)
--  Fecha: 2026-06-24
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
--  PASO 1 (solo lectura) — Confirmá que son las campañas correctas.
--  Corré ESTO primero. Deberías ver 2 filas: la de Mayo y la de Junio,
--  cada una con 1 talento y su cantidad de acciones.
-- ────────────────────────────────────────────────────────────────────────────
SELECT c.id,
       c.nombre,
       c.estado,
       c.fecha_inicio,
       c.fecha_fin,
       ct.id                                                       AS sub_campana_id,
       t.nombre                                                    AS talento,
       ct.fee_marca,
       ct.fee_talento,
       ct.moneda,
       (SELECT count(*) FROM contenidos co WHERE co.campana_talento_id = ct.id) AS acciones
FROM campanas c
LEFT JOIN campana_talentos ct ON ct.campana_id = c.id
LEFT JOIN talentos t          ON t.id = ct.talent_id
WHERE c.nombre ILIKE '%Garnier%'
  AND (c.nombre ILIKE '%Mayo%' OR c.nombre ILIKE '%Junio%')
ORDER BY c.id;


-- ────────────────────────────────────────────────────────────────────────────
--  PASO 2 — La fusión. Es atómica: si algo no cuadra, NO cambia nada.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_surv_id  integer;   -- campaña que sobrevive (Mayo) → se renombra a Squad Always H1
  v_dead_id  integer;   -- campaña que se absorbe y borra (Junio)
  v_surv_ct  integer;   -- fila de talento de Mayo (la que queda)
  v_dead_ct  integer;   -- fila de talento de Junio (se vacía y borra)
  v_t_surv   integer;
  v_t_dead   integer;
  v_fi       date;
  v_ff       date;
  -- tablas que apuntan a campana_talentos.id (registros por-talento)
  ct_tables  text[] := ARRAY['contenidos','contratos','pagos_talento','comisiones_terceros'];
  -- tablas que apuntan a campanas.id (registros a nivel campaña)
  cm_tables  text[] := ARRAY['campana_briefs','campana_mensajes','contratos','comisiones_terceros','facturas'];
  i int;
BEGIN
  -- 1) Localizar las dos campañas (tiene que haber exactamente UNA de cada una)
  SELECT id INTO STRICT v_surv_id FROM campanas
    WHERE nombre ILIKE '%Garnier%' AND nombre ILIKE '%Mayo%';
  SELECT id INTO STRICT v_dead_id FROM campanas
    WHERE nombre ILIKE '%Garnier%' AND nombre ILIKE '%Junio%';
  RAISE NOTICE 'Mayo (sobrevive) = id %  ·  Junio (se absorbe) = id %', v_surv_id, v_dead_id;

  -- 2) Exigir 1 talento en cada campaña (si no, frenar sin tocar nada)
  IF (SELECT count(*) FROM campana_talentos WHERE campana_id = v_surv_id) <> 1
     OR (SELECT count(*) FROM campana_talentos WHERE campana_id = v_dead_id) <> 1 THEN
     RAISE EXCEPTION 'Esperaba 1 talento por campaña y encontré otra cosa. Frená y avisale a Claude.';
  END IF;

  SELECT id, talent_id INTO v_surv_ct, v_t_surv FROM campana_talentos WHERE campana_id = v_surv_id;
  SELECT id, talent_id INTO v_dead_ct, v_t_dead FROM campana_talentos WHERE campana_id = v_dead_id;

  IF v_t_surv IS DISTINCT FROM v_t_dead THEN
     RAISE WARNING 'OJO: las sub-campañas apuntan a talentos distintos (% vs %). Se consolida bajo el de Mayo igual.',
                   v_t_surv, v_t_dead;
  END IF;

  -- 3) Mover acciones/contenidos y registros por-talento de Junio → fila de Mayo
  FOR i IN 1 .. array_length(ct_tables,1) LOOP
    IF to_regclass(ct_tables[i]) IS NOT NULL
       AND EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name=ct_tables[i]
                      AND column_name='campana_talento_id') THEN
      EXECUTE format('UPDATE %I SET campana_talento_id=$1 WHERE campana_talento_id=$2', ct_tables[i])
        USING v_surv_ct, v_dead_ct;
    END IF;
  END LOOP;

  -- factura_talentos: re-apuntar evitando duplicar la clave única (factura_id, campana_talento_id)
  IF to_regclass('factura_talentos') IS NOT NULL THEN
    UPDATE factura_talentos ft SET campana_talento_id = v_surv_ct
      WHERE campana_talento_id = v_dead_ct
        AND NOT EXISTS (SELECT 1 FROM factura_talentos x
                         WHERE x.factura_id = ft.factura_id AND x.campana_talento_id = v_surv_ct);
    DELETE FROM factura_talentos WHERE campana_talento_id = v_dead_ct;   -- sobrantes que ya existían
  END IF;

  -- 4) Borrar la fila de talento de Junio (ya quedó sin hijos)
  DELETE FROM campana_talentos WHERE id = v_dead_ct;

  -- 5) Mover registros a nivel campaña de Junio → Mayo
  FOR i IN 1 .. array_length(cm_tables,1) LOOP
    IF to_regclass(cm_tables[i]) IS NOT NULL
       AND EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name=cm_tables[i]
                      AND column_name='campana_id') THEN
      EXECUTE format('UPDATE %I SET campana_id=$1 WHERE campana_id=$2', cm_tables[i])
        USING v_surv_id, v_dead_id;
    END IF;
  END LOOP;

  -- managers / handlers tienen clave compuesta: mover sin duplicar
  IF to_regclass('campana_managers') IS NOT NULL THEN
    UPDATE campana_managers m SET campana_id = v_surv_id WHERE campana_id = v_dead_id
      AND NOT EXISTS (SELECT 1 FROM campana_managers x WHERE x.campana_id=v_surv_id AND x.user_id=m.user_id);
    DELETE FROM campana_managers WHERE campana_id = v_dead_id;
  END IF;
  IF to_regclass('campana_handlers') IS NOT NULL THEN
    UPDATE campana_handlers h SET campana_id = v_surv_id WHERE campana_id = v_dead_id
      AND NOT EXISTS (SELECT 1 FROM campana_handlers x WHERE x.campana_id=v_surv_id AND x.user_id=h.user_id);
    DELETE FROM campana_handlers WHERE campana_id = v_dead_id;
  END IF;

  -- 6) Que la campaña abarque mayo–junio (LEAST/GREATEST ignoran nulos)
  SELECT LEAST(a.fecha_inicio, b.fecha_inicio), GREATEST(a.fecha_fin, b.fecha_fin)
    INTO v_fi, v_ff
    FROM (SELECT fecha_inicio, fecha_fin FROM campanas WHERE id = v_surv_id) a,
         (SELECT fecha_inicio, fecha_fin FROM campanas WHERE id = v_dead_id) b;

  -- 7) Fee final + nombre + fechas en la campaña que sobrevive
  UPDATE campana_talentos
     SET fee_marca = 160000, fee_talento = 128000
   WHERE id = v_surv_ct;

  UPDATE campanas
     SET nombre       = 'Squad Always H1',
         fecha_inicio = COALESCE(v_fi, fecha_inicio),
         fecha_fin    = COALESCE(v_ff, fecha_fin)
   WHERE id = v_surv_id;

  -- 8) Borrar la campaña de Junio (ya quedó vacía)
  DELETE FROM campanas WHERE id = v_dead_id;

  RAISE NOTICE 'Listo. Campaña % = "Squad Always H1" · 1 talento · fee 160000 / pago 128000. Campaña % eliminada.',
               v_surv_id, v_dead_id;
END $$;


-- ────────────────────────────────────────────────────────────────────────────
--  PASO 3 (solo lectura) — Verificar el resultado.
--  Debe devolver 1 fila: "Squad Always H1", el talento, fee 160000 / 128000,
--  y la suma de acciones de mayo + junio.
-- ────────────────────────────────────────────────────────────────────────────
SELECT c.id,
       c.nombre,
       c.estado,
       c.fecha_inicio,
       c.fecha_fin,
       t.nombre        AS talento,
       ct.fee_marca,
       ct.fee_talento,
       (SELECT count(*) FROM contenidos co WHERE co.campana_talento_id = ct.id) AS acciones
FROM campanas c
JOIN campana_talentos ct ON ct.campana_id = c.id
LEFT JOIN talentos t      ON t.id = ct.talent_id
WHERE c.nombre = 'Squad Always H1';
