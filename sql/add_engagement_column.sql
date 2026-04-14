-- Add engagement, avg_views, and social_meta columns to talentos table

-- Engagement rates: {"tiktok": 3.45, "instagram": 2.1}
ALTER TABLE talentos ADD COLUMN IF NOT EXISTS engagement jsonb DEFAULT '{}'::jsonb;

-- Average views per post: {"tiktok": 125000, "instagram": 45000}
ALTER TABLE talentos ADD COLUMN IF NOT EXISTS avg_views jsonb DEFAULT '{}'::jsonb;

-- Hidden social metadata (bios, verified, category, region, etc.)
-- {"tiktok": {"bio": "...", "verified": true, "region": "AR"}, "instagram": {"bio": "...", "category": "Artist"}}
ALTER TABLE talentos ADD COLUMN IF NOT EXISTS social_meta jsonb DEFAULT '{}'::jsonb;
