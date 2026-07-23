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

## Git & Deploy
- **Auto-deploy:** After completing changes, always commit and push to `origin/main` without asking. Netlify deploys automatically from GitHub.
- Git remote: `origin` → `https://github.com/agustinriosgabriel-arch/beme-agency.git`

## Common Gotchas
- `getElementById('x').value` crashes if element 'x' doesn't exist → always use optional chaining or null check
- Supabase JOINs through foreign keys can fail silently with RLS → load related data separately
- `sb.auth.signUp()` changes the active session → save admin session before, restore after
- File uploads fail silently if the storage bucket doesn't exist
- `contenido_historial` table is used for timeline but needs RLS policy
