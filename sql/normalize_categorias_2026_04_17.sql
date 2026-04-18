-- Normaliza talentos.categorias: reemplaza valores "fantasma" (keywords usadas como
-- categoría) por su categoría padre correcta y agrega el valor original a talentos.keywords.
--
-- Taxonomía de 14 categorías:
--   Profesional, Familia, Deporte, Entretenimiento, Gaming, Belleza, Moda,
--   Gastronomía, Hogar, Aventura, Creatividad/Arte, Contenido, Tecnología, Música
--
-- Uso recomendado:
--   1) Correr el SELECT de preview (sección 1) para ver los talentos afectados.
--   2) Correr el BEGIN..COMMIT (sección 2) para aplicar la migración.
--   3) Correr las verificaciones (sección 3) para confirmar el resultado.

-- ===================================================================
-- 1) PREVIEW — talentos con categorías fantasma (no aplica cambios)
-- ===================================================================
WITH mapping(kw, cat) AS (
  VALUES
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
    ('negocios','Profesional'),('salud','Profesional'),
    -- Familia
    ('mommy','Familia'),('baby','Familia'),('kid','Familia'),('pareja','Familia'),
    ('familia / maternidad','Familia'),('maternidad','Familia'),
    -- Deporte
    ('fitness','Deporte'),('deportista','Deporte'),('deportes','Deporte'),
    -- Entretenimiento
    ('cine','Entretenimiento'),('peliculas','Entretenimiento'),('películas','Entretenimiento'),
    ('tv celebrity','Entretenimiento'),('celebrity','Entretenimiento'),
    ('comedia','Entretenimiento'),('anime','Entretenimiento'),('doblaje','Entretenimiento'),
    ('cosplay','Entretenimiento'),('podcast','Entretenimiento'),('humor','Entretenimiento'),
    -- Gaming
    ('videojuegos','Gaming'),('gamers','Gaming'),('gamer','Gaming'),
    ('fortnite','Gaming'),('minecraft','Gaming'),('otaku','Gaming'),
    -- Belleza
    ('makeup','Belleza'),('beauty','Belleza'),('skincare','Belleza'),
    -- Moda
    ('fashion','Moda'),('luxury','Moda'),
    -- Gastronomía
    ('cooking','Gastronomía'),('chef','Gastronomía'),('foodie','Gastronomía'),
    ('gastronomia','Gastronomía'),
    -- Hogar
    ('diy','Hogar'),('manualidad','Hogar'),
    ('decoracion','Hogar'),('decoración','Hogar'),
    ('building','Hogar'),('cabin','Hogar'),('tiny house','Hogar'),
    -- Aventura
    ('outdoor','Aventura'),('camping','Aventura'),('fishing','Aventura'),
    ('sailing','Aventura'),('storm chaser','Aventura'),('weather','Aventura'),
    ('campo','Aventura'),('farm','Aventura'),('animales','Aventura'),('mascotas','Aventura'),
    ('travel','Aventura'),('viajes','Aventura'),('van','Aventura'),
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
    ('deals','Contenido'),
    -- Tecnología
    ('telefono','Tecnología'),('teléfono','Tecnología'),('ia','Tecnología'),
    ('tecnologia','Tecnología'),
    -- Música
    ('musica','Música'),('cantante','Música'),('baile','Música'),
    ('trend','Música'),('lipsync','Música'),('asmr','Música')
)
SELECT
  t.id,
  t.nombre,
  t.categorias                         AS categorias_actuales,
  ARRAY(
    SELECT DISTINCT COALESCE(m.cat, c)
    FROM unnest(t.categorias) AS c
    LEFT JOIN mapping m ON m.kw = lower(c)
  )                                    AS categorias_nuevas,
  ARRAY(
    SELECT c
    FROM unnest(t.categorias) AS c
    JOIN mapping m ON m.kw = lower(c)
  )                                    AS keywords_a_agregar,
  t.keywords                           AS keywords_actuales
FROM talentos t
WHERE EXISTS (
  SELECT 1 FROM unnest(t.categorias) AS c
  WHERE lower(c) IN (SELECT kw FROM mapping)
)
ORDER BY t.nombre;


-- ===================================================================
-- 2) MIGRACIÓN — aplica cambios
-- ===================================================================
BEGIN;

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
  ('negocios','Profesional'),('salud','Profesional'),
  -- Familia
  ('mommy','Familia'),('baby','Familia'),('kid','Familia'),('pareja','Familia'),
  ('familia / maternidad','Familia'),('maternidad','Familia'),
  -- Deporte
  ('fitness','Deporte'),('deportista','Deporte'),('deportes','Deporte'),
  -- Entretenimiento
  ('cine','Entretenimiento'),('peliculas','Entretenimiento'),('películas','Entretenimiento'),
  ('tv celebrity','Entretenimiento'),('celebrity','Entretenimiento'),
  ('comedia','Entretenimiento'),('anime','Entretenimiento'),('doblaje','Entretenimiento'),
  ('cosplay','Entretenimiento'),('podcast','Entretenimiento'),('humor','Entretenimiento'),
  -- Gaming
  ('videojuegos','Gaming'),('gamers','Gaming'),('gamer','Gaming'),
  ('fortnite','Gaming'),('minecraft','Gaming'),('otaku','Gaming'),
  -- Belleza
  ('makeup','Belleza'),('beauty','Belleza'),('skincare','Belleza'),
  -- Moda
  ('fashion','Moda'),('luxury','Moda'),
  -- Gastronomía
  ('cooking','Gastronomía'),('chef','Gastronomía'),('foodie','Gastronomía'),
  ('gastronomia','Gastronomía'),
  -- Hogar
  ('diy','Hogar'),('manualidad','Hogar'),
  ('decoracion','Hogar'),('decoración','Hogar'),
  ('building','Hogar'),('cabin','Hogar'),('tiny house','Hogar'),
  -- Aventura
  ('outdoor','Aventura'),('camping','Aventura'),('fishing','Aventura'),
  ('sailing','Aventura'),('storm chaser','Aventura'),('weather','Aventura'),
  ('campo','Aventura'),('farm','Aventura'),('animales','Aventura'),('mascotas','Aventura'),
  ('travel','Aventura'),('viajes','Aventura'),('van','Aventura'),
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
  ('deals','Contenido'),
  -- Tecnología
  ('telefono','Tecnología'),('teléfono','Tecnología'),('ia','Tecnología'),
  ('tecnologia','Tecnología'),
  -- Música
  ('musica','Música'),('cantante','Música'),('baile','Música'),
  ('trend','Música'),('lipsync','Música'),('asmr','Música');

DO $$
DECLARE
  t_row        RECORD;
  cat_val      TEXT;
  mapped_cat   TEXT;
  new_cats     TEXT[];
  kw_add       TEXT[];
  new_kws      TEXT;
  existing_kws TEXT[];
BEGIN
  FOR t_row IN
    SELECT id, categorias, keywords
    FROM talentos
    WHERE EXISTS (
      SELECT 1 FROM unnest(categorias) AS c
      WHERE lower(c) IN (SELECT kw FROM _kw_to_cat)
    )
  LOOP
    new_cats := ARRAY[]::TEXT[];
    kw_add   := ARRAY[]::TEXT[];

    FOREACH cat_val IN ARRAY t_row.categorias LOOP
      SELECT cat INTO mapped_cat FROM _kw_to_cat WHERE kw = lower(cat_val);
      IF mapped_cat IS NOT NULL THEN
        new_cats := array_append(new_cats, mapped_cat);
        kw_add   := array_append(kw_add, cat_val);
      ELSE
        new_cats := array_append(new_cats, cat_val);
      END IF;
    END LOOP;

    -- Dedupe categorías
    new_cats := ARRAY(SELECT DISTINCT x FROM unnest(new_cats) AS x);

    -- Keywords existentes (lowercase, trim) para evitar duplicados
    existing_kws := ARRAY(
      SELECT lower(trim(x))
      FROM unnest(string_to_array(COALESCE(t_row.keywords, ''), ',')) AS x
      WHERE trim(x) <> ''
    );

    new_kws := COALESCE(t_row.keywords, '');
    FOREACH cat_val IN ARRAY kw_add LOOP
      IF NOT (lower(trim(cat_val)) = ANY(existing_kws)) THEN
        IF new_kws = '' THEN
          new_kws := cat_val;
        ELSE
          new_kws := new_kws || ', ' || cat_val;
        END IF;
        existing_kws := array_append(existing_kws, lower(trim(cat_val)));
      END IF;
    END LOOP;

    UPDATE talentos
    SET categorias = new_cats,
        keywords   = new_kws
    WHERE id = t_row.id;
  END LOOP;
END $$;

-- Actualiza la lista de categorías guardada en app_config para reflejar las 14 oficiales
UPDATE app_config
SET value = to_jsonb(ARRAY[
  'Profesional','Familia','Deporte','Entretenimiento','Gaming','Belleza','Moda',
  'Gastronomía','Hogar','Aventura','Creatividad/Arte','Contenido','Tecnología','Música'
])
WHERE key = 'categories';

COMMIT;


-- ===================================================================
-- 3) VERIFICACIONES — correr después de la migración
-- ===================================================================

-- 3.a) Ya no debería quedar ningún talento con categorías fantasma
SELECT COUNT(*) AS talentos_con_fantasma
FROM talentos t
WHERE EXISTS (
  SELECT 1 FROM unnest(t.categorias) AS c
  WHERE lower(c) NOT IN (
    'profesional','familia','deporte','entretenimiento','gaming','belleza','moda',
    'gastronomía','hogar','aventura','creatividad/arte','contenido','tecnología','música',
    'sin categoría'
  )
);

-- 3.b) Distribución de categorías post-migración
SELECT unnest(categorias) AS categoria, COUNT(*) AS total
FROM talentos
GROUP BY 1
ORDER BY 2 DESC;
