-- Normalize country names in talentos.paises array
-- Run this once to fix existing data with missing flags / wrong casing

-- Helper: replace a country variant with the canonical name in all paises arrays
CREATE OR REPLACE FUNCTION normalize_country_in_paises(old_name text, new_name text)
RETURNS integer AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE talentos
  SET paises = (
    SELECT array_agg(
      CASE WHEN elem = old_name THEN new_name ELSE elem END
    )
    FROM unnest(paises) AS elem
  )
  WHERE paises @> ARRAY[old_name];

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Common normalizations (add more as needed)
SELECT normalize_country_in_paises('mexico', 'México');
SELECT normalize_country_in_paises('Mexico', 'México');
SELECT normalize_country_in_paises('MEXICO', 'México');
SELECT normalize_country_in_paises('Mexíco', 'México');
SELECT normalize_country_in_paises('argentina', 'Argentina');
SELECT normalize_country_in_paises('ARGENTINA', 'Argentina');
SELECT normalize_country_in_paises('colombia', 'Colombia');
SELECT normalize_country_in_paises('COLOMBIA', 'Colombia');
SELECT normalize_country_in_paises('chile', 'Chile');
SELECT normalize_country_in_paises('CHILE', 'Chile');
SELECT normalize_country_in_paises('peru', 'Perú');
SELECT normalize_country_in_paises('Peru', 'Perú');
SELECT normalize_country_in_paises('PERU', 'Perú');
SELECT normalize_country_in_paises('ecuador', 'Ecuador');
SELECT normalize_country_in_paises('ECUADOR', 'Ecuador');
SELECT normalize_country_in_paises('venezuela', 'Venezuela');
SELECT normalize_country_in_paises('VENEZUELA', 'Venezuela');
SELECT normalize_country_in_paises('bolivia', 'Bolivia');
SELECT normalize_country_in_paises('BOLIVIA', 'Bolivia');
SELECT normalize_country_in_paises('paraguay', 'Paraguay');
SELECT normalize_country_in_paises('PARAGUAY', 'Paraguay');
SELECT normalize_country_in_paises('uruguay', 'Uruguay');
SELECT normalize_country_in_paises('URUGUAY', 'Uruguay');
SELECT normalize_country_in_paises('panama', 'Panamá');
SELECT normalize_country_in_paises('Panama', 'Panamá');
SELECT normalize_country_in_paises('espana', 'España');
SELECT normalize_country_in_paises('Espana', 'España');
SELECT normalize_country_in_paises('Spain', 'España');
SELECT normalize_country_in_paises('Brasil', 'Brasil');
SELECT normalize_country_in_paises('brazil', 'Brasil');
SELECT normalize_country_in_paises('Brazil', 'Brasil');
SELECT normalize_country_in_paises('USA', 'Estados Unidos');
SELECT normalize_country_in_paises('United States', 'Estados Unidos');
SELECT normalize_country_in_paises('EEUU', 'Estados Unidos');
SELECT normalize_country_in_paises('estados unidos', 'Estados Unidos');
SELECT normalize_country_in_paises('Republica Dominicana', 'República Dominicana');
SELECT normalize_country_in_paises('republica dominicana', 'República Dominicana');
SELECT normalize_country_in_paises('Rep Dominicana', 'República Dominicana');
SELECT normalize_country_in_paises('Rep. Dominicana', 'República Dominicana');
SELECT normalize_country_in_paises('guatemala', 'Guatemala');
SELECT normalize_country_in_paises('honduras', 'Honduras');
SELECT normalize_country_in_paises('nicaragua', 'Nicaragua');
SELECT normalize_country_in_paises('el salvador', 'El Salvador');
SELECT normalize_country_in_paises('costa rica', 'Costa Rica');
SELECT normalize_country_in_paises('cuba', 'Cuba');
SELECT normalize_country_in_paises('puerto rico', 'Puerto Rico');

-- Cleanup: drop the helper function
DROP FUNCTION normalize_country_in_paises;

-- Verify: show all unique countries after normalization
SELECT DISTINCT unnest(paises) AS country FROM talentos ORDER BY 1;
