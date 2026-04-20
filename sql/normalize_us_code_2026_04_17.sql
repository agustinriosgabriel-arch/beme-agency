-- Normaliza el código 'US' (2 letras) a 'Estados Unidos' en talentos.paises
-- Complemento de normalize_countries.sql, que maneja USA/EEUU/United States pero no 'US'.

UPDATE talentos
SET paises = (
  SELECT array_agg(
    CASE WHEN elem = 'US' THEN 'Estados Unidos' ELSE elem END
  )
  FROM unnest(paises) AS elem
)
WHERE paises @> ARRAY['US'];

-- Verificación
SELECT DISTINCT unnest(paises) AS country
FROM talentos
ORDER BY 1;
