-- Add hidden field to roster_selecciones for per-client talent hiding
ALTER TABLE roster_selecciones ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
