-- ══════════════════════════════════════════════════════════════════
-- BEME AGENTS — Auto-estado + Notification helpers
-- ══════════════════════════════════════════════════════════════════

-- ┌─────────────────────────────────────────────────────────────┐
-- │  1. AUTO-ESTADO: Campana → etapa_finanzas                   │
-- │  When ALL contenidos in a campana reach paso >= 8,           │
-- │  automatically set campana.estado = 'etapa_finanzas'         │
-- └─────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION check_campana_auto_estado()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_campana_id integer;
  v_total integer;
  v_done integer;
  v_estado text;
BEGIN
  -- Get campana_id from the contenido's campana_talento
  SELECT ct.campana_id INTO v_campana_id
  FROM campana_talentos ct
  WHERE ct.id = NEW.campana_talento_id;

  IF v_campana_id IS NULL THEN RETURN NEW; END IF;

  -- Only act on campanas that are 'en_curso'
  SELECT estado INTO v_estado FROM campanas WHERE id = v_campana_id;
  IF v_estado != 'en_curso' THEN RETURN NEW; END IF;

  -- Count total vs completed contenidos
  SELECT COUNT(*), COUNT(*) FILTER (WHERE c.paso_actual >= 8)
  INTO v_total, v_done
  FROM contenidos c
  JOIN campana_talentos ct ON ct.id = c.campana_talento_id
  WHERE ct.campana_id = v_campana_id;

  -- If all done and there are contenidos, auto-advance
  IF v_total > 0 AND v_total = v_done THEN
    UPDATE campanas SET estado = 'etapa_finanzas' WHERE id = v_campana_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_estado_campana ON contenidos;
CREATE TRIGGER trg_auto_estado_campana
  AFTER UPDATE OF paso_actual ON contenidos
  FOR EACH ROW
  WHEN (NEW.paso_actual >= 8)
  EXECUTE FUNCTION check_campana_auto_estado();


-- ┌─────────────────────────────────────────────────────────────┐
-- │  2. NOTIFICATION LOG TABLE                                  │
-- │  Tracks sent notifications to avoid duplicates              │
-- └─────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS notificaciones_enviadas (
  id         serial PRIMARY KEY,
  tipo       text NOT NULL,          -- paso_cambio, recordatorio, vencimiento
  ref_id     integer,                -- contenido_id or campana_id
  user_email text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_ref ON notificaciones_enviadas(tipo, ref_id);
CREATE INDEX IF NOT EXISTS idx_notif_created ON notificaciones_enviadas(created_at);

-- RLS
ALTER TABLE notificaciones_enviadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY notif_admin ON notificaciones_enviadas FOR ALL USING (is_admin());
CREATE POLICY notif_internal_read ON notificaciones_enviadas FOR SELECT USING (is_internal());
