# BEME Agency Platform

Plataforma de gestión de talentos e influencers para agencia de marketing.

## Módulos

### 1. Dashboard de Talentos (`index.html` + `dashboard.js`)
- CRUD de talentos con grid/list view
- Filtros por país, categoría, red social, roster
- Scraping de TikTok/Instagram vía Apify
- Import/Export CSV
- Gestión de categorías y países (persisten en `app_config`)
- Rosters (agrupaciones de talentos)
- URL normalization automática (TikTok, Instagram, YouTube)

### 2. Campañas (`campanas.html`)
- Crear/editar campañas con marca, cliente, fechas
- Vista grid, lista, kanban por estado
- Asignar managers y handlers
- Gestión de usuarios (crear con `signUp` + profile)
- Sección finanzas (solo admin)

### 3. Detalle de Campaña (`campana-detalle.html`)
- Workflow de 9 pasos por contenido:
  1. Esperando Brief
  2. Esperando Script
  3. Aprobación Script
  4. Producción (borrador)
  5. Aprobación Contenido
  6. Publicar (cargar link)
  7. Estadísticas
  8. Completado / Pendiente pago
  9. Pagado
- Upload de briefs, scripts, borradores, estadísticas
- Botones de archivo en cada paso (Ver Brief, Ver Script, Ver Borrador, Ver Link)
- Botón "← Volver al paso anterior" (admin)
- Spark Code con campo de texto editable
- Timeline/Historial visual del workflow
- Chat interno por campaña
- Fees por talento (marca/talento/ganancia agencia)
- Derechos de imagen, producto, pago

### 4. Portal del Talento (`talento-portal.html`)
- Login separado (valida role=talent + talent_id)
- Lista de campañas asignadas al talento
- Workflow view con acciones: subir script, subir borrador, cargar link
- Estados de espera para aprobación
- Observaciones del equipo
- Spark Code field
- Timeline de historial
- NO muestra: fees, finanzas, chat, otros talentos, admin buttons

### 5. Roster Público (`roster.html`)
- Vista pública de un roster (selección de talentos)

## Deploy
```bash
# Netlify CLI
netlify deploy --prod --dir=.
```

## Supabase
- URL: `https://ngstqwbzvnpggpklifat.supabase.co`
- Dashboard: Supabase Studio → SQL Editor para queries directas
