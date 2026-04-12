-- Add second publication URL for Reel/TikTok Espejo content type
ALTER TABLE contenidos ADD COLUMN IF NOT EXISTS url_publicacion_2 TEXT;
