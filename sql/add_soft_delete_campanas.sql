-- Soft delete for campaigns: 30-day trash
ALTER TABLE campanas ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_campanas_deleted ON campanas(deleted_at);

-- Function to permanently delete campaigns older than 30 days in trash
CREATE OR REPLACE FUNCTION purge_deleted_campanas() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Delete all related data first (cascading), then the campaign
  DELETE FROM campanas
  WHERE deleted_at IS NOT NULL
    AND deleted_at < now() - interval '30 days';
END;
$$;
