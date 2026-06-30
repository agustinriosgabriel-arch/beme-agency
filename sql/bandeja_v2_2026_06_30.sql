-- ══════════════════════════════════════════════════════
-- BANDEJA v2 — modelo unificado por MENSAJES + hilos
-- Reemplaza bandeja_emails / bandeja_respuestas por una sola
-- tabla bandeja_mensajes con dirección (recibido/enviado),
-- thread_key (hilo), tag y vínculo a talento.
-- Run en Supabase SQL Editor.
-- ══════════════════════════════════════════════════════

-- Limpiar el modelo viejo (eran datos de prueba)
DROP TABLE IF EXISTS bandeja_respuestas CASCADE;
DROP TABLE IF EXISTS bandeja_emails CASCADE;

CREATE TABLE IF NOT EXISTS bandeja_mensajes (
  id                    serial PRIMARY KEY,

  message_id            text NOT NULL UNIQUE,          -- Message-ID (con <>) — anti-duplicado
  thread_key            text NOT NULL DEFAULT '',      -- id raíz del hilo (para agrupar conversación)
  thread_references     text DEFAULT '',               -- References + In-Reply-To

  casilla               text NOT NULL DEFAULT 'contacto', -- 'contacto' | 'management'
  direccion             text NOT NULL DEFAULT 'recibido', -- 'recibido' | 'enviado'

  -- Partes
  de_nombre             text DEFAULT '',
  de_email              text DEFAULT '',
  para_email            text DEFAULT '',

  -- Contenido
  asunto                text DEFAULT '',
  fecha                 timestamptz,
  resumen               text DEFAULT '',               -- IA (solo recibidos)
  tag                   text DEFAULT '',               -- cotizacion|propuesta|finanzas|logistica|spam
  datos                 jsonb DEFAULT '{}'::jsonb,
  cuerpo_preview        text DEFAULT '',

  -- Talento (en management, SIEMPRE dirigido a un talento; en contacto, si matchea)
  es_talento_exclusivo  boolean DEFAULT false,
  talento_id            integer REFERENCES talentos(id) ON DELETE SET NULL,
  talento_nombre        text DEFAULT '',

  -- Gestión (se opera a nivel hilo desde la UI)
  estado                text DEFAULT 'nuevo',           -- nuevo|visto|gestionado|archivado
  link_tipo             text DEFAULT '',
  link_id               integer,

  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bmsg_thread   ON bandeja_mensajes(thread_key);
CREATE INDEX IF NOT EXISTS idx_bmsg_casilla  ON bandeja_mensajes(casilla);
CREATE INDEX IF NOT EXISTS idx_bmsg_fecha    ON bandeja_mensajes(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_bmsg_tag      ON bandeja_mensajes(tag);
CREATE INDEX IF NOT EXISTS idx_bmsg_estado   ON bandeja_mensajes(estado);
CREATE INDEX IF NOT EXISTS idx_bmsg_talento  ON bandeja_mensajes(talento_id);

ALTER TABLE bandeja_mensajes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_bandeja_mensajes" ON bandeja_mensajes;
CREATE POLICY "auth_all_bandeja_mensajes" ON bandeja_mensajes
  FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION touch_bmsg_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bmsg_touch ON bandeja_mensajes;
CREATE TRIGGER trg_bmsg_touch
  BEFORE UPDATE ON bandeja_mensajes
  FOR EACH ROW
  EXECUTE FUNCTION touch_bmsg_updated_at();
