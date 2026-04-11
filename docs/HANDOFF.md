# BEME Handoff — Feature Status

## ✅ COMPLETED

### Dashboard de Talentos
- [x] CRUD talentos (crear, editar, eliminar)
- [x] Grid view + List view
- [x] Filtros por país, categoría, red social, roster, búsqueda
- [x] CSV import/export
- [x] Scraping TikTok/Instagram via Apify
- [x] Gestión de categorías (14 categorías unificadas + keywords)
- [x] Gestión de países
- [x] Rosters (crear, agregar/quitar talentos)
- [x] URL normalization (TikTok, Instagram, YouTube)
- [x] Loading overlay con safety timeout (12s)
- [x] Escape key para modals
- [x] Confirmación antes de borrar
- [x] Género y Keywords por talento
- [x] Persistencia de categorías a app_config en saveTalent

### Campañas
- [x] CRUD campañas (crear, editar)
- [x] Vista grid, lista, kanban por estado
- [x] Asignar managers y handlers (chips con iniciales reales + tooltip)
- [x] Gestión de usuarios (crear con signUp + session save/restore)
- [x] Sección finanzas (solo admin): método pago, facturación
- [x] Safety timeout en loading overlay

### Detalle de Campaña
- [x] Workflow completo de 9 pasos
- [x] Upload briefs (campaña-level), scripts, borradores, estadísticas
- [x] Botones de archivo en cada paso (Ver Brief, Ver Script, Ver Borrador, Ver Link)
- [x] Botón "← Volver al paso anterior" (admin, con confirmación + historial)
- [x] Spark Code con campo de texto monospace + copiar
- [x] Timeline/Historial visual (collapsible, dots verdes/rojos)
- [x] Observaciones (aprobar/rechazar con comentario)
- [x] Chat interno (Supabase Realtime)
- [x] Fees por talento (marca/talento/ganancia)
- [x] Derechos de imagen (días, valor, desde)
- [x] Producto (estado, paquetería, tracking)
- [x] Pago (pendiente/pagado)
- [x] Acordeón se mantiene abierto al hacer acciones
- [x] Replace script/draft files

### Portal del Talento
- [x] Login separado (valida role=talent + talent_id)
- [x] Lista de campañas asignadas
- [x] Brief de campaña visible
- [x] Workflow con pasos y archivos
- [x] Subir script (paso 2), borrador (paso 4), link (paso 6)
- [x] Estados de espera (paso 3, 5)
- [x] Observaciones del equipo
- [x] Spark Code field
- [x] Timeline historial
- [x] NO muestra fees/finanzas/chat/admin

---

## ❌ PENDING (by priority)

### 1. Alertas Automáticas
- Vencimiento de Spark Code (X días antes)
- Vencimiento de derechos de imagen
- Vencimiento de pautas
- Notificaciones cuando un paso cambia
- Possibly Web Push via VAPID (keys not yet configured)

### 2. Duplicar Campaña (Plantillas)
- Botón "Duplicar" en campaña existente
- Copia configuración, talentos, contenidos (sin archivos)
- Opción de crear como plantilla reutilizable

### 3. Sección Finanzas Global
- Resumen cross-campañas: total cobrado a marcas, total pagado a talentos, ganancia
- Filtros por mes, cliente, marca
- Exportar a CSV/PDF

### 4. Dirección de Envío en Talento
- Campo adicional en tabla `talentos` para dirección de envío de producto
- Visible en campana-detalle cuando producto_estado != 'no_aplica'

### 5. Exportar Campaña a PDF
- Resumen de campaña con talentos, contenidos, estados, fees
- Timeline de workflow
- Usar jsPDF o similar

### 6. Brief por Contenido
- `campana_briefs` es campaign-level actualmente
- `contenido_briefs` table exists but not wired
- Allow per-content brief in addition to campaign brief

### 7. Categorías desde el Panel
- BUG: Las categorías se perdían al refrescar
- FIX APLICADO: saveTalent() ahora persiste nuevas categorías
- REQUIERE: RLS policy en app_config (ver DATABASE.md)
- VERIFICAR que funcione post-deploy

---

## Known Issues / Tech Debt

1. **app_config RLS** — Si las categorías no se guardan, falta el policy:
   ```sql
   CREATE POLICY "auth_all_app_config" ON app_config 
     FOR ALL USING (auth.uid() IS NOT NULL) 
     WITH CHECK (auth.uid() IS NOT NULL);
   ```

2. **dashboard.js es muy grande** (~4100 líneas) — Podría dividirse en módulos pero funciona como está.

3. **File access buttons** solo aparecen si hay archivos en DB — Si los pasos se avanzaron manualmente sin subir archivos, no hay botones que mostrar.

4. **campanas.html: fee_agencia/moneda_agencia** — Estas columnas fueron removidas del schema. El JS fue limpiado de referencias, pero si aparece un error similar a `Cannot set properties of null`, buscar getElementById de campos que no existen en el HTML.

5. **Scraper Apify** — Requiere API key en Netlify environment variables (`APIFY_TOKEN`).

6. **Email confirmation** — Si está habilitado en Supabase Auth settings, los usuarios nuevos necesitan confirmar email antes de ingresar. Para desarrollo, desactivar en Supabase → Auth → Providers → Email → "Confirm email".
