-- ══════════════════════════════════════════════════════════════════
-- CONTRATOS — EXPANSIÓN (2026-06-26)
-- Ejecutar en Supabase SQL Editor (proyecto ngstqwbzvnpggpklifat).
-- Idempotente: se puede re-ejecutar sin romper.
--
-- Qué agrega (ver plan en .claude/plans):
--   1. empresas_facturacion  — librería de NUESTRAS empresas emisoras
--      (reemplaza el BEME_DATA hardcodeado). Se elige cuál factura/firma
--      por contrato.
--   2. firmas_agencia        — librería de firmas guardadas del equipo
--      (se incrustan en el PDF firmado).
--   3. contrato_comentarios  — hilo de comentarios por contrato
--      (talento/marca piden cambios; el equipo responde).
--   4. contrato_documentos   — ID + selfie de cada parte (validez legal).
--      Bucket PRIVADO `contrato-docs` (PII) → lectura por URL firmada.
--   5. contrato_firma_eventos — bitácora append-only de auditoría fuerte.
--   6. Columnas nuevas en `contratos`: empresa_id, firma de agencia,
--      pdf_firmado_url, mirror_origen_id, consentimiento/hash/bloqueo.
--
-- Las firmas EXISTENTES (firma_url/firmante_nombre/firmado_at/firma_ip)
-- quedan como la firma de la CONTRAPARTE (talento o marca según tipo).
-- ══════════════════════════════════════════════════════════════════

-- ┌──────────────────────────────────────────────────────────────┐
-- │ 1. EMPRESAS DE FACTURACIÓN (emisores nuestros)               │
-- └──────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS empresas_facturacion (
  id               serial PRIMARY KEY,
  nombre           text NOT NULL,            -- "NITZIO MICH SA DE CV" / "BEME AGENCY"
  rfc              text DEFAULT '',
  domicilio        text DEFAULT '',
  email            text DEFAULT '',
  signatory_nombre text DEFAULT '',          -- representante legal que firma
  signatory_cargo  text DEFAULT '',
  firma_url        text DEFAULT '',          -- firma por defecto de esta empresa (opcional)
  es_default       boolean DEFAULT false,
  activo           boolean DEFAULT true,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);
COMMENT ON TABLE empresas_facturacion IS 'Empresas emisoras de BEME (datos fiscales + firmante) elegibles por contrato. Reemplaza el BEME_DATA hardcodeado.';

DROP TRIGGER IF EXISTS trg_empresas_fact_updated ON empresas_facturacion;
CREATE TRIGGER trg_empresas_fact_updated BEFORE UPDATE ON empresas_facturacion
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE empresas_facturacion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS empresas_fact_internal_all ON empresas_facturacion;
CREATE POLICY empresas_fact_internal_all ON empresas_facturacion
  FOR ALL USING (is_internal()) WITH CHECK (is_internal());

-- Lectura por magic-api (service_role) → no depende de RLS.

-- ┌──────────────────────────────────────────────────────────────┐
-- │ 2. FIRMAS DEL EQUIPO (librería para firmar como agencia)     │
-- └──────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS firmas_agencia (
  id          serial PRIMARY KEY,
  nombre      text NOT NULL,                 -- "Agustín Ríos"
  cargo       text DEFAULT '',
  firma_url   text NOT NULL,                 -- PNG en bucket contratos/firmas-agencia/
  empresa_id  integer REFERENCES empresas_facturacion(id) ON DELETE SET NULL,
  es_default  boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);
COMMENT ON TABLE firmas_agencia IS 'Firmas guardadas del equipo BEME. Se eligen para firmar como agencia y se incrustan en el PDF.';

ALTER TABLE firmas_agencia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS firmas_agencia_internal_all ON firmas_agencia;
CREATE POLICY firmas_agencia_internal_all ON firmas_agencia
  FOR ALL USING (is_internal()) WITH CHECK (is_internal());

-- ┌──────────────────────────────────────────────────────────────┐
-- │ 3. COMENTARIOS POR CONTRATO                                  │
-- └──────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS contrato_comentarios (
  id           serial PRIMARY KEY,
  contrato_id  integer NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  autor_tipo   text NOT NULL,                -- 'talento' | 'marca' | 'interno'
  autor_nombre text DEFAULT '',
  mensaje      text NOT NULL,
  resuelto     boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contrato_comentarios_contrato_idx ON contrato_comentarios (contrato_id);
COMMENT ON TABLE contrato_comentarios IS 'Hilo de comentarios de un contrato: talento/marca piden cambios (vía magic-api), el equipo responde (sesión auth).';

ALTER TABLE contrato_comentarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contrato_coment_internal_all ON contrato_comentarios;
CREATE POLICY contrato_coment_internal_all ON contrato_comentarios
  FOR ALL USING (is_internal()) WITH CHECK (is_internal());
-- El talento/marca escribe vía magic-api con service_role.

-- ┌──────────────────────────────────────────────────────────────┐
-- │ 4. DOCUMENTOS (ID + SELFIE) — bucket PRIVADO                 │
-- └──────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS contrato_documentos (
  id             serial PRIMARY KEY,
  contrato_id    integer NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  parte          text NOT NULL,              -- 'talento' | 'marca'
  tipo_doc       text NOT NULL,              -- 'identificacion' | 'selfie'
  archivo_path   text NOT NULL,              -- path en bucket privado contrato-docs (NO URL pública)
  nombre_archivo text DEFAULT '',
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contrato_documentos_contrato_idx ON contrato_documentos (contrato_id);
COMMENT ON TABLE contrato_documentos IS 'ID + selfie de cada parte para validez legal. Archivos en bucket privado contrato-docs; lectura por URL firmada vía magic-api / panel.';

ALTER TABLE contrato_documentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contrato_docs_internal_all ON contrato_documentos;
CREATE POLICY contrato_docs_internal_all ON contrato_documentos
  FOR ALL USING (is_internal()) WITH CHECK (is_internal());

-- Bucket PRIVADO (PII): sin acceso público; se lee con URL firmada generada
-- por service_role (magic-api) o por el panel interno.
INSERT INTO storage.buckets (id, name, public)
VALUES ('contrato-docs', 'contrato-docs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Solo el equipo interno (sesión auth) puede listar/leer/escribir directo.
-- El talento/marca sube vía magic-api (service_role → omite RLS).
DROP POLICY IF EXISTS contrato_docs_obj_internal ON storage.objects;
CREATE POLICY contrato_docs_obj_internal ON storage.objects
  FOR ALL USING (bucket_id = 'contrato-docs' AND auth.uid() IS NOT NULL)
  WITH CHECK (bucket_id = 'contrato-docs' AND auth.uid() IS NOT NULL);

-- ┌──────────────────────────────────────────────────────────────┐
-- │ 5. BITÁCORA DE FIRMA (auditoría fuerte, append-only)         │
-- └──────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS contrato_firma_eventos (
  id              serial PRIMARY KEY,
  contrato_id     integer NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  lado            text NOT NULL,             -- 'agencia' | 'talento' | 'marca'
  evento          text NOT NULL,             -- 'firmado' | 'consentimiento'
  firmante_nombre text DEFAULT '',
  ip              text DEFAULT '',
  user_agent      text DEFAULT '',
  hash            text DEFAULT '',           -- SHA-256 del contenido_html firmado
  consentimiento  text DEFAULT '',           -- texto del "Acepto" mostrado
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contrato_firma_eventos_contrato_idx ON contrato_firma_eventos (contrato_id);
COMMENT ON TABLE contrato_firma_eventos IS 'Bitácora inmutable de eventos de firma (auditoría legal): quién/cuándo/IP/UA + hash del documento firmado.';

ALTER TABLE contrato_firma_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contrato_firma_eventos_internal_read ON contrato_firma_eventos;
CREATE POLICY contrato_firma_eventos_internal_read ON contrato_firma_eventos
  FOR SELECT USING (is_internal());
-- Inserts solo vía service_role (magic-api) o panel interno con sesión.
DROP POLICY IF EXISTS contrato_firma_eventos_internal_ins ON contrato_firma_eventos;
CREATE POLICY contrato_firma_eventos_internal_ins ON contrato_firma_eventos
  FOR INSERT WITH CHECK (is_internal());

-- ┌──────────────────────────────────────────────────────────────┐
-- │ 6. COLUMNAS NUEVAS EN contratos                              │
-- └──────────────────────────────────────────────────────────────┘
-- Empresa emisora elegida
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS empresa_id integer REFERENCES empresas_facturacion(id);

-- Firma de NUESTRO lado (agencia). La contraparte usa firma_url/firmante_nombre/firmado_at/firma_ip.
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS firma_agencia_url    text DEFAULT '';
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS firma_agencia_nombre text DEFAULT '';
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS firmado_agencia_at   timestamptz;

-- PDF final con ambas firmas incrustadas (descargable por todos)
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS pdf_firmado_url text DEFAULT '';

-- Espejo de un contrato externo adjunto
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS mirror_origen_id integer REFERENCES contratos(id);

-- Auditoría fuerte
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS firma_consentimiento_texto text DEFAULT '';
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS firma_user_agent           text DEFAULT '';
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS contenido_hash             text DEFAULT '';  -- SHA-256 del contenido_html al firmar
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS bloqueado                  boolean DEFAULT false;

COMMENT ON COLUMN contratos.empresa_id        IS 'Empresa emisora (empresas_facturacion) elegida para este contrato.';
COMMENT ON COLUMN contratos.firma_agencia_url IS 'Firma de BEME (nuestro lado) incrustada al firmar como agencia.';
COMMENT ON COLUMN contratos.pdf_firmado_url   IS 'PDF final con ambas firmas, en bucket contratos/pdf-firmado/.';
COMMENT ON COLUMN contratos.mirror_origen_id  IS 'Si es espejo de un contrato externo adjunto, id del contrato origen.';
COMMENT ON COLUMN contratos.contenido_hash    IS 'SHA-256 del contenido_html congelado al firmar (no se puede alterar después).';
COMMENT ON COLUMN contratos.bloqueado         IS 'true tras la primera firma: bloquea edición manual / IA del contenido.';
