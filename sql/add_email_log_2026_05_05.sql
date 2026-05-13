-- ══════════════════════════════════════════════════════════
-- prospeccion_email_log — registro de envíos de email
-- ══════════════════════════════════════════════════════════
-- Cada fila = un intento de envío SMTP a un destinatario.
-- Permite ver desde la app si un email fue enviado, rechazado
-- por SMTP, o falló por error de red/función.

CREATE TABLE IF NOT EXISTS prospeccion_email_log (
  id              serial PRIMARY KEY,
  contacto_id     integer REFERENCES prospeccion_contactos(id) ON DELETE CASCADE,
  prospeccion_id  integer REFERENCES prospecciones(id) ON DELETE CASCADE,
  email_to        text NOT NULL,
  asunto          text DEFAULT '',
  cuerpo          text DEFAULT '',
  status          text NOT NULL DEFAULT 'sent',  -- sent | rejected | failed
  message_id      text DEFAULT '',
  smtp_response   text DEFAULT '',
  error           text DEFAULT '',
  template_id     integer,
  created_at      timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_log_contacto    ON prospeccion_email_log(contacto_id);
CREATE INDEX IF NOT EXISTS idx_email_log_prospeccion ON prospeccion_email_log(prospeccion_id);
CREATE INDEX IF NOT EXISTS idx_email_log_created     ON prospeccion_email_log(created_at DESC);

ALTER TABLE prospeccion_email_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prospeccion_email_log_auth ON prospeccion_email_log;
CREATE POLICY prospeccion_email_log_auth
  ON prospeccion_email_log
  FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
