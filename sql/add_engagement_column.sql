-- Add engagement column to talentos table
-- Stores engagement rates as JSONB: {"tiktok": 3.45, "instagram": 2.1}
ALTER TABLE talentos ADD COLUMN IF NOT EXISTS engagement jsonb DEFAULT '{}'::jsonb;
