-- ════════════════════════════════════════════════════════════════
-- Agregar email_thread_url a campana_talentos
-- ════════════════════════════════════════════════════════════════
-- Permite vincular un hilo de email específico (Gmail/Outlook web URL)
-- a la dupla campaña + talento, para acceder rápido a la conversación
-- desde la card del talento dentro de la campaña.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE campana_talentos
  ADD COLUMN IF NOT EXISTS email_thread_url text;
