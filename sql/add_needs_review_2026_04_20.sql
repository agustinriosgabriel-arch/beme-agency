-- Add review flag + comment fields to talentos
-- Allows marking a profile "Para Revisión" with a note so employees can review it

ALTER TABLE talentos
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS review_comment TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS review_marked_by TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS review_marked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_talentos_needs_review
  ON talentos (needs_review)
  WHERE needs_review = TRUE;
