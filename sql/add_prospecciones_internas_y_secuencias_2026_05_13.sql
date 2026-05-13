-- ══════════════════════════════════════════════════════════
-- Prospecciones Internas + Secuencias de Email
-- 2026-05-13
-- ══════════════════════════════════════════════════════════
-- Agrega:
--  - tipo (externa | interna | mixta) a prospecciones
--  - secuencia_default_id en prospecciones
--  - origen (externo | interno) en prospeccion_contactos
--  - precio_cotizado en prospeccion_contactos (para internas que cotizan)
--  - UNIQUE (prospeccion_id, talento_id) para evitar duplicados internos
--  - prospeccion_email_secuencias: cadenas de templates (1..N pasos)
--  - prospeccion_email_cola: cola de envíos programados

-- ───────────────────────────────────────────────────────────
-- 0. prospeccion_email_log (asegurar que exista — la cola la referencia)
-- ───────────────────────────────────────────────────────────
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

-- ───────────────────────────────────────────────────────────
-- 1. Secuencias de email (templates encadenados)
-- Creamos PRIMERO porque prospecciones la referencia
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prospeccion_email_secuencias (
  id          serial PRIMARY KEY,
  nombre      text NOT NULL,
  descripcion text DEFAULT '',
  pasos       jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- pasos = [{step:1, template_id:12, delay_horas:0,  dias_habiles:false},
  --         {step:2, template_id:13, delay_horas:24, dias_habiles:true},
  --         {step:3, template_id:14, delay_horas:72, dias_habiles:true}]
  created_at  timestamp DEFAULT now(),
  updated_at  timestamp DEFAULT now()
);

ALTER TABLE prospeccion_email_secuencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prosp_seq_auth ON prospeccion_email_secuencias;
CREATE POLICY prosp_seq_auth ON prospeccion_email_secuencias
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ───────────────────────────────────────────────────────────
-- 2. Prospecciones: tipo + secuencia default
-- ───────────────────────────────────────────────────────────
ALTER TABLE prospecciones
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'externa';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'prospecciones_tipo_check'
  ) THEN
    ALTER TABLE prospecciones
      ADD CONSTRAINT prospecciones_tipo_check
      CHECK (tipo IN ('externa','interna','mixta'));
  END IF;
END $$;

ALTER TABLE prospecciones
  ADD COLUMN IF NOT EXISTS secuencia_default_id integer
    REFERENCES prospeccion_email_secuencias(id) ON DELETE SET NULL;

-- ───────────────────────────────────────────────────────────
-- 3. Contactos: origen + precio cotizado
-- ───────────────────────────────────────────────────────────
ALTER TABLE prospeccion_contactos
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'externo';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'prospeccion_contactos_origen_check'
  ) THEN
    ALTER TABLE prospeccion_contactos
      ADD CONSTRAINT prospeccion_contactos_origen_check
      CHECK (origen IN ('externo','interno'));
  END IF;
END $$;

ALTER TABLE prospeccion_contactos
  ADD COLUMN IF NOT EXISTS precio_cotizado        numeric,
  ADD COLUMN IF NOT EXISTS precio_cotizado_moneda text DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS precio_cotizado_notas  text DEFAULT '';

-- 3b. CONSTRAINT: un talento no puede estar dos veces en la misma prospección.
-- Solo aplica cuando talento_id NOT NULL (contactos externos no tienen talento_id).
CREATE UNIQUE INDEX IF NOT EXISTS uq_contacto_talento_por_prospeccion
  ON prospeccion_contactos (prospeccion_id, talento_id)
  WHERE talento_id IS NOT NULL;

-- ───────────────────────────────────────────────────────────
-- 4. Cola de envíos programados
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prospeccion_email_cola (
  id              serial PRIMARY KEY,
  contacto_id     integer NOT NULL REFERENCES prospeccion_contactos(id) ON DELETE CASCADE,
  prospeccion_id  integer NOT NULL REFERENCES prospecciones(id) ON DELETE CASCADE,
  secuencia_id    integer REFERENCES prospeccion_email_secuencias(id) ON DELETE SET NULL,
  step            integer NOT NULL,
  template_id     integer,
  scheduled_at    timestamp NOT NULL,
  status          text NOT NULL DEFAULT 'pendiente',
  -- status: pendiente | enviado | cancelado | error
  sent_at         timestamp,
  email_log_id    integer REFERENCES prospeccion_email_log(id) ON DELETE SET NULL,
  error           text DEFAULT '',
  created_at      timestamp DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'prospeccion_email_cola_status_check'
  ) THEN
    ALTER TABLE prospeccion_email_cola
      ADD CONSTRAINT prospeccion_email_cola_status_check
      CHECK (status IN ('pendiente','enviado','cancelado','error'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cola_pending_due
  ON prospeccion_email_cola(scheduled_at) WHERE status='pendiente';
CREATE INDEX IF NOT EXISTS idx_cola_contacto    ON prospeccion_email_cola(contacto_id);
CREATE INDEX IF NOT EXISTS idx_cola_prospeccion ON prospeccion_email_cola(prospeccion_id);

ALTER TABLE prospeccion_email_cola ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prosp_cola_auth ON prospeccion_email_cola;
CREATE POLICY prosp_cola_auth ON prospeccion_email_cola
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ───────────────────────────────────────────────────────────
-- 5. Permisos para que la Netlify Function pueda procesar la cola
-- usando el service role key (auth.uid() es NULL ahí). La function
-- usa el service role, que bypassea RLS, por lo que no es estrictamente
-- necesario, pero dejamos las policies abiertas a usuarios autenticados.
-- ───────────────────────────────────────────────────────────
