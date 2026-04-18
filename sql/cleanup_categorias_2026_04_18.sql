-- Cleanup post-migración (corre DESPUÉS de normalize_categorias_2026_04_17.sql)
--
-- Arregla 3 tipos de basura detectados en talentos.categorias:
--   1) Arrays serializados como string: '{Aventura}', '{Contenido,Entretenimiento}', etc.
--   2) Strings con coma como un solo elemento: 'Contenido, moda', 'Belleza, moda, viaje', etc.
--   3) Categorías con casing incorrecto y keywords nuevas no mapeadas (Actor, Streamer,
--      Educativo, Cheff, Kids, Niños, Relationship).
--
-- Lógica por elemento de categorias:
--   a) Quita llaves '{...}' si están envolviéndolo
--   b) Splittea por coma en piezas
--   c) Para cada pieza:
--      - Si matchea una de las 14 categorías oficiales (case-insensitive) → canónica, NO toca keywords
--      - Si matchea una keyword fantasma → reemplaza por categoría padre + agrega original a keywords
--      - Si no matchea nada → la deja con primera letra capitalizada (no toca keywords)

-- ===================================================================
-- 1) PREVIEW — mostrar talentos que serían modificados
-- ===================================================================
SELECT
  id,
  nombre,
  categorias AS categorias_actuales,
  keywords   AS keywords_actuales
FROM talentos
WHERE EXISTS (
  SELECT 1 FROM unnest(categorias) AS c
  WHERE
    -- malformados (con llaves o coma)
    c LIKE '{%}' OR c LIKE '%,%'
    -- o no está en las 14 oficiales
    OR lower(c) NOT IN (
      'profesional','familia','deporte','entretenimiento','gaming','belleza','moda',
      'gastronomía','gastronomia','hogar','aventura','creatividad/arte','contenido',
      'tecnología','tecnologia','música','musica','sin categoría'
    )
)
ORDER BY nombre;


-- ===================================================================
-- 2) CLEANUP — aplica cambios
-- ===================================================================
BEGIN;

-- 14 categorías oficiales (lowercase → forma canónica con accentos)
CREATE TEMP TABLE _valid_cats (cat_lower TEXT PRIMARY KEY, cat_proper TEXT) ON COMMIT DROP;
INSERT INTO _valid_cats VALUES
  ('profesional','Profesional'),
  ('familia','Familia'),
  ('deporte','Deporte'),
  ('entretenimiento','Entretenimiento'),
  ('gaming','Gaming'),
  ('belleza','Belleza'),
  ('moda','Moda'),
  ('gastronomía','Gastronomía'),('gastronomia','Gastronomía'),
  ('hogar','Hogar'),
  ('aventura','Aventura'),
  ('creatividad/arte','Creatividad/Arte'),
  ('contenido','Contenido'),
  ('tecnología','Tecnología'),('tecnologia','Tecnología'),
  ('música','Música'),('musica','Música');

-- Mapping completo de keywords fantasma → categoría padre (incluye las 7 nuevas)
CREATE TEMP TABLE _kw_to_cat (kw TEXT PRIMARY KEY, cat TEXT NOT NULL) ON COMMIT DROP;
INSERT INTO _kw_to_cat (kw, cat) VALUES
  -- Profesional
  ('medico','Profesional'),('médico','Profesional'),
  ('dermatologo','Profesional'),('dermatólogo','Profesional'),
  ('anestesista','Profesional'),('finanzas','Profesional'),
  ('marketing','Profesional'),('periodista profesional','Profesional'),
  ('periodista','Profesional'),('programador','Profesional'),('programadora','Profesional'),
  ('nutricion','Profesional'),('nutrición','Profesional'),
  ('arquitecta','Profesional'),('arquitecto','Profesional'),
  ('electricidad','Profesional'),('business','Profesional'),
  ('educacion','Profesional'),('educación','Profesional'),
  ('educativo','Profesional'),
  ('negocios','Profesional'),('salud','Profesional'),
  -- Familia
  ('mommy','Familia'),('baby','Familia'),('kid','Familia'),('kids','Familia'),
  ('niños','Familia'),('ninos','Familia'),('niño','Familia'),('nino','Familia'),
  ('pareja','Familia'),('familia / maternidad','Familia'),('maternidad','Familia'),
  -- Deporte
  ('fitness','Deporte'),('deportista','Deporte'),('deportes','Deporte'),
  -- Entretenimiento
  ('cine','Entretenimiento'),('peliculas','Entretenimiento'),('películas','Entretenimiento'),
  ('tv celebrity','Entretenimiento'),('celebrity','Entretenimiento'),
  ('comedia','Entretenimiento'),('anime','Entretenimiento'),('doblaje','Entretenimiento'),
  ('cosplay','Entretenimiento'),('podcast','Entretenimiento'),('humor','Entretenimiento'),
  ('actor','Entretenimiento'),('actriz','Entretenimiento'),
  -- Gaming
  ('videojuegos','Gaming'),('gamers','Gaming'),('gamer','Gaming'),
  ('fortnite','Gaming'),('minecraft','Gaming'),('otaku','Gaming'),
  ('streamer','Gaming'),
  -- Belleza
  ('makeup','Belleza'),('beauty','Belleza'),('skincare','Belleza'),
  -- Moda
  ('fashion','Moda'),('luxury','Moda'),
  -- Gastronomía
  ('cooking','Gastronomía'),('chef','Gastronomía'),('cheff','Gastronomía'),
  ('foodie','Gastronomía'),
  -- Hogar
  ('diy','Hogar'),('manualidad','Hogar'),
  ('decoracion','Hogar'),('decoración','Hogar'),
  ('building','Hogar'),('cabin','Hogar'),('tiny house','Hogar'),
  -- Aventura
  ('outdoor','Aventura'),('camping','Aventura'),('fishing','Aventura'),
  ('sailing','Aventura'),('storm chaser','Aventura'),('weather','Aventura'),
  ('campo','Aventura'),('farm','Aventura'),('animales','Aventura'),('mascotas','Aventura'),
  ('travel','Aventura'),('viajes','Aventura'),('viaje','Aventura'),('van','Aventura'),
  ('motorhome','Aventura'),('autos','Aventura'),('motos','Aventura'),
  -- Creatividad/Arte
  ('artista','Creatividad/Arte'),('dibujo','Creatividad/Arte'),
  ('diseño','Creatividad/Arte'),('diseno','Creatividad/Arte'),
  ('fotografia','Creatividad/Arte'),('fotografía','Creatividad/Arte'),
  ('vfx','Creatividad/Arte'),('edicion','Creatividad/Arte'),('edición','Creatividad/Arte'),
  ('animacion','Creatividad/Arte'),('animación','Creatividad/Arte'),
  ('arte & diseño','Creatividad/Arte'),('arte','Creatividad/Arte'),
  -- Contenido
  ('vlog','Contenido'),('variedades','Contenido'),('lifestyle','Contenido'),
  ('lifehacks','Contenido'),('motivacional','Contenido'),('reviews','Contenido'),
  ('comentarista','Contenido'),('entrevistas','Contenido'),('lgbt','Contenido'),
  ('deals','Contenido'),('relationship','Contenido'),('relación','Contenido'),
  -- Tecnología
  ('telefono','Tecnología'),('teléfono','Tecnología'),('ia','Tecnología'),
  -- Música
  ('cantante','Música'),('baile','Música'),
  ('trend','Música'),('lipsync','Música'),('asmr','Música');

DO $$
DECLARE
  t_row        RECORD;
  raw_elem     TEXT;
  cleaned_elem TEXT;
  pieces       TEXT[];
  piece        TEXT;
  piece_lower  TEXT;
  canonical    TEXT;
  mapped_cat   TEXT;
  new_cats     TEXT[];
  kw_add       TEXT[];
  new_kws      TEXT;
  existing_kws TEXT[];
BEGIN
  FOR t_row IN
    SELECT id, categorias, keywords
    FROM talentos
    WHERE categorias IS NOT NULL AND array_length(categorias, 1) > 0
  LOOP
    new_cats := ARRAY[]::TEXT[];
    kw_add   := ARRAY[]::TEXT[];

    FOREACH raw_elem IN ARRAY t_row.categorias LOOP
      cleaned_elem := trim(raw_elem);
      -- Quita llaves '{...}' si están envolviendo
      IF cleaned_elem LIKE '{%}' THEN
        cleaned_elem := substring(cleaned_elem FROM 2 FOR length(cleaned_elem) - 2);
      END IF;
      -- Splittea por coma
      pieces := string_to_array(cleaned_elem, ',');

      FOREACH piece IN ARRAY pieces LOOP
        piece := trim(BOTH ' "' FROM piece);
        IF piece = '' THEN CONTINUE; END IF;
        piece_lower := lower(piece);

        -- 1) ¿Es una categoría oficial (case-insensitive)?
        SELECT cat_proper INTO canonical FROM _valid_cats WHERE cat_lower = piece_lower;
        IF canonical IS NOT NULL THEN
          new_cats := array_append(new_cats, canonical);
          CONTINUE;
        END IF;

        -- 2) ¿Es una keyword fantasma?
        SELECT cat INTO mapped_cat FROM _kw_to_cat WHERE kw = piece_lower;
        IF mapped_cat IS NOT NULL THEN
          new_cats := array_append(new_cats, mapped_cat);
          kw_add   := array_append(kw_add, piece);
          CONTINUE;
        END IF;

        -- 3) Desconocida → mantener con primera letra mayúscula
        new_cats := array_append(
          new_cats,
          upper(substring(piece FROM 1 FOR 1)) || substring(piece FROM 2)
        );
      END LOOP;
    END LOOP;

    -- Dedupe
    new_cats := ARRAY(SELECT DISTINCT x FROM unnest(new_cats) AS x);
    -- Si quedó vacío, dejar 'Sin categoría' por seguridad
    IF array_length(new_cats, 1) IS NULL THEN
      new_cats := ARRAY['Sin categoría'];
    END IF;

    -- Keywords existentes (lowercase, trim) para evitar duplicados
    existing_kws := ARRAY(
      SELECT lower(trim(x))
      FROM unnest(string_to_array(COALESCE(t_row.keywords, ''), ',')) AS x
      WHERE trim(x) <> ''
    );

    new_kws := COALESCE(t_row.keywords, '');
    IF array_length(kw_add, 1) > 0 THEN
      FOREACH piece IN ARRAY kw_add LOOP
        IF NOT (lower(trim(piece)) = ANY(existing_kws)) THEN
          IF new_kws = '' THEN
            new_kws := piece;
          ELSE
            new_kws := new_kws || ', ' || piece;
          END IF;
          existing_kws := array_append(existing_kws, lower(trim(piece)));
        END IF;
      END LOOP;
    END IF;

    UPDATE talentos
    SET categorias = new_cats,
        keywords   = new_kws
    WHERE id = t_row.id;
  END LOOP;
END $$;

COMMIT;


-- ===================================================================
-- 3) VERIFICACIONES
-- ===================================================================

-- 3.a) Distribución final — solo deberían aparecer las 14 oficiales (+ 'Sin categoría' si hay)
SELECT unnest(categorias) AS categoria, COUNT(*) AS total
FROM talentos
GROUP BY 1
ORDER BY 2 DESC;

-- 3.b) Detectar cualquier residuo malformado o no oficial
SELECT id, nombre, categorias
FROM talentos
WHERE EXISTS (
  SELECT 1 FROM unnest(categorias) AS c
  WHERE c LIKE '{%}' OR c LIKE '%,%'
     OR lower(c) NOT IN (
       'profesional','familia','deporte','entretenimiento','gaming','belleza','moda',
       'gastronomía','hogar','aventura','creatividad/arte','contenido',
       'tecnología','música','sin categoría'
     )
)
ORDER BY nombre;
