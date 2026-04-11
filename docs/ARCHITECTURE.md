# BEME Architecture

## Page Map

```
┌─────────────────────────────────────────────────────────┐
│                    ADMIN PAGES                          │
│                                                         │
│  index.html ──→ Dashboard Talentos (+ dashboard.js)     │
│       │         Grid/List view, CRUD, CSV import,       │
│       │         Scraping, Rosters, Categories            │
│       │                                                  │
│       ├──→ campanas.html ──→ Campaign List               │
│       │    Grid/List/Kanban, CRUD campañas,              │
│       │    User management, Alertas                      │
│       │         │                                        │
│       │         └──→ campana-detalle.html?id=X           │
│       │              9-step workflow, files,              │
│       │              chat, finanzas, equipo               │
│       │                                                  │
│       └──→ roster.html?id=X ──→ Public Roster View       │
│                                                          │
├──────────────────────────────────────────────────────────┤
│                   TALENT PAGE                            │
│                                                          │
│  talento-portal.html ──→ Talent Portal                   │
│       Own login, sees only their campaigns,              │
│       can upload scripts/drafts/links                    │
└──────────────────────────────────────────────────────────┘
```

## Auth Flow

```
User visits page
     │
     ├── Has session? ──→ Yes ──→ Load profile from user_profiles
     │                              │
     │                              ├── role=admin/campaign_manager ──→ Full access
     │                              ├── role=brand_handler ──→ Approve/reject access
     │                              └── role=talent ──→ Redirect to talento-portal
     │
     └── No session ──→ Show login form
                          │
                          └── signInWithPassword() ──→ Load profile ──→ Route by role
```

## Campaign Workflow (9 Steps)

```
Step 1: Esperando Brief         ──→ Admin uploads brief files
Step 2: Esperando Script        ──→ Talent uploads script  
Step 3: Aprobación Script       ──→ Admin/Handler approves or rejects (→ step 2)
Step 4: Producción              ──→ Talent uploads video/image draft
Step 5: Aprobación Contenido    ──→ Admin/Handler approves or rejects (→ step 4)
Step 6: Publicar                ──→ Talent pastes publication URL
Step 7: Estadísticas            ──→ Admin uploads stats screenshots
Step 8: Completado              ──→ Pending payment
Step 9: Pagado                  ──→ Done
```

Admin can go back to previous step at any time via `retrocederPaso()`.

Steps 2/3 are skipped if `script_requerido = false`.
Step 7 is skipped if `estadisticas_requeridas = false`.

## Data Flow

```
Frontend (HTML/JS)
     │
     ├── sb.from('table').select/insert/update/delete
     │   (Supabase JS client, anon key, RLS-filtered)
     │
     ├── sb.storage.from('bucket').upload/getPublicUrl
     │   (Files stored in Supabase Storage)
     │
     ├── sb.rpc('avanzar_paso_contenido', {...})
     │   (Database function for step advancement)
     │
     └── sb.channel('chat-X').subscribe()
         (Realtime for chat messages)
```

## Netlify Functions

### `apify-scraper.js`
- Called from dashboard.js to scrape TikTok/Instagram profiles
- Uses Apify actors: `clockworks~tiktok-scraper`, `clockworks~tiktok-sound-scraper`
- Returns follower count, profile photo, etc.

### `fetch-profile-photo.js`
- Fetches profile photos from social media URLs
- Used during talent creation/editing

## Key JS Patterns

### State Management (dashboard.js)
```js
let talents = [];        // Main talent array
let CATEGORIES = [];     // Loaded from app_config
let COUNTRIES = [];      // Loaded from app_config
let selectedIds = new Set(); // Selected talent IDs
let editingId = null;    // Currently editing talent
```

### Accordion Preservation
```js
// Before re-render:
const openIds = [];
container.querySelectorAll('.open').forEach(el => { if(el.id) openIds.push(el.id); });
// After re-render:
openIds.forEach(id => { const el = document.getElementById(id); if(el) el.classList.add('open'); });
```

### Safe URL Rendering
```js
const safeUrl = (url) => { 
  if(!url) return '#'; 
  if(url.startsWith('http')) return escapeHtml(url); 
  return escapeHtml('https://'+url); 
};
```

## CSS Theme System
All pages use CSS variables with dark mode support:
```css
:root { --bg:#f7f7fa; --surface:#fff; --primary:#b2005d; ... }
body.dark { --bg:#0f0f0f; --surface:#181818; ... }
```
Theme is toggled with `toggleTheme()` and persisted in `localStorage('beme_theme')`.
