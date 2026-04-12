-- Add brief_notas JSONB array to campanas for storing timestamped notes
ALTER TABLE campanas ADD COLUMN IF NOT EXISTS brief_notas jsonb DEFAULT '[]';
