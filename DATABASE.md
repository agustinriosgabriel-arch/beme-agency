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
id      serial PRIMARY KEY
nombre  text NOT NULL
created timestamp DEFAULT now()
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
roster_id   integer REFERENCES rosters(id)
talent_id   integer REFERENCES talentos(id)
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
```

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
role        text  -- admin|campaign_manager|brand_handler|talent
telefono    text
talent_id   integer REFERENCES talentos(id)  -- only for role=talent
activo      boolean DEFAULT true
```

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
--   campana_mensajes, campana_managers, campana_handlers, user_profiles

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
