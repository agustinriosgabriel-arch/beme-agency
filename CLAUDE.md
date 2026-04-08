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
├── campanas.html           → Campaign management panel (list/grid/kanban)
├── campana-detalle.html    → Single campaign detail + 9-step workflow
├── talento-portal.html     → Talent-facing portal (separate login)
├── netlify.toml            → Netlify config (redirects)
└── netlify/functions/
    ├── apify-scraper.js    → Netlify function: TikTok/IG scraping via Apify
    └── fetch-profile-photo.js → Netlify function: profile photo fetcher
```

## Critical Rules

### 1. Single-file pages
Each HTML page is self-contained (CSS + HTML + JS in one file), EXCEPT index.html which loads dashboard.js externally. Do NOT split files or add build tools.

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
All tables have Row Level Security enabled. If a query returns empty when data exists, it's almost certainly a missing RLS policy. Check DATABASE.md.

### 5. Storage buckets
Buckets must exist AND be `public: true` for file URLs to work. Current buckets: `campaign-briefs`, `content-scripts`, `content-drafts`, `content-stats`, `brand-logos`.

### 6. Accordion state preservation
When re-rendering talento cards or contenido cards after an action (upload, step change, etc.), always save `.open` class state BEFORE innerHTML replace and restore AFTER. This is implemented in `renderTalentos()` and `renderAll()` in campana-detalle.html.

### 7. URL normalization
All social media URLs must have `https://`. Use `normalizeSocialUrl(raw, platform)` in dashboard.js. The `safeUrl()` function in render functions auto-adds `https://` for display.

### 8. Categories persist to app_config
When saving a talent with new categories, they must be pushed to `CATEGORIES[]` and then `saveData()` called to persist to `app_config` table in Supabase.

## Common Gotchas
- `getElementById('x').value` crashes if element 'x' doesn't exist → always use optional chaining or null check
- Supabase JOINs through foreign keys can fail silently with RLS → load related data separately
- `sb.auth.signUp()` changes the active session → save admin session before, restore after
- File uploads fail silently if the storage bucket doesn't exist
- `contenido_historial` table is used for timeline but needs RLS policy
