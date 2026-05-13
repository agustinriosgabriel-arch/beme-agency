-- ══════════════════════════════════════════════════════════
-- Plantillas con cuerpo de WhatsApp opcional
-- 2026-05-13
-- ══════════════════════════════════════════════════════════
-- Agrega un campo whatsapp_body a las plantillas existentes.
-- Si está presente, el botón "Contactar WhatsApp" lo usa.
-- Si está vacío, ese template no aparece en el picker de WhatsApp.

ALTER TABLE prospeccion_email_templates
  ADD COLUMN IF NOT EXISTS whatsapp_body text DEFAULT '';
