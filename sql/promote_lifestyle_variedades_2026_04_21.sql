-- Promueve 2 keywords a categorías oficiales:
--   • "lifestyle"                              → categoría "Lifestyle"
--   • "variedades" + "lifehack(s)"/"life hack(s)" → categoría "Variedades"
--
-- Para cada talento:
--   1) Si una de esas keywords aparece en talentos.keywords, se agrega la categoría
--      correspondiente a talentos.categorias (sin duplicar).
--   2) Se remueve la keyword del string talentos.keywords (case-insensitive).
--   3) Si al talento se le agregó Lifestyle o Variedades, se le REMUEVE "Contenido"
--      de sus categorías (si estaba). La nueva categoría reemplaza a "Contenido".
--
-- Además actualiza app_config.categories para incluir "Lifestyle" y "Variedades"
-- (lista pasa de 14 → 16 categorías oficiales).
--
-- Uso:
--   1) Correr sección 1 (PREVIEW) para ver qué talentos serían modificados.
--   2) Correr sección 2 (BEGIN..COMMIT) para aplicar la migración.
--   3) Correr sección 3 (VERIFICACIONES).

-- ===================================================================
-- 1) PREVIEW — talentos afectados (no aplica cambios)
-- ===================================================================
WITH kw_map(kw, cat) AS (
  VALUES
    ('lifestyle','Lifestyle'),
    ('variedades','Variedades'),
    ('lifehack','Variedades'),
    ('lifehacks','Variedades'),
    ('life hack','Variedades'),
    ('life hacks','Variedades')
),
exploded AS (
  SELECT
    t.id,
    t.nombre,
    t.categorias,
    t.keywords,
    lower(trim(kw_piece)) AS kw_lower,
    trim(kw_piece)        AS kw_original
  FROM talentos t
  CROSS JOIN LATERAL unnest(
    string_to_array(COALESCE(t.keywords, ''), ',')
  ) AS kw_piece
  WHERE trim(kw_piece) <> ''
)
SELECT
  e.id,
  e.nombre,
  e.categorias                               AS categorias_actuales,
  ARRAY(
    SELECT DISTINCT m.cat
    FROM exploded e2
    JOIN kw_map m ON m.kw = e2.kw_lower
    WHERE e2.id = e.id
  )                                          AS categorias_a_agregar,
  CASE WHEN 'Contenido' = ANY(e.categorias)
       THEN 'Contenido' ELSE NULL END        AS categoria_a_remover,
  ARRAY(
    SELECT DISTINCT e2.kw_original
    FROM exploded e2
    JOIN kw_map m ON m.kw = e2.kw_lower
    WHERE e2.id = e.id
  )                                          AS keywords_a_remover,
  e.keywords                                 AS keywords_actuales
FROM exploded e
JOIN kw_map m ON m.kw = e.kw_lower
GROUP BY e.id, e.nombre, e.categorias, e.keywords
ORDER BY e.nombre;


-- ===================================================================
-- 2) MIGRACIÓN — aplica cambios
-- ===================================================================
BEGIN;

CREATE TEMP TABLE _kw_promote (kw TEXT PRIMARY KEY, cat TEXT NOT NULL) ON COMMIT DROP;
INSERT INTO _kw_promote (kw, cat) VALUES
  ('lifestyle','Lifestyle'),
  ('variedades','Variedades'),
  ('lifehack','Variedades'),
  ('lifehacks','Variedades'),
  ('life hack','Variedades'),
  ('life hacks','Variedades');

DO $$
DECLARE
  t_row        RECORD;
  kw_piece     TEXT;
  kw_lower     TEXT;
  mapped_cat   TEXT;
  cats_add     TEXT[];
  new_cats     TEXT[];
  new_kw_parts TEXT[];
BEGIN
  FOR t_row IN
    SELECT id, categorias, keywords
    FROM talentos
    WHERE keywords IS NOT NULL AND keywords <> ''
  LOOP
    cats_add     := ARRAY[]::TEXT[];
    new_kw_parts := ARRAY[]::TEXT[];

    -- Recorrer cada keyword separada por coma
    FOREACH kw_piece IN ARRAY string_to_array(t_row.keywords, ',') LOOP
      kw_piece := trim(kw_piece);
      IF kw_piece = '' THEN CONTINUE; END IF;
      kw_lower := lower(kw_piece);

      SELECT cat INTO mapped_cat FROM _kw_promote WHERE kw = kw_lower;
      IF mapped_cat IS NOT NULL THEN
        cats_add := array_append(cats_add, mapped_cat);
        -- Skip: no se vuelve a agregar al nuevo string de keywords
      ELSE
        new_kw_parts := array_append(new_kw_parts, kw_piece);
      END IF;
    END LOOP;

    -- Si esta fila no tenía ninguna keyword promovible, no hacer nada
    IF array_length(cats_add, 1) IS NULL THEN
      CONTINUE;
    END IF;

    -- Armar nuevas categorías: existentes + agregadas, deduplicadas (case-insensitive),
    -- y REMOVIENDO "Contenido" (la nueva categoría lo reemplaza).
    new_cats := ARRAY(
      SELECT x FROM (
        SELECT DISTINCT ON (lower(x)) x
        FROM unnest(COALESCE(t_row.categorias, ARRAY[]::TEXT[]) || cats_add) AS x
        WHERE lower(x) <> 'contenido'
        ORDER BY lower(x), x
      ) dedup
    );

    UPDATE talentos
    SET categorias = new_cats,
        keywords   = array_to_string(new_kw_parts, ', ')
    WHERE id = t_row.id;
  END LOOP;
END $$;

-- Actualiza app_config.categories con las 16 oficiales (14 + Lifestyle + Variedades)
UPDATE app_config
SET value = to_jsonb(ARRAY[
  'Profesional','Familia','Deporte','Entretenimiento','Gaming','Belleza','Moda',
  'Gastronomía','Hogar','Aventura','Creatividad/Arte','Contenido','Tecnología','Música',
  'Lifestyle','Variedades'
])
WHERE key = 'categories';

COMMIT;


-- ===================================================================
-- 3) VERIFICACIONES — correr después de la migración
-- ===================================================================

-- 3.a) No deberían quedar keywords "lifestyle", "variedades" o "lifehack(s)"
SELECT id, nombre, keywords
FROM talentos
WHERE EXISTS (
  SELECT 1
  FROM unnest(string_to_array(COALESCE(keywords, ''), ',')) AS kw
  WHERE lower(trim(kw)) IN ('lifestyle','variedades','lifehack','lifehacks','life hack','life hacks')
)
ORDER BY nombre;

-- 3.b) Distribución de categorías — deberían aparecer Lifestyle y Variedades
SELECT unnest(categorias) AS categoria, COUNT(*) AS total
FROM talentos
GROUP BY 1
ORDER BY 2 DESC;

-- 3.c) Ningún talento que esté en Lifestyle o Variedades debería seguir en Contenido
SELECT id, nombre, categorias
FROM talentos
WHERE ('Lifestyle' = ANY(categorias) OR 'Variedades' = ANY(categorias))
  AND 'Contenido' = ANY(categorias)
ORDER BY nombre;

-- 3.d) Confirmar que app_config tiene 16 categorías
SELECT jsonb_array_length(value) AS total_categorias, value
FROM app_config
WHERE key = 'categories';
