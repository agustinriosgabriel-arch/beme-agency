-- ══════════════════════════════════════════════════════════════════
-- BEME AGENCY — Schema Unificado
-- Supabase Project: ngstqwbzvnpggpklifat
-- Generado: 2026-04-12
-- ══════════════════════════════════════════════════════════════════
-- Este archivo documenta el schema completo. Ejecutar solo las
-- secciones marcadas con "-- MIGRATION" para aplicar cambios.
-- ══════════════════════════════════════════════════════════════════


-- ┌─────────────────────────────────────────────────────────────┐
-- │  1. FUNCIONES AUXILIARES                                    │
-- └─────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION is_internal() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin','campaign_manager'));
$$;

CREATE OR REPLACE FUNCTION get_user_role() RETURNS text
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION update_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


-- ┌─────────────────────────────────────────────────────────────┐
-- │  2. TABLAS                                                  │
-- └─────────────────────────────────────────────────────────────┘

-- ── user_profiles ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
  id         uuid PRIMARY KEY,  -- matches auth.users.id
  role       text NOT NULL,     -- admin, campaign_manager, brand_handler, talent
  nombre     text NOT NULL DEFAULT '',
  email      text NOT NULL DEFAULT '',
  telefono   text DEFAULT '',
  avatar_url text DEFAULT '',
  activo     boolean DEFAULT true,
  talent_id  integer,           -- FK to talentos.id (only for role=talent)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── talentos ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS talentos (
  id              serial PRIMARY KEY,
  nombre          text NOT NULL DEFAULT '',
  paises          text[] DEFAULT '{}',
  ciudad          text DEFAULT '',
  telefono        text DEFAULT '',
  email           text DEFAULT '',
  tiktok          text DEFAULT '',
  instagram       text DEFAULT '',
  youtube         text DEFAULT '',
  valores         text DEFAULT '',
  categorias      text[] DEFAULT '{}',
  foto            text DEFAULT '',         -- base64 or URL
  seguidores      jsonb DEFAULT '{"tiktok":0,"instagram":0,"youtube":0}',
  genero          text DEFAULT '',
  keywords        text DEFAULT '',
  tipo_contenido  text DEFAULT '',
  calidad         text DEFAULT '',
  marcas_previas  text DEFAULT '',
  notas_internas  text DEFAULT '',
  tiene_manager   boolean DEFAULT false,
  updated         text DEFAULT '',
  created_at      timestamptz DEFAULT now()
);

-- ── app_config ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_config (
  key   text PRIMARY KEY,  -- 'categories', 'countries', 'next_talent_id', 'next_roster_id'
  value jsonb DEFAULT 'null'
);

-- ── clientes ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clientes (
  id                       serial PRIMARY KEY,
  nombre                   text NOT NULL,
  tipo                     text NOT NULL,         -- agencia, marca_directa, etc
  pais                     text DEFAULT '',
  logo_url                 text DEFAULT '',
  notas                    text DEFAULT '',
  activo                   boolean DEFAULT true,
  rfc                      text DEFAULT '',
  razon_social             text DEFAULT '',
  domicilio_fiscal         text DEFAULT '',
  regimen_fiscal           text DEFAULT '',
  uso_cfdi                 text DEFAULT '',
  google_drive_link        text DEFAULT '',
  requiere_alta_proveedor  boolean DEFAULT false,
  alta_proveedor_estado    text DEFAULT 'no_aplica',
  alta_proveedor_notas     text DEFAULT '',
  metodo_envio_factura     text DEFAULT 'email',
  email_facturacion        text DEFAULT '',
  portal_facturacion_url   text DEFAULT '',
  portal_facturacion_notas text DEFAULT '',
  created_at               timestamptz DEFAULT now()
);

-- ── marcas ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marcas (
  id         serial PRIMARY KEY,
  cliente_id integer NOT NULL REFERENCES clientes(id),
  nombre     text NOT NULL,
  logo_url   text DEFAULT '',
  notas      text DEFAULT '',
  activo     boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ── marca_handlers ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marca_handlers (
  marca_id integer NOT NULL REFERENCES marcas(id),
  user_id  uuid NOT NULL REFERENCES user_profiles(id),
  PRIMARY KEY (marca_id, user_id)
);

-- ── rosters ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rosters (
  id                   serial PRIMARY KEY,
  name                 text NOT NULL DEFAULT '',
  description          text DEFAULT '',
  platforms            jsonb DEFAULT '{"tt":true,"ig":true,"yt":true}',
  talent_ids           integer[] DEFAULT '{}',
  public_token         text DEFAULT encode(gen_random_bytes(16), 'hex'),
  created              text DEFAULT '',
  ai_descriptions      jsonb DEFAULT '{}',
  ai_campaign_context  text DEFAULT '',
  show_ai_descriptions boolean DEFAULT false,
  created_at           timestamptz DEFAULT now()
);

-- ── roster_selecciones ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roster_selecciones (
  roster_id        integer NOT NULL REFERENCES rosters(id),
  talent_id        integer NOT NULL REFERENCES talentos(id),
  selected         boolean DEFAULT false,
  accion           text DEFAULT '',
  precio           numeric,
  contraoferta     text,
  allow_counteroffer boolean DEFAULT false,
  admin_notes      text DEFAULT '',
  admin_precio     text DEFAULT '',
  last_brand_edit  timestamp,
  updated_at       timestamptz DEFAULT now(),
  PRIMARY KEY (roster_id, talent_id)
);

-- ── rosters_generales ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rosters_generales (
  id           serial PRIMARY KEY,
  name         text NOT NULL,
  description  text DEFAULT '',
  filters      jsonb DEFAULT '{}',
  platforms    jsonb DEFAULT '{"tt":true,"ig":true,"yt":true}',
  public_token text,
  created_at   timestamp DEFAULT now()
);

-- ── campanas ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campanas (
  id                serial PRIMARY KEY,
  nombre            text NOT NULL,
  descripcion       text DEFAULT '',
  cliente_id        integer REFERENCES clientes(id),
  marca_id          integer REFERENCES marcas(id),
  estado            text NOT NULL DEFAULT 'sin_iniciar',  -- sin_iniciar, en_curso, etapa_finanzas, finalizada, cancelada
  fecha_inicio      date,
  fecha_fin         date,
  brief_texto       text DEFAULT '',
  fee_agencia       numeric,
  moneda_agencia    text DEFAULT 'USD',
  metodo_pago_marca text DEFAULT '',
  pais_facturacion  text DEFAULT '',
  requiere_factura  text DEFAULT 'no',     -- no, sí, solo_invoice
  notas_finanzas    text DEFAULT '',
  brief_notas       jsonb DEFAULT '[]',     -- timestamped notes array [{texto,autor,autor_id,fecha}]
  deleted_at        timestamptz DEFAULT NULL,  -- soft delete (30-day trash)
  created_by        uuid,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- ── campana_managers ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campana_managers (
  campana_id integer NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES user_profiles(id),
  PRIMARY KEY (campana_id, user_id)
);

-- ── campana_handlers ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campana_handlers (
  campana_id integer NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES user_profiles(id),
  PRIMARY KEY (campana_id, user_id)
);

-- ── campana_briefs ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campana_briefs (
  id          serial PRIMARY KEY,
  campana_id  integer NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  url         text NOT NULL,
  size_bytes  integer DEFAULT 0,
  uploaded_by uuid,
  created_at  timestamptz DEFAULT now()
);

-- ── campana_mensajes (chat interno) ───────────────────────────
CREATE TABLE IF NOT EXISTS campana_mensajes (
  id           serial PRIMARY KEY,
  campana_id   integer NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  autor_id     uuid,
  autor_nombre text DEFAULT '',
  mensaje      text NOT NULL,
  created_at   timestamptz DEFAULT now()
);

-- ── campana_talentos ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campana_talentos (
  id                     serial PRIMARY KEY,
  campana_id             integer NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  talent_id              integer NOT NULL REFERENCES talentos(id),
  fee                    numeric,            -- legacy (use fee_marca/fee_talento)
  fee_marca              numeric,
  fee_talento            numeric,
  moneda                 text DEFAULT 'USD',
  metodo_pago            text DEFAULT '',
  derechos_imagen_dias   integer,
  derechos_imagen_valor  numeric,
  derechos_imagen_desde  date,
  producto_estado        text DEFAULT 'no_aplica',  -- no_aplica, en_espera, recibido, con_inconvenientes
  producto_paqueteria    text DEFAULT '',
  producto_tracking      text DEFAULT '',
  producto_notas         text DEFAULT '',
  pago_estado            text DEFAULT 'pendiente',  -- pendiente, pagado
  pago_fecha             date,
  pago_referencia        text DEFAULT '',
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

-- ── contenidos ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contenidos (
  id                      serial PRIMARY KEY,
  campana_talento_id      integer NOT NULL REFERENCES campana_talentos(id) ON DELETE CASCADE,
  tipo                    text NOT NULL,      -- tiktok_video, reel, reel_tiktok_espejo, ig_story, youtube_video, youtube_short
  titulo                  text DEFAULT '',
  brief_propio            text DEFAULT '',
  usa_brief_general       boolean DEFAULT true,
  fecha_publicacion       date,
  paso_actual             integer NOT NULL DEFAULT 1,  -- 1-9
  script_requerido        boolean DEFAULT false,
  estadisticas_requeridas boolean DEFAULT false,
  spark_code_dias         integer,
  spark_code_valor        numeric,
  spark_code_desde        date,
  spark_code_texto        text DEFAULT '',
  pauta_dias              integer,
  pauta_valor             numeric,
  pauta_desde             date,
  url_publicacion         text DEFAULT '',
  url_publicacion_2       text,               -- segundo link para reel_tiktok_espejo
  copy_texto              text DEFAULT '',    -- MIGRATION: agregar si no existe
  stats_7d_cargadas       boolean DEFAULT false,
  stats_15d_cargadas      boolean DEFAULT false,
  stats_30d_cargadas      boolean DEFAULT false,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

-- ── contenido_scripts ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contenido_scripts (
  id           serial PRIMARY KEY,
  contenido_id integer NOT NULL REFERENCES contenidos(id) ON DELETE CASCADE,
  version      integer NOT NULL DEFAULT 1,
  texto        text DEFAULT '',
  url_archivo  text DEFAULT '',
  subido_por   uuid,
  created_at   timestamptz DEFAULT now()
);

-- ── contenido_borradores ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS contenido_borradores (
  id             serial PRIMARY KEY,
  contenido_id   integer NOT NULL REFERENCES contenidos(id) ON DELETE CASCADE,
  version        integer NOT NULL DEFAULT 1,
  url_archivo    text NOT NULL,
  nombre_archivo text DEFAULT '',
  size_bytes     integer DEFAULT 0,
  subido_por     uuid,
  created_at     timestamptz DEFAULT now()
);

-- ── contenido_briefs ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contenido_briefs (
  id           serial PRIMARY KEY,
  contenido_id integer NOT NULL REFERENCES contenidos(id) ON DELETE CASCADE,
  nombre       text NOT NULL,
  url          text NOT NULL,
  size_bytes   integer DEFAULT 0,
  uploaded_by  uuid,
  created_at   timestamptz DEFAULT now()
);

-- ── contenido_observaciones ───────────────────────────────────
CREATE TABLE IF NOT EXISTS contenido_observaciones (
  id           serial PRIMARY KEY,
  contenido_id integer NOT NULL REFERENCES contenidos(id) ON DELETE CASCADE,
  paso         integer NOT NULL,
  tipo         text NOT NULL,        -- script, borrador
  observacion  text NOT NULL,
  autor_id     uuid,
  autor_nombre text DEFAULT '',
  created_at   timestamptz DEFAULT now()
);

-- ── contenido_historial ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS contenido_historial (
  id           serial PRIMARY KEY,
  contenido_id integer NOT NULL REFERENCES contenidos(id) ON DELETE CASCADE,
  paso_anterior integer,
  paso_nuevo   integer NOT NULL,
  accion       text DEFAULT '',
  autor_id     uuid,
  autor_nombre text DEFAULT '',
  created_at   timestamptz DEFAULT now()
);

-- ── contenido_estadisticas ────────────────────────────────────
CREATE TABLE IF NOT EXISTS contenido_estadisticas (
  id             serial PRIMARY KEY,
  contenido_id   integer NOT NULL REFERENCES contenidos(id) ON DELETE CASCADE,
  periodo        text NOT NULL,       -- 7d, 15d, 30d
  url_screenshot text NOT NULL,
  nombre_archivo text DEFAULT '',
  subido_por     uuid,
  created_at     timestamptz DEFAULT now()
);

-- ── alertas ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alertas (
  id           serial PRIMARY KEY,
  user_id      uuid NOT NULL,
  campana_id   integer,
  contenido_id integer,
  tipo         text NOT NULL,
  titulo       text NOT NULL,
  descripcion  text DEFAULT '',
  leida        boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

-- ── contratos ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contratos (
  id                 serial PRIMARY KEY,
  campana_id         integer REFERENCES campanas(id),
  campana_talento_id integer REFERENCES campana_talentos(id),
  tipo               text NOT NULL DEFAULT 'marca',
  idioma             text NOT NULL DEFAULT 'es',
  numero_contrato    text NOT NULL DEFAULT '',
  estado             text NOT NULL DEFAULT 'borrador',
  parte_a_nombre     text DEFAULT '',
  parte_a_rfc        text DEFAULT '',
  parte_a_domicilio  text DEFAULT '',
  parte_b_nombre     text DEFAULT '',
  parte_b_rfc        text DEFAULT '',
  parte_b_domicilio  text DEFAULT '',
  influencer_nombre  text DEFAULT '',
  servicios          text DEFAULT '',
  canales            text DEFAULT '',
  hashtags           text DEFAULT 'A Definir en Brief',
  marca_producto     text DEFAULT '',
  tarifa_tipo        text DEFAULT 'pago',
  monto              numeric DEFAULT 0,
  moneda             text DEFAULT 'MXN',
  monto_texto        text DEFAULT '',
  metodo_pago        text DEFAULT '',
  plazo_pago_dias    integer DEFAULT 45,
  comentarios        text DEFAULT '',
  derechos_imagen    boolean DEFAULT false,
  derechos_dias      integer,
  derechos_valor     numeric,
  derechos_desde     date,
  fecha_contrato     date DEFAULT CURRENT_DATE,
  ciudad_contrato    text DEFAULT 'Mexico City',
  contenido_html     text DEFAULT '',
  created_by         uuid,
  created_at         timestamp DEFAULT now(),
  updated_at         timestamp DEFAULT now()
);

-- ── facturas ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturas (
  id               serial PRIMARY KEY,
  campana_id       integer REFERENCES campanas(id),
  cliente_id       integer REFERENCES clientes(id),
  tipo             text NOT NULL DEFAULT 'PUE',
  numero_factura   text DEFAULT '',
  monto            numeric NOT NULL DEFAULT 0,
  moneda           text DEFAULT 'USD',
  estado           text DEFAULT 'pendiente',
  factura_pdf_url  text DEFAULT '',
  factura_xml_url  text DEFAULT '',
  enviada_por      text DEFAULT '',
  fecha_emision    date,
  fecha_envio      date,
  notas            text DEFAULT '',
  created_by       uuid,
  created_at       timestamp DEFAULT now(),
  updated_at       timestamp DEFAULT now()
);

-- ── pagos_marca ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pagos_marca (
  id              serial PRIMARY KEY,
  factura_id      integer REFERENCES facturas(id),
  campana_id      integer REFERENCES campanas(id),
  monto           numeric NOT NULL DEFAULT 0,
  moneda          text DEFAULT 'USD',
  fecha_pago      date,
  corredor        text DEFAULT '',
  comprobante_url text DEFAULT '',
  notas           text DEFAULT '',
  created_by      uuid,
  created_at      timestamp DEFAULT now()
);

-- ── complementos_pago ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS complementos_pago (
  id                  serial PRIMARY KEY,
  factura_id          integer REFERENCES facturas(id),
  pago_marca_id       integer REFERENCES pagos_marca(id),
  estado              text DEFAULT 'pendiente',
  complemento_pdf_url text DEFAULT '',
  complemento_xml_url text DEFAULT '',
  fecha_emision       date,
  fecha_envio         date,
  enviado_por         text DEFAULT '',
  notas               text DEFAULT '',
  created_by          uuid,
  created_at          timestamp DEFAULT now()
);

-- ── pagos_talento ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pagos_talento (
  id                 serial PRIMARY KEY,
  campana_talento_id integer REFERENCES campana_talentos(id),
  campana_id         integer REFERENCES campanas(id),
  talent_id          integer REFERENCES talentos(id),
  monto              numeric NOT NULL DEFAULT 0,
  moneda             text DEFAULT 'USD',
  estado             text DEFAULT 'pendiente',
  fecha_pago         date,
  corredor           text DEFAULT '',
  comprobante_url    text DEFAULT '',
  notas              text DEFAULT '',
  created_by         uuid,
  created_at         timestamp DEFAULT now()
);

-- ── paquetes ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS paquetes (
  id         text PRIMARY KEY,
  prov_id    text NOT NULL,
  total      integer NOT NULL,
  precio     numeric NOT NULL,
  notas      text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- ── paquete_usos ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS paquete_usos (
  id         bigserial PRIMARY KEY,
  paquete_id text NOT NULL REFERENCES paquetes(id),
  entry_id   bigint,
  camp_name  text DEFAULT '',
  song       text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- ── prospecciones ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prospecciones (
  id                serial PRIMARY KEY,
  marca             text NOT NULL,
  paises            text[] DEFAULT '{}',
  plataformas       text[] DEFAULT '{}',
  contenido         text DEFAULT '',
  categorias        text[] DEFAULT '{}',
  generos           text[] DEFAULT '{}',
  visualizaciones   text DEFAULT '',
  seguidores_min    integer DEFAULT 0,
  seguidores_max    integer DEFAULT 0,
  cantidad_talentos integer DEFAULT 0,
  producto          text DEFAULT '',
  fecha             date,
  notas             text DEFAULT '',
  email_draft       text DEFAULT '',
  estado            text DEFAULT 'activa',
  created_at        timestamp DEFAULT now(),
  updated_at        timestamp DEFAULT now()
);

-- ── prospeccion_contactos ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS prospeccion_contactos (
  id             serial PRIMARY KEY,
  prospeccion_id integer REFERENCES prospecciones(id) ON DELETE CASCADE,
  nombre         text NOT NULL,
  paises         text[] DEFAULT '{}',
  ciudad         text DEFAULT '',
  telefono       text DEFAULT '',
  email          text DEFAULT '',
  tiktok         text DEFAULT '',
  instagram      text DEFAULT '',
  youtube        text DEFAULT '',
  seguidores     jsonb DEFAULT '{"tiktok":0,"instagram":0,"youtube":0}',
  categorias     text[] DEFAULT '{}',
  genero         text DEFAULT '',
  keywords       text DEFAULT '',
  foto           text DEFAULT '',
  valores        text DEFAULT '',
  etapa          text DEFAULT 'evaluacion',  -- evaluacion, contactar, esperando_respuesta, descartado, no_interesado, interesado
  medio_contacto text DEFAULT '',
  notas          text DEFAULT '',
  talento_id     integer,
  created_at     timestamp DEFAULT now(),
  updated_at     timestamp DEFAULT now()
);

-- ── prospeccion_historial ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS prospeccion_historial (
  id             serial PRIMARY KEY,
  contacto_id    integer REFERENCES prospeccion_contactos(id) ON DELETE CASCADE,
  etapa_anterior text NOT NULL,
  etapa_nueva    text NOT NULL,
  medio_contacto text,
  notas          text DEFAULT '',
  created_at     timestamp DEFAULT now()
);

-- ── prospeccion_email_templates ───────────────────────────────
CREATE TABLE IF NOT EXISTS prospeccion_email_templates (
  id         serial PRIMARY KEY,
  nombre     text NOT NULL,
  asunto     text DEFAULT '',
  cuerpo     text NOT NULL,
  created_at timestamp DEFAULT now()
);


-- ┌─────────────────────────────────────────────────────────────┐
-- │  3. FUNCIONES DE WORKFLOW                                   │
-- └─────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION avanzar_paso_contenido(
  p_contenido_id integer,
  p_autor_id uuid,
  p_autor_nombre text,
  p_accion text
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_actual integer; v_nuevo integer;
  v_script boolean; v_stats boolean;
BEGIN
  SELECT paso_actual, script_requerido, estadisticas_requeridas
  INTO v_actual, v_script, v_stats
  FROM contenidos WHERE id = p_contenido_id;

  v_nuevo := v_actual + 1;

  -- Saltar pasos de script si no requerido
  IF v_nuevo = 2 AND NOT v_script THEN v_nuevo := 4; END IF;
  IF v_nuevo = 3 AND NOT v_script THEN v_nuevo := 4; END IF;
  -- Después de paso 6 va a 7 (stats) si requerido, sino a 8
  IF v_nuevo = 7 AND NOT v_stats THEN v_nuevo := 8; END IF;
  IF v_nuevo > 9 THEN v_nuevo := 9; END IF;

  UPDATE contenidos SET paso_actual = v_nuevo WHERE id = p_contenido_id;
  INSERT INTO contenido_historial(contenido_id, paso_anterior, paso_nuevo, accion, autor_id, autor_nombre)
  VALUES (p_contenido_id, v_actual, v_nuevo, p_accion, p_autor_id, p_autor_nombre);
  RETURN v_nuevo;
END;
$$;

CREATE OR REPLACE FUNCTION rechazar_contenido(
  p_contenido_id integer,
  p_observacion text,
  p_autor_id uuid,
  p_autor_nombre text
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_paso_actual integer;
  v_paso_nuevo  integer;
  v_tipo        text;
BEGIN
  SELECT paso_actual INTO v_paso_actual FROM contenidos WHERE id = p_contenido_id;

  IF v_paso_actual = 3 THEN v_paso_nuevo := 2; v_tipo := 'script';
  ELSIF v_paso_actual = 5 THEN v_paso_nuevo := 4; v_tipo := 'borrador';
  ELSE RETURN v_paso_actual;
  END IF;

  INSERT INTO contenido_observaciones(contenido_id, paso, tipo, observacion, autor_id, autor_nombre)
  VALUES (p_contenido_id, v_paso_actual, v_tipo, p_observacion, p_autor_id, p_autor_nombre);

  UPDATE contenidos SET paso_actual = v_paso_nuevo WHERE id = p_contenido_id;

  INSERT INTO contenido_historial(contenido_id, paso_anterior, paso_nuevo, accion, autor_id, autor_nombre)
  VALUES (p_contenido_id, v_paso_actual, v_paso_nuevo, 'Rechazado: ' || p_observacion, p_autor_id, p_autor_nombre);

  RETURN v_paso_nuevo;
END;
$$;

CREATE OR REPLACE FUNCTION generate_contract_number() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  yr text; mn text; seq integer;
BEGIN
  yr := to_char(NEW.fecha_contrato, 'YY');
  mn := to_char(NEW.fecha_contrato, 'MM');
  SELECT COALESCE(MAX(
    CAST(NULLIF(regexp_replace(numero_contrato, '[^0-9]', '', 'g'), '') AS integer)
  ), 0) + 1
  INTO seq
  FROM contratos
  WHERE numero_contrato LIKE mn || yr || '%';
  NEW.numero_contrato := mn || yr || LPAD(seq::text, 2, '0');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION purge_deleted_campanas() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Permanently delete campaigns in trash for 30+ days (ON DELETE CASCADE handles related data)
  DELETE FROM campanas
  WHERE deleted_at IS NOT NULL
    AND deleted_at < now() - interval '30 days';
END;
$$;

-- Auto-estado: when all contenidos in a campana reach paso >= 8,
-- automatically set campana.estado = 'etapa_finanzas'
CREATE OR REPLACE FUNCTION check_campana_auto_estado()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_campana_id integer;
  v_total integer;
  v_done integer;
  v_estado text;
BEGIN
  SELECT ct.campana_id INTO v_campana_id
  FROM campana_talentos ct WHERE ct.id = NEW.campana_talento_id;
  IF v_campana_id IS NULL THEN RETURN NEW; END IF;
  SELECT estado INTO v_estado FROM campanas WHERE id = v_campana_id;
  IF v_estado != 'en_curso' THEN RETURN NEW; END IF;
  SELECT COUNT(*), COUNT(*) FILTER (WHERE c.paso_actual >= 8)
  INTO v_total, v_done
  FROM contenidos c
  JOIN campana_talentos ct ON ct.id = c.campana_talento_id
  WHERE ct.campana_id = v_campana_id;
  IF v_total > 0 AND v_total = v_done THEN
    UPDATE campanas SET estado = 'etapa_finanzas' WHERE id = v_campana_id;
  END IF;
  RETURN NEW;
END;
$$;

-- ── notificaciones_enviadas ───────────────────────────────────
CREATE TABLE IF NOT EXISTS notificaciones_enviadas (
  id         serial PRIMARY KEY,
  tipo       text NOT NULL,          -- paso_cambio, recordatorio
  ref_id     integer,                -- contenido_id or campana_id
  user_email text NOT NULL,
  created_at timestamptz DEFAULT now()
);


-- ┌─────────────────────────────────────────────────────────────┐
-- │  4. TRIGGERS                                                │
-- └─────────────────────────────────────────────────────────────┘

DROP TRIGGER IF EXISTS trg_campanas_updated ON campanas;
CREATE TRIGGER trg_campanas_updated
  BEFORE UPDATE ON campanas FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_campana_talentos_updated ON campana_talentos;
CREATE TRIGGER trg_campana_talentos_updated
  BEFORE UPDATE ON campana_talentos FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_contenidos_updated ON contenidos;
CREATE TRIGGER trg_contenidos_updated
  BEFORE UPDATE ON contenidos FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_contract_number ON contratos;
CREATE TRIGGER trg_contract_number
  BEFORE INSERT ON contratos FOR EACH ROW EXECUTE FUNCTION generate_contract_number();

DROP TRIGGER IF EXISTS trg_auto_estado_campana ON contenidos;
CREATE TRIGGER trg_auto_estado_campana
  AFTER UPDATE OF paso_actual ON contenidos
  FOR EACH ROW WHEN (NEW.paso_actual >= 8)
  EXECUTE FUNCTION check_campana_auto_estado();


-- ┌─────────────────────────────────────────────────────────────┐
-- │  5. RLS POLICIES (unificadas — sin duplicados)              │
-- └─────────────────────────────────────────────────────────────┘

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE talentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE marcas ENABLE ROW LEVEL SECURITY;
ALTER TABLE rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE roster_selecciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE rosters_generales ENABLE ROW LEVEL SECURITY;
ALTER TABLE campanas ENABLE ROW LEVEL SECURITY;
ALTER TABLE campana_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE campana_handlers ENABLE ROW LEVEL SECURITY;
ALTER TABLE campana_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE campana_mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE campana_talentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE contenidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE contenido_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contenido_borradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE contenido_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE contenido_observaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE contenido_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE contenido_estadisticas ENABLE ROW LEVEL SECURITY;
ALTER TABLE alertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE contratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_marca ENABLE ROW LEVEL SECURITY;
ALTER TABLE complementos_pago ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_talento ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospecciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospeccion_contactos ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospeccion_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospeccion_email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE paquetes ENABLE ROW LEVEL SECURITY;
ALTER TABLE paquete_usos ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaciones_enviadas ENABLE ROW LEVEL SECURITY;

-- ── user_profiles ─────────────────────────────────────────────
-- Cada usuario ve su perfil, admin ve todos
CREATE POLICY user_profiles_select ON user_profiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY user_profiles_insert ON user_profiles FOR INSERT WITH CHECK (is_admin() OR id = auth.uid());
CREATE POLICY user_profiles_update ON user_profiles FOR UPDATE USING (is_admin() OR id = auth.uid());

-- ── talentos ──────────────────────────────────────────────────
CREATE POLICY talentos_auth_all ON talentos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY talentos_anon_read ON talentos FOR SELECT TO anon USING (EXISTS (SELECT 1 FROM rosters WHERE talentos.id = ANY(rosters.talent_ids)));
CREATE POLICY talentos_anon_update ON talentos FOR UPDATE TO anon USING (EXISTS (SELECT 1 FROM rosters WHERE talentos.id = ANY(rosters.talent_ids)));

-- ── app_config ────────────────────────────────────────────────
CREATE POLICY app_config_auth ON app_config FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── clientes ──────────────────────────────────────────────────
CREATE POLICY clientes_select ON clientes FOR SELECT USING (is_internal());
CREATE POLICY clientes_all ON clientes FOR ALL USING (is_admin());

-- ── marcas ────────────────────────────────────────────────────
CREATE POLICY marcas_select ON marcas FOR SELECT USING (is_internal());
CREATE POLICY marcas_all ON marcas FOR ALL USING (is_admin());

-- ── rosters ───────────────────────────────────────────────────
CREATE POLICY rosters_auth_all ON rosters FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY rosters_anon_read ON rosters FOR SELECT TO anon USING (true);

-- ── roster_selecciones ────────────────────────────────────────
CREATE POLICY rs_auth_all ON roster_selecciones FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY rs_anon_read ON roster_selecciones FOR SELECT TO anon USING (EXISTS (SELECT 1 FROM rosters WHERE rosters.id = roster_selecciones.roster_id));
CREATE POLICY rs_anon_insert ON roster_selecciones FOR INSERT TO anon WITH CHECK (EXISTS (SELECT 1 FROM rosters WHERE rosters.id = roster_selecciones.roster_id AND roster_selecciones.talent_id = ANY(rosters.talent_ids)));
CREATE POLICY rs_anon_update ON roster_selecciones FOR UPDATE TO anon USING (EXISTS (SELECT 1 FROM rosters WHERE rosters.id = roster_selecciones.roster_id));

-- ── rosters_generales ─────────────────────────────────────────
CREATE POLICY rg_auth_all ON rosters_generales FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY rg_public_read ON rosters_generales FOR SELECT USING (true);

-- ── campanas ──────────────────────────────────────────────────
CREATE POLICY campanas_admin ON campanas FOR ALL USING (is_admin());
CREATE POLICY campanas_manager ON campanas FOR SELECT USING (EXISTS (SELECT 1 FROM campana_managers WHERE campana_managers.campana_id = campanas.id AND campana_managers.user_id = auth.uid()));
CREATE POLICY campanas_handler ON campanas FOR SELECT USING (EXISTS (SELECT 1 FROM campana_handlers WHERE campana_handlers.campana_id = campanas.id AND campana_handlers.user_id = auth.uid()));
CREATE POLICY campanas_talent ON campanas FOR SELECT USING (EXISTS (SELECT 1 FROM campana_talentos ct JOIN user_profiles up ON up.talent_id = ct.talent_id WHERE ct.campana_id = campanas.id AND up.id = auth.uid()));

-- ── campana_managers ──────────────────────────────────────────
CREATE POLICY cm_admin ON campana_managers FOR ALL USING (is_admin());
CREATE POLICY cm_internal_read ON campana_managers FOR SELECT USING (is_internal());

-- ── campana_handlers ──────────────────────────────────────────
CREATE POLICY ch_admin ON campana_handlers FOR ALL USING (is_admin());
CREATE POLICY ch_internal_read ON campana_handlers FOR SELECT USING (is_internal());

-- ── campana_talentos ──────────────────────────────────────────
CREATE POLICY ct_admin ON campana_talentos FOR ALL USING (is_admin());
CREATE POLICY ct_manager ON campana_talentos FOR SELECT USING (EXISTS (SELECT 1 FROM campana_managers WHERE campana_managers.campana_id = campana_talentos.campana_id AND campana_managers.user_id = auth.uid()));
CREATE POLICY ct_handler ON campana_talentos FOR SELECT USING (EXISTS (SELECT 1 FROM campana_handlers WHERE campana_handlers.campana_id = campana_talentos.campana_id AND campana_handlers.user_id = auth.uid()));
CREATE POLICY ct_talent ON campana_talentos FOR SELECT USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.talent_id = campana_talentos.talent_id));

-- ── contenidos ────────────────────────────────────────────────
CREATE POLICY cont_admin ON contenidos FOR ALL USING (is_admin());
CREATE POLICY cont_manager ON contenidos FOR ALL USING (EXISTS (SELECT 1 FROM campana_managers cm JOIN campana_talentos ct ON ct.campana_id = cm.campana_id WHERE ct.id = contenidos.campana_talento_id AND cm.user_id = auth.uid()));
CREATE POLICY cont_handler ON contenidos FOR SELECT USING (EXISTS (SELECT 1 FROM campana_handlers ch JOIN campana_talentos ct ON ct.campana_id = ch.campana_id WHERE ct.id = contenidos.campana_talento_id AND ch.user_id = auth.uid()));
CREATE POLICY cont_talent ON contenidos FOR ALL USING (EXISTS (SELECT 1 FROM campana_talentos ct JOIN user_profiles up ON up.talent_id = ct.talent_id WHERE ct.id = contenidos.campana_talento_id AND up.id = auth.uid()));

-- ── contenido_scripts ─────────────────────────────────────────
CREATE POLICY scripts_auth ON contenido_scripts FOR ALL USING (auth.uid() IS NOT NULL);

-- ── contenido_borradores ──────────────────────────────────────
CREATE POLICY borradores_auth ON contenido_borradores FOR ALL USING (auth.uid() IS NOT NULL);

-- ── contenido_briefs ──────────────────────────────────────────
CREATE POLICY briefs_auth ON campana_briefs FOR ALL USING (auth.uid() IS NOT NULL);

-- ── contenido_observaciones ───────────────────────────────────
CREATE POLICY obs_admin ON contenido_observaciones FOR ALL USING (is_admin());
CREATE POLICY obs_manager ON contenido_observaciones FOR ALL USING (EXISTS (SELECT 1 FROM campana_managers cm JOIN campana_talentos ct ON ct.campana_id = cm.campana_id WHERE ct.id = (SELECT contenidos.campana_talento_id FROM contenidos WHERE contenidos.id = contenido_observaciones.contenido_id) AND cm.user_id = auth.uid()));
CREATE POLICY obs_handler ON contenido_observaciones FOR ALL USING (EXISTS (SELECT 1 FROM campana_handlers ch JOIN campana_talentos ct ON ct.campana_id = ch.campana_id WHERE ct.id = (SELECT contenidos.campana_talento_id FROM contenidos WHERE contenidos.id = contenido_observaciones.contenido_id) AND ch.user_id = auth.uid()));
CREATE POLICY obs_talent ON contenido_observaciones FOR SELECT USING (EXISTS (SELECT 1 FROM campana_talentos ct JOIN user_profiles up ON up.talent_id = ct.talent_id WHERE ct.id = (SELECT contenidos.campana_talento_id FROM contenidos WHERE contenidos.id = contenido_observaciones.contenido_id) AND up.id = auth.uid()));

-- ── contenido_historial ───────────────────────────────────────
CREATE POLICY hist_admin ON contenido_historial FOR ALL USING (is_admin());
CREATE POLICY hist_internal ON contenido_historial FOR SELECT USING (is_internal());
CREATE POLICY hist_auth ON contenido_historial FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY hist_talent ON contenido_historial FOR SELECT USING (EXISTS (SELECT 1 FROM campana_talentos ct JOIN user_profiles up ON up.talent_id = ct.talent_id WHERE ct.id = (SELECT contenidos.campana_talento_id FROM contenidos WHERE contenidos.id = contenido_historial.contenido_id) AND up.id = auth.uid()));

-- ── contenido_estadisticas ────────────────────────────────────
CREATE POLICY stats_auth ON contenido_estadisticas FOR ALL USING (auth.uid() IS NOT NULL);

-- ── campana_mensajes ──────────────────────────────────────────
CREATE POLICY chat_internal ON campana_mensajes FOR ALL USING (is_internal());

-- ── alertas ───────────────────────────────────────────────────
CREATE POLICY alertas_select ON alertas FOR SELECT USING (user_id = auth.uid());
CREATE POLICY alertas_insert ON alertas FOR INSERT WITH CHECK (is_internal());
CREATE POLICY alertas_update ON alertas FOR UPDATE USING (user_id = auth.uid());

-- ── contratos ─────────────────────────────────────────────────
CREATE POLICY contratos_auth ON contratos FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── facturas ──────────────────────────────────────────────────
CREATE POLICY facturas_auth ON facturas FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── pagos_marca ───────────────────────────────────────────────
CREATE POLICY pagos_marca_auth ON pagos_marca FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── complementos_pago ─────────────────────────────────────────
CREATE POLICY complementos_auth ON complementos_pago FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── pagos_talento ─────────────────────────────────────────────
CREATE POLICY pagos_talento_auth ON pagos_talento FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── prospecciones ─────────────────────────────────────────────
CREATE POLICY prospecciones_auth ON prospecciones FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── prospeccion_contactos ─────────────────────────────────────
CREATE POLICY prospeccion_contactos_auth ON prospeccion_contactos FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── prospeccion_historial ─────────────────────────────────────
CREATE POLICY prospeccion_historial_auth ON prospeccion_historial FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── prospeccion_email_templates ───────────────────────────────
CREATE POLICY prospeccion_templates_auth ON prospeccion_email_templates FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── paquetes ──────────────────────────────────────────────────
CREATE POLICY paquetes_anon ON paquetes FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── paquete_usos ──────────────────────────────────────────────
CREATE POLICY paquete_usos_anon ON paquete_usos FOR ALL TO anon USING (true) WITH CHECK (true);


-- ┌─────────────────────────────────────────────────────────────┐
-- │  6. MIGRATION — Columnas + Limpiar duplicados               │
-- │  ⚠️  EJECUTAR ESTO EN SQL EDITOR DE SUPABASE               │
-- └─────────────────────────────────────────────────────────────┘

-- 6a. Columnas faltantes
ALTER TABLE contenidos ADD COLUMN IF NOT EXISTS copy_texto text DEFAULT '';
ALTER TABLE contenidos ADD COLUMN IF NOT EXISTS url_publicacion_2 text;
ALTER TABLE campanas ADD COLUMN IF NOT EXISTS brief_notas jsonb DEFAULT '[]';
ALTER TABLE campanas ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- 6b. Eliminar policies DUPLICADAS (nombres viejos que hacen lo mismo)
-- Campanas
DROP POLICY IF EXISTS "Admin full campanas" ON campanas;
DROP POLICY IF EXISTS "Manager ve sus campanas" ON campanas;
DROP POLICY IF EXISTS "Handler ve sus campanas" ON campanas;
DROP POLICY IF EXISTS "Talento ve sus campanas" ON campanas;
-- Campana_talentos
DROP POLICY IF EXISTS "Admin full campana_talentos" ON campana_talentos;
DROP POLICY IF EXISTS "Manager ve campana_talentos de sus campanas" ON campana_talentos;
DROP POLICY IF EXISTS "Handler ve campana_talentos de sus campanas" ON campana_talentos;
DROP POLICY IF EXISTS "Talento ve su campana_talento" ON campana_talentos;
-- Contenidos
DROP POLICY IF EXISTS "Admin full contenidos" ON contenidos;
DROP POLICY IF EXISTS "Manager full contenidos de sus campanas" ON contenidos;
DROP POLICY IF EXISTS "Handler lee y aprueba contenidos de sus campanas" ON contenidos;
DROP POLICY IF EXISTS "Talento ve y edita sus contenidos" ON contenidos;
-- Contenido_observaciones
DROP POLICY IF EXISTS "Admin full observaciones" ON contenido_observaciones;
DROP POLICY IF EXISTS "Manager full observaciones sus campanas" ON contenido_observaciones;
DROP POLICY IF EXISTS "Handler inserta y lee observaciones sus campanas" ON contenido_observaciones;
DROP POLICY IF EXISTS "Talento lee observaciones de sus contenidos" ON contenido_observaciones;
-- Marcas
DROP POLICY IF EXISTS "Internos leen marcas" ON marcas;
DROP POLICY IF EXISTS "Admin gestiona marcas" ON marcas;
-- Clientes
DROP POLICY IF EXISTS "Internos leen clientes" ON clientes;
DROP POLICY IF EXISTS "Admin gestiona clientes" ON clientes;
-- User_profiles
DROP POLICY IF EXISTS "Cada usuario ve su propio perfil" ON user_profiles;
DROP POLICY IF EXISTS "Solo admin crea usuarios" ON user_profiles;
DROP POLICY IF EXISTS "Solo admin actualiza usuarios" ON user_profiles;
DROP POLICY IF EXISTS "user_inserts_own_profile" ON user_profiles;
-- Campana_mensajes
DROP POLICY IF EXISTS "Solo internos acceden al chat" ON campana_mensajes;
-- Alertas
DROP POLICY IF EXISTS "Cada usuario ve sus alertas" ON alertas;
DROP POLICY IF EXISTS "Sistema crea alertas" ON alertas;
DROP POLICY IF EXISTS "Usuario marca leida" ON alertas;

-- 6c. Indices para acelerar queries (reduce Disk IO)
CREATE INDEX IF NOT EXISTS idx_campana_talentos_campana ON campana_talentos(campana_id);
CREATE INDEX IF NOT EXISTS idx_campana_talentos_talent ON campana_talentos(talent_id);
CREATE INDEX IF NOT EXISTS idx_contenidos_ct ON contenidos(campana_talento_id);
CREATE INDEX IF NOT EXISTS idx_contenido_scripts_cont ON contenido_scripts(contenido_id);
CREATE INDEX IF NOT EXISTS idx_contenido_borradores_cont ON contenido_borradores(contenido_id);
CREATE INDEX IF NOT EXISTS idx_contenido_briefs_cont ON contenido_briefs(contenido_id);
CREATE INDEX IF NOT EXISTS idx_contenido_observaciones_cont ON contenido_observaciones(contenido_id);
CREATE INDEX IF NOT EXISTS idx_contenido_historial_cont ON contenido_historial(contenido_id);
CREATE INDEX IF NOT EXISTS idx_contenido_estadisticas_cont ON contenido_estadisticas(contenido_id);
CREATE INDEX IF NOT EXISTS idx_campana_briefs_campana ON campana_briefs(campana_id);
CREATE INDEX IF NOT EXISTS idx_campana_mensajes_campana ON campana_mensajes(campana_id);
CREATE INDEX IF NOT EXISTS idx_campana_managers_campana ON campana_managers(campana_id);
CREATE INDEX IF NOT EXISTS idx_campana_handlers_campana ON campana_handlers(campana_id);
CREATE INDEX IF NOT EXISTS idx_campanas_estado ON campanas(estado);
CREATE INDEX IF NOT EXISTS idx_campanas_deleted ON campanas(deleted_at);
CREATE INDEX IF NOT EXISTS idx_campanas_marca ON campanas(marca_id);
CREATE INDEX IF NOT EXISTS idx_marcas_cliente ON marcas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_alertas_user ON alertas(user_id);
CREATE INDEX IF NOT EXISTS idx_contratos_campana ON contratos(campana_id);
CREATE INDEX IF NOT EXISTS idx_prospeccion_contactos_prospeccion ON prospeccion_contactos(prospeccion_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_talent ON user_profiles(talent_id);
CREATE INDEX IF NOT EXISTS idx_notif_ref ON notificaciones_enviadas(tipo, ref_id);
CREATE INDEX IF NOT EXISTS idx_notif_created ON notificaciones_enviadas(created_at);
