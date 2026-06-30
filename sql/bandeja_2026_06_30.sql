-- ══════════════════════════════════════════════════════
-- BANDEJA (Inbox) MODULE — Supabase SQL
-- Resumen de mails entrantes: cotizaciones (contacto@) y
-- propuestas/cotizaciones de creadores (management@).
-- Run this in Supabase SQL Editor.
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bandeja_emails (
  id                    serial PRIMARY KEY,

  -- Identidad del mail (anti-duplicado + threading)
  message_id            text NOT NULL UNIQUE,          -- Message-ID del header (con <>)
  thread_references     text DEFAULT '',               -- References + In-Reply-To, separados por espacio

  -- Origen
  casilla               text NOT NULL DEFAULT 'contacto', -- 'contacto' | 'management'
  tipo                  text DEFAULT 'cotizacion',        -- 'cotizacion' | 'propuesta' (clasificación IA, informativo)

  -- Remitente
  remitente_nombre      text DEFAULT '',
  remitente_email       text DEFAULT '',

  -- Contenido
  asunto                text DEFAULT '',
  recibido_en           timestamptz,
  resumen               text DEFAULT '',               -- 2-3 frases generadas por IA
  datos                 jsonb DEFAULT '{}'::jsonb,      -- campos extraídos (marca, presupuesto, redes, etc.)
  cuerpo_preview        text DEFAULT '',                -- primeros ~3000 chars del cuerpo (para detalle / contexto)

  -- Talento exclusivo (match contra tabla talentos por email)
  es_talento_exclusivo  boolean DEFAULT false,
  talento_id            integer REFERENCES talentos(id) ON DELETE SET NULL,
  talento_nombre        text DEFAULT '',

  -- Estado / gestión
  estado                text DEFAULT 'nuevo',           -- 'nuevo' | 'visto' | 'gestionado' | 'archivado'
  link_tipo             text DEFAULT '',                -- 'presupuesto' | 'talento'
  link_id               integer,
  respondido_en         timestamptz,

  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bandeja_recibido   ON bandeja_emails(recibido_en DESC);
CREATE INDEX IF NOT EXISTS idx_bandeja_casilla     ON bandeja_emails(casilla);
CREATE INDEX IF NOT EXISTS idx_bandeja_estado      ON bandeja_emails(estado);
CREATE INDEX IF NOT EXISTS idx_bandeja_talento     ON bandeja_emails(talento_id);

-- RLS: cualquier usuario autenticado (interno) puede leer/gestionar.
-- La función de ingesta usa el SERVICE KEY y bypassa RLS para insertar.
ALTER TABLE bandeja_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_bandeja_emails" ON bandeja_emails;
CREATE POLICY "auth_all_bandeja_emails" ON bandeja_emails
  FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ── Respuestas enviadas (historial visible en la app) ──
CREATE TABLE IF NOT EXISTS bandeja_respuestas (
  id            serial PRIMARY KEY,
  bandeja_id    integer NOT NULL REFERENCES bandeja_emails(id) ON DELETE CASCADE,
  direccion     text DEFAULT 'saliente',   -- 'saliente' (respuesta nuestra)
  from_email    text DEFAULT '',
  to_email      text DEFAULT '',
  asunto        text DEFAULT '',
  cuerpo        text DEFAULT '',           -- texto que escribió el usuario (sin la firma)
  message_id    text DEFAULT '',
  guardado_en_enviados boolean DEFAULT false,
  enviado_por   uuid,
  enviado_en    timestamptz DEFAULT now(),
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bandeja_respuestas_mail ON bandeja_respuestas(bandeja_id);

ALTER TABLE bandeja_respuestas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_bandeja_respuestas" ON bandeja_respuestas;
CREATE POLICY "auth_all_bandeja_respuestas" ON bandeja_respuestas
  FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- updated_at trigger
CREATE OR REPLACE FUNCTION touch_bandeja_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bandeja_touch ON bandeja_emails;
CREATE TRIGGER trg_bandeja_touch
  BEFORE UPDATE ON bandeja_emails
  FOR EACH ROW
  EXECUTE FUNCTION touch_bandeja_updated_at();
