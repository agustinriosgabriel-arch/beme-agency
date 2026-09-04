# BEME Agency — Instructions for Claude Code

## Project Overview
BEME is a talent marketing and influencer agency platform. It manages talent databases, campaign workflows (9-step content production), and a talent-facing portal.

## Tech Stack
- **Frontend:** Vanilla HTML + CSS + JavaScript (NO framework, NO build step)
- **Backend:** Supabase (Auth + Postgres DB + Storage + Realtime)
- **Deploy:** Netlify at https://bemeagency.netlify.app
- **Supabase:** https://ngstqwbzvnpggpklifat.supabase.co
- **Supabase Anon Key:** `sb_publishable_1E2K-9D-KzOSVCgROnfa-g_-WCnWCDb`

## File Structure
```
beme_v10/
├── index.html              → Talent dashboard (list/grid/manage talents)
├── dashboard.js            → All JS logic for index.html (~4100 lines)
├── roster.html             → Public roster view
├── roster-general.html     → General public roster with filters
├── campanas.html           → Campaign management panel (list/grid/kanban)
├── campana-detalle.html    → Single campaign detail + 9-step workflow
├── contratos.html          → Contract management (generate/translate/customize)
├── presupuestos.html       → Budget proposal generator (talents + content + price, 15-day validity)
├── prospecciones.html      → Brand prospection listing
├── prospeccion-detalle.html→ Prospection detail with kanban pipeline
├── talento-portal.html     → Talent-facing portal (separate login)
├── artes-campana.html      → Auto-generates social art from a real campaign (?id=)
├── templates-instagram.html→ Instagram template library (manual editing / Canva export)
├── artes-engine.js         → Shared art engine: design system CSS + 14 templates + PNG/ZIP export
├── artes-logos.js          → Beme logos as base64 (needed for the SVG-based PNG export)
├── CLAUDE.md               → This file (project instructions)
├── netlify.toml            → Netlify config
├── docs/                   → Project documentation
│   ├── DATABASE.md         → Full Supabase schema reference
│   ├── ARCHITECTURE.md     → System architecture
│   ├── DEPLOYMENT.md       → Deploy instructions
│   ├── HANDOFF.md          → Handoff notes
│   └── README.md           → Project readme
├── sql/                    → Database migration scripts
│   ├── contratos.sql       → Contratos table + RLS + triggers
│   └── presupuestos.sql    → Presupuestos + presupuesto_items tables + RLS + triggers
├── agents/                 → AI agents and skills (by module)
│   └── contratos/          → Contract agent config
├── assets/brand/           → Brand assets
│   ├── Manual-Beme.pdf     → Official identity manual (source of truth)
│   ├── logos/              → Allowed logo versions
│   └── fonts/              → Just Sans goes here; Plus Jakarta Sans is the fallback
└── netlify/functions/      → Serverless functions
    ├── apify-scraper.js    → TikTok/IG scraping via Apify
    ├── contract-agent.js   → Contract generation + AI customization
    ├── artes-agent.js      → Copywriting agent for campaign social art (Claude)
    └── fetch-profile-photo.js → Profile photo fetcher
```

## Critical Rules

### 1. Single-file pages
Each HTML page is self-contained (CSS + HTML + JS in one file), EXCEPT index.html which loads dashboard.js externally, and the two art pages (`templates-instagram.html`, `artes-campana.html`) which share `artes-engine.js` + `artes-logos.js` because both render the same templates. Do NOT split anything else or add build tools.

### 2. Supabase client
Every page creates its own Supabase client with the same URL/Key:
```js
const SB_URL = 'https://ngstqwbzvnpggpklifat.supabase.co';
const SB_KEY = 'sb_publishable_1E2K-9D-KzOSVCgROnfa-g_-WCnWCDb';
const sb = supabase.createClient(SB_URL, SB_KEY);
```

### 3. No admin API
The frontend uses the anon/publishable key. `sb.auth.admin.*` does NOT work. User creation uses `sb.auth.signUp()` + session save/restore.

### 4. RLS is on everywhere
All tables have Row Level Security enabled. If a query returns empty when data exists, it's almost certainly a missing RLS policy. Check docs/DATABASE.md.

### 5. Storage buckets
Buckets must exist AND be `public: true` for file URLs to work. Current buckets: `campaign-briefs`, `content-scripts`, `content-drafts`, `content-stats`, `brand-logos`.

### 6. Accordion state preservation
When re-rendering talento cards or contenido cards after an action (upload, step change, etc.), always save `.open` class state BEFORE innerHTML replace and restore AFTER. This is implemented in `renderTalentos()` and `renderAll()` in campana-detalle.html.

### 7. URL normalization
All social media URLs must have `https://`. Use `normalizeSocialUrl(raw, platform)` in dashboard.js. The `safeUrl()` function in render functions auto-adds `https://` for display.

### 8. Categories persist to app_config
When saving a talent with new categories, they must be pushed to `CATEGORIES[]` and then `saveData()` called to persist to `app_config` table in Supabase.

### 9. Social art system (artes-engine.js)
- Artboards are authored at **real Instagram pixels** (1080×1350 / 1080×1080 / 1080×1920). On screen they are shown with a CSS `transform: scale()`; `BemeArtes.toPng()` removes it before rendering so the export is always 1080 px wide.
- PNG export uses **html-to-image**, not html2canvas: the templates rely on `-webkit-text-stroke` and `background-clip: text`, which html2canvas does not render.
- Because that export renders through an SVG `foreignObject`, **every image must be a data URL**. External URLs are blocked inside the SVG. `artes-campana.html` downloads talent photos and brand logos and converts them before rendering; the logos ship base64 in `artes-logos.js`.
- Engine CSS is scoped under `.a` so it never leaks into the host page. Do not add unscoped selectors there.
- Display headlines that carry hand-placed `<br>` get the `fit` class; `BemeArtes.ajustar(el)` shrinks them after insertion so a long word never breaks mid-word. It must run with the artboard already in the DOM.
- Visual language follows what @beme.agency actually publishes: white/pastel base with lots of air, a small `BEME AGENCY` wordmark top-left plus the isotype top-right, phone mockups holding the creator's reel, packshots on white. Magenta `#b2005d` is an accent, not a background. The `oscuro` and `vibrante` backgrounds stay available for statements and reel covers.
- The host pages define their own `.btn` and `.mini`; the engine renamed its text style to `.eyebrow` and hard-declares `width`/`min-height` on `.btn` so host toolbar CSS cannot leak into an artboard. Watch for this when adding component classes.
- `artes-engine.js` and `artes-logos.js` are included with a `?v=` query. Bump it when the engine changes, otherwise browsers keep serving the cached copy.

### 10. Netlify functions: CORS no es autenticación
Toda function que **envía correo, escribe con el service_role key o hace algo en nombre de un usuario interno** debe llamar a `requireInternalUser(event)` de `netlify/functions/lib/auth.js` como primer paso. El allowlist de `lib/cors.js` solo restringe navegadores: un POST desde `curl` o desde un servidor ignora el CORS por completo.

En agosto de 2026 `send-email.js` no validaba nada y quedó como **open relay**: bots que escanean GitHub (el repo es público) encontraron el endpoint y mandaron spam desde `contacto@bemeagency.com`. Reglas que salieron de eso:
- El token de sesión viaja en `Authorization: Bearer <access_token>`. En el frontend usar el helper `authHeaders()` (ver `prospeccion-detalle.html`), nunca `{'Content-Type':'application/json'}` pelado contra un endpoint de envío.
- Validar el destinatario con `isValidEmail()`: **un solo** email. Un `to` tipo `"a@x,b@y"` convierte el endpoint en difusor masivo, y un `\r\n` en asunto o `replyTo` permite inyectar headers `Bcc`.
- Las functions con `schedule` en netlify.toml devuelven 403 desde el edge ante una invocación HTTP directa — pero eso es protección de la plataforma, no del código. Si alguna vez se les saca el `schedule`, quedan expuestas. Autenticarlas igual.
- Ningún modo "de prueba" abierto: `brand-notify?test=` mandaba mail a cualquier dirección. Va detrás de sesión interna o `ADMIN_TASK_SECRET`.

### 11. Nada de Artifacts de Claude: todo documento se entrega como página en bemeagency.com
Agustín no puede usar los links de artifacts (`claude.ai/code/artifact/...`), así que **nunca entregar documentos por esa vía**. Cualquier documento para compartir (organigrama, perfiles de puesto, manuales, decks) se publica como página HTML en este repo, se suma al allowlist de `netlify.toml` con su header `noindex`, y se comparte el link `bemeagency.com/...`. Ejemplos ya publicados: `/organigrama` y `/puesto-comercial`.

### 12. Compartir siempre bemeagency.com, nunca la URL .netlify.app
`bemeagency.com` y `bemeagency.netlify.app` son **el mismo sitio de Netlify** (id `7bc7d274-b308-4938-8631-30df1bc79d5c`), no dos hostings. Lo que los separa es el allowlist de `netlify.toml`: el dominio sirve solo las páginas listadas y **todo lo demás cae en el catch-all y devuelve 404**; la URL `.netlify.app` no filtra nada y ahí vive el panel interno.

- **Todo link que se le pase a un cliente, marca, talento o socio va bajo `bemeagency.com`.** Nunca compartir `bemeagency.netlify.app` — es la puerta de servicio, expone el panel interno y no es una dirección presentable.
- **Al crear una página pública nueva hay que agregarla al allowlist de `netlify.toml`**, si no da 404 en el dominio. Es el error que ya pasó con `argentina.html`: existía y estaba deployada, pero como nadie la sumó al allowlist solo respondía por `.netlify.app`.
- Sumar también un `[[headers]]` con `X-Robots-Tag = "noindex, nofollow, noarchive"` cuando la página sea material comercial que se comparte por link y no deba indexarse.
- El panel interno (`index`, `campanas`, `contratos`, `finanzas`, `presupuestos`, `prospecciones`) **se queda fuera del dominio a propósito**. No agregarlo al allowlist.

## Git & Deploy
- **Auto-deploy:** After completing changes, always commit and push to `origin/main` without asking. Netlify deploys automatically from GitHub.
- Git remote: `origin` → `https://github.com/agustinriosgabriel-arch/beme-agency.git`

## Common Gotchas
- `getElementById('x').value` crashes if element 'x' doesn't exist → always use optional chaining or null check
- Supabase JOINs through foreign keys can fail silently with RLS → load related data separately
- `sb.auth.signUp()` changes the active session → save admin session before, restore after
- File uploads fail silently if the storage bucket doesn't exist
- `contenido_historial` table is used for timeline but needs RLS policy
