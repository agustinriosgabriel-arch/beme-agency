-- ============================================================
-- Update URLs de redes sociales para los 41 talentos importados
-- Fuente: Exportacion_URLs_corregido.csv (2026-04-17)
-- Base: sql/import_talentos_2026_04_16.sql
--
-- Criterio:
-- - Match por `nombre` exacto (coincide con el INSERT previo)
-- - Solo actualiza columnas con URL real (ignora celdas "x" o vacías)
-- - Idempotente: correrlo dos veces no daña nada
-- ============================================================

-- 1. John Malecki  (ya tenía IG + YT; CSV confirma mismos valores, no hay cambios)

-- 2. awesomeactioncat  (ya tenía TT + IG; CSV confirma, no hay cambios)

-- 3. Tayo Aina
UPDATE talentos SET
  tiktok    = 'https://www.tiktok.com/@tayoainafilms?lang=en',
  instagram = 'https://www.instagram.com/tayoainafilms/?hl=en',
  youtube   = 'https://www.youtube.com/channel/UC8p_y3iHPe-n3zRfXK2czWA'
WHERE nombre = 'Tayo Aina';

-- 4. Reedthefishmonger
UPDATE talentos SET
  tiktok    = 'https://www.tiktok.com/@reed_thefishmonger?_t=8m6Pf2AddRS&_r=1',
  instagram = 'https://www.instagram.com/reedthefishmonger/',
  youtube   = 'https://www.youtube.com/@reedthefishmonger/videos'
WHERE nombre = 'Reedthefishmonger';

-- 5. Fletcher The Fisherman
UPDATE talentos SET
  tiktok    = 'https://www.tiktok.com/@fletcherthefisherman?lang=en',
  instagram = 'https://www.instagram.com/fletcherthefisherman/?hl=en',
  youtube   = 'https://www.youtube.com/@Fletcher_The_Fisherman'
WHERE nombre = 'Fletcher The Fisherman';

-- 6. Finn Whitaker
UPDATE talentos SET
  tiktok    = 'https://www.tiktok.com/@finnwhitakerr?lang=en',
  instagram = 'https://www.instagram.com/finnwhitakerr/reels/?hl=en',
  youtube   = 'https://www.youtube.com/@FinnWhitaker'
WHERE nombre = 'Finn Whitaker';

-- 7. Jack Whitaker
UPDATE talentos SET
  tiktok    = 'https://www.tiktok.com/@jackwhitakerofficial?lang=en',
  instagram = 'https://www.instagram.com/_jackwhitaker/?hl=en',
  youtube   = 'https://www.youtube.com/@jackwhitakerr/videos'
WHERE nombre = 'Jack Whitaker';

-- 8. Sailing Zatara
UPDATE talentos SET
  tiktok    = 'https://www.tiktok.com/@sailingzatara',
  instagram = 'https://www.instagram.com/sailingzatara/',
  youtube   = 'https://www.youtube.com/@SailingZatara/videos'
WHERE nombre = 'Sailing Zatara';

-- 9. Outdoor Chef Life  (sin TikTok)
UPDATE talentos SET
  instagram = 'https://www.instagram.com/outdoorcheflife/?hl=en',
  youtube   = 'https://www.youtube.com/c/OutdoorChefLife'
WHERE nombre = 'Outdoor Chef Life';

-- 10. Madison Clysdale
UPDATE talentos SET
  tiktok    = 'https://www.tiktok.com/@madisonclysdalee?lang=en',
  instagram = 'https://www.instagram.com/madisonclysdalee/',
  youtube   = 'https://www.youtube.com/@MadisonClysdalee'
WHERE nombre = 'Madison Clysdale';

-- 11. Adam Stew  (solo YouTube)
UPDATE talentos SET
  youtube   = 'https://www.youtube.com/@AdamStew'
WHERE nombre = 'Adam Stew';

-- 12. Off Grid Island
UPDATE talentos SET
  tiktok    = 'http://tiktok.com/@off.grid.island',
  instagram = 'http://instagram.com/off.grid.island',
  youtube   = 'https://www.youtube.com/@Off-Grid-Island/videos'
WHERE nombre = 'Off Grid Island';

-- 13. Becca Y
UPDATE talentos SET
  tiktok    = 'https://www.tiktok.com/@fishingwithbecca?lang=en',
  instagram = 'https://www.instagram.com/beccayaseen/',
  youtube   = 'https://www.youtube.com/@beccayaseen'
WHERE nombre = 'Becca Y';

-- 14. Fishin with Tate
UPDATE talentos SET
  tiktok    = 'https://www.tiktok.com/@fishinwithtate',
  instagram = 'https://www.instagram.com/fishinwithtate/',
  youtube   = 'https://www.youtube.com/@FishinwithTate/videos'
WHERE nombre = 'Fishin with Tate';

-- 15. Wild Homestead
UPDATE talentos SET
  tiktok    = 'https://www.tiktok.com/@wildhomesteadca',
  instagram = 'https://www.instagram.com/wildhomesteadca',
  youtube   = 'https://www.youtube.com/@wildhomestead'
WHERE nombre = 'Wild Homestead';

-- 16. Abel & Victoria  (sin TikTok)
UPDATE talentos SET
  instagram = 'https://www.instagram.com/abel_and_victoria/?hl=en',
  youtube   = 'https://www.youtube.com/@AbelandVictoria'
WHERE nombre = 'Abel & Victoria';

-- 17. Cabin River Outdoors  (agrega YouTube)
UPDATE talentos SET
  instagram = 'https://www.instagram.com/cabinriveroutdoors/',
  youtube   = 'https://www.youtube.com/@cabinriveroutdoors/featured'
WHERE nombre = 'Cabin River Outdoors';

-- 18. Big Water Guy  (agrega YouTube)
UPDATE talentos SET
  instagram = 'https://www.instagram.com/biigwaterguy/',
  youtube   = 'https://www.youtube.com/@bigwaterguy/videos'
WHERE nombre = 'Big Water Guy';

-- 19. Die Hard Fishing  (agrega YouTube)
UPDATE talentos SET
  instagram = 'https://www.instagram.com/die.hard.fishing/',
  youtube   = 'https://www.youtube.com/c/DieHardFishing'
WHERE nombre = 'Die Hard Fishing';

-- 20. Kenny of All Trades  (agrega YouTube)
UPDATE talentos SET
  instagram = 'https://www.instagram.com/kennyofalltrades_/',
  youtube   = 'https://www.youtube.com/@KennyOfAllTrades/videos'
WHERE nombre = 'Kenny of All Trades';

-- 21. KatieRoams  (agrega YouTube)
UPDATE talentos SET
  instagram = 'https://www.instagram.com/katiieroams',
  youtube   = 'https://www.youtube.com/@Katieroams/videos'
WHERE nombre = 'KatieRoams';

-- 22. Dantic  (agrega YouTube)
UPDATE talentos SET
  instagram = 'https://www.instagram.com/dantic.ig/',
  youtube   = 'https://www.youtube.com/channel/UCNNdYhLEd4aAivW_V9GNOMQ'
WHERE nombre = 'Dantic';

-- 23. More Dantic  (agrega YouTube)
UPDATE talentos SET
  instagram = 'https://www.instagram.com/dantic.ig/',
  youtube   = 'https://www.youtube.com/@MoreDantic/videos'
WHERE nombre = 'More Dantic';

-- 24. Guiny  (solo YouTube)
UPDATE talentos SET
  youtube   = 'https://www.youtube.com/@Guiny/videos'
WHERE nombre = 'Guiny';

-- 25. RantAd  (agrega YouTube)
UPDATE talentos SET
  instagram = 'https://www.instagram.com/rant_ad/',
  youtube   = 'https://www.youtube.com/@RantAd/videos'
WHERE nombre = 'RantAd';

-- 26. YouTube Tech Guy  (agrega YouTube)
UPDATE talentos SET
  instagram = 'https://www.instagram.com/youtubetechguy',
  youtube   = 'https://www.youtube.com/@YouTubeTechGuy'
WHERE nombre = 'YouTube Tech Guy';

-- 27. FrenchieFries  (solo YouTube)
UPDATE talentos SET
  youtube   = 'https://www.youtube.com/frenchiefries'
WHERE nombre = 'FrenchieFries';

-- 28. Taklyn the World  (agrega YouTube)
UPDATE talentos SET
  instagram = 'https://www.instagram.com/taklyntheworld/',
  youtube   = 'https://www.youtube.com/@TaklyntheWorld/videos'
WHERE nombre = 'Taklyn the World';

-- 29. Uncomfy  (agrega YouTube)
UPDATE talentos SET
  instagram = 'https://www.instagram.com/uncomfy.co/',
  youtube   = 'https://www.youtube.com/user/Tamzillla/videos'
WHERE nombre = 'Uncomfy';

-- 30. Julia Lee  (agrega YouTube)
UPDATE talentos SET
  instagram = 'https://www.instagram.com/mejulialee/',
  youtube   = 'https://www.youtube.com/@mejulialee'
WHERE nombre = 'Julia Lee';

-- 31-41. Talentos de México (Paul Rico, Samir, Santi, Daniel Serti, Alex, Marek,
--        Panagiotios, Casandra, Arelia, Jazmin, Daniela): el CSV confirma solo
--        Instagram (sin TT/YT), idéntico al import previo → no requieren cambios.

-- ============================================================
-- Verificación: cuántos de los 28 talentos actualizados tienen ahora YouTube
SELECT COUNT(*) AS con_youtube
FROM talentos
WHERE nombre IN (
  'Tayo Aina','Reedthefishmonger','Fletcher The Fisherman','Finn Whitaker',
  'Jack Whitaker','Sailing Zatara','Outdoor Chef Life','Madison Clysdale',
  'Adam Stew','Off Grid Island','Becca Y','Fishin with Tate','Wild Homestead',
  'Abel & Victoria','Cabin River Outdoors','Big Water Guy','Die Hard Fishing',
  'Kenny of All Trades','KatieRoams','Dantic','More Dantic','Guiny','RantAd',
  'YouTube Tech Guy','FrenchieFries','Taklyn the World','Uncomfy','Julia Lee'
) AND youtube <> '';
-- Debe devolver 28.
