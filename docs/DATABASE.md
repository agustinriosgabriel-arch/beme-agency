# BEME Database Schema (Supabase/PostgreSQL)

## Connection
- **URL:** `https://ngstqwbzvnpggpklifat.supabase.co`
- **Anon Key:** `sb_publishable_1E2K-9D-KzOSVCgROnfa-g_-WCnWCDb`
- **RLS:** Enabled on ALL tables

---

## Core Tables

### `talentos`
```sql
id              serial PRIMARY KEY
nombre          text NOT NULL
paises          text[] DEFAULT '{}'
ciudad          text DEFAULT ''
telefono        text DEFAULT ''
email           text DEFAULT ''
tiktok          text DEFAULT ''
instagram       text DEFAULT ''
youtube         text DEFAULT ''
valores         text DEFAULT ''
categorias      text[] DEFAULT '{}'    -- e.g. ARRAY['Belleza','Contenido']
foto            text DEFAULT ''
seguidores      jsonb DEFAULT '{"tiktok":0,"instagram":0,"youtube":0}'
genero          text DEFAULT ''
keywords        text DEFAULT ''
direccion_entrega jsonb DEFAULT '{}'  -- { destinatario, calle, ciudad, provincia, cp, pais, telefono, notas } — envío de producto/PR boxes; pre-llena la dirección de entrega en campañas
updated         date
```

### `app_config`
```sql
key    text PRIMARY KEY    -- 'categories', 'countries', 'next_talent_id'
value  jsonb               -- JSON array or value
```
Categories and countries are stored here and loaded on boot.

### `rosters`
```sql
id              serial PRIMARY KEY
nombre          text NOT NULL
created         timestamp DEFAULT now()
lineas_comunes  jsonb DEFAULT '[]'      -- acciones comunes del roster: [{accion}], se siembran a todos los talentos
mostrar_total   boolean DEFAULT false   -- si true, el summary suma los precios de todas las líneas
moneda          text DEFAULT 'USD'      -- USD | MXN | ARS | EUR (formato de precios del roster)
```

### `rosters_generales`
```sql
id              serial PRIMARY KEY
name            text NOT NULL
description     text DEFAULT ''
filters         jsonb DEFAULT '{}'   -- {categoria, pais, genero, min_seguidores, max_seguidores}
platforms       jsonb DEFAULT '{"tt":true,"ig":true,"yt":true}'
public_token    text UNIQUE
created_at      timestamp DEFAULT now()
```

### `roster_selecciones`
```sql
roster_id          integer REFERENCES rosters(id)
talent_id          integer REFERENCES talentos(id)
link_id            integer DEFAULT 0          -- 0 = token directo, >0 = roster_links.id
selected           boolean DEFAULT false
lineas             jsonb DEFAULT '[]'         -- [{accion, precio}] por talento (reemplaza accion/precio simples)
accion             text DEFAULT ''            -- LEGACY: espejo (líneas unidas) por compatibilidad
precio             numeric                    -- LEGACY: espejo (suma de líneas)
contraoferta       text                       -- guarda el campo "Comentarios" del cliente (UI de contraoferta eliminada)
allow_counteroffer boolean DEFAULT false      -- DEPRECADO: ya no se usa (UI eliminada)
admin_precio       text DEFAULT ''            -- precio interno (solo admin)
admin_notes        text DEFAULT ''            -- notas internas (solo admin)
hidden             boolean DEFAULT false      -- descartado por link
updated_at         timestamptz DEFAULT now()
PRIMARY KEY (roster_id, talent_id, link_id)
```
Historial de precios por creador: se deriva consultando todas las filas de `roster_selecciones`
de un `talent_id`, uniendo en JS con `rosters` (nombre) y `roster_links` (cliente). No hay tabla aparte.

---

## Prospection Tables

### `prospecciones`
```sql
id                    serial PRIMARY KEY
marca                 text NOT NULL
paises                text[] DEFAULT '{}'
plataformas           text[] DEFAULT '{}'        -- ['TikTok','Instagram','YouTube']
contenido             text DEFAULT ''
categorias            text[] DEFAULT '{}'
generos               text[] DEFAULT '{}'
visualizaciones       text DEFAULT ''
seguidores_min        integer DEFAULT 0
seguidores_max        integer DEFAULT 0
cantidad_talentos     integer DEFAULT 0
producto              text DEFAULT ''
fecha                 date
notas                 text DEFAULT ''
email_draft           text DEFAULT ''
estado                text DEFAULT 'activa'      -- activa|pausada|completada|cancelada
tipo                  text DEFAULT 'externa'     -- externa|interna|mixta
secuencia_default_id  integer REFERENCES prospeccion_email_secuencias(id)
created_at            timestamp DEFAULT now()
updated_at            timestamp DEFAULT now()
```

**`tipo`** define el flujo:
- `externa`: contactos vienen de afuera de la base de Talentos (CSV, agregar manual). Al cualificarse → "Pasar a Talentos".
- `interna`: contactos son seleccionados directamente de la base de Talentos via "Sumar Talentos" o desde `index.html` con bulk → "Agregar a prospección". No requiere graduación.
- `mixta`: ambos flujos disponibles en la misma prospección.

### `prospeccion_contactos`
```sql
id                       serial PRIMARY KEY
prospeccion_id           integer REFERENCES prospecciones(id) ON DELETE CASCADE
nombre                   text NOT NULL
paises                   text[] DEFAULT '{}'
ciudad                   text DEFAULT ''
telefono                 text DEFAULT ''
email                    text DEFAULT ''
tiktok                   text DEFAULT ''
instagram                text DEFAULT ''
youtube                  text DEFAULT ''
seguidores               jsonb DEFAULT '{"tiktok":0,"instagram":0,"youtube":0}'
categorias               text[] DEFAULT '{}'
genero                   text DEFAULT ''
keywords                 text DEFAULT ''
foto                     text DEFAULT ''
valores                  text DEFAULT ''
etapa                    text DEFAULT 'evaluacion'  -- evaluacion|contactar|esperando_respuesta|descartado|no_interesado|interesado
medio_contacto           text DEFAULT ''            -- mail|whatsapp|dm
notas                    text DEFAULT ''
talento_id               integer REFERENCES talentos(id)  -- set when graduated OR for "origen=interno"
origen                   text DEFAULT 'externo'     -- externo|interno
precio_cotizado          numeric                    -- cotización recibida (visible al llegar a "Interesado")
precio_cotizado_moneda   text DEFAULT 'USD'
precio_cotizado_notas    text DEFAULT ''
direccion_entrega        jsonb DEFAULT '{}'  -- { destinatario, calle, ciudad, provincia, cp, pais, telefono, notas } — envío de PR boxes/regalos
created_at               timestamp DEFAULT now()
updated_at               timestamp DEFAULT now()
```

**Unique constraint**: `(prospeccion_id, talento_id) WHERE talento_id IS NOT NULL` — un talento no puede estar dos veces en la misma prospección.

**`origen='interno'`** indica que el contacto fue agregado desde la base de Talentos (no requiere graduación, los botones "Pasar a Talentos" se ocultan).

### `prospeccion_historial`
```sql
id                serial PRIMARY KEY
contacto_id       integer REFERENCES prospeccion_contactos(id) ON DELETE CASCADE
etapa_anterior    text NOT NULL
etapa_nueva       text NOT NULL
medio_contacto    text
notas             text DEFAULT ''
created_at        timestamp DEFAULT now()
```

### `prospeccion_email_templates`
```sql
id                serial PRIMARY KEY
nombre            text NOT NULL
asunto            text DEFAULT ''
cuerpo            text NOT NULL
created_at        timestamp DEFAULT now()
```

### `prospeccion_email_secuencias`
Cadenas automatizadas de 1..N templates. Cada paso define qué template usar, cuánto esperar desde el paso anterior, y si respetar días hábiles.
```sql
id           serial PRIMARY KEY
nombre       text NOT NULL
descripcion  text DEFAULT ''
pasos        jsonb DEFAULT '[]'  -- [{step,template_id,delay_horas,dias_habiles},...]
created_at   timestamp DEFAULT now()
updated_at   timestamp DEFAULT now()
```

Ejemplo de `pasos`:
```json
[
  {"step":1,"template_id":12,"delay_horas":0, "dias_habiles":false},
  {"step":2,"template_id":13,"delay_horas":24,"dias_habiles":true},
  {"step":3,"template_id":14,"delay_horas":72,"dias_habiles":true}
]
```

### `prospeccion_email_cola`
Cola de envíos programados. Una fila por (contacto × paso). El scheduled function `process-email-queue` (cada 15 min) procesa filas `status='pendiente'` con `scheduled_at <= now()`.
```sql
id              serial PRIMARY KEY
contacto_id     integer NOT NULL REFERENCES prospeccion_contactos(id) ON DELETE CASCADE
prospeccion_id  integer NOT NULL REFERENCES prospecciones(id) ON DELETE CASCADE
secuencia_id    integer REFERENCES prospeccion_email_secuencias(id)
step            integer NOT NULL
template_id     integer
scheduled_at    timestamp NOT NULL
status          text DEFAULT 'pendiente'  -- pendiente|enviado|cancelado|error
sent_at         timestamp
email_log_id    integer REFERENCES prospeccion_email_log(id)
error           text DEFAULT ''
created_at      timestamp DEFAULT now()
```

**Reglas**:
- Al **iniciar secuencia** (bulk action en kanban), se insertan N filas: paso 1 marcado como `enviado` (envío inmediato), pasos 2..N como `pendiente` con `scheduled_at` calculado.
- Al **salir de `etapa='esperando_respuesta'`** hacia cualquier otra etapa, todas las filas `pendiente` de ese contacto se marcan `cancelado` automáticamente.
- **Forzar siguiente envío**: el botón en el modal de detalle del contacto pone `scheduled_at = now()` y dispara el procesador.

### `prospeccion_email_log`
Registro de cada intento de envío SMTP (definido en `sql/add_email_log_2026_05_05.sql`):
```sql
id              serial PRIMARY KEY
contacto_id     integer REFERENCES prospeccion_contactos(id)
prospeccion_id  integer REFERENCES prospecciones(id)
email_to        text NOT NULL
asunto          text
cuerpo          text
status          text  -- sent|rejected|failed
message_id      text
smtp_response   text
error           text
template_id     integer
created_at      timestamp DEFAULT now()
```

---

## Campaign Tables

### `clientes`
```sql
id      serial PRIMARY KEY
nombre  text NOT NULL UNIQUE
```

### `marcas`
```sql
id          serial PRIMARY KEY
nombre      text NOT NULL
cliente_id  integer REFERENCES clientes(id)
logo_url    text
```

### `campanas`
```sql
id                  serial PRIMARY KEY
nombre              text NOT NULL
marca_id            integer REFERENCES marcas(id)
estado              text DEFAULT 'sin_iniciar'  -- sin_iniciar|en_curso|etapa_finanzas|finalizada|cancelada
descripcion         text
fecha_inicio        date
fecha_fin           date
metodo_pago_marca   text
pais_facturacion    text
requiere_factura    text DEFAULT 'no'  -- no|si|solo_invoice
notas_finanzas      text
created_at          timestamp DEFAULT now()
updated_at          timestamp DEFAULT now()  -- bumpeado por trigger trg_campanas_touch
updated_by          uuid REFERENCES auth.users(id)  -- seteado por la app en cada UPDATE
```

Triggers: `trg_campanas_touch` actualiza `updated_at` en cada UPDATE. La app setea `updated_by = currentUser.id`.

### `campana_talentos`
```sql
id                      serial PRIMARY KEY
campana_id              integer REFERENCES campanas(id)
talent_id               integer REFERENCES talentos(id)
fee_marca               numeric
fee_talento             numeric
moneda                  text DEFAULT 'USD'
metodo_pago             text
pago_estado             text DEFAULT 'pendiente'  -- pendiente|pagado
pago_fecha              date
producto_estado         text DEFAULT 'no_aplica'  -- no_aplica|en_espera|recibido|con_inconvenientes
producto_paqueteria     text
producto_tracking       text
producto_notas          text
producto_direccion      jsonb DEFAULT '{}'  -- { destinatario, calle, ciudad, provincia, cp, pais, telefono, notas } — dirección de entrega por campaña, pre-llenada del contacto pero editable
derechos_imagen_dias    integer
derechos_imagen_valor   numeric
derechos_imagen_desde   date
created_at              timestamp DEFAULT now()
```

### `contenidos`
```sql
id                      serial PRIMARY KEY
campana_talento_id      integer REFERENCES campana_talentos(id)
tipo                    text  -- tiktok_video|reel|ig_story|youtube_video|youtube_short
titulo                  text
paso_actual             integer DEFAULT 1  -- 1 through 9
fecha_publicacion       date
url_publicacion         text
script_requerido        boolean DEFAULT true
estadisticas_requeridas boolean DEFAULT true
spark_code_dias         integer
spark_code_valor        numeric
spark_code_desde        date
spark_code_texto        text DEFAULT ''
pauta_dias              integer
pauta_valor             numeric
pauta_desde             date
created_at              timestamp DEFAULT now()
```

### `contenido_scripts`
```sql
id              serial PRIMARY KEY
contenido_id    integer REFERENCES contenidos(id)
url_archivo     text
version         integer DEFAULT 1
subido_por      uuid
created_at      timestamp DEFAULT now()
```

### `contenido_borradores`
```sql
id              serial PRIMARY KEY
contenido_id    integer REFERENCES contenidos(id)
url_archivo     text
nombre_archivo  text
size_bytes      bigint
version         integer DEFAULT 1
subido_por      uuid
created_at      timestamp DEFAULT now()
```

### `contenido_observaciones`
```sql
id              serial PRIMARY KEY
contenido_id    integer REFERENCES contenidos(id)
paso            integer
tipo            text           -- script|borrador
observacion     text
autor_id        uuid
autor_nombre    text
created_at      timestamp DEFAULT now()
```

### `contenido_historial`
```sql
id              serial PRIMARY KEY
contenido_id    integer REFERENCES contenidos(id)
paso_anterior   integer
paso_nuevo      integer
accion          text
autor_id        uuid
autor_nombre    text
created_at      timestamp DEFAULT now()
```

### `contenido_estadisticas`
```sql
id              serial PRIMARY KEY
contenido_id    integer REFERENCES contenidos(id)
periodo         text DEFAULT '7d'
url_screenshot  text
subido_por      uuid
created_at      timestamp DEFAULT now()
```

### `campana_briefs`
```sql
id              serial PRIMARY KEY
campana_id      integer REFERENCES campanas(id)
nombre          text
url             text
size_bytes      bigint
uploaded_by     uuid
created_at      timestamp DEFAULT now()
```

### `campana_mensajes`
```sql
id              serial PRIMARY KEY
campana_id      integer REFERENCES campanas(id)
autor_id        uuid
autor_nombre    text
mensaje         text
created_at      timestamp DEFAULT now()
```

### `campana_managers` / `campana_handlers`
```sql
campana_id  integer REFERENCES campanas(id)
user_id     uuid REFERENCES user_profiles(id)
```

### `user_profiles`
```sql
id          uuid PRIMARY KEY  -- matches auth.users.id
nombre      text
email       text
role        text  -- admin|campaign_manager|brand_handler|talent|contador
telefono    text
talent_id   integer REFERENCES talentos(id)  -- only for role=talent
activo      boolean DEFAULT true
```

**Rol `contador`** (`sql/rol_contador_2026_08_11.sql`): trabaja SOLO el módulo
Finanzas. Helper `is_contador()` (SECURITY DEFINER). Policies: CRUD en
`facturas`, `pagos_marca`, `complementos_pago`, `pagos_talento`,
`factura_talentos`, `facturas_auditoria`, `terceros`, `comisiones_terceros`,
`pagos_tercero`, `clientes`; SELECT en `campanas`, `campana_talentos`, `marcas`,
`talentos`, `talento_cuentas_pago`; UPDATE en `campanas` (finalizar) y
`campana_talentos` (pago_estado/fecha/invoice_url). Solo el admin general puede
crear/editar/borrar contadores (trigger `enforce_admin_role_grant` extendido +
policy `user_profiles_delete`). Todas las páginas salvo finanzas.html lo
redirigen a finanzas.html; allí se le oculta la nav al resto de módulos.

---

## Database Functions (RPC)

### `avanzar_paso_contenido(p_contenido_id, p_autor_id, p_autor_nombre, p_accion)`
Advances `paso_actual` by 1 on the given contenido, inserts into `contenido_historial`, returns new paso.

### `rechazar_contenido(p_contenido_id, p_autor_id, p_autor_nombre, p_observacion)`
Steps back: paso 3→2, paso 5→4. Inserts observation and historial entry.

---

## Storage Buckets

| Bucket | Public | Used For |
|--------|--------|----------|
| `campaign-briefs` | true | Campaign brief PDFs/docs |
| `content-scripts` | true | Script files per contenido |
| `content-drafts` | true | Video/image drafts |
| `content-stats` | true | Statistics screenshots |
| `brand-logos` | true | Brand logo images |
| `contratos` | true | External contract PDFs + talent signature images (`firmas/contrato-<id>/`) |
| `finanzas` | true | Invoices, payment receipts, CFDI complements + talent-generated invoices (`campana-<id>/invoice-talento-<talId>/`) |

---

## Contract Tables

### `contratos`
```sql
id                  serial PRIMARY KEY
campana_id          integer REFERENCES campanas(id)
campana_talento_id  integer REFERENCES campana_talentos(id)
tipo                text NOT NULL DEFAULT 'marca'        -- 'marca' (Marca↔Agencia) | 'talento' (Agencia↔Talento)
idioma              text NOT NULL DEFAULT 'es'           -- 'es' | 'en'
numero_contrato     text NOT NULL DEFAULT ''             -- auto-generated: MMYYNN
estado              text NOT NULL DEFAULT 'borrador'     -- borrador | enviado | firmado | cancelado
parte_a_nombre      text DEFAULT ''
parte_a_rfc         text DEFAULT ''
parte_a_domicilio   text DEFAULT ''
parte_b_nombre      text DEFAULT ''
parte_b_rfc         text DEFAULT ''
parte_b_domicilio   text DEFAULT ''
influencer_nombre   text DEFAULT ''
servicios           text DEFAULT ''                      -- "1 reel + 1 historia"
canales             text DEFAULT ''                      -- "Instagram, TikTok"
hashtags            text DEFAULT 'A Definir en Brief'
marca_producto      text DEFAULT ''
tarifa_tipo         text DEFAULT 'pago'                  -- 'pago' | 'canje' | 'mixto'
monto               numeric DEFAULT 0
moneda              text DEFAULT 'MXN'
monto_texto         text DEFAULT ''                      -- amount in words
metodo_pago         text DEFAULT ''
plazo_pago_dias     integer DEFAULT 45
comentarios         text DEFAULT ''
derechos_imagen     boolean DEFAULT false
derechos_dias       integer
derechos_valor      numeric
derechos_desde      date
fecha_contrato      date DEFAULT CURRENT_DATE
ciudad_contrato     text DEFAULT 'Mexico City'
contenido_html      text DEFAULT ''                      -- AI-generated contract HTML
archivo_url         text DEFAULT ''                      -- external PDF attached (es_externo)
archivo_nombre      text DEFAULT ''
es_externo          boolean DEFAULT false
firma_url           text DEFAULT ''                      -- talent signature image (canvas → bucket contratos) [sql/contrato_firma_2026_06_25.sql]
firmante_nombre     text DEFAULT ''                      -- full name the talent signed with
firmado_at          timestamptz                          -- when the talent signed
firma_ip            text DEFAULT ''                      -- signing IP (light audit)
created_by          uuid
created_at          timestamp DEFAULT now()
updated_at          timestamp DEFAULT now()
```

Contract types are "mirror" contracts:
- **marca**: Party A = Brand, Party B = BEME AGENCY. Amount = fee_marca.
- **talento**: Party A = BEME AGENCY, Party B = Influencer. Amount = fee_talento.

**Talent signing (no-login):** when a `tipo='talento'` contract is set to `estado='enviado'`, it appears in the talent's magic link (`talento-link.html`). The talent draws their signature on a canvas; `magic-api` action `sign-contract` uploads the PNG to the `contratos` bucket and sets `estado='firmado'` + the `firma_*` fields. The signed signature shows in both `talento-link.html` and the `contratos.html` preview.

---

## Talent Payment & Invoicing (no-login, via magic link)

### `talento_cuentas_pago` — reusable payment accounts per talent
`[sql/talento_cuentas_pago_2026_06_25.sql]`
```sql
id              serial PRIMARY KEY
talent_id       integer NOT NULL REFERENCES talentos(id) ON DELETE CASCADE
pais            text DEFAULT ''     -- mexico|colombia|argentina|brasil|usa|espana|italia|holanda|alemania
nombre_completo text DEFAULT ''     -- account holder full name (common to all countries)
banco           text DEFAULT ''
datos_cuenta    jsonb DEFAULT '{}'  -- country-specific bank fields (clabe / cbu / iban+bic / routing+account / tipo_cuenta / documento ...)
direccion       jsonb DEFAULT '{}'  -- country-specific address fields (calle/num_ext/num_int/estado/ciudad/cp ...)
moneda          text DEFAULT ''
alias           text DEFAULT ''
es_default      boolean DEFAULT false
created_at/updated_at timestamptz
```
- The country→fields mapping lives in `talento-link.html` (`COUNTRY_PAY`). The talent edits these via `magic-api` (`save-cuenta`/`delete-cuenta`/`set-default-cuenta`, service_role → no RLS). Internal team reads them (RLS `is_internal()`); `finanzas.html` shows them per CxP row (💳 button → `verDatosPago`).

### `campana_talentos` — talent invoice (CxP) columns
`invoice_url` (existing, `sql/fase3_finanzas_2026_06_19.sql`) is the talent's invoice for Cuentas por Pagar. Added `[sql/factura_talento_2026_06_25.sql]`:
```sql
factura_datos  jsonb DEFAULT '{}'  -- when invoice is generated in-app (name/razón social, dirección, account snapshot, monto, moneda, número, fecha)
factura_tipo   text  DEFAULT ''    -- 'subida' (talent uploaded a file) | 'generada' (PDF built in-app)
```
- The talent can invoice **only when all their contenidos are at `paso_actual >= 7`** (constant `INVOICE_MIN_PASO` in `magic-api.js`, also enforced server-side). Both paths (upload file / generate PDF with jsPDF) write `invoice_url` via `magic-api` (`invoice-signed-upload` + `set-invoice`/`create-invoice`) and surface automatically in `finanzas.html` CxP.

### `talentos.idioma`
`[sql/talentos_idioma_2026_06_25.sql]` — `text DEFAULT 'es'` (`es|en|it|de|nl`). Set by the team in the talent form (`index.html`/`dashboard.js`); drives the language of `talento-link.html` (the talent can also switch it; persisted in `localStorage`).

---

## Budget Proposal Tables

### `presupuestos`
```sql
id                 serial PRIMARY KEY
numero_presupuesto text NOT NULL DEFAULT ''       -- auto-generated: P-MMYYNN
estado             text NOT NULL DEFAULT 'borrador' -- borrador|enviado|aceptado|rechazado|vencido
marca_nombre       text NOT NULL DEFAULT ''
marca_contacto     text DEFAULT ''
marca_email        text DEFAULT ''
marca_telefono     text DEFAULT ''
titulo             text DEFAULT ''
producto           text DEFAULT ''
descripcion        text DEFAULT ''
notas              text DEFAULT ''
moneda             text DEFAULT 'MXN'
validez_dias       integer DEFAULT 15             -- default 15-day validity clause
fecha              date DEFAULT CURRENT_DATE
ciudad             text DEFAULT 'Mexico City'
created_by         uuid
created_at         timestamp DEFAULT now()
updated_at         timestamp DEFAULT now()
```

### `presupuesto_items`
```sql
id              serial PRIMARY KEY
presupuesto_id  integer REFERENCES presupuestos(id) ON DELETE CASCADE
talento_id      integer REFERENCES talentos(id)
talento_nombre  text NOT NULL DEFAULT ''          -- snapshot (survives talent delete)
talento_foto    text DEFAULT ''
contenido       text DEFAULT ''                   -- "1 Reel + 2 Historias IG"
precio          numeric DEFAULT 0
orden           integer DEFAULT 0
created_at      timestamp DEFAULT now()
```

Triggers: `trg_presupuesto_number` auto-fills `numero_presupuesto` as `P-MMYYNN`. `trg_presupuesto_touch` bumps `updated_at` on UPDATE.

---

## RLS Policies Required

```sql
-- All tables: authenticated users can read/write
CREATE POLICY "auth_all" ON <table> FOR ALL 
  USING (auth.uid() IS NOT NULL) 
  WITH CHECK (auth.uid() IS NOT NULL);

-- Apply to: talentos, app_config, rosters, roster_selecciones,
--   clientes, marcas, campanas, campana_talentos, contenidos,
--   contenido_scripts, contenido_borradores, contenido_observaciones,
--   contenido_historial, contenido_estadisticas, campana_briefs,
--   campana_mensajes, campana_managers, campana_handlers, user_profiles,
--   contratos, presupuestos, presupuesto_items

-- Storage: each bucket needs
CREATE POLICY "auth_all_<bucket>" ON storage.objects 
  FOR ALL USING (bucket_id = '<bucket>' AND auth.uid() IS NOT NULL);

-- user_profiles also needs INSERT for self-registration
CREATE POLICY "user_inserts_own_profile" ON user_profiles 
  FOR INSERT WITH CHECK (id = auth.uid());
```

---

## Category System

14 unified categories stored in `app_config` key='categories':
```
Profesional, Familia, Deporte, Entretenimiento, Gaming, Belleza, 
Moda, Gastronomia, Hogar, Aventura, Creatividad/Arte, Contenido, 
Tecnologia, Musica
```

Each talento has `categorias text[]` (the unified categories) and `keywords text` (the original subcategories like "comedia, streamer, gaming").

---

## Terceros y Comisiones (sql/terceros_comisiones_2026_06_20.sql)

Un tercer monto además de `fee_marca` (CxC) y `fee_talento` (CxP): comisiones que se pagan
a una persona externa. Se muestran en Finanzas → CxP como entradas a pagar.

- **`terceros`** — catálogo de personas: `id, nombre, rol, email, telefono, notas, activo`.
  CRUD desde Finanzas (sub-tab Terceros) y Campañas (botón Terceros).
- **`comisiones_terceros`** — comisión asignada a una campaña o a un talento:
  `tercero_id, campana_id, campana_talento_id (null = nivel campaña), tipo ('porcentaje'|'fijo'),
  valor, moneda, monto_calculado, pago_estado, pago_fecha`.
  - Nivel **talento** (`campana_talento_id` set): % sobre el `fee_marca` de ese talento.
  - Nivel **campaña** (`campana_talento_id` null): % sobre la SUMA de `fee_marca` de los
    talentos no cancelados.
  - `monto_calculado` lo computa el trigger `trg_comision_calc`; se recalcula si cambia el
    `fee_marca` de un talento (`trg_ct_recalc_comisiones`).
  - Se asigna desde campana-detalle.html (en cada talento + panel de campaña en el sidebar).
- **`pagos_tercero`** — pagos (parciales) de cada comisión, igual que `pagos_talento`:
  `comision_id, monto, moneda, fecha_pago, corredor, comprobante_url, notas`.
  El trigger `trg_pagos_tercero_sync` sincroniza `comisiones_terceros.pago_estado`
  (pendiente/parcial/pagado).

RLS: las 3 tablas son solo para equipo interno vía `is_internal()`.

## Facturas multi-talento (sql/factura_talentos_2026_06_24.sql)

Antes una factura (CxC) se enlazaba a **un** talento vía el string `facturas.orden_compra =
campana_talentos.identificador`. Ahora una factura puede **agrupar varios talentos de la MISMA
campaña** (monto = suma de `fee_marca`, editable).

- **`factura_talentos`** — tabla de enlace factura ↔ talentos de campaña que cubre:
  `id, factura_id (FK facturas ON DELETE CASCADE), campana_talento_id (FK campana_talentos
  ON DELETE CASCADE), created_at`. `UNIQUE (factura_id, campana_talento_id)`.
  - Es la **fuente de verdad** de qué talento(s) cubre la factura. Finanzas → CxC se renderiza por
    campaña en dos secciones: **Facturas** (una fila por factura, con su QB Fact/QB Cobro/cobro/envío;
    un talento puede tener VARIAS — facturación parcial) y **Por facturar** (talentos con saldo sin
    facturar, total o parcial, con "+ Factura"; el checkbox agrupa varios en una factura conjunta).
  - El modal de factura usa un **checklist** de talentos de la campaña; al marcar varios, el monto
    auto-suma su `fee_marca` (editable) y el Folio/OC se autoasigna con los identificadores.
  - `facturas.orden_compra` se mantiene como referencia legible (no se borra).
  - **Backfill** idempotente: enlaza facturas existentes a su talento por `orden_compra` (o
    `numero_factura`) que matchee `campana_talentos.identificador` en la misma campaña.

La misma migración agrega a **`facturas`**:
- `qb_factura`, `qb_cobro` (boolean) — registro en QuickBooks **por cada factura** (no por campaña).
  En CxC cada fila de sub-campaña muestra las casillas de su factura.
- `plataforma_envio` (text: `mail|chat|plataforma`) — cómo se envió la factura al cliente.
- El trigger `trg_factura_vencimiento` ahora calcula `fecha_vencimiento` desde
  **`COALESCE(fecha_envio, fecha_emision) + dias_credito`** — los días de crédito cuentan desde que
  el cliente **recibe** la factura (envío), no desde la emisión/carga.

RLS: admin-only vía `is_admin()`, igual que `facturas` / `pagos_marca`.
