-- Import batch de 41 talentos (2026-04-16)
-- Ejecutar en Supabase SQL Editor
-- Modo: AGREGAR (no reemplaza nada)
-- Columnas no especificadas toman defaults: foto='', seguidores={"tiktok":0,"instagram":0,"youtube":0}, updated=NULL

INSERT INTO talentos (nombre, paises, ciudad, tiktok, instagram, youtube, categorias, valores, telefono, email, genero, keywords)
VALUES
('John Malecki', ARRAY['US'], '', '', 'https://www.instagram.com/john_malecki/', 'https://www.youtube.com/@JohnMaleckiUnscrewed/videos', ARRAY['tecnologia'], 'Cuenta secundaria de john malecki', '', 'TeamMalecki@oddprojects.com', 'hombre', 'tecnologia'),

('awesomeactioncat', ARRAY['México'], '', 'https://www.tiktok.com/@awesomeactioncat', 'https://www.instagram.com/awesomeactioncat_/?hlen', '', ARRAY['belleza'],
'1 tiktok - $3,500.00 mxn (176 USD)
reel - $2,000.00 mxn (100 USD)
post - $2,500.00 mxn
story - $1,000.00 mxn',
'0052 33 1600 4947', '', 'mujer', 'beauty'),

('Tayo Aina', ARRAY['US'], '', '', '', '', ARRAY['contenido'], '', '', 'eric@swishmedia.co', 'hombre', 'Lifestyle, Education, Commentary, Documentary'),

('Reedthefishmonger', ARRAY['US'], '', '', '', '', ARRAY['profesional','aventura'], '', '', 'eric@swishmedia.co', 'hombre', 'Fish/Fishing/Education'),

('Fletcher The Fisherman', ARRAY['US'], '', '', '', '', ARRAY['aventura'], '', '', 'eric@swishmedia.co', 'hombre', 'Fishing/Outdoors'),

('Finn Whitaker', ARRAY['US'], '', '', '', '', ARRAY['aventura'], '', '', 'eric@swishmedia.co', 'hombre', 'Outdoor/VanLife/Sailing/Off Grid'),

('Jack Whitaker', ARRAY['US'], '', '', '', '', ARRAY['aventura'], '', '', 'eric@swishmedia.co', 'hombre', 'Outdoor/VanLife/Sailing/Off Grid'),

('Sailing Zatara', ARRAY['US'], '', '', '', '', ARRAY['aventura'], '', '', 'eric@swishmedia.co', 'hombre', 'Sailing/Off Grid/Outdoor'),

('Outdoor Chef Life', ARRAY['US'], '', '', '', '', ARRAY['aventura'], '', '', 'eric@swishmedia.co', 'hombre', 'Cooking, Fishing, Outdoors, Food, Homestead'),

('Madison Clysdale', ARRAY['US'], '', '', '', '', ARRAY['aventura'], '', '', 'eric@swishmedia.co', 'mujer', 'Van Life/Lifestyle, Outdoors'),

('Adam Stew', ARRAY['US'], '', '', '', '', ARRAY['aventura'], '', '', 'eric@swishmedia.co', 'otros', 'Outdoors / Camping / Fishing'),

('Off Grid Island', ARRAY['US'], '', '', '', '', ARRAY['aventura'], '', '', 'eric@swishmedia.co', 'hombre', 'Outdoor, Off Grid, DIY, Homestead'),

('Becca Y', ARRAY['US'], '', '', '', '', ARRAY['aventura'], '', '', 'eric@swishmedia.co', 'mujer', 'Fishing/ Outdoor/ VanLife/Homestead'),

('Fishin with Tate', ARRAY['US'], '', '', '', '', ARRAY['aventura'], '', '', 'eric@swishmedia.co', 'hombre', 'Fishing/ Outdoor/ Hunting/ Camping'),

('Wild Homestead', ARRAY['US'], '', '', '', '', ARRAY['aventura'], '', '', 'eric@swishmedia.co', 'hombre', 'Homestead. DIY, Outdoors'),

('Abel & Victoria', ARRAY['US'], '', '', '', '', ARRAY['aventura'], '', '', 'eric@swishmedia.co', 'otros', 'Camping, Outdoors, DIY'),

('Cabin River Outdoors', ARRAY['US'], '', '', 'https://www.instagram.com/cabinriveroutdoors/', '', ARRAY['aventura'], '', '', 'eric@swishmedia.co', 'hombre', 'Homesteading, Outdoors, Lifestyle, DIY, Off-Grid'),

('Big Water Guy', ARRAY['US'], '', '', 'https://www.instagram.com/biigwaterguy/', '', ARRAY['aventura'], 'Rate: $5.000', '', 'eric@swishmedia.co', 'hombre', 'Outdoors/Fishing/Cooking/Diving'),

('Die Hard Fishing', ARRAY['US'], '', '', 'https://www.instagram.com/die.hard.fishing/', '', ARRAY['aventura'], 'Rates: $2.000 / $8.500', '', 'eric@swishmedia.co', 'hombre', 'Fishing/Outdoors'),

('Kenny of All Trades', ARRAY['US'], '', '', 'https://www.instagram.com/kennyofalltrades_/', '', ARRAY['aventura'], 'Rates: $4.000 / $10.000', '', 'eric@swishmedia.co', 'hombre', 'Camping/Outdoors/RV'),

('KatieRoams', ARRAY['US'], '', '', 'https://www.instagram.com/katiieroams', '', ARRAY['aventura'], 'Rate: $5.000', '', 'eric@swishmedia.co', 'mujer', 'Outdoor/Camping'),

('Dantic', ARRAY['US'], '', '', 'https://www.instagram.com/dantic.ig/', '', ARRAY['tecnologia'], 'Rates: $60.000 / $150.000', '', 'eric@swishmedia.co', 'hombre', 'Tech Reviews / Gaming / Travel'),

('More Dantic', ARRAY['US'], '', '', 'https://www.instagram.com/dantic.ig/', '', ARRAY['tecnologia'], 'Rates: $12.000 / $25.000', '', 'eric@swishmedia.co', 'hombre', 'Tech Reviews / Gaming / Travel'),

('Guiny', ARRAY['US'], '', '', '', '', ARRAY['tecnologia'], 'Rates: $20.000 / $35.000', '', 'eric@swishmedia.co', 'hombre', 'Tech Reviews / Gaming'),

('RantAd', ARRAY['US'], '', '', 'https://www.instagram.com/rant_ad/', '', ARRAY['tecnologia'], 'Rates: $3.000 / $8.000', '', 'eric@swishmedia.co', 'hombre', 'Tech Reviews / Gaming'),

('YouTube Tech Guy', ARRAY['US'], '', '', 'https://www.instagram.com/youtubetechguy', '', ARRAY['tecnologia'], 'Rates: $1.000 / $4.500', '', 'eric@swishmedia.co', 'hombre', 'Tech Reviews'),

('FrenchieFries', ARRAY['US'], '', '', '', '', ARRAY['aventura'], 'Rates: $60.000 / $150.000', '', 'eric@swishmedia.co', 'hombre', 'Room Renovations / DIY / Travel'),

('Taklyn the World', ARRAY['US'], '', '', 'https://www.instagram.com/taklyntheworld/', '', ARRAY['aventura','contenido'], 'Rates: $2.000 / $12.000', '', 'eric@swishmedia.co', 'otros', 'DIY / Travel / Lifestyle / Vlog'),

('Uncomfy', ARRAY['US'], '', '', 'https://www.instagram.com/uncomfy.co/', '', ARRAY['creatividad/arte','contenido'], 'Rates: $8.000 / $25.000', '', 'eric@swishmedia.co', 'mujer', 'Artist / Clay Making / Small Business / Lifestyle'),

('Julia Lee', ARRAY['US'], '', '', 'https://www.instagram.com/mejulialee/', '', ARRAY['contenido','aventura'], 'Rate: $2.000', '', 'eric@swishmedia.co', 'mujer', 'Lifestyle / DIY / Home'),

('Paul Rico', ARRAY['México'], '', '', 'https://www.instagram.com/paulricz/', '', ARRAY['contenido'], '1 tiktok + pauta - 30,000 mxn', '5550542127', 'paulrico23@gmail.com', 'hombre', 'Lifestyle'),

('Samir Galan', ARRAY['México'], '', '', 'https://www.instagram.com/samirgalann/', '', ARRAY['contenido'], '1 TikTok es de $25,000 MXN, y el uso mediante Spark Code por 30 días se contempla por separado en $5,000 MXN.', '52 3318755070', '', 'hombre', 'Lifestyle'),

('Santi Hernandez', ARRAY['México'], '', '', 'https://www.instagram.com/santihdzg/', '', ARRAY['contenido'],
'Tiktok: $25,000 + IVA
Pauta 30 días: $10,000 + IVA',
'52 1 56 4424 4700', 'santiagohdz@behindagency.mx', 'hombre', 'Lifestyle'),

('Daniel Serti', ARRAY['México'], '', '', 'https://www.instagram.com/daniel_serti/', '', ARRAY['contenido'], '$25,000 MXN por el TikTok + $8,000 MXN por 30 días de SparkAds.', '5587924351', 'danielserti333@gmail.com', 'hombre', 'Lifestyle'),

('Alex Cordova', ARRAY['México'], '', '', 'https://www.instagram.com/thealexcordova/', '', ARRAY['contenido'], 'esperando rta', '5560837315', '', 'hombre', 'Lifestyle'),

('Marek Cris', ARRAY['México'], '', '', 'https://www.instagram.com/marekcris/', '', ARRAY['contenido'], 'esperando rta', 'sara 52 55 2712 6338 / joaquin 55 1845 7994', '', 'hombre', 'Lifestyle'),

('Panagiotios Karounis', ARRAY['México'], '', '', 'https://www.instagram.com/panagiotios/', '', ARRAY['contenido','entretenimiento'], '1 TikTok + 30 dias de spark code 12-15K flexible', '', 'Panagiotiosweb@gmail.com', 'hombre', 'Lifestyle, Actor'),

('Casandra Ascencio', ARRAY['México'], '', '', 'https://www.instagram.com/casandraascencio/', '', ARRAY['deporte'], 'Inversión $55,000.00 mxn + iva', '526673033952', 'casandra@cflw.mx', 'mujer', 'Fitness'),

('Arelia Rechiga', ARRAY['México'], '', '', 'https://www.instagram.com/soyareliarechiga/', '', ARRAY['deporte'],
'1 TT 18.000 + IVA
sparkcode 8.000',
'3331191018', 'hola@soyareliarechiga.com', 'mujer', 'Fitness'),

('Jazmin Arias', ARRAY['México'], '', '', 'https://www.instagram.com/imjazminarias/', '', ARRAY['deporte'], '1 TT + 30 dias de Spark code: $67,500 mxn + IVA', '55 7930 3753', 'jazminariaszas@gmail.com', 'mujer', 'Fitness'),

('Daniela Reza', ARRAY['México'], '', '', 'https://www.instagram.com/danielarezam/', '', ARRAY['deporte'], 'Inversión $55,000.00 mxn + iva', '526673033952', '', 'mujer', 'Fitness');

-- Verificación: debe devolver 41
SELECT COUNT(*) AS insertados FROM talentos WHERE email = 'eric@swishmedia.co' OR nombre IN ('John Malecki','awesomeactioncat','Paul Rico','Samir Galan','Santi Hernandez','Daniel Serti','Alex Cordova','Marek Cris','Panagiotios Karounis','Casandra Ascencio','Arelia Rechiga','Jazmin Arias','Daniela Reza');
