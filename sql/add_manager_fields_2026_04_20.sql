-- Add manager contact fields to talentos
-- Shown in the talent modal when "Tiene Manager" = true.
-- Manager email/telefono pueden repetirse entre talentos (sin UNIQUE).

ALTER TABLE talentos
  ADD COLUMN IF NOT EXISTS manager_agencia TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS manager_telefono TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS manager_email TEXT DEFAULT '';
