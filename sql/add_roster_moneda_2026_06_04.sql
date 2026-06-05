-- ─────────────────────────────────────────────────────────────
-- Rosters: moneda (USD / MXN / ARS / EUR)
-- Fecha: 2026-06-04
-- Idempotente.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE rosters ADD COLUMN IF NOT EXISTS moneda text NOT NULL DEFAULT 'USD';
