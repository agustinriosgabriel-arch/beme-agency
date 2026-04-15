
// ===================== SUPABASE CONFIG =====================
const SUPABASE_URL = 'https://ngstqwbzvnpggpklifat.supabase.co';
const SUPABASE_KEY = 'sb_publishable_1E2K-9D-KzOSVCgROnfa-g_-WCnWCDb';
let sb = null;
let currentUser = null;
let _syncTimer = null;
let _syncPending = false;

// ===================== CONSTANTS =====================
let COUNTRIES = [
  "Argentina","Bolivia","Brasil","Chile","Colombia","Costa Rica","Cuba",
  "Ecuador","El Salvador","España","Estados Unidos","Guatemala","Honduras",
  "México","Nicaragua","Panamá","Paraguay","Perú","Puerto Rico",
  "República Dominicana","Uruguay","Venezuela"
];
let COUNTRY_FLAGS = {
  "Argentina":"🇦🇷","Bolivia":"🇧🇴","Brasil":"🇧🇷","Chile":"🇨🇱","Colombia":"🇨🇴",
  "Costa Rica":"🇨🇷","Cuba":"🇨🇺","Ecuador":"🇪🇨","El Salvador":"🇸🇻","España":"🇪🇸",
  "Estados Unidos":"🇺🇸","Guatemala":"🇬🇹","Honduras":"🇭🇳","México":"🇲🇽",
  "Nicaragua":"🇳🇮","Panamá":"🇵🇦","Paraguay":"🇵🇾","Perú":"🇵🇪",
  "Puerto Rico":"🇵🇷","República Dominicana":"🇩🇴","Uruguay":"🇺🇾","Venezuela":"🇻🇪"
};

// Normalize country names: match variants (no accents, lowercase, aliases) to canonical name
const COUNTRY_ALIASES = {};
(function buildAliases() {
  // Strip accents helper
  function strip(s) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
  // Canonical names from COUNTRY_FLAGS
  Object.keys(COUNTRY_FLAGS).forEach(function(name) {
    COUNTRY_ALIASES[strip(name)] = name;
  });
  // Common aliases
  var extras = {
    'mexico':'México','peru':'Perú','panama':'Panamá','espana':'España','spain':'España',
    'brasil':'Brasil','brazil':'Brasil','usa':'Estados Unidos','us':'Estados Unidos',
    'united states':'Estados Unidos','eeuu':'Estados Unidos','dominican republic':'República Dominicana',
    'rep dominicana':'República Dominicana','rep. dominicana':'República Dominicana',
    'republica dominicana':'República Dominicana','puerto rico':'Puerto Rico',
    'costa rica':'Costa Rica','el salvador':'El Salvador',
    'mx':'México','ar':'Argentina','co':'Colombia','cl':'Chile','pe':'Perú',
    've':'Venezuela','ec':'Ecuador','bo':'Bolivia','py':'Paraguay','uy':'Uruguay',
    'gt':'Guatemala','hn':'Honduras','ni':'Nicaragua','sv':'El Salvador',
    'cr':'Costa Rica','cu':'Cuba','pa':'Panamá','do':'República Dominicana','pr':'Puerto Rico',
    'br':'Brasil','es':'España',
  };
  Object.keys(extras).forEach(function(k) { COUNTRY_ALIASES[k.toLowerCase()] = extras[k]; });
})();

function normalizeCountry(raw) {
  if (!raw) return raw;
  var s = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  // Strip leading flag emojis
  s = s.replace(/^[\u{1F1E6}-\u{1F1FF}\s]+/gu, '').trim();
  if (COUNTRY_ALIASES[s]) return COUNTRY_ALIASES[s];
  // Try exact match with canonical names (case-insensitive)
  var match = Object.keys(COUNTRY_FLAGS).find(function(name) {
    return name.toLowerCase() === s;
  });
  if (match) return match;
  // Return original with first letter capitalized
  return raw.trim().charAt(0).toUpperCase() + raw.trim().slice(1);
}
const BASE_CATEGORIES = [
  "Música","Moda","Belleza","Fitness","Gastronomía","Viajes","Gaming",
  "Comedia","Lifestyle","Negocios","Deportes","Arte & Diseño",
  "Familia / Maternidad","Tecnología","Entretenimiento","Educación","Mascotas","Salud"
];

// ===================== STATE =====================
let CATEGORIES = [...BASE_CATEGORIES];
let talents = [];
let rosters = [];
let rosterLinks = [];
let talentCampaigns = []; // campaign history per talent
let rosterBrandEdits = {}; // roster_id → count of brand edits
let nextTalentId = 1000;
let nextRosterId = 100;
let editingId = null;
let editingRosterId = null;
let managingRosterId = null;
let managingRosterTemp = [];
let _csvPreviewRows = []; // pending CSV import rows
let currentView = 'grid';
let currentTab = 'talents';
let selectedIds = new Set();
let networkFilter = '';
let selectedCats = new Set();
let selectedCountries = new Set();
let selectedRosters = new Set();
let minFollowers = 0;
let maxFollowers = Infinity;
let followerNetwork = 'total'; // which network to filter on: tt, ig, yt, total
let activeKeywords = []; // keywords filter
let selectedGenders = new Set();
let genderDropdownOpen = false;
let currentPhoto = '';
let filterDebounce = null;
let currentSort = ''; // '' | 'az' | 'za' | 'tt-desc' | 'ig-desc' | 'yt-desc' | 'total-desc'
let sortDropdownOpen = false;
let rosterViewMode = 'table'; // 'table' | 'cards'
let catDropdownOpen = false;
let paisDropdownOpen = false;
let rosterFilterDropdownOpen = false;
let netDropdownOpen = false;
let formSelectedPaises = [];
let allVisibleSelected = false;


// ── Init Supabase ──────────────────────────────────────────
function initSupabase() {
  try {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  } catch(e) {
    console.error('[Beme] createClient error:', e);
    sb = null;
  }
}
// Llamar inmediatamente — CONSTANTS/STATE ya declarados arriba
initSupabase();

// ── Login helpers ───────────────────────────────────────────
function _loginErr(msg) {
  var d = document.getElementById('login-error');
  if (!d) return;
  d.textContent = msg;
  d.style.background = '#fff0f0'; d.style.borderColor = '#fcc'; d.style.color = '#cc0000';
  d.style.display = 'block';
}
function _loginErrClear() {
  var d = document.getElementById('login-error');
  if (d) d.style.display = 'none';
}
function toggleSignupSection() {
  var s = document.getElementById('signup-section');
  if (s) s.style.display = s.style.display === 'none' ? 'block' : 'none';
}
async function doLogin() {
  var email = (document.getElementById('login-email') || {}).value || '';
  var pass  = (document.getElementById('login-pass')  || {}).value || '';
  var btn   = document.getElementById('login-btn');
  email = email.trim();
  if (!email || !pass) { _loginErr('Completá el email y la contraseña.'); return; }
  if (!sb) { initSupabase(); }
  if (!sb) { _loginErr('Error de conexión. Recargá la página.'); return; }
  if (btn) { btn.textContent = 'Ingresando...'; btn.disabled = true; }
  _loginErrClear();
  try {
    var r = await sb.auth.signInWithPassword({ email: email, password: pass });
    if (r.error) {
      var msg = r.error.message || '';
      if (msg.includes('Invalid') || msg.includes('invalid_credentials')) _loginErr('Email o contraseña incorrectos.');
      else if (msg.includes('Email not confirmed')) _loginErr('Confirmá tu email antes de entrar.');
      else if (r.error.status === 429 || msg.includes('Too many')) _loginErr('Demasiados intentos. Esperá unos minutos.');
      else _loginErr('Error: ' + msg);
      if (btn) { btn.textContent = 'Ingresar'; btn.disabled = false; }
    } else {
      currentUser = r.data.user;
      hideLoginOverlay();
      await loadFromSupabase();
    }
  } catch(e) {
    _loginErr('Error inesperado: ' + (e.message || String(e)));
    if (btn) { btn.textContent = 'Ingresar'; btn.disabled = false; }
  }
}
async function doSignup() {
  var email = (document.getElementById('signup-email') || {}).value || '';
  var pass  = (document.getElementById('signup-pass')  || {}).value || '';
  var btn   = document.getElementById('signup-btn');
  email = email.trim();
  if (!email || !pass) { _loginErr('Completá el email y la contraseña.'); return; }
  if (pass.length < 6) { _loginErr('La contraseña necesita al menos 6 caracteres.'); return; }
  if (!sb) { initSupabase(); }
  if (!sb) { _loginErr('Error de conexión. Recargá la página.'); return; }
  if (btn) { btn.textContent = 'Registrando...'; btn.disabled = true; }
  _loginErrClear();
  try {
    var r = await sb.auth.signUp({ email: email, password: pass });
    var d = document.getElementById('login-error');
    if (r.error) {
      _loginErr(r.error.message);
    } else {
      if (d) { d.textContent='✓ Revisá el email para confirmar.'; d.style.background='#f0fff8'; d.style.borderColor='#9FE1CB'; d.style.color='#0F6E56'; d.style.display='block'; }
    }
  } catch(e) { _loginErr('Error inesperado: ' + (e.message || String(e))); }
  if (btn) { btn.textContent = 'Registrar usuario'; btn.disabled = false; }
}
async function doLogout() {
  if (!sb) return;
  if (!confirm('¿Cerrar sesión?')) return;
  await sb.auth.signOut();
  currentUser = null;
  showLoginOverlay();
}

async function initAuth() {
  if (!sb) initSupabase();
  if (!sb) { showLoginOverlay(); return; }
  try {
    var res = await sb.auth.getSession();
    var session = res.data && res.data.session;
    if (session) {
      currentUser = session.user;
      hideLoginOverlay();
      await loadFromSupabase();
    } else {
      showLoginOverlay();
    }
  } catch(e) {
    console.error('[Beme] getSession error:', e);
    showLoginOverlay();
  }
  sb.auth.onAuthStateChange(async function(event, session) {
    if (event === 'SIGNED_IN' && !currentUser) {
      currentUser = session.user;
      hideLoginOverlay();
      await loadFromSupabase();
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      showLoginOverlay();
    }
  });
}

function showLoginOverlay() {
  const overlay = document.getElementById('login-overlay');
  if (overlay) overlay.style.display = 'flex';
  hideAppLoadingOverlay();
}

function hideLoginOverlay() {
  const overlay = document.getElementById('login-overlay');
  if (overlay) overlay.style.display = 'none';
  const lo = document.getElementById('app-loading-overlay');
  if(lo) { lo.classList.remove('hidden'); const msg = document.getElementById('app-load-msg'); if(msg) msg.textContent = 'Cargando datos...'; }
}

function hideAppLoadingOverlay() {
  const lo = document.getElementById('app-loading-overlay');
  if(lo) {
    lo.classList.add('hidden');
    setTimeout(() => { if(lo.parentNode) lo.parentNode.removeChild(lo); }, 350);
  }
}

// Safety: force-remove loading overlay after 20s (allows time for Supabase cold-start retries)
setTimeout(function() {
  var lo = document.getElementById('app-loading-overlay');
  if(lo && !lo.classList.contains('hidden')) {
    console.warn('[Beme] Force-removing loading overlay after timeout');
    lo.classList.add('hidden');
    setTimeout(function(){ if(lo.parentNode) lo.parentNode.removeChild(lo); }, 350);
  }
}, 20000);

// wireLoginUI → replaced by doLogin/doSignup onclick


// ── Load helpers ─────────────────────────────────────
async function loadTalentosWithRetry(columns) {
  const PAGE_SIZE = 1000;
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let allTalents = [];
    let queryError = null;
    let from = 0;
    while (true) {
      const { data: page, error: tErr } = await sb.from('talentos').select(columns).order('nombre').range(from, from + PAGE_SIZE - 1);
      if (tErr) {
        console.error(`[Beme] Error loading talentos (attempt ${attempt}/${MAX_RETRIES}):`, tErr);
        queryError = tErr;
        break;
      }
      if (!page || page.length === 0) break;
      allTalents = allTalents.concat(page);
      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    if (!queryError) return { data: allTalents, error: null };
    if (attempt < MAX_RETRIES) {
      console.log(`[Beme] Retrying talentos load in ${attempt * 2}s...`);
      const msg = document.getElementById('app-load-msg');
      if (msg) msg.textContent = `Reconectando... intento ${attempt + 1}/${MAX_RETRIES}`;
      await new Promise(r => setTimeout(r, attempt * 3000));
    }
  }
  return { data: [], error: true };
}

// ── Load from Supabase ─────────────────────────────────────
async function loadFromSupabase() {
  try {

    // Wake up Supabase (free tier sleeps after inactivity) with a lightweight ping
    // This runs first so the DB is ready for the real queries
    try { await sb.from('app_config').select('key').limit(1); } catch(e) { /* ignore wake-up error */ }

    // Load all data in parallel for speed
    // Load WITHOUT foto first (base64 photos are huge, loaded in background after render)
    const TALENT_COLS = 'id,nombre,paises,ciudad,email,tiktok,instagram,youtube,categorias,seguidores,engagement,avg_views,social_meta,genero,keywords,valores,updated,telefono';
    const [configResult, talentResult, rosterResult, linksResult] = await Promise.all([
      sb.from('app_config').select('key,value'),
      loadTalentosWithRetry(TALENT_COLS),
      sb.from('rosters').select('*').order('created_at', {ascending:false}),
      sb.from('roster_links').select('*').order('created_at', {ascending:false})
    ]);

    // Process config
    const configRows = configResult.data;
    if (configRows) {
      for (const row of configRows) {
        if (row.key === 'categories' && Array.isArray(row.value)) { CATEGORIES.length=0; row.value.forEach(c=>CATEGORIES.push(c)); }
        if (row.key === 'countries' && Array.isArray(row.value)) {
          COUNTRIES.length = 0;
          row.value.forEach(c => {
            if(typeof c === 'string') {
              COUNTRIES.push(c); // old format
            } else if(c && c.name) {
              COUNTRIES.push(c.name); // new format
              if(c.flag) COUNTRY_FLAGS[c.name] = c.flag;
            }
          });
        }
        if (row.key === 'next_talent_id')  nextTalentId  = typeof row.value==='number' ? row.value : nextTalentId;
        if (row.key === 'next_roster_id') nextRosterId  = typeof row.value==='number' ? row.value : nextRosterId;
      }
    }

    // Process talents
    const { data: allTalents, error: talentQueryError } = talentResult;
    talents = (allTalents || []).map(t => ({
      ...t,
      paises: t.paises || [],
      categorias: t.categorias || [],
      seguidores: t.seguidores || {tiktok:0,instagram:0,youtube:0},
      engagement: t.engagement || {},
      avg_views: t.avg_views || {},
      social_meta: t.social_meta || {},
      genero: t.genero || '',
      keywords: t.keywords || ''
    }));
    console.log('[Beme] Loaded', talents.length, 'talentos from Supabase');

    // Process rosters
    if (rosterResult.error) console.error('[Beme] Error loading rosters:', rosterResult.error);
    rosters = (rosterResult.data || []).map(r => ({
      ...r,
      talentIds: (r.talent_ids || []).map(id => parseInt(id)),
      platforms: r.platforms || {tt:true,ig:true,yt:true},
      public_token: r.public_token || generateToken()
    }));
    rosterLinks = linksResult.data || [];

    // Only migrate from localStorage if query succeeded and returned 0
    if (talents.length === 0 && !talentQueryError) tryMigrateFromLocalStorage();
    if (talents.length === 0 && talentQueryError) {
      showToast('Error cargando talentos de la nube. Reintentá recargando la página.', 'error');
    }

    // Safety: ensure next IDs are always higher than existing data
    if(talents.length > 0) {
      const maxTalentId = talents.reduce((m,t)=>t.id>m?t.id:m,0);
      if(nextTalentId <= maxTalentId) { nextTalentId = maxTalentId + 1; console.warn('[Beme] Fixed nextTalentId →', nextTalentId); }
    }
    if(rosters.length > 0) {
      const maxRosterId = rosters.reduce((m,r)=>r.id>m?r.id:m,0);
      if(nextRosterId <= maxRosterId) { nextRosterId = maxRosterId + 1; console.warn('[Beme] Fixed nextRosterId →', nextRosterId); }
    }

    // Load campaign history for talents
    try {
      const {data: tcData} = await sb.from('campana_talentos').select('talent_id,fee_marca,fee_talento,moneda,campanas(id,nombre,deleted_at,marcas(nombre)),contenidos(tipo)').order('created_at', {ascending:false}).limit(200);
      talentCampaigns = (tcData||[])
        .filter(ct => ct.campanas && !ct.campanas.deleted_at) // Exclude soft-deleted campaigns
        .map(ct => ({
          talent_id: ct.talent_id,
          campana: ct.campanas?.nombre||'',
          marca: ct.campanas?.marcas?.nombre||'',
          fee_marca: ct.fee_marca||0,
          fee_talento: ct.fee_talento||0,
          moneda: ct.moneda||'USD',
          acciones: (ct.contenidos||[]).map(c => c.tipo).filter(Boolean),
        }));
    } catch(e) { console.warn('Campaign history load:', e); talentCampaigns = []; }

    // Auto-enrich marcas_previas from campaign history
    for (const t of talents) {
      const marcas = talentCampaigns.filter(tc => tc.talent_id === t.id && tc.marca).map(tc => tc.marca);
      if (marcas.length) {
        const existing = (t.marcas_previas||'').split(',').map(s=>s.trim()).filter(Boolean);
        const merged = [...new Set([...existing, ...marcas])];
        t.marcas_previas = merged.join(', ');
      }
    }

    renderTalents();
    renderRosters();
    updateStats();
    updatePlatformCounts();
    populateCountrySelects();
    populateCatCheckboxes();
    populateCountryDropdown();
    updateApiKeyUI();
    loadGeneralRosters();
    loadRosterBrandEdits();

    // Subscribe to realtime changes so all users see updates instantly
    setupRealtimeSubscription();
    hideAppLoadingOverlay();

    // Load photos in background (base64 photos are heavy, skip for initial render)
    loadTalentPhotos();
  } catch(e) {
    console.error('loadFromSupabase error:', e);
    hideAppLoadingOverlay();
    showToast('Error cargando datos: ' + e.message, 'error');
  }
}

async function loadTalentPhotos() {
  try {
    const PAGE = 200;
    for (let i = 0; i < talents.length; i += PAGE) {
      const batch = talents.slice(i, i + PAGE);
      const ids = batch.map(t => t.id);
      const {data} = await sb.from('talentos').select('id,foto').in('id', ids);
      if (data) {
        data.forEach(p => {
          if (!p.foto) return;
          const t = talents.find(x => x.id === p.id);
          if (t) t.foto = p.foto;
        });
        renderTalents();
      }
    }
  } catch(e) { console.warn('[Beme] Photo load error:', e); }
}

let _realtimeChannel = null;
let _recentlyDeleted = new Set(); // track recently deleted IDs to prevent re-insert from RT
function setupRealtimeSubscription() {
  if (_realtimeChannel) { sb.removeChannel(_realtimeChannel); _realtimeChannel = null; }
  // Unique channel name per session to avoid conflicts between users
  const channelName = 'beme-' + Math.random().toString(36).slice(2, 8);
  _realtimeChannel = sb
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'talentos' }, (payload) => {
      if (payload.eventType === 'INSERT') {
        const t = payload.new;
        // Only add if not already in local array (saveTalent already pushed it)
        if (!talents.find(x => x.id === t.id) && !_recentlyDeleted.has(t.id)) {
          talents.push({ ...t, paises: t.paises||[], categorias: t.categorias||[], seguidores: t.seguidores||{tiktok:0,instagram:0,youtube:0} });
          renderTalents(); updateStats(); updatePlatformCounts();
        }
        // If already exists, it came from our own INSERT — no action needed
      } else if (payload.eventType === 'UPDATE') {
        const t = payload.new;
        if (!t || !t.id) {
          // payload.new is empty — reload only changed columns (skip foto to save IO)
          // payload.new is empty — merge updated columns into existing talents (preserve foto, etc.)
          const TALENT_COLS_RT = 'id,nombre,paises,ciudad,email,tiktok,instagram,youtube,categorias,seguidores,engagement,avg_views,social_meta,genero,keywords,valores,updated,telefono';
          sb.from('talentos').select(TALENT_COLS_RT).order('nombre').then(({ data }) => {
            if (data) {
              // Merge into existing talents to preserve fields not in RT select (like foto)
              var byId = {};
              talents.forEach(function(x) { byId[x.id] = x; });
              talents = data.filter(function(x) { return !_recentlyDeleted.has(x.id); }).map(function(x) {
                var existing = byId[x.id] || {};
                return { ...existing, ...x, paises:x.paises||existing.paises||[], categorias:x.categorias||existing.categorias||[], seguidores:x.seguidores||existing.seguidores||{tiktok:0,instagram:0,youtube:0}, engagement:x.engagement||existing.engagement||{}, avg_views:x.avg_views||existing.avg_views||{}, social_meta:x.social_meta||existing.social_meta||{} };
              });
              renderTalents(); updateStats(); updatePlatformCounts();
            }
          });
        } else {
          const idx = talents.findIndex(x => x.id === t.id);
          const mapped = { ...t, paises: t.paises||[], categorias: t.categorias||[], seguidores: t.seguidores||{tiktok:0,instagram:0,youtube:0}, engagement: t.engagement||{}, avg_views: t.avg_views||{}, social_meta: t.social_meta||{} };
          if (_recentlyDeleted.has(t.id)) { /* skip — recently deleted */ }
          else if (idx >= 0) { talents[idx] = { ...talents[idx], ...mapped }; }
          else { talents.push(mapped); }
          renderTalents(); updateStats(); updatePlatformCounts();
        }
      } else if (payload.eventType === 'DELETE') {
        const delId = payload.old.id;
        _recentlyDeleted.add(delId);
        setTimeout(function() { _recentlyDeleted.delete(delId); }, 10000);
        const before = talents.length;
        talents = talents.filter(x => x.id !== delId);
        if (talents.length !== before) { renderTalents(); updateStats(); updatePlatformCounts(); }
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rosters' }, (payload) => {
      if (payload.eventType === 'INSERT') {
        const r = payload.new;
        if (!rosters.find(x => x.id === r.id)) {
          rosters.push({ ...r, talentIds: (r.talent_ids||[]).map(id => parseInt(id)), platforms: r.platforms||{tt:true,ig:true,yt:true} });
          renderRosters(); updateStats();
        }
      } else if (payload.eventType === 'UPDATE') {
        const r = payload.new;
        if (!r || !r.id) {
          sb.from('rosters').select('*').order('created_at', {ascending:false}).then(({ data }) => {
            if (data) { rosters = data.map(x => ({...x, talentIds:x.talent_ids||[], platforms:x.platforms||{tt:true,ig:true,yt:true}})); renderRosters(); updateStats(); }
          });
        } else {
          const idx = rosters.findIndex(x => x.id === r.id);
          // Always use talent_ids from Supabase payload as source of truth
          const mapped = {
            ...r,
            talentIds: (Array.isArray(r.talent_ids) ? r.talent_ids : (r.talent_ids || [])).map(id => parseInt(id)),
            platforms: r.platforms || {tt:true,ig:true,yt:true}
          };
          if (idx >= 0) {
            rosters[idx] = mapped;
          } else {
            rosters.push(mapped);
          }
          renderRosters(); updateStats();
        }
      } else if (payload.eventType === 'DELETE') {
        const before = rosters.length;
        rosters = rosters.filter(x => x.id !== payload.old.id);
        if (rosters.length !== before) { renderRosters(); updateStats(); }
      }
    })
    .subscribe((status) => {
      console.log('[Beme] Realtime:', status);
    });
}

// ── Migration from localStorage ────────────────────────────
function tryMigrateFromLocalStorage() {
  try {
    const stored = localStorage.getItem('beme_talents');
    if (!stored) return;
    const lsTalents = JSON.parse(stored);
    if (!lsTalents || !lsTalents.length) return;
    if (!confirm(`Hay ${lsTalents.length} talentos guardados localmente. ¿Migrarlos a la nube ahora?`)) return;
    talents = lsTalents.map(t => ({...t, paises: t.paises||(t.pais?[t.pais]:[]), seguidores:t.seguidores||{tiktok:0,instagram:0,youtube:0}}));
    const lsRosters = JSON.parse(localStorage.getItem('beme_rosters') || '[]');
    rosters = lsRosters.map(r => ({...r, talentIds:r.talentIds||[], platforms:r.platforms||{tt:true,ig:true,yt:true}, public_token:r.public_token||generateToken()}));
    nextTalentId = parseInt(localStorage.getItem('beme_nextTalentId') || String(talents.length+1));
    nextRosterId = parseInt(localStorage.getItem('beme_nextRosterId') || String(rosters.length+1));
    _syncToSupabase(true).then(() => showToast(`${talents.length} talentos migrados a la nube ✓`, 'success'));
  } catch(e) { console.warn('Migration error:', e); }
}

// ── Save (debounced) ───────────────────────────────────────
// saveData() is defined once in the LOCAL STORAGE section below.
// Do NOT define it here to avoid duplication.

async function _syncToSupabase(force = false) {
  if (!sb || !currentUser) return;
  _syncPending = false;
  try {
    // Config (categories/countries) is managed by addCountry/removeCountry/addCategory directly
    // Don't write them here — it would overwrite changes made by other users or race with deletions

    // If force=true (migration), also push all talents+rosters
    if (force) {
      if (talents.length > 0) {
        const rows = talents.map(t => ({
          id: t.id, nombre: t.nombre||'', paises: t.paises||[],
          ciudad: t.ciudad||'', telefono: t.telefono||'', email: t.email||'',
          tiktok: t.tiktok||'', instagram: t.instagram||'', youtube: t.youtube||'',
          valores: t.valores||'', categorias: t.categorias||[], foto: t.foto||'',
          seguidores: t.seguidores||{tiktok:0,instagram:0,youtube:0}, updated: t.updated||null
        }));
        const CHUNK = 20;
        for(let i=0;i<rows.length;i+=CHUNK) {
          await sb.from('talentos').upsert(rows.slice(i,i+CHUNK), {onConflict:'id'});
        }
      }
      if (rosters.length > 0) {
        const rows = rosters.map(r => ({
          id: r.id, name: r.name||'', description: r.description||'',
          platforms: r.platforms||{tt:true,ig:true,yt:true},
          talent_ids: r.talentIds||r.talent_ids||[],
          public_token: r.public_token || generateToken(),
          created: r.created||''
        }));
        await sb.from('rosters').upsert(rows, {onConflict:'id'});
      }
    }

    const ind = document.getElementById('sync-indicator');
    if(ind) { ind.style.opacity='1'; setTimeout(()=>{ind.style.opacity='0';},1800); }
  } catch(e) {
    console.error('Sync error:', e);
    showToast('Error al guardar: ' + e.message, 'error');
  }
}

// ── Delete from Supabase ───────────────────────────────────
async function deleteFromSupabase(table, id) {
  if (!sb || !currentUser) return;
  try { await sb.from(table).delete().eq('id', id); } catch(e) { console.warn('Delete error:', e); }
}

// ── Token generator ────────────────────────────────────────
function generateToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g,'').substring(0,24);
  }
  return Math.random().toString(36).substring(2)+Date.now().toString(36);
}

// ── Get public roster URL ──────────────────────────────────
function getRosterPublicUrl(roster, options) {
  // Always use the Netlify URL as base
  const base = 'https://bemeagency.netlify.app/';
  const params = new URLSearchParams({ token: roster.public_token || '' });
  if (options && options.compact) params.set('compact', '1');
  return base + 'roster.html?' + params.toString();
}

async function copyRosterUrl(rosterId) {
  const roster = rosters.find(r => r.id === rosterId);
  if (!roster) return;

  // Generate token if missing — no need to wait for Supabase
  if (!roster.public_token) {
    roster.public_token = generateToken();
    // Save in background — don't await so UI is instant
    if (sb && currentUser) {
      sb.from('rosters').upsert({
        id: roster.id, name: roster.name,
        description: roster.description || '',
        platforms: roster.platforms || {tt:true,ig:true,yt:true},
        talent_ids: roster.talentIds || [],
        public_token: roster.public_token,
        created: roster.created || ''
      }, { onConflict: 'id' }).then(() => {}).catch(e => console.warn('token save:', e));
    }
  }

  const url = getRosterPublicUrl(roster);
  await copyTextWithToast(url, '✓ URL copiada. Enviala al cliente.');
}

async function copyCompactRosterUrl(rosterId) {
  const roster = rosters.find(r => r.id === rosterId);
  if (!roster) return;

  // Generate token if missing — no need to wait for Supabase
  if (!roster.public_token) {
    roster.public_token = generateToken();
    if (sb && currentUser) {
      sb.from('rosters').upsert({
        id: roster.id, name: roster.name,
        description: roster.description || '',
        platforms: roster.platforms || {tt:true,ig:true,yt:true},
        talent_ids: roster.talentIds || [],
        public_token: roster.public_token,
        created: roster.created || ''
      }, { onConflict: 'id' }).then(() => {}).catch(e => console.warn('token save:', e));
    }
  }

  const url = getRosterPublicUrl(roster, { compact: true });
  await copyTextWithToast(url, '✓ URL compacta copiada (sin precio/comentarios).');
}

async function copyTextWithToast(url, successMessage) {

  // Copy to clipboard
  let copied = false;
  try {
    await navigator.clipboard.writeText(url);
    copied = true;
  } catch(e) {
    // Fallback
    try {
      const el = document.createElement('textarea');
      el.value = url; el.style.position = 'fixed'; el.style.opacity = '0';
      document.body.appendChild(el); el.focus(); el.select();
      copied = document.execCommand('copy');
      document.body.removeChild(el);
    } catch(e2) {}
  }

  if (copied) {
    showToast(successMessage, 'success');
  } else {
    // Last resort — show in prompt so they can copy manually
    prompt('Copiá esta URL y enviásela al cliente:', url);
  }
}

// ===================== EVENT DELEGATION (CSP-safe, MV3 compliant) =====================

let FN_MAP = {
  toggleTheme,
  doLogout,
  triggerCSVImport,
  openApiKeyModal,
  updateAllFollowers,
  scrapeAllProfiles,
  openAddModal,
  filterTT:             () => setPlatformFilter('tt'),
  filterIG:             () => setPlatformFilter('ig'),
  filterYT:             () => setPlatformFilter('yt'),
  clearPlatformFilter,
  toggleCountryDropdown,
  clearCountryFilter,
  clearCatFilter,
  clearRosterFilter,
  toggleRosterFilterDropdown,
  clearFollowerFilter,
  clearKeywordsFilter,
  toggleGenderDropdown,
  clearGenderFilter,
  openManageCountriesModal,
  clearAllFilters,
  viewGrid:             () => setView('grid'),
  viewList:             () => setView('list'),
  exportCSV,
  tabTalents:           () => switchTab('talents'),
  tabRosters:           () => switchTab('rosters'),
  clearSelection,
  exportSelectedCSV,
  openAddToRosterModal,
  closeTalentModal:     () => closeModal('talent-modal'),
  triggerPhotoUpload:   () => document.getElementById('photo-file').click(),
  fetchProfilePhoto,
  deleteTalent,
  saveTalent,
  closeRosterCreateModal: () => { _pendingRosterTalentIds = null; closeModal('roster-create-modal'); },
  saveRoster,
  openManageTalentsModal,
  downloadCurrentRoster,
  printRoster,
  closeRosterViewModal:  () => closeModal('roster-view-modal'),
  closeManageTalentsModal: () => closeModal('manage-talents-modal'),
  applyManageTalents,
  closeAddToRosterModal: () => closeModal('add-to-roster-modal'),
  openCreateRosterAndAdd,
  closeManageCountriesModal: () => closeModal('manage-countries-modal'),
  addCountry,
  closeYtApiModal:      () => closeModal('yt-api-modal'),
  toggleApiKeyVisibility,
  clearApiKey,
  saveApiKey,
  saveApifyToken,
  testApifyToken,
  clearApifyToken,
  toggleApifyTokenVisibility: function(){var i=document.getElementById("apify-token-input");if(i)i.type=i.type==="password"?"text":"password";},
  saveEnsembleToken,
  testEnsembleToken,
  clearEnsembleToken,
  toggleEnsembleTokenVisibility: function(){var i=document.getElementById("ensemble-token-input");if(i)i.type=i.type==="password"?"text":"password";},
  openCreateRosterModal,
  openCreateGeneralRosterModal: () => openCreateGeneralRosterModal(),
  closeGeneralRosterModal,
  saveGeneralRoster,
  toggleRosterSortDropdown,
  setRosterSort,
  toggleArchivedRosters,
  deleteSelectedTalents,
  fetchPhotosSelected,
  toggleNetUpdateDropdown,
  scrapeAllTikTok,
  scrapeAllInstagram,
  updateAll3Networks,
  updateSelectedAll,
  engagementAllTikTok,
  engagementAllInstagram,
  updateSelectedTikTok,
  updateSelectedInstagram,
  updateSelectedYouTube,
  engagementSelectedTikTok,
  engagementSelectedInstagram,
  toggleBottomBarUpdateMenu,
  toggleCatDropdown,
  addCategoryFromPanel,
  openManageCatsModal,
  closeManageCatsModal,
  closeManageLinksModal: function(){ closeModal('manage-links-modal'); },
  createRosterLink,
  addCategoryFromModal,
  togglePaisDropdown,
  toggleSortDropdown,
  toggleSelectAll,
  executeUndo,
  dismissUndo,
  undoLastAction: function(){executeUndo();},
  setRosterViewTable,
  setRosterViewCards,
  openAIRosterModal,
  closeAIRosterModal,
  generateAIRoster,
  showAIForm,
  createRosterFromAI,
  toggleAISelect,
  toggleAllAISelect,
  toggleAIDescs,
  openAIDescsModal,
  closeAIDescsModal,
  confirmAIDescs,
};

let ACTION_MAP = {
  'edit':           (id, e) => openEditModal(parseInt(id)),
  'select':         (id, e) => toggleSelect(e, parseInt(id)),
  'yt-refresh':     (id)    => refreshYouTubeSingle(parseInt(id)),
  'ig-refresh':     (id)    => refreshInstagramSingle(parseInt(id)),
  'scrape-ig':      (id)    => scrapeSingle(parseInt(id), 'instagram'),
  'scrape-tt':      (id)    => scrapeSingle(parseInt(id), 'tiktok'),
  'view-roster':    (id)    => viewRoster(parseInt(id)),
  'edit-roster':    (id)    => openCreateRosterModal(parseInt(id)),
  'manage-roster':  (id)    => openManageTalentsForRoster(parseInt(id)),
  'manage-links':   (id)    => openManageLinksModal(parseInt(id)),
  'download-roster':(id)    => downloadRosterById(parseInt(id)),
  'delete-roster':  (id)    => deleteRoster(parseInt(id)),
  'archive-roster': (id)    => archiveRoster(parseInt(id)),
  'unarchive-roster':(id)   => unarchiveRoster(parseInt(id)),
  'set-roster-sort': (val)  => applyRosterSort(val),
  'add-selection':  (id)    => addSelectionToRoster(parseInt(id)),
  'remove-country': (id, e, el) => removeCountry(el.dataset.country),
  'toggle-manage':  (id, e, el) => toggleManageTalent(parseInt(id), el),
  'upd-all':        (id)    => updateTalentAll(parseInt(id)),
  'card-update-menu': (id) => toggleCardUpdateMenu(parseInt(id)),
  'eng-tt':         (id)    => engagementSingle(parseInt(id), 'tiktok'),
  'eng-ig':         (id)    => engagementSingle(parseInt(id), 'instagram'),
  'sort-opt':        (id, e, el) => setSort(el.dataset.sort || ''),
  'duplicate-roster':(id)    => duplicateRoster(parseInt(id)),
  'copy-url':        (id)    => copyRosterUrl(parseInt(id)),
  'copy-url-compact':(id)    => copyCompactRosterUrl(parseInt(id)),
  'switch-roster-subtab': (id) => switchRosterSubtab(id),
  'edit-general-roster':  (id) => openCreateGeneralRosterModal(parseInt(id)),
  'delete-general-roster':(id) => deleteGeneralRoster(id),
  'copy-general-roster-url':(id) => copyGeneralRosterUrl(id),
  'ai-descs-roster': (id) => openAIDescsModal(parseInt(id)),
  'clear-brand-edits': (id) => clearRosterBrandEdits(parseInt(id)),
};

document.addEventListener('click', (e) => {
  // data-fn: simple mapped function call
  const fnEl = e.target.closest('[data-fn]');
  if(fnEl) {
    const fn = FN_MAP[fnEl.dataset.fn];
    if(fn) fn();
    return;
  }
  // data-action: action with id/extra data
  const actEl = e.target.closest('[data-action]');
  if(actEl) {
    const action = actEl.dataset.action;
    const id = actEl.dataset.id;
    if(actEl.dataset.stop) e.stopPropagation();
    const handler = ACTION_MAP[action];
    if(handler) handler(id, e, actEl);
  }
});

// Wire form elements that need oninput/onchange/onchange
function wireFormListeners() {
  const search = document.getElementById('search-input');
  if(search) search.addEventListener('input', () => renderTalents());

  const photoFile = document.getElementById('photo-file');
  if(photoFile) photoFile.addEventListener('change', (e) => handlePhotoUpload(e.target));

  const segMin = document.getElementById('filter-seg-min');
  if(segMin) segMin.addEventListener('change', applyFollowerSelectFilter);

  const segMax = document.getElementById('filter-seg-max');
  if(segMax) segMax.addEventListener('change', applyFollowerSelectFilter);
  // CSV file input
  const csvInput = document.getElementById('csv-file-input');
  if(csvInput) csvInput.addEventListener('change', (e) => handleCSVImport(e.target));
}

// ===================== LOCAL STORAGE =====================
function saveData() {
  // Persist categories and countries to Supabase
  if(sb && currentUser) {
    sb.from('app_config').upsert([
      {key:'categories', value:[...CATEGORIES]},
      {key:'countries', value: COUNTRIES.map(c => ({name: c, flag: COUNTRY_FLAGS[c] || ''}))}
    ]).catch(e => console.warn('[Beme] saveData config sync error:', e));
  }
  _syncToSupabase();
}
function loadData() {
  // Clear stale localStorage data so Supabase is the single source of truth
  try {
    localStorage.removeItem('beme_talents');
    localStorage.removeItem('beme_rosters');
    localStorage.removeItem('beme_categories');
    localStorage.removeItem('beme_countries');
    localStorage.removeItem('beme_country_flags');
    localStorage.removeItem('beme_nextTalentId');
    localStorage.removeItem('beme_nextRosterId');
  } catch(e) {}
}

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  wireFormListeners();
  populateCountrySelects();
  populateCountryDropdown();
  populateGenderDropdown();
  populateCatCheckboxes();
  loadTheme();
  loadApiKey();
  renderTalents();
  updateStats();
  updatePlatformCounts();
  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    var _cw=document.getElementById('country-wrap'); if(_cw&&!_cw.contains(e.target)){var _cp=document.getElementById('country-panel'),_ct=document.getElementById('country-trigger'); if(_cp)_cp.classList.remove('open'); if(_ct)_ct.classList.remove('open');}
    // Close cat dropdown
    const catWrap = document.getElementById('cat-wrap');
    if(catWrap && !catWrap.contains(e.target)) {
      const catPanel = document.getElementById('cat-panel');
      const catTrigger = document.getElementById('cat-trigger');
      if(catPanel) catPanel.classList.remove('open');
      if(catTrigger) catTrigger.classList.remove('open');
      catDropdownOpen = false;
    }
    // Close sort dropdown
    const sortWrap = document.getElementById('sort-wrap');
    if(sortWrap && !sortWrap.contains(e.target)) {
      const sortPanel = document.getElementById('sort-panel');
      if(sortPanel) sortPanel.classList.remove('open');
      const sortTrigger = document.getElementById('sort-trigger');
      if(sortTrigger && !currentSort) sortTrigger.classList.remove('active');
      sortDropdownOpen = false;
    }
    // Close pais dropdown
    const paisWrap = document.getElementById('pais-wrap');
    if(paisWrap && !paisWrap.contains(e.target)) {
      const paisPanel = document.getElementById('pais-panel');
      if(paisPanel) paisPanel.classList.remove('open');
      const paisTrigger = document.getElementById('pais-trigger');
      if(paisTrigger) paisTrigger.classList.remove('open');
      paisDropdownOpen = false;
    }
    // Close roster filter dropdown
    const rosterFilterWrap = document.getElementById('roster-filter-wrap');
    if(rosterFilterWrap && !rosterFilterWrap.contains(e.target)) {
      const rp = document.getElementById('roster-filter-panel');
      const rt = document.getElementById('roster-filter-trigger');
      if(rp) rp.classList.remove('open');
      if(rt) rt.classList.remove('open');
      rosterFilterDropdownOpen = false;
    }
    // Close gender dropdown
    const genderWrap = document.getElementById('gender-wrap');
    if(genderWrap && !genderWrap.contains(e.target)) {
      const gp = document.getElementById('gender-panel');
      const gt = document.getElementById('gender-trigger');
      if(gp) gp.classList.remove('open');
      if(gt) gt.classList.remove('open');
      genderDropdownOpen = false;
    }
    // Close net update dropdown
    const netWrap = document.getElementById('net-update-wrap');
    if(netWrap && !netWrap.contains(e.target)) {
      const netPanel = document.getElementById('net-update-panel');
      if(netPanel) netPanel.classList.remove('open');
      netDropdownOpen = false;
    }
  });
  // Close modals and dropdowns on Escape key
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
      ['country-panel','cat-panel','sort-panel','pais-panel','roster-filter-panel','net-update-panel','roster-sort-panel','gender-panel'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.remove('open');
      });
      catDropdownOpen = false; paisDropdownOpen = false; sortDropdownOpen = false;
      rosterFilterDropdownOpen = false; netDropdownOpen = false; genderDropdownOpen = false;
    }
  });
});

// ===================== CSV IMPORT =====================
function triggerCSVImport() { document.getElementById('csv-file-input').click(); }

function handleCSVImport(input) {
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (e) => parseCSV(e.target.result);
  reader.readAsText(file, 'UTF-8');
  input.value = '';
}

// RFC-4180 CSV parser — handles multiline quoted fields


function splitCSV(str) {
  var rows = [], cols = [], cur = '', inQ = false, i = 0, c, n;
  while(i <= str.length) {
    c = i < str.length ? str.charCodeAt(i) : -1;
    if(c === 34) { // "
      n = str.charCodeAt(i+1);
      if(inQ && n === 34) { cur += '"'; i += 2; continue; }
      inQ = !inQ; i++; continue;
    }
    if(c === 44 && !inQ) { cols.push(cur); cur = ''; i++; continue; } // comma
    if(!inQ && (c === 10 || (c === 13 && str.charCodeAt(i+1) === 10))) { // newline
      if(c === 13) i++;
      cols.push(cur); cur = '';
      if(cols.length > 0) rows.push(cols);
      cols = []; i++; continue;
    }
    if(c === -1) { cols.push(cur); if(cols.some(Boolean)) rows.push(cols); break; }
    cur += str[i]; i++;
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for(let i = 0; i < line.length; i++) {
    const ch = line[i];
    if(ch === '"') { if(inQ && line[i+1]==='"') { cur+='"'; i++; } else inQ=!inQ; }
    else if(ch === ',' && !inQ) { result.push(cur); cur=''; }
    else cur += ch;
  }
  result.push(cur);
  return result;
}

async function parseCSV(text) {
  if(text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const allRows = splitCSV(text);
  if(allRows.length < 2) { showToast('CSV vacío o inválido', 'error'); return; }
  const headers = allRows[0].map(h => (h||'').trim().toLowerCase()
    .replace(/[áàä]/g,'a').replace(/[éèë]/g,'e').replace(/[íìï]/g,'i')
    .replace(/[óòö]/g,'o').replace(/[úùü]/g,'u').replace(/[ñ]/g,'n'));

  showToast('Importando...', 'info');

  const existingTT = new Set(talents.map(t=>t.tiktok).filter(Boolean).map(u=>u.toLowerCase().trim()));
  const existingIG = new Set(talents.map(t=>t.instagram).filter(Boolean).map(u=>u.toLowerCase().trim()));
  const existingYT = new Set(talents.map(t=>t.youtube).filter(Boolean).map(u=>u.toLowerCase().trim()));
  const existingNames = new Set(talents.map(t=>t.nombre).filter(Boolean).map(n=>n.toLowerCase().trim()));

  const rows = [];
  let skippedDupe=0, skippedEmpty=0;

  for(let i=1; i<allRows.length; i++) {
    const vals = allRows[i];
    const row = {};
    headers.forEach((h,idx) => { row[h] = (vals[idx]||'').trim(); });

    const nombre = row['nombre'] || row['name'] || '';
    if(!nombre) { skippedEmpty++; continue; }
    if(/USD|MXN|Valor|Reel|Historia|spark|undefined/i.test(nombre)||nombre.length>80) { skippedEmpty++; continue; }

    const ttUrl = row['tiktok']||'';
    const igUrl = row['instagram']||'';
    const ytUrl = row['youtube']||'';
    if(nombre && existingNames.has(nombre.toLowerCase())) { skippedDupe++; continue; }
    if(ttUrl && existingTT.has(ttUrl.toLowerCase())) { skippedDupe++; continue; }
    if(igUrl && existingIG.has(igUrl.toLowerCase())) { skippedDupe++; continue; }
    if(ytUrl && existingYT.has(ytUrl.toLowerCase())) { skippedDupe++; continue; }

    const paisRaw = row['paises']||row['países']||row['pais']||row['country']||'';
    const paises = paisRaw.split(';').map(x=>normalizeCountry(x.trim())).filter(Boolean);
    paises.forEach(p => { if(p&&!COUNTRIES.includes(p)) COUNTRIES.push(p); });

    const rawCats = (row['categorias']||row['categories']||row['categorías']||'').split(';').map(c=>c.trim()).filter(Boolean);
    rawCats.forEach(cat => { if(cat&&!CATEGORIES.includes(cat)) CATEGORIES.push(cat); });

    rows.push({
      nombre, paises,
      ciudad:    row['ciudad']||row['city']||'',
      telefono:  row['telefono']||row['phone']||row['teléfono']||'',
      email:     row['email']||'',
      tiktok:    normalizeSocialUrl(ttUrl, 'tiktok') || '',
      instagram: normalizeSocialUrl(igUrl, 'instagram') || '',
      youtube:   normalizeSocialUrl(row['youtube']||'', 'youtube') || '',
      valores:   row['valores']||row['values']||'',
      categorias: rawCats.length>0 ? rawCats : ['Sin categoría'],
      seguidores: {tiktok:0,instagram:0,youtube:0},
      foto: '',
      updated: new Date().toISOString().split('T')[0]
    });
    existingNames.add(nombre.toLowerCase());
    if(ttUrl) existingTT.add(ttUrl.toLowerCase());
    if(igUrl) existingIG.add(igUrl.toLowerCase());
    if(ytUrl) existingYT.add(ytUrl.toLowerCase());
  }

  if(rows.length===0) {
    var msg2 = 'No hay talentos nuevos.';
    if(skippedDupe>0) msg2 += ' '+skippedDupe+' duplicado(s) omitido(s).';
    showToast(msg2,'info'); return;
  }
  // Show preview instead of importing directly
  _csvPreviewRows = rows;
  showCSVPreview(rows, skippedDupe, skippedEmpty);
}

function escH(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showCSVPreview(rows, skippedDupe, skippedEmpty) {
  var thS = 'padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:#fff;background:linear-gradient(135deg,#b2005d,#9414E0);white-space:nowrap;';
  var cols = ['#','Nombre','Países','TikTok','Instagram','YouTube','Categorías','Teléfono','Email','Valores'];
  var thead = document.getElementById('csv-preview-head');
  if(thead) thead.innerHTML = '<tr>'+cols.map(function(c,i){return '<th style="'+thS+(i===0?'width:36px;text-align:center;':'')+'">'+c+'</th>';}).join('')+'</tr>';
  var tbody = document.getElementById('csv-preview-body');
  if(tbody) {
    tbody.innerHTML = '';
    rows.forEach(function(row, i) {
      var tr = document.createElement('tr');
      tr.style.cssText = 'border-bottom:1px solid #f0f0f0;cursor:pointer;'+(i%2===0?'background:#fff;':'background:#faf9fc;');
      tr.title = 'Clic para eliminar esta fila de la importación';
      var cells = [
        '<td style="padding:6px 10px;text-align:center;font-size:11px;color:#999;">'+(i+1)+'</td>',
        '<td style="padding:6px 10px;font-weight:700;font-size:12px;white-space:nowrap;">'+escH(row.nombre)+'</td>',
        '<td style="padding:6px 10px;font-size:11px;color:#555;">'+escH((row.paises||[]).join(', '))+'</td>',
        '<td style="padding:6px 10px;font-size:11px;">'+(row.tiktok?'<a href="'+escH(row.tiktok)+'" target="_blank" style="color:#ff0050;text-decoration:none;">'+escH(extractHandle(row.tiktok))+'</a>':'<span style="color:#ccc;">—</span>')+'</td>',
        '<td style="padding:6px 10px;font-size:11px;">'+(row.instagram?'<a href="'+escH(row.instagram)+'" target="_blank" style="color:#e1306c;text-decoration:none;">'+escH(extractHandle(row.instagram))+'</a>':'<span style="color:#ccc;">—</span>')+'</td>',
        '<td style="padding:6px 10px;font-size:11px;">'+(row.youtube?'<a href="'+escH(row.youtube)+'" target="_blank" style="color:#cc0000;text-decoration:none;">'+escH(extractHandle(row.youtube))+'</a>':'<span style="color:#ccc;">—</span>')+'</td>',
        '<td style="padding:6px 10px;font-size:11px;color:#555;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+escH((row.categorias||[]).join(', '))+'</td>',
        '<td style="padding:6px 10px;font-size:11px;color:#555;white-space:nowrap;">'+escH(row.telefono||'')+'</td>',
        '<td style="padding:6px 10px;font-size:11px;color:#555;">'+escH(row.email||'')+'</td>',
        '<td style="padding:6px 10px;font-size:11px;color:#777;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+escH(row.valores||'')+'</td>',
      ];
      tr.innerHTML = cells.join('');
      tr.addEventListener('mouseenter', function(){ tr.style.background='#fff0f4'; });
      tr.addEventListener('mouseleave', function(){ tr.style.background = i%2===0?'#fff':'#faf9fc'; });
      tr.addEventListener('click', function() {
        _csvPreviewRows = _csvPreviewRows.filter(function(r){ return r!==row; });
        tr.remove();
        var cnt = document.getElementById('csv-preview-count');
        if(cnt) cnt.textContent = _csvPreviewRows.length+' talento(s) a importar';
        if(_csvPreviewRows.length===0){ closeModal('csv-preview-modal'); showToast('Importación cancelada','info'); }
      });
      tbody.appendChild(tr);
    });
  }
  var cnt = document.getElementById('csv-preview-count');
  if(cnt) cnt.textContent = rows.length+' talento(s) a importar';
  var footer = document.getElementById('csv-preview-footer');
  if(footer) {
    var fp = '';
    if(skippedDupe>0) fp += '<span style="color:#b2005d;">'+skippedDupe+' duplicado(s) omitido(s)</span>';
    if(skippedEmpty>0) fp += '<span style="color:#999;margin-left:12px;">'+skippedEmpty+' fila(s) vacías omitidas</span>';
    fp += '<span style="color:#aaa;margin-left:auto;">Clic en una fila para eliminarla</span>';
    footer.innerHTML = fp;
  }
  openModal('csv-preview-modal');
}

async function confirmCSVImport() {
  var rows = _csvPreviewRows;
  if(!rows||rows.length===0){ closeModal('csv-preview-modal'); return; }
  closeModal('csv-preview-modal');
  showToast('Importando '+rows.length+' talentos...','info');

  // Assign integer IDs before insert (table has no auto-increment)
  rows.forEach(function(r) { r.id = nextTalentId++; });

  var imported=0, dbErrors=0;
  const CHUNK=50;
  for(var i=0;i<rows.length;i+=CHUNK){
    var chunk=rows.slice(i,i+CHUNK);
    if(sb&&currentUser){
      var res=await sb.from('talentos').insert(chunk).select();
      if(res.error){ console.error('CSV import:',res.error); dbErrors+=chunk.length; }
      else{ (res.data||[]).forEach(function(t){ talents.push({...t,paises:t.paises||[],categorias:t.categorias||[],seguidores:t.seguidores||{tiktok:0,instagram:0,youtube:0}}); }); imported+=(res.data||[]).length; }
    } else {
      chunk.forEach(function(t){ talents.push({...t}); imported++; });
    }
  }

  // Persist updated nextTalentId to app_config
  if(sb && currentUser) {
    sb.from('app_config').upsert({key:'next_talent_id', value: nextTalentId}).catch(function(e){ console.warn('Update next_talent_id:', e); });
  }
  renderTalents(); updateStats(); updatePlatformCounts(); populateCatCheckboxes();
  if(sb&&currentUser&&imported>0){
    sb.from('app_config').upsert([{key:'categories',value:[...CATEGORIES]},{key:'countries',value:[...COUNTRIES]}])
      .then(function(){ populateCountryDropdown(); });
  }
  var msg3='';
  if(imported>0) msg3+=imported+' talento(s) importados. ';
  if(dbErrors>0) msg3+=dbErrors+' error(es) al guardar.';
  showToast(msg3.trim()||'Sin cambios', imported>0?'success':'info');
  _csvPreviewRows=[];
}

// ===================== FILTERS =====================

function setFollowerNetwork(net) {
  followerNetwork = net;
  ['tt','ig','yt','total'].forEach(n => {
    const btn = document.getElementById('fseg-' + n);
    if(!btn) return;
    if(n === net) {
      btn.style.borderColor = '#b2005d';
      btn.style.background = 'rgba(178,0,93,0.08)';
      btn.style.color = '#b2005d';
      btn.style.fontWeight = '700';
    } else {
      btn.style.borderColor = 'var(--border2)';
      btn.style.background = 'var(--surface)';
      btn.style.color = 'var(--text-dim)';
      btn.style.fontWeight = '600';
    }
  });
  applyFollowerInputFilter();
}

function parseFollowerInput(val) {
  if(!val || !val.trim()) return 0;
  let s = val.trim().toUpperCase().replace(/[\s]/g,'');
  // Check for suffix (K/M/B) first — if present, preserve decimal point
  const mSuffix = s.match(/^([\d.,]+)([KMB])$/);
  if(mSuffix) {
    // Remove thousands separators (commas) but keep decimal point
    // Normalize: treat last dot or comma before suffix as decimal
    let numStr = mSuffix[1].replace(/,/g, '');
    const n = parseFloat(numStr);
    if(isNaN(n)) return 0;
    const suffix = mSuffix[2];
    if(suffix === 'K') return Math.round(n * 1000);
    if(suffix === 'M') return Math.round(n * 1000000);
    if(suffix === 'B') return Math.round(n * 1000000000);
    return Math.round(n);
  }
  // No suffix — strip separators and parse as plain number
  const clean = s.replace(/[,\.]/g, '');
  const m = clean.match(/^(\d+)$/);
  if(!m) return 0;
  return parseInt(m[1]);
}

function applyFollowerInputFilter() {
  const minRaw = document.getElementById('filter-seg-min')?.value || '';
  const maxRaw = document.getElementById('filter-seg-max')?.value || '';
  minFollowers = parseFollowerInput(minRaw);
  maxFollowers = maxRaw.trim() ? parseFollowerInput(maxRaw) : Infinity;
  if(maxFollowers === 0) maxFollowers = Infinity;
  const active = minFollowers > 0 || maxFollowers < Infinity;
  const clearBtn = document.getElementById('clear-followers');
  if(clearBtn) clearBtn.style.display = active ? 'inline' : 'none';
  renderTalents();
}

function applyFollowerSelectFilter() {
  const minVal = parseInt(document.getElementById('filter-seg-min').value) || 0;
  const maxVal = parseInt(document.getElementById('filter-seg-max').value) || 0;
  minFollowers = minVal;
  maxFollowers = maxVal > 0 ? maxVal : Infinity;
  const active = minVal > 0 || maxVal > 0;
  document.getElementById('clear-followers').style.display = active ? 'inline' : 'none';
  renderTalents();
}

function clearFollowerFilter() {
  minFollowers = 0;
  maxFollowers = Infinity;
  const min = document.getElementById('filter-seg-min');
  const max = document.getElementById('filter-seg-max');
  if(min) min.value = '';
  if(max) max.value = '';
  const clr = document.getElementById('clear-followers');
  if(clr) clr.style.display = 'none';
  followerNetwork = 'total';
  setFollowerNetwork('total');
  renderTalents();
}

// Keep stub so clearAllFilters doesn't break
function populateFollowerRanges() {}

function setPlatformFilter(net) {
  networkFilter = networkFilter === net ? '' : net;
  ['tt','ig','yt'].forEach(n => {
    const el = document.getElementById('filter-' + n);
    el.classList.toggle('active', networkFilter === n);
  });
  document.getElementById('clear-platform').style.display = networkFilter ? 'inline' : 'none';
  renderTalents();
}
function clearPlatformFilter() {
  networkFilter = '';
  ['tt','ig','yt'].forEach(n => {
    const el = document.getElementById('filter-' + n);
    if(el) el.classList.remove('active');
  });
  document.getElementById('clear-platform').style.display = 'none';
  renderTalents();
}

function toggleCountryDropdown() {
  const panel = document.getElementById('country-panel');
  const trigger = document.getElementById('country-trigger');
  panel.classList.toggle('open');
  trigger.classList.toggle('open');
}

function populateCountryDropdown() {
  const panel = document.getElementById('country-panel');
  panel.innerHTML = '';
  COUNTRIES.forEach(c => {
    const el = document.createElement('div');
    el.className = 'multi-select-opt' + (selectedCountries.has(c) ? ' selected' : '');
    el.innerHTML = `<div class="ms-checkbox">${selectedCountries.has(c)?'<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg>':''}</div>${COUNTRY_FLAGS[c]||''} ${c}`;
    el.onclick = (e) => { e.stopPropagation(); toggleCountry(c); };
    panel.appendChild(el);
  });
}

function toggleCountry(country) {
  if(selectedCountries.has(country)) selectedCountries.delete(country);
  else selectedCountries.add(country);
  populateCountryDropdown();
  updateCountryTrigger();
  updateCountryPills();
  document.getElementById('clear-countries').style.display = selectedCountries.size > 0 ? 'inline' : 'none';
  renderTalents();
}

function updateCountryTrigger() {
  const trigger = document.getElementById('country-trigger-text');
  if(selectedCountries.size === 0) { trigger.textContent = 'Todos los países'; document.getElementById('country-trigger').classList.remove('has-value'); }
  else { trigger.textContent = `${selectedCountries.size} país(es) seleccionado(s)`; document.getElementById('country-trigger').classList.add('has-value'); }
}

function updateCountryPills() {
  const row = document.getElementById('country-pills-row');
  row.innerHTML = '';
  selectedCountries.forEach(c => {
    const el = document.createElement('span');
    el.className = 'country-pill';
    el.innerHTML = `${COUNTRY_FLAGS[c]||''} ${c} <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    el.onclick = () => toggleCountry(c);
    row.appendChild(el);
  });
}

function clearCountryFilter() {
  selectedCountries.clear();
  populateCountryDropdown();
  updateCountryTrigger();
  updateCountryPills();
  document.getElementById('clear-countries').style.display = 'none';
  renderTalents();
}

function toggleCatFilter(cat) {
  if(selectedCats.has(cat)) selectedCats.delete(cat);
  else selectedCats.add(cat);
  document.getElementById('clear-cats').style.display = selectedCats.size > 0 ? 'inline' : 'none';
  updateCatTrigger();
  updateCatPills();
  renderTalents();
}

function clearCatFilter() {
  selectedCats.clear();
  document.getElementById('clear-cats').style.display = 'none';
  updateCatTrigger();
  updateCatPills();
  renderTalents();
}

function applyKeywordsFilter() {
  var val = (document.getElementById('filter-keywords-input') || {}).value || '';
  var terms = val.toLowerCase().split(',').map(function(s){return s.trim();}).filter(Boolean);
  activeKeywords = terms;
  var clrBtn = document.getElementById('clear-keywords');
  if (clrBtn) clrBtn.style.display = terms.length > 0 ? 'inline' : 'none';
  // Show pills
  var row = document.getElementById('keywords-pills-row');
  if (row) {
    row.innerHTML = '';
    terms.forEach(function(kw) {
      var el = document.createElement('span');
      el.className = 'country-pill';
      el.innerHTML = kw + ' <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      el.addEventListener('click', function() {
        terms = terms.filter(function(t){return t!==kw;});
        var inp = document.getElementById('filter-keywords-input');
        if (inp) inp.value = terms.join(', ');
        applyKeywordsFilter();
      });
      row.appendChild(el);
    });
  }
  renderTalents();
}

function clearKeywordsFilter() {
  activeKeywords = [];
  var inp = document.getElementById('filter-keywords-input');
  if (inp) inp.value = '';
  var clrBtn = document.getElementById('clear-keywords');
  if (clrBtn) clrBtn.style.display = 'none';
  var row = document.getElementById('keywords-pills-row');
  if (row) row.innerHTML = '';
  renderTalents();
}

// ===================== GENDER FILTER =====================
const GENDERS = ['Mujer', 'Hombre', 'Otro'];

function toggleGenderDropdown() {
  const panel = document.getElementById('gender-panel');
  const trigger = document.getElementById('gender-trigger');
  panel.classList.toggle('open');
  trigger.classList.toggle('open');
  genderDropdownOpen = panel.classList.contains('open');
}

function populateGenderDropdown() {
  const panel = document.getElementById('gender-panel');
  if (!panel) return;
  panel.innerHTML = '';
  GENDERS.forEach(g => {
    const el = document.createElement('div');
    el.className = 'multi-select-opt' + (selectedGenders.has(g) ? ' selected' : '');
    el.innerHTML = `<div class="ms-checkbox">${selectedGenders.has(g) ? '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg>' : ''}</div>${escapeHtml(g)}`;
    el.onclick = (e) => { e.stopPropagation(); toggleGender(g); };
    panel.appendChild(el);
  });
}

function toggleGender(g) {
  if (selectedGenders.has(g)) selectedGenders.delete(g);
  else selectedGenders.add(g);
  populateGenderDropdown();
  updateGenderTrigger();
  updateGenderPills();
  const clr = document.getElementById('clear-gender');
  if (clr) clr.style.display = selectedGenders.size > 0 ? 'inline' : 'none';
  renderTalents();
}

function updateGenderTrigger() {
  const txt = document.getElementById('gender-trigger-text');
  if (!txt) return;
  if (selectedGenders.size === 0) txt.textContent = 'Todos los géneros';
  else if (selectedGenders.size === 1) txt.textContent = [...selectedGenders][0];
  else txt.textContent = selectedGenders.size + ' géneros';
}

function updateGenderPills() {
  const row = document.getElementById('gender-pills-row');
  if (!row) return;
  row.innerHTML = '';
  selectedGenders.forEach(g => {
    const el = document.createElement('span');
    el.className = 'country-pill';
    el.innerHTML = escapeHtml(g) + ' <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    el.addEventListener('click', () => toggleGender(g));
    row.appendChild(el);
  });
}

function clearGenderFilter() {
  selectedGenders.clear();
  const clr = document.getElementById('clear-gender');
  if (clr) clr.style.display = 'none';
  updateGenderTrigger();
  updateGenderPills();
  populateGenderDropdown();
  renderTalents();
}

function clearAllFilters() {
  networkFilter = '';
  selectedCats.clear();
  selectedCountries.clear();
  minFollowers = 0;
  maxFollowers = Infinity;
  followerNetwork = 'total';
  const minSel = document.getElementById('filter-seg-min');
  const maxSel = document.getElementById('filter-seg-max');
  if(minSel) minSel.value = '';
  if(maxSel) maxSel.value = '';
  document.getElementById('search-input').value = '';
  ['tt','ig','yt'].forEach(n => { var el = document.getElementById('filter-' + n); if(el) el.classList.remove('active'); });
  activeKeywords = [];
  var _kInp = document.getElementById('filter-keywords-input'); if(_kInp) _kInp.value='';
  var _kRow = document.getElementById('keywords-pills-row'); if(_kRow) _kRow.innerHTML='';
  selectedGenders.clear();
  updateGenderTrigger();
  updateGenderPills();
  populateGenderDropdown();
  ['clear-platform','clear-cats','clear-countries','clear-followers','clear-roster','clear-keywords','clear-gender'].forEach(id => { var el=document.getElementById(id); if(el) el.style.display='none'; });
  populateCountryDropdown();
  updateCountryTrigger();
  updateCountryPills();
  updateCatTrigger();
  updateCatPills();
  selectedRosters.clear();
  updateRosterFilterTrigger();
  renderTalents();
}

function getFilteredTalents() {
  const search = document.getElementById('search-input').value.toLowerCase().trim();
  return talents.filter(t => {
    if(search && !t.nombre.toLowerCase().includes(search) &&
       !(t.ciudad||'').toLowerCase().includes(search) &&
       !(t.paises||[]).some(p=>p.toLowerCase().includes(search)) &&
       !(t.email||'').toLowerCase().includes(search) &&
       !(t.tiktok||'').toLowerCase().includes(search) &&
       !(t.instagram||'').toLowerCase().includes(search) &&
       !(t.youtube||'').toLowerCase().includes(search)) return false;
    if(selectedGenders.size > 0 && !selectedGenders.has(t.genero || '')) return false;
    if(selectedCountries.size > 0 && !(t.paises||[]).some(p => selectedCountries.has(p))) return false;
    if(networkFilter === 'tt' && !t.tiktok) return false;
    if(networkFilter === 'ig' && !t.instagram) return false;
    if(networkFilter === 'yt' && !t.youtube) return false;
    if(selectedCats.size > 0 && !t.categorias.some(c => selectedCats.has(c))) return false;
    // Roster filter
    if(selectedRosters.size > 0) {
      var inAnyRoster = rosters.some(function(r) { return selectedRosters.has(String(r.id)) && r.talentIds.includes(t.id); });
      var wantsNoRoster = selectedRosters.has('none');
      var isOrphan = !rosters.some(function(r) { return r.talentIds.includes(t.id); });
      if(!inAnyRoster && !(wantsNoRoster && isOrphan)) return false;
    }
    let segCount = 0;
    if(followerNetwork === 'tt') segCount = t.seguidores.tiktok||0;
    else if(followerNetwork === 'ig') segCount = t.seguidores.instagram||0;
    else if(followerNetwork === 'yt') segCount = t.seguidores.youtube||0;
    else segCount = (t.seguidores.tiktok||0) + (t.seguidores.instagram||0) + (t.seguidores.youtube||0);
    if(minFollowers > 0 && segCount < minFollowers) return false;
    if(maxFollowers < Infinity && segCount > maxFollowers) return false;
    // Keywords filter
    if(activeKeywords.length > 0) {
      var kws = (t.keywords || '').toLowerCase();
      var name = (t.nombre || '').toLowerCase();
      var vals = (t.valores || '').toLowerCase();
      var matched = activeKeywords.every(function(kw) {
        return kws.includes(kw) || name.includes(kw) || vals.includes(kw);
      });
      if (!matched) return false;
    }
    return true;
  });
}

// ===================== RENDER =====================
function escapeHtml(str) {
  if(!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function getInitials(name) { return escapeHtml(name).split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase(); }
function formatUpdatedDate(dateStr) {
  if (!dateStr) return '';
  try {
    var d = new Date(dateStr + 'T00:00:00');
    var now = new Date();
    var diff = Math.floor((now - d) / 86400000);
    if (diff === 0) return 'Hoy';
    if (diff === 1) return 'Ayer';
    if (diff < 7) return 'Hace ' + diff + ' días';
    if (diff < 30) return 'Hace ' + Math.floor(diff / 7) + ' sem.';
    return d.toLocaleDateString('es-ES', {day:'2-digit', month:'short'});
  } catch(e) { return dateStr; }
}

function formatFollowers(n) {
  if(!n||n===0) return '-';
  if(n>=1000000) return (n/1000000).toFixed(1).replace('.0','')+'M';
  if(n>=1000) return Math.floor(n/1000)+'K';
  return n.toString();
}
function formatFollowersOrError(n) {
  if(!n||n===0) return '<span style="color:#ef4444;font-weight:700;font-size:10px;">ERROR</span>';
  return formatFollowers(n);
}
function extractHandle(url) {
  if(!url) return '';
  // Try @handle first
  const m = url.match(/@([^/?#]+)/);
  if(m) return '@'+m[1];
  // Fallback: extract last non-empty path segment as username
  try {
    const u = new URL(url.startsWith('http') ? url : 'https://'+url);
    const segments = u.pathname.split('/').filter(Boolean);
    // Skip common non-username segments
    const skip = new Set(['channel','user','c','p','reel','tv','reels','explore']);
    for(let i = segments.length - 1; i >= 0; i--) {
      if(!skip.has(segments[i].toLowerCase())) return segments[i];
    }
    return segments[0] || url;
  } catch(e) {
    // If URL parsing fails, strip protocol and domain
    return url.replace(/https?:\/\/(www\.)?[^/]+\/?/,'').split('/').filter(Boolean)[0] || url;
  }
}

function renderTalents() {
  let filtered = getFilteredTalents();
  filtered = applySortToList(filtered);
  const container = document.getElementById('talent-container');
  const total = talents.length;
  document.getElementById('result-count').textContent =
    filtered.length === total ? `${total} talentos` : `${filtered.length} de ${total}`;
  document.getElementById('tab-total-badge').textContent = talents.length;
  if(filtered.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><h3>Sin resultados</h3><p>Ajusta los filtros o agrega nuevos talentos.</p></div>`;
    return;
  }
  if(currentView === 'grid') {
    container.innerHTML = `<div class="talent-grid">${filtered.map(renderCard).join('')}</div>`;
  } else {
    container.innerHTML = `<div class="talent-list">${filtered.map(renderListRow).join('')}</div>`;
  }
  updateSelectAllBtn(filtered);
}

function renderCard(t) {
  const sel = selectedIds.has(t.id);
  const safeNombre = escapeHtml(t.nombre);
  const safeCiudad = escapeHtml(t.ciudad);
  const safeFoto = t.foto && (t.foto.startsWith('data:') || t.foto.startsWith('https://')) ? t.foto : '';
  const avatar = safeFoto
    ? `<div class="card-avatar"><img src="${safeFoto}" alt="${safeNombre}"></div>`
    : `<div class="card-avatar">${getInitials(t.nombre)}</div>`;
  const safeUrl = (url) => { if(!url) return '#'; if(url.startsWith('http')) return escapeHtml(url); return escapeHtml('https://'+url); };
  const networks = [
    t.tiktok ? `<div class="network-row"><div class="network-icon tt"><svg width="11" height="11" viewBox="0 0 24 24" fill="#ff0050"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34l-.04-8.68a8.25 8.25 0 004.82 1.55V4.72a4.85 4.85 0 01-1.01-.03z"/></svg></div><a class="network-link" href="${safeUrl(t.tiktok)}" target="_blank" onclick="event.stopPropagation()">${escapeHtml(extractHandle(t.tiktok))}</a><span class="network-followers">${formatFollowersOrError(t.seguidores.tiktok)}</span></div>` : '',
    t.instagram ? `<div class="network-row"><div class="network-icon ig"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#e1306c" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/></svg></div><a class="network-link" href="${safeUrl(t.instagram)}" target="_blank" onclick="event.stopPropagation()">${escapeHtml(extractHandle(t.instagram))}</a><span class="network-followers">${formatFollowersOrError(t.seguidores.instagram)}</span></div>` : '',
    t.youtube ? `<div class="network-row"><div class="network-icon yt"><svg width="11" height="11" viewBox="0 0 24 24" fill="#ff0000"><path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.38.55A3.02 3.02 0 0 0 .5 6.19C0 8.04 0 12 0 12s0 3.96.5 5.81a3.02 3.02 0 0 0 2.12 2.14C4.46 20.5 12 20.5 12 20.5s7.54 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14C24 15.96 24 12 24 12s0-3.96-.5-5.81zM9.75 15.52V8.48L15.5 12l-5.75 3.52z"/></svg></div><a class="network-link" href="${safeUrl(t.youtube)}" target="_blank" onclick="event.stopPropagation()">${escapeHtml(extractHandle(t.youtube))}</a><span class="network-followers">${formatFollowersOrError(t.seguidores.youtube)}</span></div>` : '',
  ].filter(Boolean).join('');
  const metricRows = [];
  // TikTok metrics
  const ttMetrics = [];
  if (t.engagement?.tiktok != null) ttMetrics.push(`<span class="metric-val">ER ${t.engagement.tiktok}%</span>`);
  if (t.avg_views?.tiktok) ttMetrics.push(`<span class="metric-val">Views ${formatFollowers(t.avg_views.tiktok)}</span>`);
  if (ttMetrics.length) metricRows.push(`<div class="metric-row metric-tt"><span class="metric-label">TT</span>${ttMetrics.join('<span class="metric-sep">·</span>')}</div>`);
  // Instagram metrics
  const igMetrics = [];
  if (t.engagement?.instagram != null) igMetrics.push(`<span class="metric-val">ER ${t.engagement.instagram}%</span>`);
  if (t.avg_views?.instagram) igMetrics.push(`<span class="metric-val">Views ${formatFollowers(t.avg_views.instagram)}</span>`);
  if (igMetrics.length) metricRows.push(`<div class="metric-row metric-ig"><span class="metric-label">IG</span>${igMetrics.join('<span class="metric-sep">·</span>')}</div>`);
  const engRow = metricRows.length ? `<div class="card-metrics">${metricRows.join('')}</div>` : '';
  const genderBadge = t.genero ? `<span class="cat-tag" style="background:rgba(148,20,224,0.08);color:#9414E0;border-color:rgba(148,20,224,0.2);">${escapeHtml(t.genero)}</span>` : '';
  const cats = t.categorias.slice(0,3).map(c=>`<span class="cat-tag">${escapeHtml(c)}</span>`).join('');
  return `<div class="talent-card${sel?' selected':''}" id="card-${t.id}" data-action="edit" data-id="${t.id}">
    <div class="card-select" data-action="select" data-id="${t.id}" data-stop="1">${sel?'<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>':''}</div>
    ${avatar}
    <div class="card-name">${safeNombre}</div>
    <div class="card-location">${(t.paises||[]).map(p=>(COUNTRY_FLAGS[p]||'')+' '+escapeHtml(p)).join(' · ')}${safeCiudad?', '+safeCiudad:''}</div>
    <div class="card-networks">${networks}</div>
    ${engRow}
    <div class="card-cats">${genderBadge}${cats}${t.categorias.length>3?`<span class="cat-tag">+${t.categorias.length-3}</span>`:''}</div>
    ${t.updated ? `<div class="card-updated" title="Última actualización de seguidores">↻ ${formatUpdatedDate(t.updated)}</div>` : ''}
    <div class="card-footer">
      <button class="btn btn-outline btn-sm" style="flex:1" data-action="edit" data-id="${t.id}" data-stop="1">Editar</button>
      ${(t.tiktok || t.instagram || t.youtube) ? `<div class="card-update-wrap" data-stop="1">
        <button class="scrape-btn upd-all" id="upd-all-${t.id}" data-action="upd-all" data-id="${t.id}" data-stop="1" title="Actualizar todo">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
        </button>
        <button class="scrape-btn card-update-drop-btn" data-action="card-update-menu" data-id="${t.id}" data-stop="1" title="Más opciones" style="width:18px;height:26px;background:rgba(148,20,224,0.05);color:#9414E0;border-radius:6px;">
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="card-update-menu" id="card-menu-${t.id}" style="display:none;">
          <div class="card-menu-title">Seguidores</div>
          ${t.tiktok ? `<button class="card-menu-item" data-action="scrape-tt" data-id="${t.id}" data-stop="1"><svg width="10" height="10" viewBox="0 0 24 24" fill="#ff0050"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34l-.04-8.68a8.25 8.25 0 004.82 1.55V4.72a4.85 4.85 0 01-1.01-.03z"/></svg>TikTok</button>` : ''}
          ${t.instagram ? `<button class="card-menu-item" data-action="scrape-ig" data-id="${t.id}" data-stop="1"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#e1306c" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/></svg>Instagram</button>` : ''}
          ${t.youtube ? `<button class="card-menu-item" data-action="yt-refresh" data-id="${t.id}" data-stop="1"><svg width="10" height="10" viewBox="0 0 24 24" fill="#ff0000"><path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.38.55A3.02 3.02 0 0 0 .5 6.19C0 8.04 0 12 0 12s0 3.96.5 5.81a3.02 3.02 0 0 0 2.12 2.14C4.46 20.5 12 20.5 12 20.5s7.54 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14C24 15.96 24 12 24 12s0-3.96-.5-5.81zM9.75 15.52V8.48L15.5 12l-5.75 3.52z"/></svg>YouTube</button>` : ''}
          <div class="card-menu-title" style="margin-top:2px;">Engagement</div>
          ${t.tiktok ? `<button class="card-menu-item" data-action="eng-tt" data-id="${t.id}" data-stop="1"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ff0050" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>Eng. TikTok</button>` : ''}
          <!-- IG engagement disabled -->
        </div>
      </div>` : ''}
    </div>
    ${renderCampaignHistory(t.id)}
  </div>`;
}

function renderCampaignHistory(talentId) {
  const history = talentCampaigns.filter(c => c.talent_id === talentId);
  if (!history.length) return '';
  const tipoLabels = {tiktok_video:'TikTok',reel:'Reel',ig_story:'Story',youtube_video:'YouTube',youtube_short:'YT Short'};
  return `<div class="card-history">
    <div class="card-history-title">Historial de Campanas</div>
    ${history.map(h => {
      const acciones = h.acciones.map(a => tipoLabels[a]||a).join(', ');
      return `<div class="card-history-row">
        <div class="ch-marca">${escapeHtml(h.marca)}</div>
        <div class="ch-acciones">${escapeHtml(acciones||'—')}</div>
        <div class="ch-fees">${formatMoney(h.fee_marca,h.moneda)} / ${formatMoney(h.fee_talento,h.moneda)}</div>
      </div>`;
    }).join('')}
  </div>`;
}

function formatMoney(n,cur) {
  try { return new Intl.NumberFormat('en-US',{style:'currency',currency:cur||'USD',minimumFractionDigits:0,maximumFractionDigits:0}).format(n||0); }
  catch(e) { return '$'+(n||0); }
}

function renderListRow(t) {
  const sel = selectedIds.has(t.id);
  const safeNombre = escapeHtml(t.nombre);
  const safeCiudad = escapeHtml(t.ciudad);
  const safeFoto = t.foto && (t.foto.startsWith('data:') || t.foto.startsWith('https://')) ? t.foto : '';
  const safeUrl = (url) => { if(!url) return '#'; if(url.startsWith('http')) return escapeHtml(url); return escapeHtml('https://'+url); };
  const avatar = safeFoto
    ? `<div class="list-avatar"><img src="${safeFoto}" alt="${safeNombre}"></div>`
    : `<div class="list-avatar">${getInitials(t.nombre)}</div>`;
  return `<div class="talent-list-row${sel?' selected':''}" id="card-${t.id}">
    <input type="checkbox" ${sel?'checked':''} data-action="select" data-id="${t.id}" style="cursor:pointer;accent-color:var(--primary)">
    ${avatar}
    <div style="min-width:0;flex:1">
      <div class="list-name">${safeNombre}</div>
      <div class="list-location">${(t.paises||[]).map(p=>(COUNTRY_FLAGS[p]||'')+' '+escapeHtml(p)).join(' · ')}${safeCiudad?', '+safeCiudad:''}</div>
    </div>
    <div class="list-networks">
      ${t.tiktok?`<div class="list-network"><svg width="11" height="11" viewBox="0 0 24 24" fill="#ff0050"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34l-.04-8.68a8.25 8.25 0 004.82 1.55V4.72a4.85 4.85 0 01-1.01-.03z"/></svg><a href="${safeUrl(t.tiktok)}" target="_blank" style="color:inherit;text-decoration:none;font-size:12px">${formatFollowers(t.seguidores.tiktok)}</a></div>`:''}
      ${t.instagram?`<div class="list-network"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#e1306c" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/></svg><a href="${safeUrl(t.instagram)}" target="_blank" style="color:inherit;text-decoration:none;font-size:12px">${formatFollowers(t.seguidores.instagram)}</a></div>`:''}
      ${t.youtube?`<div class="list-network"><svg width="11" height="11" viewBox="0 0 24 24" fill="#ff0000"><path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.38.55A3.02 3.02 0 0 0 .5 6.19C0 8.04 0 12 0 12s0 3.96.5 5.81a3.02 3.02 0 0 0 2.12 2.14C4.46 20.5 12 20.5 12 20.5s7.54 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14C24 15.96 24 12 24 12s0-3.96-.5-5.81zM9.75 15.52V8.48L15.5 12l-5.75 3.52z"/></svg><a href="${safeUrl(t.youtube)}" target="_blank" style="color:inherit;text-decoration:none;font-size:12px">${formatFollowers(t.seguidores.youtube)}</a></div>`:''}
    </div>
    <div class="list-cats">${t.categorias.slice(0,2).map(c=>`<span class="cat-tag">${escapeHtml(c)}</span>`).join('')}</div>
    ${t.updated ? `<div class="list-updated" title="Última actualización">↻ ${formatUpdatedDate(t.updated)}</div>` : '<div class="list-updated"></div>'}
    <div class="list-actions">
      <button class="btn btn-outline btn-sm" data-action="edit" data-id="${t.id}">Editar</button>
    </div>
  </div>`;
}

// ===================== POPULATION =====================
function populateCountrySelects() {
  // Form now uses multi-select dropdown (pais-panel), no <select> needed
  renderPaisPanel();
}

function populateCatFilters() { /* replaced by cat dropdown */ }

function populateCatCheckboxes() {
  const container = document.getElementById('cat-checkboxes');
  container.innerHTML = '';
  CATEGORIES.forEach(cat => {
    const el = document.createElement('div');
    el.className = 'cat-check';
    el.textContent = cat;
    el.onclick = () => el.classList.toggle('selected');
    container.appendChild(el);
  });
  // Add category button
  const addBtn = document.createElement('button');
  addBtn.className = 'cat-add-btn';
  addBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg> Nueva categoría`;
  addBtn.onclick = addCustomCategory;
  container.appendChild(addBtn);
}

function updatePlatformCounts() {
  document.getElementById('count-tt').textContent = talents.filter(t=>t.tiktok).length;
  document.getElementById('count-ig').textContent = talents.filter(t=>t.instagram).length;
  document.getElementById('count-yt').textContent = talents.filter(t=>t.youtube).length;
}

// ===================== CUSTOM CATEGORIES =====================
function addCustomCategory() {
  const name = prompt('Nombre de la nueva categoría:');
  if(!name || !name.trim()) return;
  const trimmed = name.trim();
  if(CATEGORIES.includes(trimmed)) { showToast('Esa categoría ya existe', 'info'); return; }
  CATEGORIES.push(trimmed);
  saveData();
  populateCatCheckboxes();
  // Re-select previously selected categories
  const selected = Array.from(document.querySelectorAll('.cat-check.selected')).map(el=>el.textContent.trim());
  document.querySelectorAll('.cat-check').forEach(el => {
    if(selected.includes(el.textContent.trim())) el.classList.add('selected');
  });
  showToast(`Categoría "${trimmed}" agregada`, 'success');
}

// ===================== SELECTION =====================
function toggleSelect(e, id) {
  e.stopPropagation();
  if(selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  updateBottomBar();
  const card = document.getElementById('card-' + id);
  if(card) {
    card.classList.toggle('selected', selectedIds.has(id));
    const cs = card.querySelector('.card-select');
    if(cs) cs.innerHTML = selectedIds.has(id) ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>` : '';
    const inp = card.querySelector('input[type=checkbox]');
    if(inp) inp.checked = selectedIds.has(id);
  }
}
function clearSelection() { selectedIds.clear(); updateBottomBar(); renderTalents(); }
function updateBottomBar() {
  const bar = document.getElementById('bottom-bar');
  document.getElementById('selected-count-num').textContent = selectedIds.size;
  bar.classList.toggle('visible', selectedIds.size > 0);
}

// ===================== STATS =====================
function updateStats() {
  const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
  set('stat-total', talents.length);
  set('stat-countries', new Set(talents.flatMap(t=>t.paises||[])).size);
  const total = talents.reduce((s,t) => s+(t.seguidores.tiktok||0)+(t.seguidores.instagram||0)+(t.seguidores.youtube||0), 0);
  set('stat-followers', formatFollowers(total));
  set('stat-rosters', rosters.length);
  set('tab-rosters-badge', rosters.length + generalRosters.length);
  set('tab-total-badge', talents.length);
  set('subtab-personalizados-badge', rosters.length);
  set('subtab-generales-badge', generalRosters.length);
}

// ===================== VIEW / TABS =====================
function setView(v) {
  currentView = v;
  document.getElementById('view-grid').classList.toggle('active', v==='grid');
  document.getElementById('view-list').classList.toggle('active', v==='list');
  renderTalents();
}

function switchTab(tab) {
  currentTab = tab;
  document.getElementById('tab-content-talents').style.display = tab==='talents'?'block':'none';
  document.getElementById('tab-content-rosters').style.display = tab==='rosters'?'block':'none';
  document.getElementById('tab-talents').classList.toggle('active', tab==='talents');
  document.getElementById('tab-rosters').classList.toggle('active', tab==='rosters');
  if(tab==='rosters') {
    if(currentRosterSubtab === 'generales') renderGeneralRosters();
    else renderRosters();
  }
}

// ===================== MODAL =====================
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function openAddModal() {
  editingId = null; currentPhoto = '';
  document.getElementById('modal-title-text').textContent = 'Agregar Talento';
  document.getElementById('delete-btn').style.display = 'none';
  clearForm();
  openModal('talent-modal');
}
function openEditModal(id) {
  const t = talents.find(x=>x.id===id);
  if(!t) return;
  editingId = id; currentPhoto = t.foto || '';
  document.getElementById('modal-title-text').textContent = 'Editar Talento';
  document.getElementById('delete-btn').style.display = 'inline-flex';
  fillForm(t);
  openModal('talent-modal');
}
function clearForm() {
  ['f-nombre','f-ciudad','f-telefono','f-email','f-tiktok','f-instagram','f-youtube','f-valores','f-seg-tiktok','f-seg-instagram','f-seg-youtube']
    .forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  var _fg = document.getElementById('f-genero'); if(_fg) _fg.value = '';
  var _fk = document.getElementById('f-keywords'); if(_fk) _fk.value = '';
  var _ftc = document.getElementById('f-tipo-contenido'); if(_ftc) _ftc.value = '';
  var _fcal = document.getElementById('f-calidad'); if(_fcal) _fcal.value = '';
  var _fmp = document.getElementById('f-marcas-previas'); if(_fmp) _fmp.value = '';
  var _fni = document.getElementById('f-notas-internas'); if(_fni) _fni.value = '';
  var _ftm = document.getElementById('f-tiene-manager'); if(_ftm) _ftm.value = 'false';
  formSelectedPaises = [];
  updatePaisTrigger();
  updatePaisPills();
  paisDropdownOpen = false;
  const p = document.getElementById('pais-panel'); if(p) p.classList.remove('open');
  const tr = document.getElementById('pais-trigger'); if(tr) tr.classList.remove('open');
  document.querySelectorAll('.cat-check').forEach(el => el.classList.remove('selected'));
  updatePhotoPreview('');
}
function fillForm(t) {
  document.getElementById('f-nombre').value = t.nombre||'';
  formSelectedPaises = [...(t.paises || (t.pais ? [t.pais] : []))];
  updatePaisTrigger();
  updatePaisPills();
  document.getElementById('f-ciudad').value = t.ciudad||'';
  document.getElementById('f-telefono').value = t.telefono||'';
  document.getElementById('f-email').value = t.email||'';
  document.getElementById('f-tiktok').value = t.tiktok||'';
  document.getElementById('f-instagram').value = t.instagram||'';
  document.getElementById('f-youtube').value = t.youtube||'';
  document.getElementById('f-valores').value = t.valores||'';
  var _fg = document.getElementById('f-genero'); if(_fg) _fg.value = t.genero||'';
  var _fk = document.getElementById('f-keywords'); if(_fk) _fk.value = t.keywords||'';
  var _ftc = document.getElementById('f-tipo-contenido'); if(_ftc) _ftc.value = t.tipo_contenido||'';
  var _fcal = document.getElementById('f-calidad'); if(_fcal) _fcal.value = t.calidad||'';
  var _fmp = document.getElementById('f-marcas-previas'); if(_fmp) _fmp.value = t.marcas_previas||'';
  var _fni = document.getElementById('f-notas-internas'); if(_fni) _fni.value = t.notas_internas||'';
  var _ftm = document.getElementById('f-tiene-manager'); if(_ftm) _ftm.value = t.tiene_manager ? 'true' : 'false';
  document.getElementById('f-seg-tiktok').value = t.seguidores?.tiktok || 0;
  document.getElementById('f-seg-instagram').value = t.seguidores?.instagram || 0;
  document.getElementById('f-seg-youtube').value = t.seguidores?.youtube || 0;
  document.querySelectorAll('.cat-check').forEach(el => {
    el.classList.toggle('selected', t.categorias.includes(el.textContent.trim()));
  });
  updatePhotoPreview(t.foto||'');
}
function updatePhotoPreview(src) {
  const p = document.getElementById('modal-photo-preview');
  p.innerHTML = src ? `<img src="${src}" alt="foto">` : `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
}
function handlePhotoUpload(input) {
  const file = input.files[0];
  if(!file) return;
  if(file.size > 5*1024*1024) { showToast('Imagen demasiado grande (máx 5MB)', 'error'); return; }
  const reader = new FileReader();
  reader.onload = e => { currentPhoto = e.target.result; updatePhotoPreview(currentPhoto); };
  reader.readAsDataURL(file);
}

// ===================== FETCH PROFILE PHOTO FROM TIKTOK / INSTAGRAM =====================
function normalizeSocialUrl(raw, platform) {
  if(!raw) return null;
  let url = raw.trim();
  if(!url || url === '-') return '';
  // Already a full URL — just ensure https
  if(url.match(/^https?:\/\//)) {
    // Validate it contains the correct domain
    var result = url;
    if(platform === 'tiktok' && !result.includes('tiktok.com')) return '';
    if(platform === 'instagram' && !result.includes('instagram.com')) return '';
    if(platform === 'youtube' && !result.includes('youtube.com') && !result.includes('youtu.be')) return '';
    return result;
  }
  // Has domain but no protocol
  if(url.includes('tiktok.com') || url.includes('instagram.com') || url.includes('youtube.com') || url.includes('youtu.be')) {
    return 'https://' + url;
  }
  // Just a handle (@user or user) — must be alphanumeric (2+ chars, no spaces)
  let username = url.replace(/^@/, '');
  if(username && username.length >= 2 && /^[a-zA-Z0-9._]+$/.test(username)) {
    if(platform === 'tiktok') return 'https://www.tiktok.com/@' + username;
    if(platform === 'instagram') return 'https://www.instagram.com/' + username + '/';
    if(platform === 'youtube') return 'https://www.youtube.com/@' + username;
  }
  // Invalid input — return empty
  return '';
}

async function fetchProfilePhoto() {
  const tiktokRaw = document.getElementById('f-tiktok').value.trim();
  const igRaw = document.getElementById('f-instagram').value.trim();
  if(!tiktokRaw && !igRaw) {
    showToast('Ingresa un link de TikTok o Instagram primero', 'error');
    return;
  }
  const btn = document.getElementById('btn-fetch-photo');
  if(btn) { btn.disabled = true; btn.textContent = 'Buscando foto...'; }

  // Normalize URLs - build full URLs from handles/usernames if needed
  const urls = [];
  if(tiktokRaw) {
    const tiktokUrl = normalizeSocialUrl(tiktokRaw, 'tiktok');
    if(tiktokUrl) urls.push(tiktokUrl);
  }
  if(igRaw) {
    const igUrl = normalizeSocialUrl(igRaw, 'instagram');
    if(igUrl) urls.push(igUrl);
  }

  if(urls.length === 0) {
    showToast('No se pudo reconocer el link. Usa un link completo o nombre de usuario.', 'error');
    if(btn) { btn.disabled = false; btn.textContent = 'Extraer de TikTok / IG'; }
    return;
  }

  let found = false;
  let lastError = '';
  for(const url of urls) {
    try {
      const resp = await fetch('/.netlify/functions/fetch-profile-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      if(!resp.ok) {
        lastError = resp.status === 502 || resp.status === 503
          ? 'Servicio temporalmente no disponible. Intenta en unos minutos.'
          : 'Error del servidor (' + resp.status + ')';
        continue;
      }
      const data = await resp.json();
      if(data.photoUrl) {
        currentPhoto = data.photoUrl;
        updatePhotoPreview(currentPhoto);
        showToast('Foto extraída de ' + (data.platform === 'tiktok' ? 'TikTok' : 'Instagram'), 'success');
        found = true;
        break;
      }
      if(data.error) lastError = data.error;
    } catch(e) {
      console.warn('fetchProfilePhoto error for ' + url + ':', e);
      if(e.name === 'TypeError' && e.message.includes('Failed to fetch')) {
        lastError = 'Error de conexión — verifica tu internet o intenta de nuevo.';
      } else {
        lastError = e.message || 'Error desconocido al buscar foto.';
      }
    }
  }
  if(!found) {
    showToast(lastError || 'No se pudo extraer la foto. Intenta subir una manualmente.', 'error');
  }
  if(btn) { btn.disabled = false; btn.textContent = 'Extraer de TikTok / IG'; }
}

// ===================== BULK FETCH PROFILE PHOTOS =====================
async function fetchPhotosSelected() {
  const sel = talents.filter(t => selectedIds.has(t.id));
  if (!sel.length) { showToast('No hay talentos seleccionados', 'error'); return; }
  // Only process talents without a photo
  const noPhoto = sel.filter(t => !t.foto);
  if (noPhoto.length === 0) { showToast('Todos los talentos seleccionados ya tienen foto', 'info'); return; }
  if (!confirm('Extraer foto de perfil para ' + noPhoto.length + ' talento(s) sin foto?')) return;

  showToast('Extrayendo fotos... 0/' + noPhoto.length, 'info');
  let ok = 0, fail = 0;
  for (let i = 0; i < noPhoto.length; i++) {
    const t = noPhoto[i];
    const urls = [];
    if (t.tiktok) {
      const u = normalizeSocialUrl(t.tiktok, 'tiktok');
      if (u) urls.push(u);
    }
    if (t.instagram) {
      const u = normalizeSocialUrl(t.instagram, 'instagram');
      if (u) urls.push(u);
    }
    if (urls.length === 0) { fail++; continue; }

    let found = false;
    for (const url of urls) {
      try {
        const resp = await fetch('/.netlify/functions/fetch-profile-photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        if (!resp.ok) continue;
        const data = await resp.json();
        if (data.photoUrl) {
          t.foto = data.photoUrl;
          if (sb && currentUser) {
            await sb.from('talentos').update({ foto: data.photoUrl }).eq('id', t.id);
          }
          ok++;
          found = true;
          break;
        }
      } catch (e) {
        console.warn('Bulk photo error for', t.nombre, e.message);
      }
    }
    if (!found) fail++;
    // Update progress every 3
    if ((i + 1) % 3 === 0 || i === noPhoto.length - 1) {
      showToast('Extrayendo fotos... ' + (i + 1) + '/' + noPhoto.length, 'info');
    }
    await new Promise(r => setTimeout(r, 300));
  }
  renderTalents();
  if (ok > 0) showToast(ok + ' foto(s) extraída(s)', 'success');
  else showToast('No se pudo extraer ninguna foto', 'error');
}

// ===================== TALENT CRUD =====================
async function saveTalent() {
  const nombre = document.getElementById('f-nombre').value.trim();
  if(!nombre) { showToast('El nombre es obligatorio', 'error'); return; }
  const paises = [...formSelectedPaises].map(function(p){return normalizeCountry(p.replace(/^[\u{1F1E6}-\u{1FFFF}\s]+/gu,'').trim());}).filter(Boolean);
  if(paises.length === 0) { showToast('Selecciona al menos un país', 'error'); return; }
  const cats = Array.from(document.querySelectorAll('.cat-check.selected')).map(el=>el.textContent.trim());
  if(cats.length === 0) { showToast('Selecciona al menos una categoría', 'error'); return; }
  const tiktokVal = normalizeSocialUrl(document.getElementById('f-tiktok').value.trim(), 'tiktok') || '';
  const instagramVal = normalizeSocialUrl(document.getElementById('f-instagram').value.trim(), 'instagram') || '';
  const youtubeVal = normalizeSocialUrl(document.getElementById('f-youtube').value.trim(), 'youtube') || '';

  // Duplicate check (skip if editing the same talent)
  // Compare by extracted handle to avoid URL format mismatches
  function _extractHandle(url) {
    if (!url) return '';
    const m = url.toLowerCase().match(/@([^/?#]+)/);
    if (m) return m[1];
    const parts = url.toLowerCase().replace(/\/+$/,'').split('/');
    return parts[parts.length - 1] || '';
  }
  const dupeByName = talents.find(t => t.id !== editingId && t.nombre.toLowerCase().trim() === nombre.toLowerCase());
  const dupeByTT = tiktokVal && talents.find(t => t.id !== editingId && t.tiktok && _extractHandle(t.tiktok) === _extractHandle(tiktokVal));
  const dupeByIG = instagramVal && talents.find(t => t.id !== editingId && t.instagram && _extractHandle(t.instagram) === _extractHandle(instagramVal));
  const dupeByYT = youtubeVal && talents.find(t => t.id !== editingId && t.youtube && _extractHandle(t.youtube) === _extractHandle(youtubeVal));
  if (dupeByName) { showToast('Ya existe un talento con el nombre "' + dupeByName.nombre + '"', 'error'); return; }
  if (dupeByTT) { showToast('El TikTok ya está asignado a "' + dupeByTT.nombre + '"', 'error'); return; }
  if (dupeByIG) { showToast('El Instagram ya está asignado a "' + dupeByIG.nombre + '"', 'error'); return; }
  if (dupeByYT) { showToast('El YouTube ya está asignado a "' + dupeByYT.nombre + '"', 'error'); return; }

  const data = {
    nombre, paises,
    foto: currentPhoto,
    ciudad: document.getElementById('f-ciudad').value.trim(),
    telefono: document.getElementById('f-telefono').value.trim(),
    email: document.getElementById('f-email').value.trim(),
    tiktok: tiktokVal,
    instagram: instagramVal,
    youtube: youtubeVal,
    valores: document.getElementById('f-valores').value.trim(),
    genero: (document.getElementById('f-genero') ? document.getElementById('f-genero').value : ''),
    keywords: (document.getElementById('f-keywords') ? document.getElementById('f-keywords').value.trim().toLowerCase() : ''),
    tipo_contenido: (document.getElementById('f-tipo-contenido') ? document.getElementById('f-tipo-contenido').value.trim() : ''),
    calidad: (document.getElementById('f-calidad') ? document.getElementById('f-calidad').value : ''),
    marcas_previas: (document.getElementById('f-marcas-previas') ? document.getElementById('f-marcas-previas').value.trim() : ''),
    notas_internas: (document.getElementById('f-notas-internas') ? document.getElementById('f-notas-internas').value.trim() : ''),
    tiene_manager: (document.getElementById('f-tiene-manager') ? document.getElementById('f-tiene-manager').value === 'true' : false),
    categorias: cats,
    updated: new Date().toISOString().split('T')[0]
  };
  const manualSeg = {
    tiktok: parseInt(document.getElementById('f-seg-tiktok').value) || 0,
    instagram: parseInt(document.getElementById('f-seg-instagram').value) || 0,
    youtube: parseInt(document.getElementById('f-seg-youtube').value) || 0,
  };
  if(editingId) {
    const idx = talents.findIndex(t=>t.id===editingId);
    if(idx>-1) {
      // Save snapshot for undo before overwriting
      _lastUndo = {type: 'edit-talent', talent: JSON.parse(JSON.stringify(talents[idx]))};
      talents[idx] = {...talents[idx], ...data, seguidores: manualSeg};
      showUndoToast('Talento "' + nombre + '" actualizado');
    }
  } else {
    talents.push({id:nextTalentId++, ...data, seguidores: manualSeg});
    showToast('Talento agregado', 'success');
  }
  const _wasEditingId = editingId;
  editingId = null;
  closeModal('talent-modal');
  const savedTalent = _wasEditingId ? talents.find(t=>t.id===_wasEditingId) : talents[talents.length-1];
  if(sb && currentUser && savedTalent) {
    const row = {
      id: savedTalent.id, nombre: savedTalent.nombre||'', paises: savedTalent.paises||[],
      ciudad: savedTalent.ciudad||'', telefono: savedTalent.telefono||'', email: savedTalent.email||'',
      tiktok: savedTalent.tiktok||'', instagram: savedTalent.instagram||'', youtube: savedTalent.youtube||'',
      valores: savedTalent.valores||'', categorias: savedTalent.categorias||[], foto: savedTalent.foto||'',
      seguidores: savedTalent.seguidores||{tiktok:0,instagram:0,youtube:0}, updated: savedTalent.updated||null,
      genero: savedTalent.genero||'', keywords: savedTalent.keywords||'',
      tipo_contenido: savedTalent.tipo_contenido||'', calidad: savedTalent.calidad||'',
      marcas_previas: savedTalent.marcas_previas||'', notas_internas: savedTalent.notas_internas||'',
      tiene_manager: savedTalent.tiene_manager||false
    };
    sb.from('talentos').upsert([row], {onConflict:'id'})
      .then(({error}) => {
        if(error) { console.error('Upsert talent error:', error); showToast('Error al guardar en la nube: ' + error.message, 'error'); }
        else {
          const ind = document.getElementById('sync-indicator');
          if(ind) { ind.style.opacity='1'; setTimeout(()=>{ind.style.opacity='0';},1800); }
          // Persist nextTalentId if this was a new talent
          if(!_wasEditingId) sb.from('app_config').upsert({key:'next_talent_id', value: nextTalentId}).catch(e => console.warn('next_talent_id:', e));
        }
      });
  }

  syncToExtensionStorage();
  
  // Persist any new categories from this talent to app_config
  let newCats = false;
  cats.forEach(function(c) {
    if (!CATEGORIES.includes(c)) { CATEGORIES.push(c); newCats = true; }
  });
  if (newCats) saveData();

  renderTalents();
  updateStats();
  updatePlatformCounts();
}

function deleteTalent() {
  if(!editingId) return;
  if(!confirm('¿Eliminar este talento? Se puede deshacer.')) return;
  const idToDel = editingId;
  const talentCopy = JSON.parse(JSON.stringify(talents.find(t => t.id === idToDel)));
  if(!talentCopy) return;
  // Save roster links before removing
  const rosterLinks = [];
  rosters.forEach(r => { if(r.talentIds.includes(idToDel)) rosterLinks.push({rosterId: r.id, talentId: idToDel}); });

  // Store undo
  _lastUndo = {type: 'delete-talent', talent: talentCopy, rosterLinks: rosterLinks};

  // Delete locally
  talents = talents.filter(t => t.id !== idToDel);
  rosters.forEach(r => { r.talentIds = r.talentIds.filter(id => id !== idToDel); });
  selectedIds.delete(idToDel);
  closeModal('talent-modal');
  updateBottomBar(); renderTalents(); updateStats(); updatePlatformCounts();

  // Delete from Supabase
  if(sb && currentUser) {
    sb.from('talentos').delete().eq('id', idToDel);
    rosterLinks.forEach(rl => {
      const r = rosters.find(x => x.id === rl.rosterId);
      if(r) sb.from('rosters').update({talent_ids: r.talentIds}).eq('id', rl.rosterId);
    });
  }
  showUndoToast('Talento "' + talentCopy.nombre + '" eliminado');
}

function deleteSelectedTalents() {
  const count = selectedIds.size;
  if(count === 0) return;
  if(!confirm('¿Eliminar ' + count + ' talento(s)? Se puede deshacer.')) return;
  const idsToDelete = [...selectedIds];
  const talentsCopy = talents.filter(t => selectedIds.has(t.id)).map(t => JSON.parse(JSON.stringify(t)));
  // Save roster links
  const rosterLinks = [];
  rosters.forEach(r => { idsToDelete.forEach(id => { if(r.talentIds.includes(id)) rosterLinks.push({rosterId:r.id, talentId:id}); }); });

  _lastUndo = {type: 'delete-talents', talents: talentsCopy, rosterLinks: rosterLinks};

  talents = talents.filter(t => !selectedIds.has(t.id));
  rosters.forEach(r => { r.talentIds = r.talentIds.filter(id => !selectedIds.has(id)); });
  selectedIds.clear();
  updateBottomBar(); renderTalents(); updateStats(); updatePlatformCounts();

  if(sb && currentUser) {
    sb.from('talentos').delete().in('id', idsToDelete);
    const _rids=[...new Set(rosterLinks.map(rl=>rl.rosterId))]; _rids.forEach(rid=>{const r=rosters.find(x=>x.id===rid);if(r)sb.from('rosters').update({talent_ids:r.talentIds}).eq('id',rid);});
  }
  showUndoToast(count + ' talento' + (count!==1?'s':'') + ' eliminado' + (count!==1?'s':''));
}

// ===================== YOUTUBE + APIFY API =====================
let ytApiKey = '';
let apifyToken = '';
let ensembleToken = '';

function loadApiKey() {
  try {
    ytApiKey       = localStorage.getItem('beme_yt_api_key')       || '';
    apifyToken     = localStorage.getItem('beme_apify_token')     || '';
    ensembleToken  = localStorage.getItem('beme_ensemble_token')  || '';
  } catch(e) {}
  updateApiKeyUI();
}

function updateApiKeyUI() {
  ['api-status-dot','api-status-dot2'].forEach(function(id){
    var dot=document.getElementById(id); if(!dot) return;
    if(ytApiKey) dot.classList.add('active'); else dot.classList.remove('active');
  });
  var label=document.getElementById('yt-api-btn-label');
  if(label) label.textContent=ytApiKey?'YouTube API ✓':'Sin clave';
  var inline=document.getElementById('yt-api-status-inline');
  if(inline) inline.textContent=ytApiKey?'Clave configurada ✓':'Sin clave — clic para configurar';
  var apifyDot=document.getElementById('apify-status-dot');
  if(apifyDot){if(apifyToken)apifyDot.classList.add('active');else apifyDot.classList.remove('active');}
  var apifyLbl=document.getElementById('apify-status-text');
  if(apifyLbl) apifyLbl.textContent=apifyToken?'Apify ✓':'Sin token';
  var ensDot=document.getElementById('ensemble-status-dot');
  if(ensDot){if(ensembleToken)ensDot.classList.add('active');else ensDot.classList.remove('active');}
  var ensLbl=document.getElementById('ensemble-status-text');
  if(ensLbl) ensLbl.textContent=ensembleToken?'Token configurado ✓':'';
}

function openApiKeyModal() {
  var inp=document.getElementById('yt-api-key-input');
  if(inp){inp.value=ytApiKey;inp.type='password';}
  var statusRow=document.getElementById('yt-api-status-row');
  if(statusRow) statusRow.style.display=ytApiKey?'flex':'none';
  var apifyInp=document.getElementById('apify-token-input');
  if(apifyInp) apifyInp.value=apifyToken;
  var apifyStatus=document.getElementById('apify-status-text');
  if(apifyStatus) apifyStatus.textContent=apifyToken?'Token configurado ✓':'';
  var ensInp=document.getElementById('ensemble-token-input');
  if(ensInp) ensInp.value=ensembleToken;
  var ensStatus=document.getElementById('ensemble-status-text');
  if(ensStatus) ensStatus.textContent=ensembleToken?'Token configurado ✓':'';
  openModal('yt-api-modal');
}

function toggleApiKeyVisibility() {
  const inp = document.getElementById('yt-api-key-input');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

async function saveApiKey() {
  const key = document.getElementById('yt-api-key-input').value.trim();
  if(!key) { showToast('Ingresa una clave de API', 'error'); return; }
  showToast('Probando clave...', 'info');
  try {
    // Test with a known-good channel (YouTube's own channel)
    const resp = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=id&id=UCBR8-60-B28hp2BmDPdntcQ&key=${key}`);
    const data = await resp.json();
    if(data.error) {
      const msg = data.error.status === 'API_KEY_INVALID'
        ? 'Clave inválida. Verifica que la copiaste correctamente.'
        : `Error: ${data.error.message}`;
      showToast(msg, 'error'); return;
    }
    // Response with items means the key works
    ytApiKey = key;
    try { localStorage.setItem('beme_yt_api_key', key); } catch(e) {}
    updateApiKeyUI();
    document.getElementById('yt-api-status-row').style.display = 'flex';
    closeModal('yt-api-modal');
    showToast('¡Clave de YouTube API guardada!', 'success');
  } catch(e) {
    showToast('Error de conexión al verificar la clave', 'error');
  }
}

function clearApiKey() {
  ytApiKey = '';
  try { localStorage.removeItem('beme_yt_api_key'); } catch(e) {}
  document.getElementById('yt-api-key-input').value = '';
  document.getElementById('yt-api-status-row').style.display = 'none';
  updateApiKeyUI();
  closeModal('yt-api-modal');
  showToast('Clave eliminada', 'info');
}

// ── Apify token management ───────────────────────────────────
function saveApifyToken() {
  var inp = document.getElementById('apify-token-input');
  var key = inp ? inp.value.trim() : '';
  if (!key) { showToast('Ingresá el token de Apify','error'); return; }
  apifyToken = key;
  try { localStorage.setItem('beme_apify_token', key); } catch(e) {}
  updateApiKeyUI();
  showToast('Token de Apify guardado ✓','success');
}
function clearApifyToken() {
  apifyToken = '';
  try { localStorage.removeItem('beme_apify_token'); } catch(e) {}
  var inp = document.getElementById('apify-token-input');
  if (inp) inp.value = '';
  var s = document.getElementById('apify-status-text');
  if (s) s.textContent = '';
  updateApiKeyUI();
  showToast('Token eliminado','info');
}
async function testApifyToken() {
  var inp = document.getElementById('apify-token-input');
  var key = inp ? inp.value.trim() : '';
  if (key) { apifyToken=key; try{localStorage.setItem('beme_apify_token',key);}catch(e){} }
  if (!apifyToken) { showToast('Ingresá el token primero','error'); return; }
  showToast('Probando Apify...','info');
  try {
    var resp = await fetch('/.netlify/functions/apify-scraper',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({platform:'instagram',username:'instagram',apifyToken})
    });
    var data = await resp.json();
    if (data.followers !== null && data.followers !== undefined) {
      updateApiKeyUI();
      var s=document.getElementById('apify-status-text');
      if(s) s.textContent='OK — '+data.followers.toLocaleString('es-ES')+' seguidores';
      showToast('Apify conectado ✓','success');
    } else { showToast('Sin respuesta. Verificá el token.','error'); }
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

// ── EnsembleData token management ────────────────────────────
function saveEnsembleToken() {
  var inp = document.getElementById('ensemble-token-input');
  var key = inp ? inp.value.trim() : '';
  if (!key) { showToast('Ingresá el token de EnsembleData','error'); return; }
  ensembleToken = key;
  try { localStorage.setItem('beme_ensemble_token', key); } catch(e) {}
  updateApiKeyUI();
  showToast('Token de EnsembleData guardado ✓','success');
}
function clearEnsembleToken() {
  ensembleToken = '';
  try { localStorage.removeItem('beme_ensemble_token'); } catch(e) {}
  var inp = document.getElementById('ensemble-token-input');
  if (inp) inp.value = '';
  var s = document.getElementById('ensemble-status-text');
  if (s) s.textContent = '';
  updateApiKeyUI();
  showToast('Token eliminado','info');
}
async function testEnsembleToken() {
  var inp = document.getElementById('ensemble-token-input');
  var key = inp ? inp.value.trim() : '';
  if (key) { ensembleToken=key; try{localStorage.setItem('beme_ensemble_token',key);}catch(e){} }
  if (!ensembleToken) { showToast('Ingresá el token primero','error'); return; }
  showToast('Probando EnsembleData...','info');
  try {
    var resp = await fetch('/.netlify/functions/ensemble-scraper',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({platform:'tiktok',username:'tiktok',ensembleToken})
    });
    var data = await resp.json();
    if (data.followers !== null && data.followers !== undefined) {
      updateApiKeyUI();
      var s=document.getElementById('ensemble-status-text');
      if(s) s.textContent='OK — @tiktok: '+data.followers.toLocaleString('es-ES')+' seguidores';
      showToast('EnsembleData conectado ✓','success');
    } else { showToast('Sin respuesta: '+(data.error||'verificá el token'),'error'); }
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

// Extract channel identifier from YouTube URL
function extractYouTubeId(url) {
  if(!url) return null;
  // @handle format → use forHandle
  const handleMatch = url.match(/youtube\.com\/@([^/?#&]+)/);
  if(handleMatch) return { type: 'handle', value: '@' + handleMatch[1] };
  // /channel/UCxxxxxx
  const channelMatch = url.match(/youtube\.com\/channel\/(UC[^/?#&]+)/);
  if(channelMatch) return { type: 'id', value: channelMatch[1] };
  // /user/username
  const userMatch = url.match(/youtube\.com\/user\/([^/?#&]+)/);
  if(userMatch) return { type: 'forUsername', value: userMatch[1] };
  // /c/customname
  const cMatch = url.match(/youtube\.com\/c\/([^/?#&]+)/);
  if(cMatch) return { type: 'forUsername', value: cMatch[1] };
  // Bare youtube.com/ChannelName (no /c/, /user/, /@, /channel/ prefix)
  const bareMatch = url.match(/youtube\.com\/([^/?#&@]+)\s*$/);
  if(bareMatch && !['watch','playlist','feed','shorts','live','gaming','premium','music','results'].includes(bareMatch[1].toLowerCase())) {
    return { type: 'forUsername', value: bareMatch[1] };
  }
  return null;
}

async function fetchYouTubeSubscribers(ytUrl) {
  const id = extractYouTubeId(ytUrl);
  if(!id) return { error: 'URL de YouTube no reconocida' };
  const base = 'https://www.googleapis.com/youtube/v3/channels?part=statistics&key=' + ytApiKey;

  async function tryFetch(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const resp = await fetch(url, {signal: controller.signal});
      clearTimeout(timer);
      const data = await resp.json();
      if(data.error) return { error: `${data.error.code}: ${data.error.message}` };
      if(!data.items || data.items.length === 0) return { empty: true };
      const stats = data.items[0].statistics;
      if(stats.hiddenSubscriberCount) return { error: 'Canal oculta sus suscriptores' };
      return { subscribers: parseInt(stats.subscriberCount || '0') };
    } catch(e) {
      clearTimeout(timer);
      return { error: e.name === 'AbortError' ? 'timeout' : e.message };
    }
  }

  try {
    // 1. Primary attempt based on URL type
    let primaryUrl;
    if(id.type === 'handle') primaryUrl = `${base}&forHandle=${encodeURIComponent(id.value)}`;
    else if(id.type === 'id') primaryUrl = `${base}&id=${encodeURIComponent(id.value)}`;
    else primaryUrl = `${base}&forUsername=${encodeURIComponent(id.value)}`;

    let result = await tryFetch(primaryUrl);

    // 2. If handle lookup empty, try without @
    if(result.empty && id.type === 'handle') {
      const withoutAt = id.value.replace(/^@/, '');
      result = await tryFetch(`${base}&forHandle=${encodeURIComponent(withoutAt)}`);
    }

    // 3. If forUsername empty (e.g. /c/ or /user/ URLs), try as forHandle
    if(result.empty && id.type === 'forUsername') {
      result = await tryFetch(`${base}&forHandle=${encodeURIComponent(id.value)}`);
      if(result.empty) {
        result = await tryFetch(`${base}&forHandle=${encodeURIComponent('@' + id.value)}`);
      }
    }

    // 4. Last resort for ANY type: use Search API to find the channel ID
    if(result.empty) {
      try {
        const searchTerm = id.value.replace(/^@/, '');
        console.log('[Beme YT] Search fallback for:', searchTerm);
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=id&type=channel&q=${encodeURIComponent(searchTerm)}&maxResults=1&key=${ytApiKey}`;
        const sc = new AbortController();
        const st = setTimeout(() => sc.abort(), 8000);
        const sResp = await fetch(searchUrl, {signal: sc.signal});
        clearTimeout(st);
        const sData = await sResp.json();
        if(sData.items && sData.items.length > 0) {
          const channelId = sData.items[0].id.channelId;
          result = await tryFetch(`${base}&id=${channelId}`);
        }
      } catch(e) { console.warn('[Beme YT] Search error:', e.message); }
    }

    if(result.empty) return { error: 'Canal no encontrado. Verifica el link de YouTube.' };
    return result;
  } catch(e) {
    return { error: e.message };
  }
}

async function refreshYouTubeSingle(talentId) {
  if(!ytApiKey) {
    showToast('Configura tu clave de YouTube API primero', 'error');
    openApiKeyModal();
    return;
  }
  const t = talents.find(x => x.id === talentId);
  if(!t || !t.youtube) return;
  const btn = document.getElementById('yt-btn-' + talentId);
  if(btn) btn.classList.add('spinning');
  const result = await fetchYouTubeSubscribers(t.youtube);
  if(btn) btn.classList.remove('spinning');
  if(result && result.subscribers !== undefined) {
    t.seguidores.youtube = result.subscribers;
    t.updated = new Date().toISOString().split('T')[0];
    saveData();
    renderTalents();
    updateStats();
    showToast(`${t.nombre}: ${formatFollowers(result.subscribers)} suscriptores`, 'success');
  } else {
    const msg = result?.error || 'Error desconocido';
    showToast(`Error con ${t.nombre}: ${msg}`, 'error');
  }
}

async function updateAllFollowers(talentsOverride) {
  if(!ytApiKey) {
    showToast('Configura tu clave de YouTube API primero', 'error');
    openApiKeyModal();
    return;
  }
  const ytTalents = (talentsOverride || talents).filter(t => t.youtube);
  if(ytTalents.length === 0) {
    showToast('Ningún talento tiene link de YouTube', 'info');
    return;
  }

  // Safe button ref
  const btn = document.getElementById('update-yt-btn');
  if(btn) { btn.disabled = true; }

  const progressBar = document.getElementById('yt-progress-bar');
  const progressFill = document.getElementById('yt-progress-fill');
  const progressText = document.getElementById('yt-progress-text');
  const progressCount = document.getElementById('yt-progress-count');
  if(progressBar) progressBar.style.display = 'flex';

  let done = 0, ok = 0, errors = 0;
  try {
    for(const t of ytTalents) {
      if(progressText) progressText.textContent = `YouTube: ${t.nombre}`;
      if(progressCount) progressCount.textContent = `${done}/${ytTalents.length}`;
      if(progressFill) progressFill.style.width = `${(done/ytTalents.length)*100}%`;

      try {
        const result = await fetchYouTubeSubscribers(t.youtube);
        if(result && result.subscribers !== undefined) {
          t.seguidores.youtube = result.subscribers;
          t.updated = new Date().toISOString().split('T')[0];
          ok++;
          if(sb && currentUser) {
            sb.from('talentos')
              .update({ seguidores: {...t.seguidores}, updated: t.updated })
              .eq('id', t.id)
              .then(({error}) => { if(error) console.warn('YT patch error:', t.id, error.message); });
          }
        } else { errors++; }
      } catch(e) { errors++; console.warn('[Beme] YT error for', t.nombre, e.message); }
      done++;
      await new Promise(r => setTimeout(r, 200));
    }
  } finally {
    if(progressFill) progressFill.style.width = '100%';
    await new Promise(r => setTimeout(r, 500));
    if(progressBar) progressBar.style.display = 'none';
    if(btn) btn.disabled = false;
  }

  renderTalents();
  updateStats();

  if(ok > 0) showToast('YouTube: ' + ok + ' canal' + (ok!==1?'es':'') + ' actualizado' + (ok!==1?'s':''), 'success');
  else showToast('YouTube: sin datos. Verifica los links y la clave API.', 'error');
}

// ===================== EXPORT CSV =====================
function exportCSV(list) {
  const data = list || talents;
  const headers = ['ID','Nombre','Países','Ciudad','TikTok','Instagram','YouTube','Seguidores TikTok','Seguidores Instagram','Seguidores YouTube','Eng. TikTok %','Eng. Instagram %','Avg Views TikTok','Avg Views Instagram','Categorías','Valores','Teléfono','Email','Género','Keywords'];
  const rows = data.map(t => [
    t.id,t.nombre,(t.paises||[t.pais||'']).filter(Boolean).map(function(p){return p.replace(/^[\u{1F1E6}-\u{1FFFF}\s]+/gu,'').trim();}).filter(Boolean).join(';'),t.ciudad,t.tiktok,t.instagram,t.youtube,
    t.seguidores.tiktok,t.seguidores.instagram,t.seguidores.youtube,
    (t.engagement||{}).tiktok||'',(t.engagement||{}).instagram||'',
    (t.avg_views||{}).tiktok||'',(t.avg_views||{}).instagram||'',
    t.categorias.join(';'),t.valores,t.telefono,t.email,t.genero||'',t.keywords||''
  ].map(v=>`"${String(v||'').replace(/"/g,'""')}"`).join(','));
  const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'talentos_' + new Date().toISOString().split('T')[0] + '.csv';
  a.click(); URL.revokeObjectURL(url);
  showToast('CSV exportado', 'success');
}
function exportSelectedCSV() {
  const sel = talents.filter(t=>selectedIds.has(t.id));
  if(!sel.length) { showToast('No hay talentos seleccionados', 'error'); return; }
  exportCSV(sel);
}

// ===================== ROSTER MANAGEMENT =====================
let rosterSort = 'date-desc'; // 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc'
let archivedExpanded = false;

function sortRosterList(list) {
  return [...list].sort(function(a, b) {
    if (rosterSort === 'name-asc') return (a.name || '').localeCompare(b.name || '');
    if (rosterSort === 'name-desc') return (b.name || '').localeCompare(a.name || '');
    if (rosterSort === 'date-asc') return (a.created || '').localeCompare(b.created || '');
    // date-desc (default)
    return (b.created || '').localeCompare(a.created || '');
  });
}

function renderRosterCard(r, isArchived) {
  var rosterTalents = r.talentIds.map(function(id) { return talents.find(function(t){return t.id===id;}); }).filter(Boolean);
  var card = document.createElement('div');
  card.className = 'roster-card-mgr';
  if (isArchived) card.style.opacity = '0.7';
  var avatarsPrev = rosterTalents.slice(0,3).map(function(t) {
    return t.foto ? '<img src="'+t.foto+'" style="width:24px;height:24px;border-radius:50%;object-fit:cover;border:2px solid var(--surface);margin-left:-6px">' :
    '<div style="width:24px;height:24px;border-radius:50%;background:rgba(178,0,93,0.2);border:2px solid var(--surface);display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:var(--primary);margin-left:-6px">'+getInitials(t.nombre)+'</div>';
  }).join('');

  var archiveBtn = isArchived
    ? '<button class="btn btn-outline btn-sm" data-action="unarchive-roster" data-id="'+r.id+'" title="Desarchivar"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg></button>'
    : '<button class="btn btn-outline btn-sm" data-action="archive-roster" data-id="'+r.id+'" title="Archivar"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg></button>';

  const brandEditCount = rosterBrandEdits[r.id] || 0;
  card.style.cursor = 'pointer';
  card.onclick = function(e) {
    if (e.target.closest('.roster-btn')) return; // let buttons handle themselves
    viewRoster(r.id);
  };
  var rid = r.id;
  var linkCount = rosterLinks.filter(function(l){return l.roster_id===rid;}).length;
  card.innerHTML = '\
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">\
        <div class="roster-name" style="flex:1;min-width:0;">'+escapeHtml(r.name)+'</div>\
        '+(brandEditCount ? '<span style="background:linear-gradient(135deg,#b2005d,#9414E0);color:#fff;font-size:9px;font-weight:800;padding:2px 7px;border-radius:10px;white-space:nowrap" title="'+brandEditCount+' cambios de la marca">'+brandEditCount+' nuevo'+(brandEditCount!==1?'s':'')+'</span>' : '')+'\
        <button class="btn btn-outline btn-sm roster-btn" onclick="openCreateRosterModal('+rid+')" title="Editar nombre" style="padding:3px 7px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg></button>\
        <button class="btn btn-outline btn-sm roster-btn" onclick="duplicateRoster('+rid+')" title="Duplicar" style="padding:3px 7px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>\
        <button class="btn btn-outline btn-sm roster-btn" onclick="'+(isArchived?'unarchiveRoster':'archiveRoster')+'('+rid+')" title="'+(isArchived?'Desarchivar':'Archivar')+'" style="padding:3px 7px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg></button>\
      </div>\
      '+(r.description ? '<div class="roster-desc">'+escapeHtml(r.description)+'</div>' : '')+'\
      <div class="roster-meta">\
        <span class="roster-talent-count">\
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>\
          '+rosterTalents.length+' talentos\
        </span>\
        <span>Creado '+escapeHtml(r.created || '')+'</span>\
      </div>\
      '+(rosterTalents.length > 0 ? '<div style="display:flex;margin-left:6px;margin-bottom:10px">'+avatarsPrev+(rosterTalents.length>3?'<div style="width:24px;height:24px;border-radius:50%;background:var(--surface2);border:2px solid var(--surface);display:inline-flex;align-items:center;justify-content:center;font-size:9px;color:var(--text-muted);margin-left:-6px">+'+(rosterTalents.length-3)+'</div>':'')+'</div>' : '')+'\
      <div class="roster-actions" style="flex-wrap:wrap">\
        '+(brandEditCount ? '<button class="btn btn-outline btn-sm roster-btn" onclick="clearRosterBrandEdits('+rid+')" title="Marcar leido" style="color:#b2005d;border-color:rgba(178,0,93,0.4);font-size:10px">✓ Leido</button>' : '')+'\
        <button class="btn btn-outline btn-sm roster-btn" onclick="openAIDescsModal('+rid+')" title="Generar descripciones AI" style="color:#9414E0;border-color:rgba(148,20,224,0.4);font-weight:700;">AI</button>\
        <button class="btn btn-outline btn-sm roster-btn" onclick="openManageLinksModal('+rid+')" title="Links por cliente" style="color:#0ea5e9;border-color:rgba(14,165,233,0.4);font-weight:600;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> '+(linkCount || '')+'</button>\
        <button class="btn btn-outline btn-sm roster-btn" onclick="copyRosterUrl('+rid+')" title="Copiar URL directa" style="color:#b2005d;border-color:rgba(178,0,93,0.4);"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></button>\
        <button class="btn btn-outline btn-sm roster-btn" onclick="copyCompactRosterUrl('+rid+')" title="URL compacta (solo ver)" style="color:#4c6ef5;border-color:rgba(76,110,245,0.4);"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3H5a2 2 0 0 0-2 2v11"/><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M10 12h9"/><path d="M10 16h5"/></svg></button>\
        <button class="btn btn-outline btn-sm roster-btn" onclick="openManageTalentsForRoster('+rid+')" title="Editar talentos"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>\
        <button class="btn btn-danger btn-sm roster-btn" onclick="if(confirm(\'Eliminar roster?\'))deleteRoster('+rid+')" title="Eliminar"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>\
      </div>';
  return card;
}

// ── ROSTER LINKS MANAGEMENT ──────────────────────────────────
let managingLinksRosterId = null;

function openManageLinksModal(rosterId) {
  managingLinksRosterId = rosterId;
  var roster = rosters.find(function(r) { return r.id === rosterId; });
  document.getElementById('manage-links-title').textContent = 'Links — ' + (roster ? roster.name : '');
  document.getElementById('new-link-client-name').value = '';
  document.getElementById('new-link-compact').checked = false;
  renderLinksList();
  openModal('manage-links-modal');
}

function renderLinksList() {
  var links = rosterLinks.filter(function(l) { return l.roster_id === managingLinksRosterId; });
  var container = document.getElementById('links-list');
  if (!links.length) {
    container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-dim);font-size:13px;">No hay links creados. Agrega uno arriba.</div>';
    return;
  }
  container.innerHTML = links.map(function(link) {
    var url = 'https://bemeagency.netlify.app/roster.html?link=' + link.token;
    var modeColor = link.compact ? '#f59e0b' : '#22c55e';
    var modeLabel = link.compact ? 'Solo ver' : 'Cotizaciones';
    return '<div style="display:flex;align-items:center;gap:8px;padding:12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface2);">' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:700;font-size:13px;">' + escapeHtml(link.client_name) + '</div>' +
        '<div style="font-size:10px;color:var(--text-dim);margin-top:2px;">' + new Date(link.created_at).toLocaleDateString('es-ES') + '</div>' +
      '</div>' +
      '<button class="btn btn-outline btn-sm" onclick="toggleLinkMode(' + link.id + ')" title="Cambiar modo" style="font-size:10px;font-weight:700;color:' + modeColor + ';border-color:' + modeColor + '40;min-width:90px;justify-content:center;">' + modeLabel + '</button>' +
      '<button class="btn btn-outline btn-sm" onclick="copyLinkUrl(\'' + link.token + '\')" title="Copiar URL"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></button>' +
      '<button class="btn btn-danger btn-sm" onclick="deleteRosterLink(' + link.id + ')" title="Eliminar" style="padding:4px 8px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>' +
    '</div>';
  }).join('');
}

async function createRosterLink() {
  var clientName = document.getElementById('new-link-client-name').value.trim();
  if (!clientName) { showToast('Escribe el nombre del cliente', 'error'); return; }
  var compact = document.getElementById('new-link-compact').checked;
  var token = Math.random().toString(36).substring(2, 10);
  var payload = { roster_id: managingLinksRosterId, client_name: clientName, token: token, compact: compact };
  var result = await sb.from('roster_links').insert(payload).select().single();
  if (result.error) { showToast('Error: ' + result.error.message, 'error'); return; }
  rosterLinks.push(result.data);
  renderLinksList();
  renderRosters();
  document.getElementById('new-link-client-name').value = '';
  showToast('Link creado para ' + clientName, 'success');
}

async function deleteRosterLink(linkId) {
  if (!confirm('Eliminar este link? Se perderán las selecciones del cliente.')) return;
  await sb.from('roster_links').delete().eq('id', linkId);
  rosterLinks = rosterLinks.filter(function(l) { return l.id !== linkId; });
  renderLinksList();
  renderRosters();
  showToast('Link eliminado', 'success');
}

async function toggleLinkMode(linkId) {
  var link = rosterLinks.find(function(l) { return l.id === linkId; });
  if (!link) return;
  link.compact = !link.compact;
  await sb.from('roster_links').update({ compact: link.compact }).eq('id', linkId);
  renderLinksList();
  showToast(link.client_name + ': ' + (link.compact ? 'Solo ver' : 'Con cotizaciones'), 'success');
}

function slugify(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9\s]/g,'').trim().replace(/\s+/g,'-').toLowerCase();
}
function copyLinkUrl(token) {
  var link = rosterLinks.find(function(l) { return l.token === token; });
  var roster = link ? rosters.find(function(r) { return r.id === link.roster_id; }) : null;
  var parts = [roster ? slugify(roster.name) : '', link && link.client_name ? slugify(link.client_name) : ''].filter(Boolean).join('--');
  var url = 'https://bemeagency.netlify.app/roster.html?link=' + token + (parts ? '&n=' + parts : '');
  copyTextWithToast(url, 'URL copiada para el cliente');
}

function filterRosters() { renderRosters(); }

function renderRosters() {
  var grid = document.getElementById('roster-manager-grid');
  var archGrid = document.getElementById('archived-roster-grid');
  var archSection = document.getElementById('archived-rosters-section');
  grid.innerHTML = '';
  if (archGrid) archGrid.innerHTML = '';

  var searchInput = document.getElementById('roster-search');
  var search = searchInput ? searchInput.value.toLowerCase().trim() : '';
  var active = sortRosterList(rosters.filter(function(r) { return !r.archived && (!search || r.name.toLowerCase().includes(search)); }));
  var archived = sortRosterList(rosters.filter(function(r) { return r.archived && (!search || r.name.toLowerCase().includes(search)); }));

  if (active.length === 0 && archived.length === 0) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:60px 20px"><div class="empty-icon">📋</div><h3>Sin rosters todavía</h3><p>Crea tu primer roster para organizar talentos por cliente.</p></div>';
  }

  active.forEach(function(r) { grid.appendChild(renderRosterCard(r, false)); });

  // Archived section
  if (archSection) {
    if (archived.length > 0) {
      archSection.style.display = 'block';
      var label = document.getElementById('archived-count-label');
      if (label) label.textContent = 'Archivados (' + archived.length + ')';
      if (archGrid && archivedExpanded) {
        archived.forEach(function(r) { archGrid.appendChild(renderRosterCard(r, true)); });
      }
    } else {
      archSection.style.display = 'none';
    }
  }
}

// ── ROSTER SORT ──────────────────────────────────────────────
let rosterSortOpen = false;

function toggleRosterSortDropdown() {
  rosterSortOpen = !rosterSortOpen;
  document.getElementById('roster-sort-panel').classList.toggle('open', rosterSortOpen);
}

function setRosterSort(val) {
  // Proxied through ACTION_MAP → applyRosterSort
}

// applyRosterSort: called from ACTION_MAP with data-id from the clicked button
function applyRosterSort(val) {
  rosterSort = val;
  const labels = {
    'date-desc': 'Más reciente',
    'date-asc': 'Más antiguo',
    'name-asc': 'A → Z',
    'name-desc': 'Z → A',
  };
  const lbl = document.getElementById('roster-sort-label');
  if (lbl) lbl.textContent = labels[val] || 'Ordenar';
  document.querySelectorAll('.roster-sort-opt').forEach(el => {
    el.classList.toggle('active', el.dataset.id === val);
  });
  rosterSortOpen = false;
  const panel = document.getElementById('roster-sort-panel');
  if (panel) panel.classList.remove('open');
  renderRosters();
}

function toggleArchivedRosters() {
  archivedExpanded = !archivedExpanded;
  var grid = document.getElementById('archived-roster-grid');
  var chevron = document.getElementById('archived-chevron');
  if (grid) grid.style.display = archivedExpanded ? 'grid' : 'none';
  if (chevron) chevron.style.transform = archivedExpanded ? 'rotate(180deg)' : '';
  if (archivedExpanded) renderRosters();
}

async function archiveRoster(id) {
  var r = rosters.find(function(x) { return x.id === id; });
  if (!r) return;
  r.archived = true;
  renderRosters(); updateStats();
  if (sb && currentUser) {
    await sb.from('rosters').update({archived: true}).eq('id', id);
  }
  showToast('Roster "' + r.name + '" archivado', 'info');
}

async function unarchiveRoster(id) {
  var r = rosters.find(function(x) { return x.id === id; });
  if (!r) return;
  r.archived = false;
  renderRosters(); updateStats();
  if (sb && currentUser) {
    await sb.from('rosters').update({archived: false}).eq('id', id);
  }
  showToast('Roster "' + r.name + '" restaurado', 'success');
}

function openCreateRosterModal(rosterId) {
  // If opening directly (not from openCreateRosterAndAdd), clear pending
  if(rosterId !== undefined || !_pendingRosterTalentIds) _pendingRosterTalentIds = null;
  document.getElementById('r-nombre').value = '';
  document.getElementById('r-desc').value = '';
  // Default all platforms on
  ['r-show-tt','r-show-ig','r-show-yt'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.checked = true;
  });
  editingRosterId = rosterId || null;
  if(rosterId) {
    const r = rosters.find(x => x.id === rosterId);
    if(r) {
      document.getElementById('r-nombre').value = r.name;
      document.getElementById('r-desc').value = r.description || '';
      if(r.platforms) {
        if(document.getElementById('r-show-tt')) document.getElementById('r-show-tt').checked = r.platforms.tt !== false;
        if(document.getElementById('r-show-ig')) document.getElementById('r-show-ig').checked = r.platforms.ig !== false;
        if(document.getElementById('r-show-yt')) document.getElementById('r-show-yt').checked = r.platforms.yt !== false;
      }
      document.getElementById('roster-create-title').textContent = 'Editar Roster';
    }
  } else {
    document.getElementById('roster-create-title').textContent = 'Nuevo Roster';
  }
  openModal('roster-create-modal');
}

async function saveRoster() {
  const name = document.getElementById('r-nombre').value.trim();
  if(!name) { showToast('El nombre es obligatorio', 'error'); return; }
  const desc = document.getElementById('r-desc').value.trim();
  const platforms = {
    tt: document.getElementById('r-show-tt')?.checked ?? true,
    ig: document.getElementById('r-show-ig')?.checked ?? true,
    yt: document.getElementById('r-show-yt')?.checked ?? true,
  };
  if(!platforms.tt && !platforms.ig && !platforms.yt) {
    showToast('Selecciona al menos una plataforma', 'error'); return;
  }
  closeModal('roster-create-modal');

  if(editingRosterId) {
    // UPDATE
    const r = rosters.find(x => x.id === editingRosterId);
    if(r) { r.name = name; r.description = desc; r.platforms = platforms; }
    updateStats(); renderRosters();
    if(sb && currentUser) {
      sb.from('rosters').update({name, description:desc, platforms}).eq('id', editingRosterId)
        .then(({error}) => {
          if(error) showToast('Error: ' + error.message, 'error');
          else showToast('Roster actualizado', 'success');
        });
    } else { showToast('Roster actualizado', 'success'); }
  } else {
    // INSERT
    const newToken = generateToken();
    const newCreated = new Date().toISOString().split('T')[0];
    if(sb && currentUser) {
      const newId = nextRosterId++;
      // Include pending talent IDs if creating from "Add to Roster" flow
      const initialTalentIds = _pendingRosterTalentIds ? _pendingRosterTalentIds.map(id => parseInt(id)) : [];
      _pendingRosterTalentIds = null;

      const {data: inserted, error} = await sb.from('rosters').insert({
        id: newId, name, description: desc, platforms,
        talent_ids: initialTalentIds, public_token: newToken, created: newCreated
      }).select('*').single();
      if(error) {
        console.error('Roster insert error:', error);
        showToast('Error al crear roster: ' + error.message, 'error');
        nextRosterId--;
      } else {
        if(!rosters.find(r => r.id === inserted.id)) {
          rosters.unshift({...inserted, talentIds: (inserted.talent_ids||[]).map(id=>parseInt(id)), platforms: inserted.platforms||{tt:true,ig:true,yt:true}});
        }
        const talentMsg = initialTalentIds.length > 0 ? ` con ${initialTalentIds.length} talento(s)` : '';
        showToast('Roster "' + name + '" creado' + talentMsg, 'success');
      }
      sb.from('app_config').upsert({key:'next_roster_id', value: nextRosterId}).catch(e => console.warn('next_roster_id:', e));
    } else {
      const initialTalentIds = _pendingRosterTalentIds ? _pendingRosterTalentIds.map(id => parseInt(id)) : [];
      _pendingRosterTalentIds = null;
      rosters.unshift({id: nextRosterId++, name, description:desc, talentIds:initialTalentIds, talent_ids:initialTalentIds, platforms, public_token:newToken, created:newCreated});
      showToast('Roster "' + name + '" creado', 'success');
    }
    updateStats(); renderRosters();
    // Switch to rosters tab so user sees the new roster
    switchTab('rosters');
  }
}


function deleteCurrentRoster() {
  if(!editingRosterId) return;
  closeModal('roster-view-modal');
  deleteRoster(editingRosterId);
}

async function deleteRoster(id) {
  const roster = rosters.find(r => r.id === id);
  if(!roster) return;
  if(!confirm('¿Eliminar "' + roster.name + '"? Se puede deshacer.')) return;
  const rosterCopy = JSON.parse(JSON.stringify(roster));

  _lastUndo = {type: 'delete-roster', roster: rosterCopy};

  rosters = rosters.filter(r => r.id !== id);
  renderRosters(); updateStats();
  if(sb && currentUser) {
    await sb.from('rosters').delete().eq('id', id);
  }
  showUndoToast('Roster "' + rosterCopy.name + '" eliminado');
}

// ===================== MANAGE TALENTS IN ROSTER =====================
let _manageShowSelected = false;

function openManageTalentsForRoster(rosterId) {
  managingRosterId = rosterId;
  const roster = rosters.find(r=>r.id===rosterId);
  if(!roster) return;
  managingRosterTemp = (roster.talentIds||[]).map(id => parseInt(id));
  _manageShowSelected = false;

  // Clear search and filters
  const searchEl = document.getElementById('manage-talents-search');
  if(searchEl) { searchEl.value = ''; searchEl.oninput = () => renderManageTalentsGrid(); }

  // Populate category filter from ALL talents
  const catSel = document.getElementById('manage-filter-cat');
  if(catSel) {
    const cats = [...new Set(talents.flatMap(t => t.categorias || []))].sort();
    catSel.innerHTML = '<option value="">Categoría</option>' + cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    catSel.onchange = () => renderManageTalentsGrid();
  }
  // Populate country filter from ALL talents
  const countrySel = document.getElementById('manage-filter-country');
  if(countrySel) {
    const countries = [...new Set(talents.flatMap(t => t.paises || []).filter(Boolean))].sort();
    countrySel.innerHTML = '<option value="">País</option>' + countries.map(c => `<option value="${escapeHtml(c)}">${(COUNTRY_FLAGS[c]||'')} ${escapeHtml(c)}</option>`).join('');
    countrySel.onchange = () => renderManageTalentsGrid();
  }
  const genderSel = document.getElementById('manage-filter-gender');
  if(genderSel) { genderSel.value = ''; genderSel.onchange = () => renderManageTalentsGrid(); }

  // Toggle button
  const toggleBtn = document.getElementById('manage-toggle-selected');
  if(toggleBtn) {
    toggleBtn.textContent = 'Mostrar seleccionados';
    toggleBtn.style.background = 'var(--surface2)';
    toggleBtn.style.color = 'var(--text)';
    toggleBtn.onclick = () => {
      _manageShowSelected = !_manageShowSelected;
      toggleBtn.textContent = _manageShowSelected ? 'Mostrar todos' : 'Mostrar seleccionados';
      toggleBtn.style.background = _manageShowSelected ? 'var(--primary)' : 'var(--surface2)';
      toggleBtn.style.color = _manageShowSelected ? '#fff' : 'var(--text)';
      renderManageTalentsGrid();
    };
  }

  renderManageTalentsGrid();
  openModal('manage-talents-modal');
}

function renderManageTalentsGrid() {
  const grid = document.getElementById('manage-talents-grid');
  grid.innerHTML = '';
  const q = (document.getElementById('manage-talents-search')?.value || '').toLowerCase().trim();
  const fCat = document.getElementById('manage-filter-cat')?.value || '';
  const fGender = document.getElementById('manage-filter-gender')?.value || '';
  const fCountry = document.getElementById('manage-filter-country')?.value || '';
  let filtered = _manageShowSelected ? talents.filter(t => managingRosterTemp.includes(t.id)) : [...talents];
  if(q) filtered = filtered.filter(t => t.nombre.toLowerCase().includes(q) || (t.paises||[]).some(p => p.toLowerCase().includes(q)) || (t.ciudad||'').toLowerCase().includes(q) || (t.keywords||'').toLowerCase().includes(q) || (t.categorias||[]).some(c=>c.toLowerCase().includes(q)));
  if(fCat) filtered = filtered.filter(t => (t.categorias||[]).includes(fCat));
  if(fGender) filtered = filtered.filter(t => t.genero === fGender);
  if(fCountry) filtered = filtered.filter(t => (t.paises||[]).includes(fCountry));

  if(filtered.length === 0) {
    grid.innerHTML = '<p style="font-size:13px;color:var(--text-muted);text-align:center;padding:20px;grid-column:1/-1">Sin resultados</p>';
    return;
  }

  filtered.forEach(t => {
    const inRoster = managingRosterTemp.includes(t.id);
    const el = document.createElement('div');
    el.className = 'talent-select-item' + (inRoster ? ' in-roster' : '');
    el.id = `msel-${t.id}`;
    const av = t.foto
      ? `<div class="talent-select-avatar"><img src="${t.foto}" alt="${escapeHtml(t.nombre)}"></div>`
      : `<div class="talent-select-avatar">${getInitials(t.nombre)}</div>`;
    el.innerHTML = `${av}<span class="talent-select-name">${escapeHtml(t.nombre)}<br><span style="font-size:11px;font-weight:400;color:var(--text-muted)">${(t.paises||[]).map(p=>(COUNTRY_FLAGS[p]||'')+' '+escapeHtml(p)).join(' · ')}</span></span><div class="talent-select-check">${inRoster?'<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg>':''}</div>`;
    el.onclick = () => { toggleManageTalent(t.id, el); };
    grid.appendChild(el);
  });
}

function openManageTalentsModal() {
  if(editingRosterId) openManageTalentsForRoster(editingRosterId);
}

function toggleManageTalent(talentId, el) {
  talentId = parseInt(talentId);
  const idx = managingRosterTemp.indexOf(talentId);
  if(idx > -1) {
    managingRosterTemp.splice(idx, 1);
    el.classList.remove('in-roster');
    el.querySelector('.talent-select-check').innerHTML = '';
  } else {
    managingRosterTemp.push(talentId);
    el.classList.add('in-roster');
    el.querySelector('.talent-select-check').innerHTML = '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg>';
  }
}

async function saveRosterTalents(rosterId) {
  const roster = rosters.find(r => r.id === rosterId);
  if (!roster || !sb || !currentUser) return;
  const { error } = await sb.from('rosters').update({ talent_ids: roster.talentIds }).eq('id', rosterId);
  if (error) showToast('Error al guardar roster: ' + error.message, 'error');
}

async function applyManageTalents() {
  const roster = rosters.find(r => r.id === managingRosterId);
  if(!roster) { closeModal('manage-talents-modal'); return; }
  roster.talentIds = managingRosterTemp.map(id => parseInt(id));
  closeModal('manage-talents-modal');
  renderRosters();
  updateStats();
  if(editingRosterId === managingRosterId) viewRoster(managingRosterId);
  if(sb && currentUser) {
    const {error} = await sb.from('rosters')
      .update({ talent_ids: roster.talentIds })
      .eq('id', roster.id);
    if(error) showToast('Error al guardar: ' + error.message, 'error');
    else showToast('Roster actualizado', 'success');
  } else {
    showToast('Roster actualizado', 'success');
  }
}

// ===================== ADD SELECTED TO ROSTER =====================
function openAddToRosterModal() {
  if(selectedIds.size === 0) { showToast('Selecciona talentos primero', 'error'); return; }
  const list = document.getElementById('add-to-roster-list');
  list.innerHTML = '';
  if(rosters.length === 0) {
    list.innerHTML = '<p style="font-size:13px;color:var(--text-muted);text-align:center;padding:10px">No hay rosters. Crea uno primero.</p>';
  }
  rosters.forEach(r => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-outline';
    btn.style.cssText = 'width:100%;justify-content:flex-start;gap:10px;text-align:left;';
    const realCount = r.talentIds.filter(id => talents.find(t => t.id === parseInt(id))).length;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg><span style="flex:1">${r.name}</span><span style="font-size:11px;color:var(--text-dim)">${realCount} talentos</span>`;
    btn.onclick = () => addSelectionToRoster(r.id);
    list.appendChild(btn);
  });
  openModal('add-to-roster-modal');
}

async function addSelectionToRoster(rosterId) {
  const roster = rosters.find(r => r.id === rosterId);
  if(!roster) return;
  let added = 0;
  selectedIds.forEach(id => {
    const numId = parseInt(id);
    if(!roster.talentIds.includes(numId)) { roster.talentIds.push(numId); added++; }
  });
  closeModal('add-to-roster-modal');
  updateStats();
  if(currentTab === 'rosters') renderRosters();
  if(added === 0) { showToast('Todos los talentos ya están en el roster', 'info'); clearSelection(); return; }
  if(sb && currentUser) {
    const {error} = await sb.from('rosters')
      .update({ talent_ids: roster.talentIds })
      .eq('id', rosterId);
    if(error) showToast('Error al guardar: ' + error.message, 'error');
    else showToast(added + ' talento(s) agregados al roster "' + roster.name + '"', 'success');
  } else {
    showToast(added + ' talento(s) agregados al roster "' + roster.name + '"', 'success');
  }
  clearSelection();
}

let _pendingRosterTalentIds = null; // talent IDs to auto-add after roster creation

function openCreateRosterAndAdd() {
  closeModal('add-to-roster-modal');
  _pendingRosterTalentIds = [...selectedIds]; // save current selection
  openCreateRosterModal();
}

// ===================== GENERAL ROSTERS =====================
let generalRosters = [];
let editingGeneralRosterId = null;
let currentRosterSubtab = 'personalizados';

function switchRosterSubtab(tab) {
  currentRosterSubtab = tab;
  document.getElementById('subtab-generales').classList.toggle('active', tab === 'generales');
  document.getElementById('subtab-personalizados').classList.toggle('active', tab === 'personalizados');
  document.getElementById('roster-subtab-generales').style.display = tab === 'generales' ? 'block' : 'none';
  document.getElementById('roster-subtab-personalizados').style.display = tab === 'personalizados' ? 'block' : 'none';
  if (tab === 'generales') renderGeneralRosters();
  if (tab === 'personalizados') renderRosters();
}

function openCreateGeneralRosterModal(id) {
  editingGeneralRosterId = id || null;
  document.getElementById('rg-nombre').value = '';
  document.getElementById('rg-desc').value = '';
  document.getElementById('rg-categoria').value = '';
  document.getElementById('rg-pais').value = '';
  document.getElementById('rg-genero').value = '';
  document.getElementById('rg-min-seg').value = '';
  document.getElementById('rg-max-seg').value = '';
  ['rg-show-tt','rg-show-ig','rg-show-yt'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = true;
  });

  // Populate category select
  const catSel = document.getElementById('rg-categoria');
  catSel.innerHTML = '<option value="">— Todas las categorías —</option>';
  CATEGORIES.forEach(c => {
    catSel.innerHTML += '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>';
  });

  // Populate country select
  const paisSel = document.getElementById('rg-pais');
  paisSel.innerHTML = '<option value="">— Todos los países —</option>';
  COUNTRIES.forEach(c => {
    paisSel.innerHTML += '<option value="' + escapeHtml(c) + '">' + (COUNTRY_FLAGS[c] || '') + ' ' + escapeHtml(c) + '</option>';
  });

  if (id) {
    const rg = generalRosters.find(r => r.id === id);
    if (rg) {
      document.getElementById('rg-nombre').value = rg.name || '';
      document.getElementById('rg-desc').value = rg.description || '';
      document.getElementById('rg-categoria').value = rg.filters?.categoria || '';
      document.getElementById('rg-pais').value = rg.filters?.pais || '';
      document.getElementById('rg-genero').value = rg.filters?.genero || '';
      document.getElementById('rg-min-seg').value = rg.filters?.min_seguidores || '';
      document.getElementById('rg-max-seg').value = rg.filters?.max_seguidores || '';
      if (rg.platforms) {
        if (document.getElementById('rg-show-tt')) document.getElementById('rg-show-tt').checked = rg.platforms.tt !== false;
        if (document.getElementById('rg-show-ig')) document.getElementById('rg-show-ig').checked = rg.platforms.ig !== false;
        if (document.getElementById('rg-show-yt')) document.getElementById('rg-show-yt').checked = rg.platforms.yt !== false;
      }
      document.getElementById('general-roster-title').textContent = 'Editar Roster General';
    }
  } else {
    document.getElementById('general-roster-title').textContent = 'Nuevo Roster General';
  }
  openModal('general-roster-modal');
}

function closeGeneralRosterModal() {
  closeModal('general-roster-modal');
}

async function saveGeneralRoster() {
  const name = document.getElementById('rg-nombre').value.trim();
  if (!name) { showToast('El nombre es obligatorio', 'error'); return; }
  const desc = document.getElementById('rg-desc').value.trim();
  const filters = {
    categoria: document.getElementById('rg-categoria').value,
    pais: document.getElementById('rg-pais').value,
    genero: document.getElementById('rg-genero').value,
    min_seguidores: parseInt(document.getElementById('rg-min-seg').value) || 0,
    max_seguidores: parseInt(document.getElementById('rg-max-seg').value) || 0,
  };
  const platforms = {
    tt: document.getElementById('rg-show-tt')?.checked ?? true,
    ig: document.getElementById('rg-show-ig')?.checked ?? true,
    yt: document.getElementById('rg-show-yt')?.checked ?? true,
  };
  if (!platforms.tt && !platforms.ig && !platforms.yt) {
    showToast('Selecciona al menos una plataforma', 'error'); return;
  }
  closeModal('general-roster-modal');

  if (editingGeneralRosterId) {
    // UPDATE
    const rg = generalRosters.find(r => r.id === editingGeneralRosterId);
    if (rg) {
      rg.name = name; rg.description = desc; rg.filters = filters; rg.platforms = platforms;
    }
    renderGeneralRosters(); updateGeneralRosterBadge();
    if (sb && currentUser) {
      const { error } = await sb.from('rosters_generales').update({ name, description: desc, filters, platforms }).eq('id', editingGeneralRosterId);
      if (error) showToast('Error: ' + error.message, 'error');
      else showToast('Roster general actualizado', 'success');
    }
  } else {
    // CREATE
    const token = generateToken();
    const newRG = {
      id: Date.now(),
      name, description: desc, filters, platforms,
      public_token: token,
      created_at: new Date().toISOString(),
    };

    if (sb && currentUser) {
      const { data, error } = await sb.from('rosters_generales').insert({
        name, description: desc, filters, platforms, public_token: token
      }).select().single();
      if (error) {
        showToast('Error: ' + error.message, 'error');
        return;
      }
      newRG.id = data.id;
      newRG.created_at = data.created_at;
    }
    generalRosters.push(newRG);
    renderGeneralRosters(); updateGeneralRosterBadge();
    showToast('Roster general "' + name + '" creado', 'success');
  }
}

function getGeneralRosterTalents(rg) {
  let filtered = [...talents];
  const f = rg.filters || {};
  if (f.categoria) {
    filtered = filtered.filter(t => (t.categorias || []).some(c => c === f.categoria));
  }
  if (f.pais) {
    filtered = filtered.filter(t => (t.paises || []).includes(f.pais));
  }
  if (f.genero) {
    filtered = filtered.filter(t => t.genero === f.genero);
  }
  if (f.min_seguidores > 0) {
    filtered = filtered.filter(t => {
      const total = (t.seguidores?.tiktok || 0) + (t.seguidores?.instagram || 0) + (t.seguidores?.youtube || 0);
      return total >= f.min_seguidores;
    });
  }
  if (f.max_seguidores > 0) {
    filtered = filtered.filter(t => {
      const total = (t.seguidores?.tiktok || 0) + (t.seguidores?.instagram || 0) + (t.seguidores?.youtube || 0);
      return total <= f.max_seguidores;
    });
  }
  return filtered;
}

function renderGeneralRosters() {
  const grid = document.getElementById('general-roster-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (generalRosters.length === 0) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:60px 20px"><div class="empty-icon" style="font-size:40px">🌐</div><h3>Sin rosters generales</h3><p>Crea tu primer roster general para mostrar talentos por categoría.</p></div>';
    return;
  }

  generalRosters.forEach(rg => {
    const matchingTalents = getGeneralRosterTalents(rg);
    const f = rg.filters || {};
    const card = document.createElement('div');
    card.className = 'rg-card';

    // Filter tags
    const tags = [];
    if (f.categoria) tags.push(f.categoria);
    if (f.pais) tags.push((COUNTRY_FLAGS[f.pais] || '') + ' ' + f.pais);
    if (f.genero) tags.push(f.genero);
    if (f.min_seguidores > 0 || f.max_seguidores > 0) {
      let segTxt = '';
      if (f.min_seguidores > 0 && f.max_seguidores > 0) segTxt = formatFollowers(f.min_seguidores) + ' — ' + formatFollowers(f.max_seguidores);
      else if (f.min_seguidores > 0) segTxt = '>' + formatFollowers(f.min_seguidores);
      else segTxt = '<' + formatFollowers(f.max_seguidores);
      tags.push(segTxt + ' seguidores');
    }

    const tagsHTML = tags.length > 0
      ? '<div class="rg-filters-summary">' + tags.map(t => '<span class="rg-filter-tag">' + escapeHtml(t) + '</span>').join('') + '</div>'
      : '';

    // Avatars preview
    const previewTalents = matchingTalents.slice(0, 3);
    const avatarsHTML = previewTalents.map(t => {
      return t.foto
        ? '<img src="' + t.foto + '" style="width:24px;height:24px;border-radius:50%;object-fit:cover;border:2px solid var(--surface);margin-left:-6px">'
        : '<div style="width:24px;height:24px;border-radius:50%;background:rgba(148,20,224,0.2);border:2px solid var(--surface);display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:var(--purple);margin-left:-6px">' + getInitials(t.nombre) + '</div>';
    }).join('');

    card.innerHTML = '\
      <div class="rg-name">' + escapeHtml(rg.name) + '</div>\
      ' + (rg.description ? '<div class="rg-desc">' + escapeHtml(rg.description) + '</div>' : '') + '\
      ' + tagsHTML + '\
      <div class="rg-meta">\
        <span class="rg-talent-count">\
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>\
          ' + matchingTalents.length + ' talentos\
        </span>\
      </div>\
      ' + (matchingTalents.length > 0 ? '<div style="display:flex;margin-left:6px;margin-bottom:12px">' + avatarsHTML + (matchingTalents.length > 3 ? '<div style="width:24px;height:24px;border-radius:50%;background:var(--surface2);border:2px solid var(--surface);display:inline-flex;align-items:center;justify-content:center;font-size:9px;color:var(--text-muted);margin-left:-6px">+' + (matchingTalents.length - 3) + '</div>' : '') + '</div>' : '') + '\
      <div class="rg-actions">\
        <button class="btn btn-outline btn-sm" style="flex:1" data-action="copy-general-roster-url" data-id="' + rg.id + '">\
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>\
          Copiar Link\
        </button>\
        <button class="btn btn-outline btn-sm" data-action="edit-general-roster" data-id="' + rg.id + '" title="Editar"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg></button>\
        <button class="btn btn-danger btn-sm" data-action="delete-general-roster" data-id="' + rg.id + '" title="Eliminar"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>\
      </div>';
    grid.appendChild(card);
  });
}

function updateGeneralRosterBadge() {
  const el = document.getElementById('subtab-generales-badge');
  if (el) el.textContent = generalRosters.length;
  const el2 = document.getElementById('subtab-personalizados-badge');
  if (el2) el2.textContent = rosters.length;
}

function copyGeneralRosterUrl(id) {
  const rg = generalRosters.find(r => r.id === parseInt(id));
  if (!rg) return;
  const baseUrl = window.location.origin;
  const url = baseUrl + '/roster-general.html?token=' + (rg.public_token || '');
  navigator.clipboard.writeText(url).then(() => {
    showToast('Link copiado al portapapeles', 'success');
  }).catch(() => {
    showToast('No se pudo copiar', 'error');
  });
}

async function deleteGeneralRoster(id) {
  id = parseInt(id);
  const rg = generalRosters.find(r => r.id === id);
  if (!rg) return;
  if (!confirm('¿Eliminar roster general "' + rg.name + '"?')) return;
  generalRosters = generalRosters.filter(r => r.id !== id);
  renderGeneralRosters(); updateGeneralRosterBadge();
  if (sb && currentUser) {
    await sb.from('rosters_generales').delete().eq('id', id);
  }
  showToast('Roster general eliminado', 'success');
}

async function loadRosterBrandEdits() {
  if (!sb || !currentUser) return;
  try {
    const {data} = await sb.from('roster_selecciones').select('roster_id, last_brand_edit').not('last_brand_edit', 'is', null);
    rosterBrandEdits = {};
    (data||[]).forEach(s => {
      if (!rosterBrandEdits[s.roster_id]) rosterBrandEdits[s.roster_id] = 0;
      rosterBrandEdits[s.roster_id]++;
    });
    renderRosters();
  } catch(e) { console.warn('loadRosterBrandEdits:', e); }
}

async function clearRosterBrandEdits(rosterId) {
  try {
    await sb.from('roster_selecciones').update({last_brand_edit: null}).eq('roster_id', rosterId).not('last_brand_edit', 'is', null);
    delete rosterBrandEdits[rosterId];
    renderRosters();
    showToast('Notificaciones marcadas como leidas', 'success');
  } catch(e) { console.warn(e); }
}

async function loadGeneralRosters() {
  if (!sb || !currentUser) return;
  const { data, error } = await sb.from('rosters_generales').select('*').order('created_at', { ascending: false });
  if (error) {
    console.warn('[Beme] Error loading general rosters:', error.message);
    return;
  }
  generalRosters = (data || []).map(r => ({
    ...r,
    filters: r.filters || {},
    platforms: r.platforms || { tt: true, ig: true, yt: true },
  }));
  renderGeneralRosters();
  updateGeneralRosterBadge();
}

// ===================== VIEW ROSTER =====================
function viewRoster(id) {
  editingRosterId = id;
  const roster = rosters.find(r=>r.id===id);
  if(!roster) return;
  const rosterTalents = roster.talentIds.map(tid=>talents.find(t=>t.id===tid)).filter(Boolean);
  document.getElementById('roster-view-title').textContent = roster.name;
  const today = new Date().toLocaleDateString('es-ES',{day:'2-digit',month:'long',year:'numeric'});
  // Sync view toggle buttons to current mode
  document.getElementById('roster-view-table')?.classList.toggle('active', rosterViewMode === 'table');
  document.getElementById('roster-view-cards')?.classList.toggle('active', rosterViewMode === 'cards');
  const content = rosterViewMode === 'cards'
    ? generateRosterCardsHTML(roster, rosterTalents, today)
    : generateRosterPageHTML(roster, rosterTalents, today);
  document.getElementById('roster-view-content').innerHTML = content;
  openModal('roster-view-modal');
}

function generateRosterCardsHTML(roster, rosterTalents, today) {
  const showTT = roster.platforms?.tt !== false;
  const showIG = roster.platforms?.ig !== false;
  const showYT = roster.platforms?.yt !== false;

  const ttSVG = '<svg width="10" height="10" viewBox="0 0 24 24" fill="#ff0050"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34l-.04-8.68a8.25 8.25 0 004.82 1.55V4.72a4.85 4.85 0 01-1.01-.03z"/></svg>';
  const igSVG = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#e1306c" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/></svg>';
  const ytSVG = '<svg width="10" height="10" viewBox="0 0 24 24" fill="#ff0000"><path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.38.55A3.02 3.02 0 0 0 .5 6.19C0 8.04 0 12 0 12s0 3.96.5 5.81a3.02 3.02 0 0 0 2.12 2.14C4.46 20.5 12 20.5 12 20.5s7.54 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14C24 15.96 24 12 24 12s0-3.96-.5-5.81zM9.75 15.52V8.48L15.5 12l-5.75 3.52z"/></svg>';

  const cards = rosterTalents.map(t => {
    const av = t.foto
      ? `<div style="width:52px;height:52px;border-radius:50%;overflow:hidden;flex-shrink:0;border:2px solid rgba(178,0,93,0.4);"><img src="${t.foto}" style="width:100%;height:100%;object-fit:cover;"></div>`
      : `<div style="width:52px;height:52px;border-radius:50%;background:#2a2a2a;border:2px solid rgba(178,0,93,0.4);display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-size:18px;font-weight:700;color:#b2005d;flex-shrink:0;">${getInitials(t.nombre)}</div>`;
    const countries = (t.paises||[t.pais||'']).filter(Boolean).map(c=>(COUNTRY_FLAGS[c]||'')+' '+c).join(' · ');
    const nets = [
      showTT && t.tiktok ? `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px;color:#444;">${ttSVG}<a href="${t.tiktok}" target="_blank" style="color:#ff0050;text-decoration:none;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${extractHandle(t.tiktok)}</a><span style="margin-left:auto;font-weight:700;color:#111;font-size:11.5px;white-space:nowrap;">${formatFollowers(t.seguidores.tiktok)}</span></div>` : '',
      showIG && t.instagram ? `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px;color:#444;">${igSVG}<a href="${t.instagram}" target="_blank" style="color:#e1306c;text-decoration:none;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${extractHandle(t.instagram)}</a><span style="margin-left:auto;font-weight:700;color:#111;font-size:11.5px;white-space:nowrap;">${formatFollowers(t.seguidores.instagram)}</span></div>` : '',
      showYT && t.youtube ? `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px;color:#444;">${ytSVG}<a href="${t.youtube}" target="_blank" style="color:#cc0000;text-decoration:none;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${extractHandle(t.youtube)}</a><span style="margin-left:auto;font-weight:700;color:#111;font-size:11.5px;white-space:nowrap;">${formatFollowers(t.seguidores.youtube)}</span></div>` : '',
    ].filter(Boolean).join('');
    const cats = t.categorias.map(c=>`<span style="font-size:9.5px;padding:2px 7px;border-radius:10px;background:#f5f5f5;color:#555;">${c}</span>`).join(' ');
    return `<div style="border:1px solid #e8e8e8;border-radius:14px;overflow:hidden;break-inside:avoid;">
      <div style="background:linear-gradient(135deg,#1a1a1a,#2a2a2a);padding:18px;display:flex;align-items:center;gap:12px;">
        ${av}
        <div>
          <div style="color:#fff;font-size:14px;font-weight:700;line-height:1.3;">${t.nombre}</div>
          <div style="color:rgba(255,255,255,0.45);font-size:11px;margin-top:2px;">${countries}${t.ciudad?', '+t.ciudad:''}</div>
        </div>
      </div>
      <div style="padding:13px 15px;">
        ${nets}
        ${roster.show_ai_descriptions && roster.ai_descriptions?.[t.id] ? `<div style="background:linear-gradient(135deg,rgba(148,20,224,0.04),rgba(178,0,93,0.04));border:1px solid rgba(148,20,224,0.12);border-radius:8px;padding:8px 10px;margin-bottom:8px;font-size:11px;color:#555;line-height:1.4">
          <span style="font-weight:700;color:#9414E0;font-size:10px">AI</span> ${escapeHtml(roster.ai_descriptions[t.id].reason||'')}
        </div>` : ''}
        <div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:8px;padding-top:8px;border-top:1px solid #f0f0f0;">${cats}</div>
      </div>
    </div>`;
  }).join('');

  return `<div class="roster-view-page" style="background:#fff;color:#111;padding:32px;font-family:'Plus Jakarta Sans',sans-serif;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px;padding-bottom:18px;border-bottom:3px solid #b2005d;">
      <div>
        <div style="font-size:26px;font-weight:300;margin-bottom:6px;">Be<strong style="font-weight:800;color:#b2005d">me</strong></div>
        <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:700;color:#111;">${roster.name}</div>
        ${roster.description ? `<div style="font-size:13px;color:#666;margin-top:3px;">${roster.description}</div>` : ''}
      </div>
      <div style="text-align:right;font-size:12px;color:#888;line-height:1.7;">
        <div style="font-weight:700;color:#111;">${rosterTalents.length} talento${rosterTalents.length!==1?'s':''}</div>
        <div>Generado el ${today}</div>
        ${roster.ai_descriptions && Object.keys(roster.ai_descriptions).length ? `<div style="margin-top:6px">
          <label style="display:inline-flex;align-items:center;gap:5px;font-size:11px;cursor:pointer">
            <input type="checkbox" ${roster.show_ai_descriptions?'checked':''} onchange="toggleAIDescs(${roster.id},this.checked)" style="accent-color:#9414E0"> Mostrar AI
          </label>
        </div>` : `<div style="margin-top:6px">
          <button style="font-size:10px;padding:3px 8px;border-radius:12px;border:1px solid rgba(148,20,224,0.3);background:rgba(148,20,224,0.06);color:#9414E0;cursor:pointer;font-weight:600;font-family:inherit" onclick="openAIDescsModal(${roster.id})">Generar AI</button>
        </div>`}
      </div>
    </div>
    ${rosterTalents.length === 0
      ? `<p style="text-align:center;color:#999;padding:40px;">Este roster no tiene talentos todavía.</p>`
      : `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">${cards}</div>`
    }
  </div>`;
}

function generateRosterPageHTML(roster, rosterTalents, today) {
  const ttSVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="#ff0050"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34l-.04-8.68a8.25 8.25 0 004.82 1.55V4.72a4.85 4.85 0 01-1.01-.03z"/></svg>';
  const igSVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#e1306c" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/></svg>';
  const ytSVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="#ff0000"><path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.38.55A3.02 3.02 0 0 0 .5 6.19C0 8.04 0 12 0 12s0 3.96.5 5.81a3.02 3.02 0 0 0 2.12 2.14C4.46 20.5 12 20.5 12 20.5s7.54 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14C24 15.96 24 12 24 12s0-3.96-.5-5.81zM9.75 15.52V8.48L15.5 12l-5.75 3.52z"/></svg>';

  const showTT = roster.platforms?.tt !== false;
  const showIG = roster.platforms?.ig !== false;
  const showYT = roster.platforms?.yt !== false;

  const rows = rosterTalents.map((t, i) => {
    const av = t.foto
      ? `<img src="${t.foto}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:8px;">`
      : `<span style="display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:#f0e0e8;color:#b2005d;font-weight:800;font-size:13px;margin-right:8px;flex-shrink:0;">${getInitials(t.nombre)}</span>`;
    const countries = (t.paises||[t.pais||'']).filter(Boolean).map(c=>(COUNTRY_FLAGS[c]||'')+' '+c).join('<br>');
    const ttCell = !showTT ? null : t.tiktok
      ? `<div style="display:flex;align-items:center;gap:5px;">${ttSVG}<a href="${t.tiktok}" target="_blank" style="color:#ff0050;text-decoration:none;font-size:12px;font-weight:600;">${extractHandle(t.tiktok)}</a></div><div style="font-size:11px;color:#777;margin-top:2px;padding-left:16px;">${formatFollowers(t.seguidores.tiktok)}</div>`
      : '<span style="color:#ccc;font-size:12px;">—</span>';
    const igCell = !showIG ? null : t.instagram
      ? `<div style="display:flex;align-items:center;gap:5px;">${igSVG}<a href="${t.instagram}" target="_blank" style="color:#e1306c;text-decoration:none;font-size:12px;font-weight:600;">${extractHandle(t.instagram)}</a></div><div style="font-size:11px;color:#777;margin-top:2px;padding-left:16px;">${formatFollowers(t.seguidores.instagram)}</div>`
      : '<span style="color:#ccc;font-size:12px;">—</span>';
    const ytCell = !showYT ? null : t.youtube
      ? `<div style="display:flex;align-items:center;gap:5px;">${ytSVG}<a href="${t.youtube}" target="_blank" style="color:#cc0000;text-decoration:none;font-size:12px;font-weight:600;">${extractHandle(t.youtube)}</a></div><div style="font-size:11px;color:#777;margin-top:2px;padding-left:16px;">${formatFollowers(t.seguidores.youtube)}</div>`
      : '<span style="color:#ccc;font-size:12px;">—</span>';
    const cats = t.categorias.slice(0,4).map(c=>`<span style="background:#f5f0f8;color:#7a3fa0;font-size:10px;padding:2px 7px;border-radius:10px;white-space:nowrap;display:inline-block;">${c}</span>`).join(' ');
    const rowBg = i % 2 === 0 ? '#fff' : '#faf9fc';
    return `<tr style="background:${rowBg};">
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;vertical-align:middle;white-space:nowrap;">
        <div style="display:flex;align-items:center;">${av}<div><div style="font-weight:700;font-size:13px;color:#111;">${t.nombre}</div>${t.ciudad?`<div style="font-size:11px;color:#888;">${t.ciudad}</div>`:''}</div></div>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;vertical-align:middle;font-size:12px;color:#444;line-height:1.7;">${countries}</td>
      ${ttCell !== null ? `<td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;vertical-align:middle;">${ttCell}</td>` : ''}
      ${igCell !== null ? `<td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;vertical-align:middle;">${igCell}</td>` : ''}
      ${ytCell !== null ? `<td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;vertical-align:middle;">${ytCell}</td>` : ''}
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;vertical-align:middle;"><div style="display:flex;flex-wrap:wrap;gap:3px;">${cats}</div></td>
    </tr>`;
  }).join('');

  const th = (txt) => `<th style="padding:12px 14px;text-align:left;color:#fff;font-size:12px;font-weight:700;letter-spacing:0.5px;">${txt}</th>`;
  const tableHeader = `<tr style="background:linear-gradient(135deg,#b2005d,#9414E0);">
    ${th('Talento')}${th('País')}
    ${showTT ? th('TikTok') : ''}
    ${showIG ? th('Instagram') : ''}
    ${showYT ? th('YouTube') : ''}
    ${th('Categorías')}
  </tr>`;

  return `<div class="roster-view-page" style="background:#fff;color:#111;padding:32px;font-family:'Plus Jakarta Sans',sans-serif;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px;padding-bottom:18px;border-bottom:3px solid #b2005d;">
      <div>
        <div style="font-size:26px;font-weight:300;margin-bottom:6px;">Be<strong style="font-weight:800;color:#b2005d">me</strong></div>
        <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:700;color:#111;">${roster.name}</div>
        ${roster.description ? `<div style="font-size:13px;color:#666;margin-top:3px;">${roster.description}</div>` : ''}
      </div>
      <div style="text-align:right;font-size:12px;color:#888;line-height:1.7;">
        <div style="font-weight:700;color:#111;">${rosterTalents.length} talento${rosterTalents.length!==1?'s':''}</div>
        <div>Generado el ${today}</div>
      </div>
    </div>
    ${rosterTalents.length === 0
      ? `<p style="text-align:center;color:#999;padding:40px;">Este roster no tiene talentos todavía.</p>`
      : `<table style="width:100%;border-collapse:collapse;box-shadow:0 2px 12px rgba(0,0,0,0.07);">
          <thead>${tableHeader}</thead>
          <tbody>${rows}</tbody>
        </table>`
    }
  </div>`;
}

function printRoster() {
  const contentEl = document.getElementById('roster-view-content');
  if(!contentEl) { showToast('No hay contenido para imprimir', 'error'); return; }
  // Re-generate with correct mode in case it wasn't rendered yet
  if(editingRosterId) {
    const r = rosters.find(x=>x.id===editingRosterId);
    if(r) {
      const rt = r.talentIds.map(tid=>talents.find(t=>t.id===tid)).filter(Boolean);
      const td = new Date().toLocaleDateString('es-ES',{day:'2-digit',month:'long',year:'numeric'});
      contentEl.innerHTML = rosterViewMode === 'cards' ? generateRosterCardsHTML(r, rt, td) : generateRosterPageHTML(r, rt, td);
    }
  }
  const content = contentEl;
  if(!content.innerHTML.trim()) { showToast('No hay contenido para imprimir', 'error'); return; }
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Roster — Beme</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Syne:wght@700;800&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Plus Jakarta Sans',sans-serif;background:#fff;color:#111;}
    table{width:100%;border-collapse:collapse;border-radius:10px;overflow:hidden;}
    th,td{padding:10px 12px;text-align:left;vertical-align:middle;}
    th{color:#fff;font-size:12px;font-weight:700;letter-spacing:0.5px;}
    thead tr{background:linear-gradient(135deg,#b2005d,#9414E0);}
    tbody tr:nth-child(even){background:#faf9fc;}
    tbody tr:nth-child(odd){background:#fff;}
    td{border-bottom:1px solid #f0f0f0;font-size:12.5px;}
    a{text-decoration:none;}
    @media print{
      @page{margin:12mm;size:A4 landscape;}
      table{font-size:11px;}th,td{padding:7px 9px;}
      div[style*="grid-template-columns"]{display:grid!important;grid-template-columns:repeat(3,1fr)!important;gap:14px!important;}
      div[style*="break-inside"]{break-inside:avoid;}
    }
  </style></head><body>${content.innerHTML}</body></html>`);
  w.document.close();
  w.onload = () => { w.focus(); w.print(); };
}

function downloadCurrentRoster() {
  if(!editingRosterId) return;
  downloadRosterById(editingRosterId);
}

function downloadRosterById(id) {
  const roster = rosters.find(r=>r.id===id);
  if(!roster) return;
  const rosterTalents = roster.talentIds.map(tid=>talents.find(t=>t.id===tid)).filter(Boolean);
  const today = new Date().toLocaleDateString('es-ES',{day:'2-digit',month:'long',year:'numeric'});

  const showTT = roster.platforms?.tt !== false;
  const showIG = roster.platforms?.ig !== false;
  const showYT = roster.platforms?.yt !== false;

  const extractH = (url) => {
    if(!url) return '';
    const m = url.match(/@([^/?#&]+)/);
    return m ? '@'+m[1] : url.replace(/https?:\/\/(www\.)?[^/]+\//,'').split('/')[0];
  };
  const fmtF = (n) => {
    if(!n||n===0) return '—';
    if(n>=1000000) return (n/1000000).toFixed(1).replace('.0','')+'M';
    if(n>=1000) return Math.floor(n/1000)+'K';
    return String(n);
  };
  const ini = (name) => name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
  const flagMap = {"Argentina":"🇦🇷","Bolivia":"🇧🇴","Brasil":"🇧🇷","Chile":"🇨🇱","Colombia":"🇨🇴","Costa Rica":"🇨🇷","Cuba":"🇨🇺","Ecuador":"🇪🇨","El Salvador":"🇸🇻","España":"🇪🇸","Estados Unidos":"🇺🇸","Guatemala":"🇬🇹","Honduras":"🇭🇳","México":"🇲🇽","Nicaragua":"🇳🇮","Panamá":"🇵🇦","Paraguay":"🇵🇾","Perú":"🇵🇪","Puerto Rico":"🇵🇷","República Dominicana":"🇩🇴","Uruguay":"🇺🇾","Venezuela":"🇻🇪"};

  const ttSVG  = '<svg width="13" height="13" viewBox="0 0 24 24" fill="#ff0050"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34l-.04-8.68a8.25 8.25 0 004.82 1.55V4.72a4.85 4.85 0 01-1.01-.03z"/></svg>';
  const igSVG  = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e1306c" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/></svg>';
  const ytSVG  = '<svg width="13" height="13" viewBox="0 0 24 24" fill="#ff0000"><path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.38.55A3.02 3.02 0 0 0 .5 6.19C0 8.04 0 12 0 12s0 3.96.5 5.81a3.02 3.02 0 0 0 2.12 2.14C4.46 20.5 12 20.5 12 20.5s7.54 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14C24 15.96 24 12 24 12s0-3.96-.5-5.81zM9.75 15.52V8.48L15.5 12l-5.75 3.52z"/></svg>';
  const ttSVGs = '<svg width="11" height="11" viewBox="0 0 24 24" fill="#ff0050"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34l-.04-8.68a8.25 8.25 0 004.82 1.55V4.72a4.85 4.85 0 01-1.01-.03z"/></svg>';
  const igSVGs = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#e1306c" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/></svg>';
  const ytSVGs = '<svg width="11" height="11" viewBox="0 0 24 24" fill="#ff0000"><path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.38.55A3.02 3.02 0 0 0 .5 6.19C0 8.04 0 12 0 12s0 3.96.5 5.81a3.02 3.02 0 0 0 2.12 2.14C4.46 20.5 12 20.5 12 20.5s7.54 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14C24 15.96 24 12 24 12s0-3.96-.5-5.81zM9.75 15.52V8.48L15.5 12l-5.75 3.52z"/></svg>';

  // ── Desktop: table rows ──────────────────────────────────────────────────────
  const tableRows = rosterTalents.map((t, i) => {
    const av = t.foto
      ? `<img src="${t.foto}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;margin-right:8px;flex-shrink:0;">`
      : `<span style="display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:50%;background:#f0e0e8;color:#b2005d;font-weight:800;font-size:13px;margin-right:8px;flex-shrink:0;">${ini(t.nombre)}</span>`;
    const countries = (t.paises||[t.pais||'']).filter(Boolean).map(c=>(flagMap[c]||'')+' '+c).join('<br>');
    const ttCell = !showTT?'':t.tiktok?`<div style="display:flex;align-items:center;gap:4px;">${ttSVGs}<a href="${t.tiktok}" target="_blank" style="color:#ff0050;font-size:12px;font-weight:600;text-decoration:none;">${extractH(t.tiktok)}</a></div><div style="font-size:11px;color:#777;margin-top:2px;padding-left:15px;">${fmtF(t.seguidores.tiktok)}</div>`:'<span style="color:#ccc;font-size:12px;">—</span>';
    const igCell = !showIG?'':t.instagram?`<div style="display:flex;align-items:center;gap:4px;">${igSVGs}<a href="${t.instagram}" target="_blank" style="color:#e1306c;font-size:12px;font-weight:600;text-decoration:none;">${extractH(t.instagram)}</a></div><div style="font-size:11px;color:#777;margin-top:2px;padding-left:15px;">${fmtF(t.seguidores.instagram)}</div>`:'<span style="color:#ccc;font-size:12px;">—</span>';
    const ytCell = !showYT?'':t.youtube?`<div style="display:flex;align-items:center;gap:4px;">${ytSVGs}<a href="${t.youtube}" target="_blank" style="color:#cc0000;font-size:12px;font-weight:600;text-decoration:none;">${extractH(t.youtube)}</a></div><div style="font-size:11px;color:#777;margin-top:2px;padding-left:15px;">${fmtF(t.seguidores.youtube)}</div>`:'<span style="color:#ccc;font-size:12px;">—</span>';
    const cats = t.categorias.slice(0,4).map(c=>`<span style="background:#f5f0f8;color:#7a3fa0;font-size:10px;padding:2px 7px;border-radius:10px;display:inline-block;margin:1px;">${c}</span>`).join('');
    const rowBg = i%2===0?'#fff':'#faf9fc';
    return `<tr id="row_${t.id}" style="background:${rowBg};transition:background 0.15s,box-shadow 0.15s;">
      <td style="padding:12px 14px;border-bottom:1px solid #f0f0f0;vertical-align:middle;text-align:center;width:52px;">
        <input type="checkbox" class="row-check" data-id="${t.id}"
          style="width:20px;height:20px;accent-color:#b2005d;cursor:pointer;display:block;margin:auto;">
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;vertical-align:middle;">
        <div style="display:flex;align-items:center;">${av}<div><div style="font-weight:700;font-size:13px;color:#111;">${t.nombre}</div>${t.ciudad?`<div style="font-size:11px;color:#888;">${t.ciudad}</div>`:''}</div></div>
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;vertical-align:middle;font-size:12px;color:#444;line-height:1.7;">${countries}</td>
      ${showTT?`<td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;vertical-align:middle;">${ttCell}</td>`:''}
      ${showIG?`<td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;vertical-align:middle;">${igCell}</td>`:''}
      ${showYT?`<td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;vertical-align:middle;">${ytCell}</td>`:''}
      <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;vertical-align:middle;"><div style="display:flex;flex-wrap:wrap;gap:2px;">${cats}</div></td>
      <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;vertical-align:middle;min-width:155px;">
        <textarea class="accion-input" data-id="${t.id}" placeholder="Ej. Post + story..."
          style="width:100%;min-height:52px;border:1px solid #e0e0e0;border-radius:6px;padding:6px 8px;font-size:12px;font-family:inherit;color:#111;outline:none;resize:vertical;line-height:1.4;"></textarea>
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;vertical-align:middle;width:125px;">
        <div style="display:flex;align-items:center;gap:4px;">
          <span style="font-size:14px;color:#b2005d;font-weight:700;">$</span>
          <input type="text" inputmode="numeric" pattern="[0-9]*" class="price-input" data-id="${t.id}" placeholder="0"
            style="width:84px;border:1px solid #e0e0e0;border-radius:6px;padding:6px 8px;font-size:13px;font-family:inherit;color:#111;outline:none;">
        </div>
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;vertical-align:middle;min-width:125px;">
        <div style="display:flex;align-items:center;gap:4px;">
          <span style="font-size:14px;color:#9414E0;font-weight:700;">$</span>
          <input type="text" inputmode="numeric" pattern="[0-9]*" class="counter-input" data-id="${t.id}" placeholder="0"
            style="width:84px;border:1px solid #e0e0e0;border-radius:6px;padding:6px 8px;font-size:13px;font-family:inherit;color:#111;outline:none;">
        </div>
      </td>
    </tr>`;
  }).join('');

  const thStyle = 'padding:12px 14px;text-align:left;color:#fff;font-size:12px;font-weight:700;letter-spacing:0.5px;';
  const tableHeader = `<tr style="background:linear-gradient(135deg,#b2005d,#9414E0);">
    <th style="${thStyle}width:52px;text-align:center;"></th>
    <th style="${thStyle}">Talento</th>
    <th style="${thStyle}">País</th>
    ${showTT?`<th style="${thStyle}">TikTok</th>`:''}
    ${showIG?`<th style="${thStyle}">Instagram</th>`:''}
    ${showYT?`<th style="${thStyle}">YouTube</th>`:''}
    <th style="${thStyle}">Categorías</th>
    <th style="${thStyle}">Acciones</th>
    <th style="${thStyle}">Precio</th>
    <th style="${thStyle}background:rgba(148,20,224,0.7);">Contraoferta</th>
  </tr>`;

  // ── Mobile: vertical cards ───────────────────────────────────────────────────
  const mobileCards = rosterTalents.map(t => {
    const av = t.foto
      ? `<img src="${t.foto}" style="width:54px;height:54px;border-radius:50%;object-fit:cover;border:2px solid rgba(178,0,93,0.3);">`
      : `<div style="width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,#f0e0e8,#e8d0e0);color:#b2005d;font-weight:800;font-size:18px;display:flex;align-items:center;justify-content:center;border:2px solid rgba(178,0,93,0.2);">${ini(t.nombre)}</div>`;
    const countries = (t.paises||[t.pais||'']).filter(Boolean).map(c=>(flagMap[c]||'')+' '+c).join(' · ');
    const cats = t.categorias.slice(0,4).map(c=>`<span style="background:#f5f0f8;color:#7a3fa0;font-size:11px;padding:3px 9px;border-radius:10px;display:inline-block;">${c}</span>`).join(' ');

    const nets = [
      showTT && t.tiktok ? `<div style="display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid #f5f5f5;">${ttSVG}<a href="${t.tiktok}" target="_blank" style="color:#ff0050;font-weight:700;font-size:13px;text-decoration:none;flex:1;">${extractH(t.tiktok)}</a><span style="color:#333;font-weight:700;font-size:13px;">${fmtF(t.seguidores.tiktok)}</span></div>` : '',
      showIG && t.instagram ? `<div style="display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid #f5f5f5;">${igSVG}<a href="${t.instagram}" target="_blank" style="color:#e1306c;font-weight:700;font-size:13px;text-decoration:none;flex:1;">${extractH(t.instagram)}</a><span style="color:#333;font-weight:700;font-size:13px;">${fmtF(t.seguidores.instagram)}</span></div>` : '',
      showYT && t.youtube ? `<div style="display:flex;align-items:center;gap:8px;padding:9px 0;">${ytSVG}<a href="${t.youtube}" target="_blank" style="color:#cc0000;font-weight:700;font-size:13px;text-decoration:none;flex:1;">${extractH(t.youtube)}</a><span style="color:#333;font-weight:700;font-size:13px;">${fmtF(t.seguidores.youtube)}</span></div>` : '',
    ].filter(Boolean).join('');

    return `<div class="mob-card" id="mob_${t.id}" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.07);margin-bottom:14px;transition:box-shadow 0.2s;">
      <!-- Card header -->
      <div style="background:linear-gradient(135deg,#1a1a1a,#2d2d2d);padding:16px 18px;display:flex;align-items:center;gap:14px;">
        <input type="checkbox" class="row-check" data-id="${t.id}"
          style="width:22px;height:22px;accent-color:#b2005d;cursor:pointer;flex-shrink:0;">
        ${av}
        <div style="flex:1;min-width:0;">
          <div style="color:#fff;font-weight:800;font-size:15px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.nombre}</div>
          <div style="color:rgba(255,255,255,0.5);font-size:12px;margin-top:2px;">${countries}${t.ciudad?'  ·  '+t.ciudad:''}</div>
        </div>
      </div>
      <!-- Networks -->
      ${nets ? `<div style="padding:0 18px;">${nets}</div>` : ''}
      <!-- Categories -->
      ${cats ? `<div style="padding:10px 18px;border-top:1px solid #f5f5f5;display:flex;flex-wrap:wrap;gap:5px;">${cats}</div>` : ''}
      <!-- Acciones + Precio -->
      <div style="padding:12px 18px 16px;background:#fdfbfe;border-top:1px solid #f0eaf5;">
        <div style="margin-bottom:10px;">
          <label style="font-size:11px;font-weight:700;color:#b2005d;letter-spacing:0.5px;text-transform:uppercase;display:block;margin-bottom:5px;">Acciones</label>
          <textarea class="accion-input" data-id="${t.id}" placeholder="Ej. Post + story + reel..."
            style="width:100%;min-height:58px;border:1.5px solid #e8e0f0;border-radius:8px;padding:8px 10px;font-size:13px;font-family:inherit;color:#111;outline:none;resize:vertical;line-height:1.5;background:#fff;"></textarea>
        </div>
        <div style="margin-bottom:10px;">
          <label style="font-size:11px;font-weight:700;color:#b2005d;letter-spacing:0.5px;text-transform:uppercase;display:block;margin-bottom:5px;">Precio</label>
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:18px;color:#b2005d;font-weight:800;">$</span>
            <input type="text" inputmode="numeric" pattern="[0-9]*" class="price-input" data-id="${t.id}" placeholder="0"
              style="flex:1;border:1.5px solid #e8e0f0;border-radius:8px;padding:8px 10px;font-size:16px;font-family:inherit;color:#111;outline:none;background:#fff;">
          </div>
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:#9414E0;letter-spacing:0.5px;text-transform:uppercase;display:block;margin-bottom:5px;">Contraoferta</label>
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:18px;color:#9414E0;font-weight:800;">$</span>
            <input type="text" inputmode="numeric" pattern="[0-9]*" class="counter-input" data-id="${t.id}" placeholder="0"
              style="flex:1;border:1.5px solid #e8d8ff;border-radius:8px;padding:8px 10px;font-size:16px;font-family:inherit;color:#111;outline:none;background:#fff;">
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  const talentsJSON = JSON.stringify(rosterTalents.map(t => ({
    id: t.id, nombre: t.nombre,
    paises: t.paises||[t.pais||''], ciudad: t.ciudad||'',
    tiktok: t.tiktok||'', instagram: t.instagram||'', youtube: t.youtube||'',
    seguidores: t.seguidores, categorias: t.categorias
  })));

  const clientScript = `
<script>
(function() {
  var TALENTS = ${talentsJSON};

  function getSelected() {
    return Array.from(document.querySelectorAll('.row-check:checked'));
  }

  function highlightRow(checkbox) {
    var id = checkbox.getAttribute('data-id');
    // Desktop row
    var row = document.getElementById('row_' + id);
    if(row) {
      row.style.background = checkbox.checked ? '#fff5f9' : '';
      row.style.boxShadow = checkbox.checked ? 'inset 3px 0 0 #b2005d' : '';
    }
    // Mobile card
    var card = document.getElementById('mob_' + id);
    if(card) {
      card.style.boxShadow = checkbox.checked ? '0 4px 20px rgba(178,0,93,0.18),inset 0 0 0 2px #b2005d' : '0 2px 12px rgba(0,0,0,0.07)';
    }
    // Sync sibling checkbox (desktop/mobile share same data-id)
    document.querySelectorAll('.row-check[data-id="'+id+'"]').forEach(function(c){
      c.checked = checkbox.checked;
    });
  }

  function updateSummary() {
    var checked = getSelected();
    // Deduplicate by data-id (desktop + mobile both have checkboxes)
    var seen = {};
    var unique = checked.filter(function(c){
      var id = c.getAttribute('data-id');
      if(seen[id]) return false;
      seen[id] = true;
      return true;
    });

    var bar = document.getElementById('summary-bar');
    if(unique.length === 0) {
      bar.style.opacity = '0';
      bar.style.transform = 'translateY(100%)';
      return;
    }
    bar.style.opacity = '1';
    bar.style.transform = 'translateY(0)';

    var total = 0, hasPrice = false, listHTML = '';
    unique.forEach(function(chk) {
      var id = chk.getAttribute('data-id');
      var t = TALENTS.find(function(x){ return String(x.id) === String(id); });
      if(!t) return;
      var priceEls = document.querySelectorAll('.price-input[data-id="'+id+'"]');
      var accionEls = document.querySelectorAll('.accion-input[data-id="'+id+'"]');
      var counterEls = document.querySelectorAll('.counter-input[data-id="'+id+'"]');
      var p = priceEls.length ? parseFloat(priceEls[0].value)||0 : 0;
      var a = accionEls.length ? accionEls[0].value.trim() : '';
      var co = counterEls.length ? parseFloat(counterEls[0].value)||0 : 0;
      if(p > 0) hasPrice = true;
      total += (co > 0 ? co : p);
      listHTML += '<div style="display:flex;align-items:flex-start;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.1);gap:12px;">'
        + '<div><div style="font-weight:700;font-size:13px;">'+t.nombre+'</div>'
        + (a?'<div style="font-size:11px;opacity:0.7;margin-top:1px;">'+a+'</div>':'')
        + '</div>'
        + '<div style="text-align:right;flex-shrink:0;">'
        + (p>0?'<div style="font-size:12px;opacity:0.6;text-decoration:'+(co>0?'line-through':'none')+';">$ '+p.toLocaleString('es-ES')+'</div>':'')
        + (co>0?'<div style="font-size:13px;font-weight:700;color:#e8b4ff;">$ '+co.toLocaleString('es-ES')+'</div>':'')
        + (p===0&&co===0?'<span style="font-size:12px;opacity:0.4;">Sin precio</span>':'')
        + '</div>'
        + '</div>';
    });

    document.getElementById('sum-count').textContent =
      unique.length+' talento'+(unique.length!==1?'s':'')+' seleccionado'+(unique.length!==1?'s':'');
    var tw = document.getElementById('sum-total-wrap');
    if(hasPrice){ document.getElementById('sum-total').textContent='$ '+total.toLocaleString('es-ES'); tw.style.display='flex'; }
    else { tw.style.display='none'; }
    document.getElementById('sum-list').innerHTML = listHTML;
  }

  // ── Delegation: checkboxes ──
  document.addEventListener('change', function(e) {
    if(e.target.classList.contains('row-check')) {
      highlightRow(e.target);

      updateSummary();
    }
  });

  // ── Delegation: inputs ──
  document.addEventListener('input', function(e) {
    if(e.target.classList.contains('price-input')||e.target.classList.contains('accion-input')||e.target.classList.contains('counter-input')) {
      // Sync desktop↔mobile for same data-id
      var id = e.target.getAttribute('data-id');
      var val = e.target.value;
      var cls = e.target.classList.contains('price-input') ? 'price-input' : e.target.classList.contains('accion-input') ? 'accion-input' : 'counter-input';
      document.querySelectorAll('.'+cls+'[data-id="'+id+'"]').forEach(function(el){
        if(el !== e.target) el.value = val;
      });
      updateSummary();
    }
  });

  // ── Focus styling ──
  document.addEventListener('focusin', function(e) {
    if(e.target.classList.contains('price-input')||e.target.classList.contains('accion-input')||e.target.classList.contains('counter-input'))
      e.target.style.borderColor=e.target.classList.contains('counter-input')?'#9414E0':'#b2005d';
  });
  document.addEventListener('focusout', function(e) {
    if(e.target.classList.contains('price-input')||e.target.classList.contains('accion-input')||e.target.classList.contains('counter-input'))
      e.target.style.borderColor='#e8e0f0';
  });

  // Select all removed

  // ── Export ──
  var btn = document.getElementById('export-btn');
  if(btn) btn.addEventListener('click', function() {
    var checked = document.querySelectorAll('.row-check:checked');
    var seen = {}; var ids = [];
    checked.forEach(function(c){
      var id = c.getAttribute('data-id');
      if(!seen[id]){ seen[id]=true; ids.push(id); }
    });
    if(!ids.length){ alert('Seleccioná al menos un talento primero.'); return; }
    var lines = ['Talento,País,TikTok,Instagram,YouTube,Acciones,Precio,Contraoferta'];
    ids.forEach(function(id) {
      var t = TALENTS.find(function(x){ return String(x.id)===String(id); });
      if(!t) return;
      var pEl = document.querySelector('.price-input[data-id="'+id+'"]');
      var aEl = document.querySelector('.accion-input[data-id="'+id+'"]');
      var coEl = document.querySelector('.counter-input[data-id="'+id+'"]');
      var p = pEl?parseFloat(pEl.value)||'':'';
      var a = aEl?aEl.value.trim():'';
      var co = coEl?parseFloat(coEl.value)||'':'';
      var paises = (t.paises||['']).filter(Boolean).join(';');
      lines.push(['"'+t.nombre.replace(/"/g,'""')+'"','"'+paises+'"',
        t.tiktok?'"'+t.tiktok+'"':'""', t.instagram?'"'+t.instagram+'"':'""',
        t.youtube?'"'+t.youtube+'"':'""','"'+a.replace(/"/g,'""')+'"',p,co].join(','));
    });
    var csv='\uFEFF'+lines.join('\n');
    var blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url; a.download='seleccion_roster.csv'; a.click(); URL.revokeObjectURL(url);
  });
})();
<\/script>`;

  const summaryBar = `
<div id="summary-bar" style="position:fixed;bottom:0;left:0;right:0;background:linear-gradient(135deg,#8a0048,#6a0d9e);color:#fff;padding:14px 20px;display:flex;align-items:flex-start;gap:16px;box-shadow:0 -4px 24px rgba(0,0,0,0.22);transition:all 0.3s;opacity:0;transform:translateY(100%);z-index:9999;flex-wrap:wrap;">
  <div style="min-width:160px;flex-shrink:0;">
    <div id="sum-count" style="font-weight:800;font-size:15px;"></div>
    <div id="sum-total-wrap" style="display:none;align-items:baseline;gap:5px;margin-top:3px;">
      <span style="font-size:12px;opacity:0.75;">Total:</span>
      <span id="sum-total" style="font-size:19px;font-weight:800;"></span>
    </div>
  </div>
  <div id="sum-list" style="flex:1;min-width:180px;max-height:100px;overflow-y:auto;font-size:12px;"></div>
  <button id="export-btn" style="background:rgba(255,255,255,0.18);border:1.5px solid rgba(255,255,255,0.5);color:#fff;padding:10px 18px;border-radius:24px;cursor:pointer;font-size:13px;font-weight:700;font-family:inherit;white-space:nowrap;flex-shrink:0;align-self:center;">
    ↓ Exportar CSV
  </button>
</div>`;

  const header = `<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:22px;padding-bottom:16px;border-bottom:3px solid #b2005d;flex-wrap:wrap;gap:12px;">
    <div>
      <div style="font-size:24px;font-weight:300;margin-bottom:5px;">Be<strong style="font-weight:800;color:#b2005d">me</strong></div>
      <div style="font-family:'Syne',sans-serif;font-size:19px;font-weight:700;color:#111;">${roster.name}</div>
      ${roster.description?`<div style="font-size:13px;color:#666;margin-top:3px;">${roster.description}</div>`:''}
    </div>
    <div style="text-align:right;">
      <div style="font-size:12px;color:#888;line-height:1.8;"><div style="font-weight:700;color:#111;">${rosterTalents.length} talento${rosterTalents.length!==1?'s':''}</div><div>${today}</div></div>
      <div style="margin-top:8px;font-size:12px;padding:5px 12px;background:#fdf4f8;border:1px solid #f0ccd9;border-radius:10px;color:#b2005d;font-weight:600;">☑ Marcá los talentos de tu interés</div>
    </div>
  </div>`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Roster — ${roster.name}</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Syne:wght@700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Plus Jakarta Sans',sans-serif;background:#f4f2f8;color:#111;min-height:100vh;padding-bottom:130px;}
.page{background:#fff;max-width:1200px;margin:28px auto;border-radius:16px;padding:36px;box-shadow:0 4px 32px rgba(0,0,0,0.07);}
a{text-decoration:none;}
textarea,input{font-family:'Plus Jakarta Sans',sans-serif;}
input[type=number]::-webkit-inner-spin-button,
input[type=number]::-webkit-outer-spin-button{display:none;}
input[type=number]{-moz-appearance:textfield;}
#export-btn:hover{background:rgba(255,255,255,0.28)!important;}

/* ── Responsive: show/hide desktop vs mobile view ── */
.desktop-view{display:block;}
.mobile-view{display:none;}

@media(max-width:680px){
  body{padding-bottom:150px;}
  .page{margin:0;border-radius:0;padding:18px;}
  .desktop-view{display:none;}
  .mobile-view{display:block;}
  #summary-bar{padding:12px 16px;}
}

@media print{
  body{background:#fff;padding:0;}
  .page{box-shadow:none;margin:0;border-radius:0;padding:20px;}
  .mobile-view{display:none!important;}
  .desktop-view{display:block!important;}
  #summary-bar{display:none!important;}
  input[type=checkbox]{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  @page{margin:12mm;size:A4 landscape;}
}
</style>
</head>
<body>
<div class="page">
  ${header}
  ${rosterTalents.length===0
    ? '<p style="text-align:center;color:#999;padding:40px;">Este roster no tiene talentos todavía.</p>'
    : `
  <!-- DESKTOP: table -->
  <div class="desktop-view">
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;box-shadow:0 2px 16px rgba(0,0,0,0.06);">
        <thead>${tableHeader}</thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  </div>
  <!-- MOBILE: vertical cards -->
  <div class="mobile-view">
    <div style="margin-bottom:14px;">
      <span style="font-size:13px;color:#888;">${rosterTalents.length} talentos</span>
    </div>
    ${mobileCards}
  </div>
  `}
</div>
${summaryBar}
${clientScript}
</body>
</html>`;

  const blob = new Blob([html], {type:'text/html;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `roster_${roster.name.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'')}.html`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Roster interactivo descargado', 'success');
}


// ===================== APIFY SCRAPING =====================
// Llamadas via Netlify function para evitar CORS y ocultar el token.

let IS_EXTENSION = false; // kept for compatibility

async function saveScrapeResults(results) {
  if (!results || !sb || !currentUser) return 0;
  let count = 0;
  for (const tid of Object.keys(results)) {
    const id = parseInt(tid);
    const r = results[id];
    const t = talents.find(x => x.id === id);
    if (!t || !r) continue;
    let changed = false;
    if (r.instagram !== undefined) { t.seguidores.instagram = r.instagram; changed = true; }
    if (r.tiktok    !== undefined) { t.seguidores.tiktok    = r.tiktok;    changed = true; }
    if (changed) {
      t.updated = new Date().toISOString().split('T')[0];
      count++;
      await sb.from('talentos').update({seguidores:{...t.seguidores},updated:t.updated}).eq('id',t.id);
    }
  }
  return count;
}

async function fetchFollowersViaApify(platform, profileUrl) {
  // Tokens are optional on frontend — server has env vars as fallback
  var username = extractUsername(profileUrl, platform);
  if (!username) return null;
  try {
    var controller = new AbortController();
    var timer = setTimeout(function(){ controller.abort(); }, 65000);
    var resp = await fetch('/.netlify/functions/ensemble-scraper', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({platform, username, action:'followers', ensembleToken, apifyToken}),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    var data = await resp.json();
    if (data.error) { console.log('[scraper]', data.error, '(source:', data.source||'none', ')'); return null; }
    if (data.source) console.log('[scraper]', platform, '@'+username, data.followers, 'via', data.source);
    return (data.followers !== null && data.followers !== undefined) ? data.followers : null;
  } catch(e) {
    console.warn('[scraper]', username, platform, e.message);
    return null;
  }
}

// ── Engagement rate fetching ─────────────────────────────────
async function fetchEngagement(platform, profileUrl) {
  // Token optional on frontend — server has ENSEMBLE_TOKEN env var
  var username = extractUsername(profileUrl, platform);
  if (!username) return null;
  try {
    var controller = new AbortController();
    var timer = setTimeout(function(){ controller.abort(); }, 65000);
    var resp = await fetch('/.netlify/functions/ensemble-scraper', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({platform, username, action:'engagement', ensembleToken}),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    var data = await resp.json();
    if (data.error) { console.log('[engagement]', data.error); return null; }
    return {
      engagementRate: data.engagementRate,
      avgViews: data.avgViews || null,
      followers: data.followers,
      postsAnalyzed: data.postsAnalyzed,
      bio: data.bio || '',
      nickname: data.nickname || '',
      verified: data.verified || false,
      category: data.category || '',
      region: data.region || '',
      instagram_id: data.instagram_id || '',
      youtube_id: data.youtube_id || '',
      external_url: data.external_url || '',
      is_business: data.is_business || false,
    };
  } catch(e) {
    console.warn('[engagement]', username, platform, e.message);
    return null;
  }
}

// ── Posts-only fetch (reuse existing followers) ──────────────
async function fetchPostsOnly(platform, profileUrl, existingFollowers) {
  var username = extractUsername(profileUrl, platform);
  if (!username) return null;
  try {
    var controller = new AbortController();
    var timer = setTimeout(function(){ controller.abort(); }, 65000);
    var resp = await fetch('/.netlify/functions/ensemble-scraper', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({platform, username, action:'posts_only', followers: existingFollowers, ensembleToken}),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    var data = await resp.json();
    if (data.error) { console.log('[posts_only]', data.error); return null; }
    return {
      engagementRate: data.engagementRate,
      avgViews: data.avgViews || null,
      followers: existingFollowers,
      postsAnalyzed: data.postsAnalyzed,
    };
  } catch(e) {
    console.warn('[posts_only]', username, platform, e.message);
    return null;
  }
}

// TikTok region code → country name mapping
// ── Freshness check (7-day cooldown) ─────────────────────────
const FRESHNESS_DAYS = 30;

function isFresh(t, platform, dataType) {
  // dataType: 'followers' or 'engagement'
  var meta = (t.social_meta || {})[platform];
  if (!meta) return false;
  var key = dataType === 'engagement' ? 'engagement_at' : 'followers_at';
  var dateStr = meta[key];
  if (!dateStr) return false;
  var then = new Date(dateStr);
  var now = new Date();
  var diffDays = (now - then) / (1000 * 60 * 60 * 24);
  return diffDays < FRESHNESS_DAYS;
}

function setFreshTimestamp(t, platform, dataType) {
  if (!t.social_meta) t.social_meta = {};
  if (!t.social_meta[platform]) t.social_meta[platform] = {};
  var key = dataType === 'engagement' ? 'engagement_at' : 'followers_at';
  t.social_meta[platform][key] = new Date().toISOString().split('T')[0];
}

const REGION_TO_COUNTRY = {
  'AR':'Argentina','BO':'Bolivia','BR':'Brasil','CL':'Chile','CO':'Colombia',
  'CR':'Costa Rica','CU':'Cuba','EC':'Ecuador','SV':'El Salvador','ES':'España',
  'US':'Estados Unidos','GT':'Guatemala','HN':'Honduras','MX':'México',
  'NI':'Nicaragua','PA':'Panamá','PY':'Paraguay','PE':'Perú',
  'PR':'Puerto Rico','DO':'República Dominicana','UY':'Uruguay','VE':'Venezuela',
};

async function engagementAndSave(t, platform, force) {
  var url = platform === 'instagram' ? t.instagram : t.tiktok;
  if (!url) return false;

  // Skip if engagement is already fresh
  if (!force && isFresh(t, platform, 'engagement')) {
    console.log('[engagement] SKIP', t.nombre, platform, '— engagement fresh');
    return 'skipped';
  }

  try {
    var result;
    var followersFresh = isFresh(t, platform, 'followers');
    var existingFollowers = t.seguidores[platform] || 0;

    if (followersFresh && existingFollowers > 0) {
      // Followers are fresh → only fetch posts (saves 1 unit TT / 3 units IG)
      console.log('[engagement] OPTIMIZED', t.nombre, platform, '— reusing fresh followers, only fetching posts');
      result = await fetchPostsOnly(platform, url, existingFollowers);
    } else {
      // Followers stale or missing → full engagement (user info + posts)
      result = await fetchEngagement(platform, url);
    }

    if (!result || (result.engagementRate === null && result.engagementRate === undefined)) return false;

    // ── Core metrics ──
    if (!t.engagement) t.engagement = {};
    t.engagement[platform] = result.engagementRate;
    if (result.followers) t.seguidores[platform] = result.followers;

    // ── Avg views ──
    if (!t.avg_views) t.avg_views = {};
    if (result.avgViews) t.avg_views[platform] = result.avgViews;

    // ── Timestamps ──
    setFreshTimestamp(t, platform, 'engagement');
    if (!followersFresh && result.followers) {
      setFreshTimestamp(t, platform, 'followers');
    }

    // ── Hidden metadata (social_meta) — only from full engagement ──
    if (!t.social_meta) t.social_meta = {};
    if (!t.social_meta[platform]) t.social_meta[platform] = {};
    var meta = t.social_meta[platform];
    if (result.bio) meta.bio = result.bio;
    if (result.nickname) meta.nickname = result.nickname;
    if (result.verified !== undefined) meta.verified = result.verified;
    if (result.category) meta.category = result.category;
    if (result.region) meta.region = result.region;
    if (result.external_url) meta.external_url = result.external_url;
    if (result.is_business !== undefined) meta.is_business = result.is_business;
    meta.updated = new Date().toISOString().split('T')[0];

    // ── Auto-fill country from TikTok region ──
    if (platform === 'tiktok' && result.region) {
      var countryName = REGION_TO_COUNTRY[result.region.toUpperCase()];
      if (countryName && (!t.paises || t.paises.length === 0)) {
        t.paises = [countryName];
        console.log('[engagement] Auto-filled country:', countryName, 'from region:', result.region);
      }
    }

    // ── Auto-link IG/YT from TikTok connected accounts ──
    if (platform === 'tiktok') {
      if (result.instagram_id && !t.instagram) {
        t.instagram = normalizeSocialUrl(result.instagram_id, 'instagram');
        console.log('[engagement] Auto-linked Instagram:', t.instagram);
      }
      if (result.youtube_id && !t.youtube) {
        t.youtube = 'https://www.youtube.com/channel/' + result.youtube_id;
        console.log('[engagement] Auto-linked YouTube:', t.youtube);
      }
    }

    t.updated = new Date().toISOString().split('T')[0];

    // ── Save to Supabase ──
    if (sb && currentUser) {
      var updateObj = {
        seguidores: {...t.seguidores},
        engagement: {...(t.engagement||{})},
        avg_views: {...(t.avg_views||{})},
        social_meta: {...(t.social_meta||{})},
        updated: t.updated
      };
      if (platform === 'tiktok') {
        if (result.instagram_id && t.instagram) updateObj.instagram = t.instagram;
        if (result.youtube_id && t.youtube) updateObj.youtube = t.youtube;
        if (t.paises && t.paises.length > 0) updateObj.paises = t.paises;
      }
      await sb.from('talentos').update(updateObj).eq('id', t.id);
    }
    return followersFresh ? 'optimized' : true;
  } catch(e) { console.warn('[engagement]', t.nombre, platform, e.message); }
  return false;
}

// ── Bulk engagement functions ────────────────────────────────
async function engagementAllTikTok() {
  netDropdownOpen = false;
  var panel = document.getElementById('net-update-panel');
  if (panel) panel.classList.remove('open');
  var list = talents.filter(function(t){ return t.tiktok; });
  if (!list.length) { showToast('Nadie tiene TikTok', 'info'); return; }
  showProgressBar('ext', list.length);
  var btn = document.getElementById('eng-tt-all-btn');
  if (btn) btn.disabled = true;
  var ok = 0, skipped = 0, optimized = 0;
  for (var i = 0; i < list.length; i++) {
    updateProgressBar('ext', i + 1, list.length, 'Eng TT: ' + list[i].nombre);
    var r = await engagementAndSave(list[i], 'tiktok');
    if (r === 'skipped') skipped++; else if (r === 'optimized') { ok++; optimized++; } else if (r) ok++;
    renderTalents();
    if (r !== 'skipped' && i < list.length - 1) await new Promise(function(r) { setTimeout(r, 0); });
  }
  hideProgressBar('ext');
  if (btn) btn.disabled = false;
  updateStats();
  var saved = skipped * 2 + optimized * 1; // skip eng TT = 2u, optimized = saves 1u (user info)
  var msg = 'Eng TikTok: ' + ok + ' actualizado(s)';
  if (skipped > 0) msg += ', ' + skipped + ' sin cambios';
  if (saved > 0) msg += ' (ahorraste ' + saved + ' units)';
  showToast(msg, ok > 0 ? 'success' : 'info');
}

async function engagementAllInstagram() {
  netDropdownOpen = false;
  var panel = document.getElementById('net-update-panel');
  if (panel) panel.classList.remove('open');
  var list = talents.filter(function(t){ return t.instagram; });
  if (!list.length) { showToast('Nadie tiene Instagram', 'info'); return; }
  showProgressBar('ig', list.length);
  var btn = document.getElementById('eng-ig-all-btn');
  if (btn) btn.disabled = true;
  var ok = 0, skipped = 0, optimized = 0;
  for (var i = 0; i < list.length; i++) {
    updateProgressBar('ig', i + 1, list.length, 'Eng IG: ' + list[i].nombre);
    var r = await engagementAndSave(list[i], 'instagram');
    if (r === 'skipped') skipped++; else if (r === 'optimized') { ok++; optimized++; } else if (r) ok++;
    renderTalents();
    if (r !== 'skipped' && i < list.length - 1) await new Promise(function(r) { setTimeout(r, 0); });
  }
  hideProgressBar('ig');
  if (btn) btn.disabled = false;
  updateStats();
  var saved = skipped * 5 + optimized * 3; // skip eng IG = ~5u, optimized = saves 3u (user info)
  var msg2 = 'Eng Instagram: ' + ok + ' actualizado(s)';
  if (skipped > 0) msg2 += ', ' + skipped + ' sin cambios';
  if (saved > 0) msg2 += ' (ahorraste ' + saved + ' units)';
  showToast(msg2, ok > 0 ? 'success' : 'info');
}

// ── Selected talents: per-platform updates ───────────────────
async function updateSelectedTikTok() {
  closeBottomBarMenu();
  if (selectedIds.size === 0) { showToast('Selecciona talentos primero', 'error'); return; }
  var list = talents.filter(function(t){ return selectedIds.has(t.id) && t.tiktok; });
  if (!list.length) { showToast('Ningún seleccionado tiene TikTok', 'info'); return; }
  showProgressBar('ext', list.length);
  var ok = 0;
  for (var i = 0; i < list.length; i++) {
    updateProgressBar('ext', i + 1, list.length, list[i].nombre);
    if (await scrapeAndSave(list[i], 'tiktok')) ok++;
    renderTalents();
    if (i < list.length - 1) await new Promise(function(r){ setTimeout(r, 300); });
  }
  hideProgressBar('ext');
  updateStats();
  showToast('TikTok: ' + ok + ' actualizado(s)', ok > 0 ? 'success' : 'info');
}

async function updateSelectedInstagram() {
  closeBottomBarMenu();
  if (selectedIds.size === 0) { showToast('Selecciona talentos primero', 'error'); return; }
  var list = talents.filter(function(t){ return selectedIds.has(t.id) && t.instagram; });
  if (!list.length) { showToast('Ningún seleccionado tiene Instagram', 'info'); return; }
  showProgressBar('ig', list.length);
  var ok = 0;
  for (var i = 0; i < list.length; i++) {
    updateProgressBar('ig', i + 1, list.length, list[i].nombre);
    if (await scrapeAndSave(list[i], 'instagram')) ok++;
    renderTalents();
    if (i < list.length - 1) await new Promise(function(r){ setTimeout(r, 600); });
  }
  hideProgressBar('ig');
  updateStats();
  showToast('Instagram: ' + ok + ' actualizado(s)', ok > 0 ? 'success' : 'info');
}

async function updateSelectedYouTube() {
  closeBottomBarMenu();
  if (selectedIds.size === 0) { showToast('Selecciona talentos primero', 'error'); return; }
  if (!ytApiKey) { showToast('Configura tu clave de YouTube primero','error'); openApiKeyModal(); return; }
  var list = talents.filter(function(t){ return selectedIds.has(t.id) && t.youtube; });
  if (!list.length) { showToast('Ningún seleccionado tiene YouTube', 'info'); return; }
  var ok = 0;
  for (var i = 0; i < list.length; i++) {
    try {
      var r = await Promise.race([fetchYouTubeSubscribers(list[i].youtube), new Promise(function(_,rej){setTimeout(function(){rej(new Error('timeout'));},15000);})]);
      if (r && r.subscribers !== undefined) {
        list[i].seguidores.youtube = r.subscribers;
        list[i].updated = new Date().toISOString().split('T')[0];
        if (sb && currentUser) await sb.from('talentos').update({seguidores:{...list[i].seguidores},updated:list[i].updated}).eq('id',list[i].id);
        ok++;
      }
    } catch(e) { console.warn('[YT]', e.message); }
    await new Promise(function(r){setTimeout(r,200);});
  }
  renderTalents(); updateStats();
  showToast('YouTube: ' + ok + ' actualizado(s)', ok > 0 ? 'success' : 'info');
}

async function engagementSelectedTikTok() {
  closeBottomBarMenu();
  if (selectedIds.size === 0) { showToast('Selecciona talentos primero', 'error'); return; }
  var list = talents.filter(function(t){ return selectedIds.has(t.id) && t.tiktok; });
  if (!list.length) { showToast('Ningún seleccionado tiene TikTok', 'info'); return; }
  showProgressBar('ext', list.length);
  var ok = 0;
  for (var i = 0; i < list.length; i++) {
    updateProgressBar('ext', i + 1, list.length, 'Eng TT: ' + list[i].nombre);
    if (await engagementAndSave(list[i], 'tiktok')) ok++;
    renderTalents();
    if (i < list.length - 1) await new Promise(function(r){ setTimeout(r, 400); });
  }
  hideProgressBar('ext');
  updateStats();
  showToast('Engagement TikTok: ' + ok + ' OK', ok > 0 ? 'success' : 'info');
}

async function engagementSelectedInstagram() {
  closeBottomBarMenu();
  if (selectedIds.size === 0) { showToast('Selecciona talentos primero', 'error'); return; }
  var list = talents.filter(function(t){ return selectedIds.has(t.id) && t.instagram; });
  if (!list.length) { showToast('Ningún seleccionado tiene Instagram', 'info'); return; }
  showProgressBar('ig', list.length);
  var ok = 0;
  for (var i = 0; i < list.length; i++) {
    updateProgressBar('ig', i + 1, list.length, 'Eng IG: ' + list[i].nombre);
    if (await engagementAndSave(list[i], 'instagram')) ok++;
    renderTalents();
    if (i < list.length - 1) await new Promise(function(r){ setTimeout(r, 600); });
  }
  hideProgressBar('ig');
  updateStats();
  showToast('Engagement Instagram: ' + ok + ' OK', ok > 0 ? 'success' : 'info');
}

// ── Bottom bar update menu toggle ────────────────────────────
function toggleBottomBarUpdateMenu() {
  var menu = document.getElementById('bottom-bar-update-menu');
  if (menu) menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
  if (menu) menu.style.flexDirection = 'column';
}
function closeBottomBarMenu() {
  var menu = document.getElementById('bottom-bar-update-menu');
  if (menu) menu.style.display = 'none';
}

async function saveFollowers(t, platform, followers) {
  t.seguidores[platform] = followers;
  t.updated = new Date().toISOString().split('T')[0];
  if (sb && currentUser) {
    await sb.from('talentos').update({seguidores:{...t.seguidores},updated:t.updated}).eq('id',t.id);
  }
}

async function scrapeAndSave(t, platform, force) {
  var url = platform === 'instagram' ? t.instagram : t.tiktok;
  if (!url) return false;
  // Skip if followers are fresh (updated < 7 days ago)
  if (!force && isFresh(t, platform, 'followers')) {
    console.log('[scraper] SKIP', t.nombre, platform, '— followers fresh');
    return 'skipped';
  }
  try {
    var timeoutP = new Promise(function(_,rej){ setTimeout(function(){ rej(new Error('timeout')); }, 65000); });
    var followers = await Promise.race([fetchFollowersViaApify(platform, url), timeoutP]);
    if (followers !== null && followers !== undefined) {
      try { await Promise.race([saveFollowers(t, platform, followers), new Promise(function(r){ setTimeout(r,5000); })]); } catch(e) {}
      setFreshTimestamp(t, platform, 'followers');
      // Persist timestamp
      if (sb && currentUser) {
        sb.from('talentos').update({ social_meta: {...(t.social_meta||{})} }).eq('id', t.id).then(function(){});
      }
      return true;
    }
  } catch(e) { console.warn('[scraper]', t.nombre, platform, e.message); }
  return false;
}

async function scrapeAllProfiles() {
  // Server has tokens via env vars — proceed directly
  var toScrape = talents.filter(function(t){ return t.instagram || t.tiktok; });
  if (!toScrape.length) { showToast('Ningún talento tiene IG o TikTok','info'); return; }
  showProgressBar('ext', toScrape.length);
  var ok=0, errors=0, skipped=0, done=0;
  for (var i=0; i<toScrape.length; i++) {
    var t = toScrape[i];
    updateProgressBar('ext', done+1, toScrape.length, t.nombre);
    if (t.instagram) { var ri = await scrapeAndSave(t,'instagram'); if (ri==='skipped') skipped++; else if (ri) ok++; else errors++; }
    if (t.tiktok)    { var rt = await scrapeAndSave(t,'tiktok');    if (rt==='skipped') skipped++; else if (rt) ok++; else errors++; }
    done++;
    renderTalents(); updateStats();
    if (i < toScrape.length-1) await new Promise(function(r){ setTimeout(r,0); });
  }
  hideProgressBar('ext');
  updatePlatformCounts();
  var msg = ok+' OK';
  if (skipped > 0) msg += ', '+skipped+' sin cambios';
  if (errors > 0) msg += ', '+errors+' errores';
  if (skipped > 0) msg += ' (ahorraste ~'+skipped+' units)';
  showToast(msg, ok>0?'success':'info');
}

async function scrapeSingle(talentId, platform) {
  // Server has tokens via env vars — proceed directly
  const t = talents.find(function(x){ return x.id===talentId; });
  if (!t) return;
  const url = platform==='instagram' ? t.instagram : t.tiktok;
  if (!url) return;
  const btn = document.getElementById('scr-'+(platform==='instagram'?'ig':'tt')+'-'+talentId);
  if (btn) btn.classList.add('spinning');
  const ok = await scrapeAndSave(t, platform);
  if (btn) btn.classList.remove('spinning');
  // Close card menu
  var menu = document.getElementById('card-menu-' + talentId);
  if (menu) menu.style.display = 'none';
  if (ok === 'skipped') { var savedU = platform==='instagram'?3:1; showToast(t.nombre+': '+platform+' ya actualizado — ahorraste '+savedU+' unit(s)','info'); }
  else if (ok) { renderTalents(); updateStats(); showToast(t.nombre+': '+formatFollowers(t.seguidores[platform])+' ✓','success'); }
  else { showToast(t.nombre+': no se pudo obtener '+platform,'error'); }
}

function extractUsername(url, platform) {
  if (!url) return '';
  try {
    var u = new URL(url.startsWith('http') ? url : 'https://'+url);
    var segs = u.pathname.split('/').filter(Boolean);
    var skip = new Set(['channel','user','c','p','reel','tv','reels','explore','videos']);
    for (var i=segs.length-1; i>=0; i--) {
      var s = segs[i].replace(/^@/,'');
      if (s && !skip.has(s.toLowerCase())) return s;
    }
    return segs[0] ? segs[0].replace(/^@/,'') : '';
  } catch(e) {
    var m = url.match(/@([^/?#\s]+)/);
    return m ? m[1] : url.replace(/https?:\/\/(www\.)?(instagram|tiktok)\.com\/?/gi,'').split('/')[0].replace(/^@/,'');
  }
}

function syncToExtensionStorage() {}
function syncFromExtensionStorage() {}
function startScrapeProgressPoller() {}
function stopScrapeProgressPoller() {}

// ── CATEGORY DROPDOWN ────────────────────────────────────────

function toggleCatDropdown() {
  catDropdownOpen = !catDropdownOpen;
  document.getElementById('cat-panel').classList.toggle('open', catDropdownOpen);
  document.getElementById('cat-trigger').classList.toggle('open', catDropdownOpen);
  if (catDropdownOpen) renderCatPanelList();
}

function renderCatPanelList() {
  const container = document.getElementById('cat-panel-list');
  container.innerHTML = '';
  CATEGORIES.forEach(cat => {
    const count = talents.filter(t => t.categorias.includes(cat)).length;
    const selected = selectedCats.has(cat);
    const el = document.createElement('div');
    el.className = 'multi-select-opt' + (selected ? ' selected' : '');
    el.innerHTML = '<div class="ms-checkbox">' + (selected ? '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg>' : '') + '</div>' + cat + '<span style="margin-left:auto;font-size:11px;color:var(--text-dim)">' + count + '</span>';
    el.addEventListener('click', function(e) { e.stopPropagation(); toggleCatFromDropdown(cat); });
    container.appendChild(el);
  });
}

function toggleCatFromDropdown(cat) {
  if (selectedCats.has(cat)) selectedCats.delete(cat); else selectedCats.add(cat);
  document.getElementById('clear-cats').style.display = selectedCats.size > 0 ? 'inline' : 'none';
  updateCatTrigger(); updateCatPills(); renderCatPanelList(); renderTalents();
}

function updateCatTrigger() {
  const trigger = document.getElementById('cat-trigger-text');
  if (!trigger) return;
  if (selectedCats.size === 0) { trigger.textContent = 'Todas las categorías'; document.getElementById('cat-trigger').classList.remove('has-value'); }
  else { trigger.textContent = selectedCats.size + ' categoría(s)'; document.getElementById('cat-trigger').classList.add('has-value'); }
}

function updateCatPills() {
  const row = document.getElementById('cat-pills-row');
  if (!row) return;
  row.innerHTML = '';
  selectedCats.forEach(c => {
    const el = document.createElement('span');
    el.className = 'country-pill';
    el.innerHTML = c + ' <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    el.addEventListener('click', function() { toggleCatFromDropdown(c); });
    row.appendChild(el);
  });
}

function addCategoryFromPanel() {
  const name = prompt('Nombre de la nueva categoría:');
  if (!name || !name.trim()) return;
  const trimmed = name.trim();
  if (CATEGORIES.includes(trimmed)) { showToast('Ya existe', 'info'); return; }
  CATEGORIES.push(trimmed);
  saveData(); populateCatCheckboxes(); renderCatPanelList();
  showToast('"' + trimmed + '" agregada', 'success');
}

// ── MANAGE CATEGORIES MODAL ──────────────────────────────────
function openManageCatsModal() { renderCatsMgrList(); document.getElementById('new-cat-name').value = ''; openModal('manage-cats-modal'); }
function closeManageCatsModal() { closeModal('manage-cats-modal'); }

function renderCatsMgrList() {
  const list = document.getElementById('cats-mgr-list');
  list.innerHTML = '';
  [...CATEGORIES].sort().forEach(cat => {
    const inUse = talents.filter(t => t.categorias.includes(cat)).length;
    const el = document.createElement('div');
    el.className = 'country-mgr-item';
    el.innerHTML = '<div class="country-mgr-name">' + cat + '</div>' +
      (inUse > 0 ? '<span class="country-in-use">' + inUse + ' talento(s)</span>' : '') +
      '<button class="country-mgr-del"' + (inUse > 0 ? ' disabled style="opacity:0.3"' : '') + '><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>';
    if (inUse === 0) el.querySelector('.country-mgr-del').addEventListener('click', function() { removeCategoryFromModal(cat); });
    list.appendChild(el);
  });
}

function addCategoryFromModal() {
  const name = document.getElementById('new-cat-name').value.trim();
  if (!name) return;
  if (CATEGORIES.includes(name)) { showToast('Ya existe', 'info'); return; }
  CATEGORIES.push(name);
  document.getElementById('new-cat-name').value = '';
  saveData(); populateCatCheckboxes(); renderCatsMgrList(); renderCatPanelList();
  showToast('"' + name + '" agregada', 'success');
}

function removeCategoryFromModal(name) {
  if (talents.some(t => t.categorias.includes(name))) { showToast('Hay talentos con esta categoría', 'error'); return; }
  if (!confirm('¿Eliminar "' + name + '"?')) return;
  const idx = CATEGORIES.indexOf(name);
  if (idx > -1) CATEGORIES.splice(idx, 1);
  selectedCats.delete(name);
  saveData(); populateCatCheckboxes(); renderCatsMgrList(); renderCatPanelList();
  updateCatTrigger(); updateCatPills(); renderTalents();
}

// ── ROSTER FILTER ────────────────────────────────────────────

function toggleRosterFilterDropdown() {
  rosterFilterDropdownOpen = !rosterFilterDropdownOpen;
  document.getElementById('roster-filter-panel').classList.toggle('open', rosterFilterDropdownOpen);
  document.getElementById('roster-filter-trigger').classList.toggle('open', rosterFilterDropdownOpen);
  if (rosterFilterDropdownOpen) populateRosterFilterList();
}

function populateRosterFilterList() {
  var list = document.getElementById('roster-filter-list');
  list.innerHTML = '';
  if (rosters.length === 0) {
    list.innerHTML = '<div style="padding:10px;font-size:12px;color:var(--text-dim);text-align:center">No hay rosters</div>';
    return;
  }
  // Option: "Sin roster" — talents not in any roster
  var noRosterSel = selectedRosters.has('none');
  var noEl = document.createElement('div');
  noEl.className = 'multi-select-opt' + (noRosterSel ? ' selected' : '');
  noEl.innerHTML = '<div class="ms-checkbox">' + (noRosterSel ? '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg>' : '') + '</div>Sin roster';
  noEl.addEventListener('click', function(e) { e.stopPropagation(); toggleRosterFilter('none'); });
  list.appendChild(noEl);

  rosters.forEach(function(r) {
    var sel = selectedRosters.has(String(r.id));
    var count = r.talentIds ? r.talentIds.length : 0;
    var el = document.createElement('div');
    el.className = 'multi-select-opt' + (sel ? ' selected' : '');
    el.innerHTML = '<div class="ms-checkbox">' + (sel ? '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg>' : '') + '</div>' + escapeHtml(r.name) + '<span style="margin-left:auto;font-size:11px;color:var(--text-dim)">' + count + '</span>';
    el.addEventListener('click', function(e) { e.stopPropagation(); toggleRosterFilter(String(r.id)); });
    list.appendChild(el);
  });
}

function toggleRosterFilter(key) {
  if (selectedRosters.has(key)) selectedRosters.delete(key);
  else selectedRosters.add(key);
  document.getElementById('clear-roster').style.display = selectedRosters.size > 0 ? 'inline' : 'none';
  updateRosterFilterTrigger();
  populateRosterFilterList();
  renderTalents();
}

function updateRosterFilterTrigger() {
  var trigger = document.getElementById('roster-filter-trigger-text');
  var btn = document.getElementById('roster-filter-trigger');
  if (selectedRosters.size === 0) {
    trigger.textContent = 'Todos los rosters';
    btn.classList.remove('has-value');
  } else {
    trigger.textContent = selectedRosters.size + ' roster(s)';
    btn.classList.add('has-value');
  }
}

function clearRosterFilter() {
  selectedRosters.clear();
  document.getElementById('clear-roster').style.display = 'none';
  updateRosterFilterTrigger();
  populateRosterFilterList();
  renderTalents();
}

// ── NETWORK UPDATE DROPDOWN ──────────────────────────────────
function toggleNetUpdateDropdown() {
  netDropdownOpen = !netDropdownOpen;
  document.getElementById('net-update-panel').classList.toggle('open', netDropdownOpen);
}


// ── SCRAPE BY PLATFORM ───────────────────────────────────────
async function scrapeAllTikTok() {
  netDropdownOpen = false;
  document.getElementById('net-update-panel').classList.remove('open');
  // Server has tokens via env vars — proceed directly
  var list = talents.filter(t => t.tiktok);
  if (!list.length) { showToast('Nadie tiene TikTok', 'info'); return; }
  showProgressBar('ext', list.length);
  var btn = document.getElementById('scrape-tt-all-btn');
  if (btn) btn.disabled = true;
  var ok = 0, skipped = 0;
  for (var i = 0; i < list.length; i++) {
    updateProgressBar('ext', i + 1, list.length, list[i].nombre);
    var r = await scrapeAndSave(list[i], 'tiktok');
    if (r === 'skipped') skipped++; else if (r) ok++;
    renderTalents();
    if (r !== 'skipped' && i < list.length - 1) await new Promise(function(r) { setTimeout(r, 0); });
  }
  hideProgressBar('ext');
  if (btn) btn.disabled = false;
  updateStats();
  var msg = 'TikTok: ' + ok + ' actualizado(s)';
  if (skipped > 0) msg += ', ' + skipped + ' sin cambios';
  if (skipped > 0) msg += ' (ahorraste ' + skipped + ' units)';
  showToast(msg, ok > 0 ? 'success' : 'info');
}

async function scrapeAllInstagram() {
  netDropdownOpen = false;
  document.getElementById('net-update-panel').classList.remove('open');
  // Server has tokens via env vars — proceed directly
  var list = talents.filter(t => t.instagram);
  if (!list.length) { showToast('Nadie tiene Instagram', 'info'); return; }
  showProgressBar('ig', list.length);
  var btn = document.getElementById('scrape-ig-all-btn');
  if (btn) btn.disabled = true;
  var ok = 0, skipped = 0;
  for (var i = 0; i < list.length; i++) {
    updateProgressBar('ig', i + 1, list.length, list[i].nombre);
    var r = await scrapeAndSave(list[i], 'instagram');
    if (r === 'skipped') skipped++; else if (r) ok++;
    renderTalents();
    if (r !== 'skipped' && i < list.length - 1) await new Promise(function(r) { setTimeout(r, 0); });
  }
  hideProgressBar('ig');
  if (btn) btn.disabled = false;
  updateStats();
  var msg = 'Instagram: ' + ok + ' actualizado(s)';
  if (skipped > 0) msg += ', ' + skipped + ' sin cambios';
  if (skipped > 0) msg += ' (ahorraste ' + (skipped * 3) + ' units)';
  showToast(msg, ok > 0 ? 'success' : 'info');
}

// ── UPDATE ALL 3 NETWORKS ────────────────────────────────────
// TT+IG scraping first → persist → then YouTube API → persist
async function updateAll3Networks() {
  netDropdownOpen = false;
  var panel = document.getElementById('net-update-panel');
  if (panel) panel.classList.remove('open');
  // Step 1: TT+IG (saves to Supabase inside scrapeAllProfiles)
  try { await scrapeAllProfiles(); } catch(e) { console.error('[Beme] Scrape error:', e); }
  // Step 2: YouTube (isolated)
  if (ytApiKey) { try { await updateAllFollowers(); } catch(e) { console.error('[Beme] YT error:', e); } }
}

// ── UPDATE SELECTED TALENTS ──────────────────────────────────
async function updateSelectedAll() {
  if (selectedIds.size === 0) { showToast('Selecciona talentos primero', 'error'); return; }
  var selected = talents.filter(t => selectedIds.has(t.id));

  closeBottomBarMenu();
  // Step 1: TT+IG — one profile at a time
  {
    var toScrape = selected.filter(t => t.instagram || t.tiktok);
    if (toScrape.length > 0) {
      showProgressBar('ext', toScrape.length);
      var scrapeOk = 0;
      for (var i = 0; i < toScrape.length; i++) {
        var ts = toScrape[i];
        if (ts.instagram) { if (await scrapeAndSave(ts, 'instagram')) scrapeOk++; }
        if (ts.tiktok) { if (await scrapeAndSave(ts, 'tiktok')) scrapeOk++; }
        renderTalents();
      }
      hideProgressBar('ext');
      showToast('IG/TikTok: ' + scrapeOk + ' OK', scrapeOk > 0 ? 'success' : 'info');
    }
  }

  // Step 2: YouTube — isolated, with timeout per talent
  if (ytApiKey) {
    var ytList = selected.filter(t => t.youtube);
    var ytOk = 0;
    for (var j = 0; j < ytList.length; j++) {
      try {
        var t = ytList[j];
        var ytP = fetchYouTubeSubscribers(t.youtube);
        var toP = new Promise(function(_, rej) { setTimeout(function() { rej(new Error('timeout')); }, 15000); });
        var r = await Promise.race([ytP, toP]);
        if (r && r.subscribers !== undefined) {
          t.seguidores.youtube = r.subscribers;
          t.updated = new Date().toISOString().split('T')[0];
          if (sb && currentUser) await sb.from('talentos').update({seguidores:{...t.seguidores}, updated:t.updated}).eq('id', t.id);
          ytOk++;
        }
      } catch(e) { console.warn('[Beme] YT error:', e.message); }
      await new Promise(function(res) { setTimeout(res, 200); });
    }
    if (ytOk > 0) showToast('YouTube: ' + ytOk + ' OK', 'success');
  }
  updateStats();
  clearSelection();
}

// ── INDIVIDUAL TALENT UPDATE ─────────────────────────────────
async function updateTalentAll(talentId) {
  var t = talents.find(function(x) { return x.id === talentId; });
  if (!t) return;
  var btn = document.getElementById('upd-all-' + talentId);
  if (btn) btn.classList.add('spinning');
  var msgs = [];

  // Step 1: TT+IG — each as separate short message
  if (ensembleToken || apifyToken) {
    if (t.instagram) { if (await scrapeAndSave(t, 'instagram')) msgs.push('IG ✓'); else msgs.push('IG ✗'); }
    if (t.tiktok) { if (await scrapeAndSave(t, 'tiktok')) msgs.push('TT ✓'); else msgs.push('TT ✗'); }
    renderTalents(); updateStats();
  }

  // Step 2: YouTube — isolated with timeout
  if (t.youtube && ytApiKey) {
    try {
      var ytP = fetchYouTubeSubscribers(t.youtube);
      var toP = new Promise(function(_, rej) { setTimeout(function() { rej(new Error('timeout')); }, 15000); });
      var yt = await Promise.race([ytP, toP]);
      if (yt && yt.subscribers !== undefined) {
        t.seguidores.youtube = yt.subscribers;
        t.updated = new Date().toISOString().split('T')[0];
        if (sb && currentUser) await sb.from('talentos').update({seguidores:{...t.seguidores}, updated:t.updated}).eq('id', t.id);
        msgs.push('YT ✓');
      } else { msgs.push('YT ✗'); }
    } catch(e) { msgs.push('YT ✗'); console.warn('[Beme] YT error:', e.message); }
  }

  if (btn) btn.classList.remove('spinning');
  renderTalents(); updateStats();
  showToast(t.nombre + ': ' + (msgs.join(' · ') || 'Sin redes'), msgs.some(function(m){return m.includes('✓');}) ? 'success' : 'info');
}

// ── CARD UPDATE MENU ─────────────────────────────────────────
function toggleCardUpdateMenu(talentId) {
  // Close all other menus first
  document.querySelectorAll('.card-update-menu').forEach(function(m) {
    if (m.id !== 'card-menu-' + talentId) m.style.display = 'none';
  });
  var menu = document.getElementById('card-menu-' + talentId);
  if (menu) menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
}

async function engagementSingle(talentId, platform) {
  var t = talents.find(function(x){ return x.id===talentId; });
  if (!t) return;
  var url = platform === 'instagram' ? t.instagram : t.tiktok;
  if (!url) return;
  // Close menu
  var menu = document.getElementById('card-menu-' + talentId);
  if (menu) menu.style.display = 'none';
  var btn = document.getElementById('upd-all-' + talentId);
  if (btn) btn.classList.add('spinning');
  var ok = await engagementAndSave(t, platform);
  if (btn) btn.classList.remove('spinning');
  if (ok === 'skipped') {
    var savedU = platform==='instagram'?5:2;
    showToast(t.nombre + ': Engagement ' + platform + ' ya actualizado — ahorraste ~' + savedU + ' units', 'info');
  } else if (ok) {
    renderTalents(); updateStats();
    showToast(t.nombre + ': Engagement ' + platform + ' ' + (t.engagement[platform]||0) + '%', 'success');
  } else {
    showToast(t.nombre + ': no se pudo obtener engagement ' + platform, 'error');
  }
}

// Close card menus on outside click
document.addEventListener('click', function(e) {
  if (!e.target.closest('.card-update-wrap')) {
    document.querySelectorAll('.card-update-menu').forEach(function(m) { m.style.display = 'none'; });
  }
  if (!e.target.closest('.bottom-bar-update-group')) {
    closeBottomBarMenu();
  }
});

// ── PROGRESS BAR HELPERS ─────────────────────────────────────
function showProgressBar(type, total) {
  var id = type === 'ig' ? 'ig-progress-bar' : type === 'yt' ? 'yt-progress-bar' : 'ext-scrape-bar';
  var el = document.getElementById(id);
  if (!el) return;
  el.style.display = 'flex';
  // Resetear a 0
  var fillId = type === 'ig' ? 'ig-progress-fill' : type === 'yt' ? 'yt-progress-fill' : 'ext-progress-fill';
  var countId = type === 'ig' ? 'ig-progress-count' : type === 'yt' ? 'yt-progress-count' : 'ext-progress-count';
  var textId  = type === 'ig' ? 'ig-progress-text'  : type === 'yt' ? 'yt-progress-text'  : 'ext-scrape-text';
  var fill  = document.getElementById(fillId);
  var count = document.getElementById(countId);
  var text  = document.getElementById(textId);
  if (fill)  fill.style.width = '0%';
  if (count) count.textContent = '0/' + (total || '?');
  if (text)  text.textContent = type === 'ig' ? 'Actualizando Instagram...' : type === 'yt' ? 'Actualizando YouTube...' : 'Actualizando TikTok...';
}
function updateProgressBar(type, done, total, currentName) {
  var fillId  = type === 'ig' ? 'ig-progress-fill'  : type === 'yt' ? 'yt-progress-fill'  : 'ext-progress-fill';
  var countId = type === 'ig' ? 'ig-progress-count' : type === 'yt' ? 'yt-progress-count' : 'ext-progress-count';
  var textId  = type === 'ig' ? 'ig-progress-text'  : type === 'yt' ? 'yt-progress-text'  : 'ext-scrape-text';
  var fill  = document.getElementById(fillId);
  var count = document.getElementById(countId);
  var text  = document.getElementById(textId);
  if (fill && total)  fill.style.width = Math.round((done / total) * 100) + '%';
  if (count && total) count.textContent = done + '/' + total;
  if (text && currentName) text.textContent = (type === 'ig' ? 'IG: ' : type === 'tt' ? 'TT: ' : '') + currentName;
}
function hideProgressBar(type) {
  var id = type === 'ig' ? 'ig-progress-bar' : type === 'yt' ? 'yt-progress-bar' : 'ext-scrape-bar';
  var el = document.getElementById(id);
  if (el) setTimeout(function() { el.style.display = 'none'; }, 2000);
}

// Stubs
function toggleIgInstructions() {}
function toggleIgTokenVisibility() {}
function updateAllInstagram() {}
async function refreshInstagramSingle(talentId) {
  // Server has tokens via env vars — proceed directly
  var t = talents.find(function(x){ return x.id === talentId; });
  if (!t || !t.instagram) return;
  var btn = document.getElementById('scr-ig-' + talentId);
  if (btn) btn.classList.add('spinning');
  var ok = await scrapeAndSave(t, 'instagram');
  if (btn) btn.classList.remove('spinning');
  if (ok) { renderTalents(); updateStats(); showToast(t.nombre + ': ' + formatFollowers(t.seguidores.instagram) + ' IG ✓','success'); }
  else { showToast(t.nombre + ': error Instagram','error'); }
}

// ===================== FORM PAÍS MULTI-SELECT =====================

function togglePaisDropdown() {
  paisDropdownOpen = !paisDropdownOpen;
  const panel = document.getElementById('pais-panel');
  const trigger = document.getElementById('pais-trigger');
  if(panel) panel.classList.toggle('open', paisDropdownOpen);
  if(trigger) trigger.classList.toggle('open', paisDropdownOpen);
  if(paisDropdownOpen) renderPaisPanel();
}

function renderPaisPanel() {
  const panel = document.getElementById('pais-panel');
  if(!panel) return;
  panel.innerHTML = '';
  COUNTRIES.forEach(c => {
    const sel = formSelectedPaises.includes(c);
    const el = document.createElement('div');
    el.className = 'multi-select-opt' + (sel ? ' selected' : '');
    el.innerHTML = `<div class="ms-checkbox">${sel ? '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg>' : ''}</div>${COUNTRY_FLAGS[c]||''} ${c}`;
    el.addEventListener('click', (e) => { e.stopPropagation(); toggleFormPais(c); });
    panel.appendChild(el);
  });
}

function toggleFormPais(country) {
  const idx = formSelectedPaises.indexOf(country);
  if(idx > -1) formSelectedPaises.splice(idx, 1);
  else formSelectedPaises.push(country);
  renderPaisPanel();
  updatePaisTrigger();
  updatePaisPills();
}

function updatePaisTrigger() {
  const t = document.getElementById('pais-trigger-text');
  if(!t) return;
  if(formSelectedPaises.length === 0) t.textContent = 'Seleccionar país(es)...';
  else t.textContent = formSelectedPaises.map(c => (COUNTRY_FLAGS[c]||'') + ' ' + c).join(' · ');
}

function updatePaisPills() {
  const row = document.getElementById('pais-selected-pills');
  if(!row) return;
  row.innerHTML = '';
  formSelectedPaises.forEach(c => {
    const el = document.createElement('span');
    el.className = 'country-pill';
    el.innerHTML = `${COUNTRY_FLAGS[c]||''} ${c} <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    el.addEventListener('click', () => toggleFormPais(c));
    row.appendChild(el);
  });
}

// ===================== SORT =====================
function toggleSortDropdown() {
  sortDropdownOpen = !sortDropdownOpen;
  const panel = document.getElementById('sort-panel');
  const trigger = document.getElementById('sort-trigger');
  if(panel) panel.classList.toggle('open', sortDropdownOpen);
  if(trigger) trigger.classList.toggle('active', sortDropdownOpen);
}

function setSort(key) {
  currentSort = key;
  sortDropdownOpen = false;
  const panel = document.getElementById('sort-panel');
  const trigger = document.getElementById('sort-trigger');
  if(panel) panel.classList.remove('open');
  if(trigger) trigger.classList.remove('active');
  // Update active option
  document.querySelectorAll('.sort-option').forEach(el => {
    el.classList.toggle('active', el.dataset.sort === key);
  });
  // Update label
  const labels = {
    '': 'Ordenar',
    'az': 'A → Z',
    'za': 'Z → A',
    'tt-desc': 'TikTok ↓',
    'ig-desc': 'Instagram ↓',
    'yt-desc': 'YouTube ↓',
    'total-desc': 'Total ↓',
  };
  const lbl = document.getElementById('sort-label');
  if(lbl) lbl.textContent = labels[key] || 'Ordenar';
  if(trigger) trigger.classList.toggle('active', !!key);
  renderTalents();
}

function applySortToList(list) {
  if(!currentSort) return list;
  const sorted = [...list];
  if(currentSort === 'az') sorted.sort((a,b) => a.nombre.localeCompare(b.nombre, 'es'));
  else if(currentSort === 'za') sorted.sort((a,b) => b.nombre.localeCompare(a.nombre, 'es'));
  else if(currentSort === 'tt-desc') sorted.sort((a,b) => (b.seguidores.tiktok||0) - (a.seguidores.tiktok||0));
  else if(currentSort === 'ig-desc') sorted.sort((a,b) => (b.seguidores.instagram||0) - (a.seguidores.instagram||0));
  else if(currentSort === 'yt-desc') sorted.sort((a,b) => (b.seguidores.youtube||0) - (a.seguidores.youtube||0));
  else if(currentSort === 'total-desc') sorted.sort((a,b) => {
    const ta = (a.seguidores.tiktok||0)+(a.seguidores.instagram||0)+(a.seguidores.youtube||0);
    const tb = (b.seguidores.tiktok||0)+(b.seguidores.instagram||0)+(b.seguidores.youtube||0);
    return tb - ta;
  });
  return sorted;
}

// ===================== SELECT ALL =====================

function toggleSelectAll() {
  const filtered = getFilteredTalents();
  if(filtered.length === 0) return;
  // If all visible are selected → deselect all. Otherwise → select all visible.
  const allSelected = filtered.every(t => selectedIds.has(t.id));
  if(allSelected) {
    filtered.forEach(t => selectedIds.delete(t.id));
    allVisibleSelected = false;
  } else {
    filtered.forEach(t => selectedIds.add(t.id));
    allVisibleSelected = true;
  }
  updateSelectAllBtn(filtered);
  updateBottomBar();
  renderTalents();
}

function updateSelectAllBtn(filtered) {
  const btn = document.getElementById('select-all-btn');
  const lbl = document.getElementById('select-all-label');
  if(!btn || !filtered) return;
  const f = filtered || getFilteredTalents();
  const allSelected = f.length > 0 && f.every(t => selectedIds.has(t.id));
  if(lbl) lbl.textContent = allSelected ? 'Deseleccionar' : 'Seleccionar todo';
  btn.style.borderColor = allSelected ? 'var(--primary)' : '';
  btn.style.color = allSelected ? 'var(--primary)' : '';
  // Update checkbox icon
  const icon = btn.querySelector('svg');
  if(icon) {
    if(allSelected) {
      icon.innerHTML = '<rect x="3" y="3" width="18" height="18" rx="3" fill="var(--primary)" stroke="var(--primary)"/><polyline points="7 12 10 15 17 9" stroke="#fff" stroke-width="2.5" fill="none"/>';
    } else {
      icon.innerHTML = '<rect x="3" y="3" width="18" height="18" rx="3"/>';
    }
  }
}

// ===================== DUPLICATE ROSTER =====================
async function duplicateRoster(id) {
  const source = rosters.find(r => r.id === id);
  if(!source) return;
  const copyName = source.name + ' (copia)';
  const newId = nextRosterId++;
  const newToken = generateToken();
  const newCreated = new Date().toISOString().split('T')[0];
  const newRoster = {
    id: newId,
    name: copyName,
    description: source.description || '',
    talentIds: [...source.talentIds],
    talent_ids: [...source.talentIds],
    platforms: source.platforms ? {...source.platforms} : {tt:true,ig:true,yt:true},
    public_token: newToken,
    created: newCreated
  };
  rosters.push(newRoster);
  updateStats();
  renderRosters();
  if(sb && currentUser) {
    const {error} = await sb.from('rosters').insert({
      id: newId, name: copyName, description: newRoster.description,
      platforms: newRoster.platforms, talent_ids: newRoster.talentIds,
      public_token: newToken, created: newCreated
    });
    if(error) showToast('Error al duplicar: ' + error.message, 'error');
    else showToast(`Roster duplicado: "${copyName}"`, 'success');
    sb.from('app_config').upsert({key:'next_roster_id', value: nextRosterId}).catch(e => console.warn('next_roster_id:', e));
  } else {
    showToast(`Roster duplicado: "${copyName}"`, 'success');
  }
}

// ===================== ROSTER VIEW MODE =====================
function setRosterViewTable() {
  rosterViewMode = 'table';
  document.getElementById('roster-view-table')?.classList.add('active');
  document.getElementById('roster-view-cards')?.classList.remove('active');
  refreshRosterView();
}

function setRosterViewCards() {
  rosterViewMode = 'cards';
  document.getElementById('roster-view-cards')?.classList.add('active');
  document.getElementById('roster-view-table')?.classList.remove('active');
  refreshRosterView();
}

function refreshRosterView() {
  if(!editingRosterId) return;
  const roster = rosters.find(r => r.id === editingRosterId);
  if(!roster) return;
  const rosterTalents = roster.talentIds.map(tid => talents.find(t => t.id === tid)).filter(Boolean);
  const today = new Date().toLocaleDateString('es-ES', {day:'2-digit', month:'long', year:'numeric'});
  const contentEl = document.getElementById('roster-view-content');
  if(contentEl) {
    contentEl.innerHTML = rosterViewMode === 'cards'
      ? generateRosterCardsHTML(roster, rosterTalents, today)
      : generateRosterPageHTML(roster, rosterTalents, today);
  }
}

// ===================== UNDO SYSTEM (Stack-based, para uso futuro) =====================
// El undo activo usa _lastUndo + executeUndo (ver más abajo).
// undoLastAction está en FN_MAP pero no se conecta al botón actual — reservado.


// ===================== VIEW CLIENT RESPONSES =====================
async function viewRosterResponses(rosterId) {
  const roster = rosters.find(r => r.id === rosterId);
  if(!roster) return;
  showToast('Cargando respuestas...', 'info');
  try {
    const { data: sels } = await sb.from('roster_selecciones').select('*').eq('roster_id', rosterId).eq('selected', true);
    if(!sels || sels.length === 0) { showToast('El cliente aún no ha seleccionado talentos', 'info'); return; }
    const selected = sels.map(s => {
      const t = talents.find(x => x.id === s.talent_id);
      return { ...s, nombre: t ? t.nombre : 'Talento #' + s.talent_id };
    });
    const total = selected.reduce((sum, s) => sum + (parseFloat(s.contraoferta) || parseFloat(s.precio) || 0), 0);
    let rows = '';
    selected.forEach((s, i) => {
      const bg = i % 2 === 0 ? '#fff' : '#faf9fc';
      const p = parseFloat(s.precio) || 0;
      const co = s.contraoferta || '';
      rows += '<tr style="background:' + bg + '">' +
        '<td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;font-weight:600;">' + s.nombre + '</td>' +
        '<td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;color:#666;">' + (s.accion || '—') + '</td>' +
        '<td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;text-align:right;">' + (p ? '$ ' + p.toLocaleString('es-ES') : '—') + '</td>' +
        '<td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;text-align:right;color:#333;">' + (co || '—') + '</td>' +
        '</tr>';
    });
    const totalRow = total > 0 ? '<tr style="background:#f5f0f8"><td colspan="3" style="padding:10px;font-weight:700;">Total</td><td style="padding:10px;text-align:right;font-weight:800;font-size:15px;color:#b2005d;">$ ' + total.toLocaleString('es-ES') + '</td></tr>' : '';
    const updated = sels.reduce((max, s) => (s.updated_at > max ? s.updated_at : max), '');
    const url = getRosterPublicUrl(roster);
    const w = window.open('', '_blank', 'width=720,height=520');
    if(!w) { showToast('Permite los pop-ups para ver las respuestas', 'error'); return; }
    w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Respuestas — ' + roster.name + '</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">' +
      '<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:"Plus Jakarta Sans",sans-serif;background:#f4f2f8;padding:32px;}' +
      '.card{background:#fff;border-radius:16px;padding:28px;box-shadow:0 4px 20px rgba(0,0,0,0.08);}' +
      'h2{font-size:20px;font-weight:800;margin-bottom:4px;}.sub{font-size:13px;color:#888;margin-bottom:20px;}' +
      'table{width:100%;border-collapse:collapse;}th{background:#f5f0f8;padding:8px 10px;text-align:left;font-size:12px;font-weight:700;}</style>' +
      '</head><body><div class="card"><h2>Respuestas — ' + roster.name + '</h2>' +
      '<div class="sub">URL: ' + url + (updated ? ' · Última actualización: ' + new Date(updated).toLocaleString('es-ES') : '') + '</div>' +
      '<table><thead><tr><th>Talento</th><th>Acción</th><th style="text-align:right">Precio</th><th style="text-align:right">Comentarios</th></tr></thead>' +
      '<tbody>' + rows + totalRow + '</tbody></table></div></body></html>');
    w.document.close();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// ===================== THEME =====================
let isDark = false;
function toggleTheme() {
  isDark = !isDark;
  document.body.classList.toggle('light', !isDark);
  document.getElementById('theme-icon-dark').style.display = isDark ? 'block' : 'none';
  document.getElementById('theme-icon-light').style.display = isDark ? 'none' : 'block';
  try { localStorage.setItem('beme_theme', isDark ? 'dark' : 'light'); } catch(e) {}
  updateApiKeyUI();
}
function loadTheme() {
  try {
    const t = localStorage.getItem('beme_theme');
    if(t === 'dark') {
      isDark = true;
      document.body.classList.remove('light');
      document.getElementById('theme-icon-dark').style.display = 'none';
      document.getElementById('theme-icon-light').style.display = 'block';
    } else {
      // Default: light
      isDark = false;
      document.body.classList.add('light');
      document.getElementById('theme-icon-dark').style.display = 'block';
      document.getElementById('theme-icon-light').style.display = 'none';
    }
  } catch(e) {
    isDark = false;
    document.body.classList.add('light');
  }
}

// ===================== COUNTRY MANAGEMENT =====================
function openManageCountriesModal() {
  renderCountryMgrList();
  document.getElementById('new-country-name').value = '';
  document.getElementById('new-country-flag').value = '';
  openModal('manage-countries-modal');
}

function renderCountryMgrList() {
  const list = document.getElementById('country-mgr-list');
  if(!list) return;
  list.innerHTML = '';

  // Bulk action bar
  const bar = document.createElement('div');
  bar.id = 'cty-bulk-bar';
  bar.style.cssText = 'display:none;align-items:center;gap:10px;margin-bottom:10px;padding:8px 12px;background:var(--surface-hover);border-radius:8px;';
  bar.innerHTML = '<span id="cty-bulk-count" style="font-size:13px;font-weight:600;flex:1;color:var(--text)"></span>' +
    '<button id="cty-bulk-del-btn" style="background:#cc0000;color:#fff;border:none;border-radius:8px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">Eliminar seleccionados</button>';
  list.appendChild(bar);

  const selSet = new Set();
  window._ctySelSet = selSet;

  function refreshBar() {
    bar.style.display = selSet.size > 0 ? 'flex' : 'none';
    document.getElementById('cty-bulk-count').textContent = selSet.size + ' país' + (selSet.size !== 1 ? 'es' : '') + ' seleccionado' + (selSet.size !== 1 ? 's' : '');
  }

  document.getElementById('cty-bulk-del-btn').onclick = function() {
    const names = [...selSet];
    const usable = names.filter(c => !talents.some(t => (t.paises || []).includes(c)));
    const blocked = names.length - usable.length;
    if(usable.length === 0) { showToast('Todos están en uso', 'error'); return; }
    const msg = blocked > 0
      ? 'Eliminar ' + usable.length + ' país(es)? (' + blocked + ' están en uso y se omitirán)'
      : 'Eliminar ' + usable.length + ' país(es)?';
    if(!confirm(msg)) return;
    usable.forEach(c => {
      const idx = COUNTRIES.indexOf(c);
      if(idx > -1) COUNTRIES.splice(idx, 1);
      delete COUNTRY_FLAGS[c];
      selectedCountries.delete(c);
    });
    if(sb && currentUser) {
      const payload = COUNTRIES.map(c => ({ name: c, flag: COUNTRY_FLAGS[c] || '' }));
      sb.from('app_config').upsert({key:'countries', value:payload})
        .then(({error}) => { if(error) console.error('bulkDelete countries error:', error); });
    }
    populateCountrySelects(); populateCountryDropdown();
    updateCountryTrigger(); updateCountryPills();
    renderCountryMgrList(); renderTalents();
    showToast(usable.length + ' país(es) eliminado(s)', 'success');
  };

  COUNTRIES.slice().sort().forEach(function(c) {
    var inUse = talents.some(function(t) { return (t.paises || []).includes(c) || t.pais === c; });
    var el = document.createElement('div');
    el.className = 'country-mgr-item';
    el.style.cssText = 'display:flex;align-items:center;gap:10px;';
    var chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.style.cssText = 'width:16px;height:16px;accent-color:#b2005d;cursor:pointer;flex-shrink:0;';
    if(inUse) { chk.disabled = true; chk.title = 'En uso'; chk.style.opacity = '0.3'; }
    chk.addEventListener('change', function() {
      if(chk.checked) selSet.add(c); else selSet.delete(c);
      refreshBar();
    });
    var nameSpan = document.createElement('span');
    nameSpan.style.cssText = 'flex:1;font-size:13px;';
    nameSpan.textContent = (COUNTRY_FLAGS[c] || '') + ' ' + c;
    if(inUse) {
      var tag = document.createElement('span');
      tag.style.cssText = 'font-size:10px;color:#999;margin-left:5px;';
      tag.textContent = 'en uso';
      nameSpan.appendChild(tag);
    }
    var delBtn = document.createElement('button');
    delBtn.className = 'country-mgr-del';
    delBtn.title = 'Eliminar';
    delBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>';
    if(inUse) { delBtn.disabled = true; delBtn.style.cssText = 'opacity:0.3;cursor:not-allowed'; }
    else { delBtn.onclick = function() { removeCountry(c); }; }
    el.appendChild(chk); el.appendChild(nameSpan); el.appendChild(delBtn);
    list.appendChild(el);
  });
}

async function addCountry() {
  const name = document.getElementById('new-country-name').value.trim();
  if(!name) { showToast('Escribe el nombre del país', 'error'); return; }
  if(COUNTRIES.includes(name)) { showToast('Ese país ya existe', 'info'); return; }
  const flag = document.getElementById('new-country-flag').value.trim() || '';
  COUNTRIES.push(name);
  if(flag) COUNTRY_FLAGS[name] = flag;
  COUNTRIES.sort();
  document.getElementById('new-country-name').value = '';
  document.getElementById('new-country-flag').value = '';
  populateCountrySelects();
  populateCountryDropdown();
  renderCountryMgrList();
  if(sb && currentUser) {
    // Save countries as [{name, flag}] objects to preserve flags
    const payload = COUNTRIES.map(c => ({ name: c, flag: COUNTRY_FLAGS[c] || '' }));
    const { error } = await sb.from('app_config').upsert({ key: 'countries', value: payload });
    if(error) {
      console.error('addCountry save error:', error);
      showToast('Error al guardar: ' + error.message, 'error');
      return;
    }
  }
  showToast('País "' + name + '" agregado', 'success');
}

async function removeCountry(name) {
  // Check both old field (pais) and new field (paises array)
  const inUse = talents.some(t => (t.paises && t.paises.includes(name)) || t.pais === name);
  if(inUse) { showToast('No se puede eliminar: hay talentos con este país', 'error'); return; }
  if(!confirm('¿Eliminar "' + name + '" de la lista de países?')) return;
  const idx = COUNTRIES.indexOf(name);
  if(idx > -1) COUNTRIES.splice(idx, 1);
  delete COUNTRY_FLAGS[name];
  selectedCountries.delete(name);
  populateCountrySelects();
  populateCountryDropdown();
  updateCountryTrigger();
  updateCountryPills();
  renderCountryMgrList();
  renderTalents();
  if(sb && currentUser) {
    const payload = COUNTRIES.map(c => ({ name: c, flag: COUNTRY_FLAGS[c] || '' }));
    const {error} = await sb.from('app_config').upsert({key:'countries', value:payload});
    if(error) {
      console.error('removeCountry save error:', error);
      showToast('Error al guardar: ' + error.message, 'error');
    } else {
      showToast('País "' + name + '" eliminado', 'info');
    }
  } else {
    showToast('País "' + name + '" eliminado', 'info');
  }
}

// ===================== TOAST =====================
function showToast(msg, type='info') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = {success:'✓', info:'●', error:'✕'};
  t.innerHTML = `<span style="font-weight:700">${icons[type]||'●'}</span> ${msg}`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ── UNDO SYSTEM ──────────────────────────────────────────────
let _lastUndo = null;

function showUndoToast(msg) {
  // Show floating undo bar at bottom
  var bar = document.getElementById('undo-bar');
  var text = document.getElementById('undo-bar-text');
  if (bar) { bar.classList.add('visible'); }
  if (text) { text.textContent = msg; }

  // Auto-hide after 30 seconds
  clearTimeout(window._undoTimer);
  window._undoTimer = setTimeout(function() {
    _lastUndo = null;
    if (bar) bar.classList.remove('visible');
  }, 30000);
}

function dismissUndo() {
  _lastUndo = null;
  clearTimeout(window._undoTimer);
  var bar = document.getElementById('undo-bar');
  if (bar) bar.classList.remove('visible');
}

async function executeUndo() {
  if (!_lastUndo) { showToast('No hay acción para deshacer', 'info'); return; }
  const action = _lastUndo;
  _lastUndo = null;

  // Hide undo bar immediately
  var undoBar = document.getElementById('undo-bar');
  if (undoBar) undoBar.classList.remove('visible');
  clearTimeout(window._undoTimer);

  try {
    if (action.type === 'delete-talent') {
      // Restore talent locally
      talents.push(action.talent);
      // Restore in rosters
      if (action.rosterLinks) {
        action.rosterLinks.forEach(function(link) {
          var r = rosters.find(x => x.id === link.rosterId);
          if (r && !r.talentIds.includes(link.talentId)) r.talentIds.push(link.talentId);
        });
      }
      // Re-insert in Supabase
      if (sb && currentUser) {
        var t = action.talent;
        await sb.from('talentos').upsert([{
          id:t.id, nombre:t.nombre||'', paises:t.paises||[], ciudad:t.ciudad||'',
          telefono:t.telefono||'', email:t.email||'', tiktok:t.tiktok||'',
          instagram:t.instagram||'', youtube:t.youtube||'', valores:t.valores||'',
          categorias:t.categorias||[], foto:t.foto||'',
          seguidores:t.seguidores||{tiktok:0,instagram:0,youtube:0}, updated:t.updated||null
        }], {onConflict:'id'});
        // Restore roster links
        if (action.rosterLinks) {
          for (var rl of action.rosterLinks) {
            var roster = rosters.find(x => x.id === rl.rosterId);
            if (roster) {
              await sb.from('rosters').update({talent_ids: roster.talentIds}).eq('id', rl.rosterId);
            }
          }
        }
      }
      showToast('Talento restaurado ✓', 'success');
    }

    else if (action.type === 'delete-talents') {
      // Restore all talents
      action.talents.forEach(function(t) { talents.push(t); });
      if (action.rosterLinks) {
        action.rosterLinks.forEach(function(link) {
          var r = rosters.find(x => x.id === link.rosterId);
          if (r && !r.talentIds.includes(link.talentId)) r.talentIds.push(link.talentId);
        });
      }
      if (sb && currentUser) {
        var rows = action.talents.map(function(t) {
          return { id:t.id, nombre:t.nombre||'', paises:t.paises||[], ciudad:t.ciudad||'',
            telefono:t.telefono||'', email:t.email||'', tiktok:t.tiktok||'',
            instagram:t.instagram||'', youtube:t.youtube||'', valores:t.valores||'',
            categorias:t.categorias||[], foto:t.foto||'',
            seguidores:t.seguidores||{tiktok:0,instagram:0,youtube:0}, updated:t.updated||null };
        });
        await sb.from('talentos').upsert(rows, {onConflict:'id'});
      }
      showToast(action.talents.length + ' talento(s) restaurados ✓', 'success');
    }

    else if (action.type === 'delete-roster') {
      rosters.push(action.roster);
      if (sb && currentUser) {
        var r = action.roster;
        await sb.from('rosters').upsert([{
          id:r.id, name:r.name||'', description:r.description||'',
          platforms:r.platforms||{tt:true,ig:true,yt:true},
          talent_ids:r.talentIds||r.talent_ids||[],
          public_token:r.public_token||'', created:r.created||''
        }], {onConflict:'id'});
      }
      showToast('Roster restaurado ✓', 'success');
    }

    else if (action.type === 'edit-talent') {
      var idx = talents.findIndex(function(x) { return x.id === action.talent.id; });
      if (idx > -1) talents[idx] = action.talent;
      if (sb && currentUser) {
        var t = action.talent;
        await sb.from('talentos').upsert([{
          id:t.id, nombre:t.nombre||'', paises:t.paises||[], ciudad:t.ciudad||'',
          telefono:t.telefono||'', email:t.email||'', tiktok:t.tiktok||'',
          instagram:t.instagram||'', youtube:t.youtube||'', valores:t.valores||'',
          categorias:t.categorias||[], foto:t.foto||'',
          seguidores:t.seguidores||{tiktok:0,instagram:0,youtube:0}, updated:t.updated||null
        }], {onConflict:'id'});
      }
      showToast('Cambios revertidos ✓', 'success');
    }

  } catch(e) {
    console.error('[Beme] Undo error:', e);
    showToast('Error al deshacer: ' + e.message, 'error');
  }

  renderTalents(); renderRosters(); updateStats(); updatePlatformCounts();
}

// ===================== AI ROSTER AGENT =====================
let _aiRosterResults = [];
let _aiSelectedIds = new Set();

function openAIRosterModal() {
  document.getElementById('ai-roster-form').style.display = 'block';
  document.getElementById('ai-roster-loading').style.display = 'none';
  document.getElementById('ai-roster-results').style.display = 'none';
  // Clear form
  ['air-marca','air-producto','air-categorias','air-paises','air-notas'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
  document.getElementById('air-genero').value = '';
  document.getElementById('air-seg-min').value = '';
  document.getElementById('air-seg-max').value = '';
  document.getElementById('air-cantidad').value = '';
  ['air-tt','air-ig'].forEach(id => { const el=document.getElementById(id); if(el) el.checked=true; });
  const yt = document.getElementById('air-yt'); if(yt) yt.checked = false;
  openModal('ai-roster-modal');
}

function closeAIRosterModal() {
  closeModal('ai-roster-modal');
}

async function generateAIRoster() {
  const marca = document.getElementById('air-marca').value.trim();
  if (!marca) { showToast('La marca es obligatoria', 'error'); return; }

  const parseCsv = v => (v||'').split(',').map(s=>s.trim()).filter(Boolean);
  const campaign = {
    marca,
    producto: document.getElementById('air-producto').value.trim(),
    categorias: parseCsv(document.getElementById('air-categorias').value),
    generos: document.getElementById('air-genero').value ? [document.getElementById('air-genero').value] : [],
    paises: parseCsv(document.getElementById('air-paises').value),
    plataformas: [
      document.getElementById('air-tt')?.checked ? 'TikTok' : '',
      document.getElementById('air-ig')?.checked ? 'Instagram' : '',
      document.getElementById('air-yt')?.checked ? 'YouTube' : '',
    ].filter(Boolean),
    seguidores_min: parseInt(document.getElementById('air-seg-min').value) || 0,
    seguidores_max: parseInt(document.getElementById('air-seg-max').value) || 0,
    cantidad: parseInt(document.getElementById('air-cantidad').value) || 10,
    notas: document.getElementById('air-notas').value.trim(),
  };

  // Pre-filter: only hard filters (platform + min followers). Let Claude handle the rest.
  let filtered = talents.filter(t => {
    // Must have at least one social network
    if (!t.tiktok && !t.instagram && !t.youtube) return false;
    // Follower minimum (only if specified)
    if (campaign.seguidores_min) {
      const totalSeg = (t.seguidores?.tiktok||0) + (t.seguidores?.instagram||0) + (t.seguidores?.youtube||0);
      if (totalSeg < campaign.seguidores_min) return false;
    }
    return true;
  });

  // If too many talents, apply soft filters to reduce to ~300 max for token efficiency
  if (filtered.length > 300) {
    // Apply gender filter if specified
    if (campaign.generos.length) {
      const gFiltered = filtered.filter(t => campaign.generos.includes(t.genero));
      if (gFiltered.length >= 20) filtered = gFiltered;
    }
    // Apply country filter if specified
    if (campaign.paises.length && filtered.length > 300) {
      const norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      const cFiltered = filtered.filter(t => (t.paises||[]).some(p => campaign.paises.some(cp => norm(p).includes(norm(cp)))));
      if (cFiltered.length >= 20) filtered = cFiltered;
    }
  }

  if (filtered.length === 0) {
    showToast('No hay talentos con redes sociales cargadas', 'error');
    return;
  }

  // Prepare talent data for AI (compact)
  const talentData = filtered.map(t => ({
    id: t.id, nombre: t.nombre, paises: t.paises || [], genero: t.genero || '',
    categorias: t.categorias || [], keywords: t.keywords || '', valores: t.valores || '',
    tipo_contenido: t.tipo_contenido || '', calidad: t.calidad || '',
    marcas_previas: t.marcas_previas || '', tiene_manager: t.tiene_manager || false,
    seguidores: t.seguidores || {},
    historial: talentCampaigns.filter(tc => tc.talent_id === t.id).map(tc => ({ marca: tc.marca, acciones: tc.acciones })),
  }));

  // Show loading
  document.getElementById('ai-roster-form').style.display = 'none';
  document.getElementById('ai-roster-loading').style.display = 'block';
  document.getElementById('ai-roster-results').style.display = 'none';
  document.getElementById('air-loading-msg').textContent = `Analizando ${filtered.length} talentos...`;
  document.getElementById('air-loading-sub').textContent = `Buscando los mejores para ${marca}`;

  try {
    const resp = await fetch('/.netlify/functions/roster-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign, talents: talentData }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Error del servidor');

    _aiRosterResults = data.roster || [];
    renderAIRosterResults(data.summary, _aiRosterResults, campaign);

  } catch(e) {
    console.error('AI Roster error:', e);
    document.getElementById('ai-roster-loading').style.display = 'none';
    document.getElementById('ai-roster-form').style.display = 'block';
    showToast('Error del agente: ' + e.message, 'error');
  }
}

function renderAIRosterResults(summary, roster, campaign) {
  document.getElementById('ai-roster-loading').style.display = 'none';
  document.getElementById('ai-roster-results').style.display = 'block';
  const resultsDiv = document.getElementById('ai-roster-results');

  if (!roster.length) {
    resultsDiv.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text-muted)">
      <p>El agente no encontro talentos que coincidan. Intenta con otros criterios.</p>
      <button class="btn btn-outline" style="margin-top:12px" data-fn="showAIForm">Volver al formulario</button>
    </div>`;
    return;
  }

  // Select all by default
  _aiSelectedIds = new Set(roster.map(r => r.id));
  renderAICards(summary, roster);
}

function renderAICards(summary, roster) {
  const resultsDiv = document.getElementById('ai-roster-results');
  const selectedCount = _aiSelectedIds.size;

  const cards = (roster || _aiRosterResults).map((r) => {
    const t = talents.find(x => x.id === r.id);
    if (!t) return '';
    const safeFoto = t.foto && (t.foto.startsWith('data:') || t.foto.startsWith('https://')) ? t.foto : '';
    const segs = t.seguidores || {};
    const hist = talentCampaigns.filter(tc => tc.talent_id === t.id);
    const marcasHist = hist.map(h => h.marca).filter(Boolean).join(', ');
    const scoreColor = r.score >= 80 ? 'var(--green)' : r.score >= 60 ? 'var(--orange)' : 'var(--text-muted)';
    const isSelected = _aiSelectedIds.has(r.id);
    const dimStyle = !isSelected ? 'opacity:0.4;' : '';

    return `<div style="display:flex;gap:10px;padding:10px 12px;border:1px solid ${isSelected?'var(--border2)':'var(--border)'};border-radius:var(--radius-sm);margin-bottom:6px;align-items:flex-start;background:var(--surface);${dimStyle}transition:opacity 0.15s">
      <input type="checkbox" ${isSelected?'checked':''} onchange="toggleAISelect(${r.id})" onclick="event.stopPropagation()" style="accent-color:var(--primary);margin-top:4px;cursor:pointer;flex-shrink:0">
      <div style="font-family:'Syne',sans-serif;font-size:16px;font-weight:800;color:${scoreColor};min-width:28px;text-align:center">${r.score}</div>
      <div style="width:32px;height:32px;border-radius:50%;background:var(--surface2);border:1.5px solid var(--border2);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:var(--primary);overflow:hidden;flex-shrink:0;cursor:pointer" onclick="event.stopPropagation();openEditModal(${r.id})">
        ${safeFoto ? `<img src="${safeFoto}" style="width:100%;height:100%;object-fit:cover">` : getInitials(t.nombre)}
      </div>
      <div style="flex:1;min-width:0;cursor:pointer" onclick="event.stopPropagation();openEditModal(${r.id})">
        <div style="font-size:13px;font-weight:700">${escapeHtml(t.nombre)}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${escapeHtml(r.reason)}</div>
        <div style="display:flex;gap:8px;margin-top:4px;font-size:10px;color:var(--text-dim);flex-wrap:wrap">
          ${segs.tiktok ? `<span>TT: ${formatFollowers(segs.tiktok)}</span>` : ''}
          ${segs.instagram ? `<span>IG: ${formatFollowers(segs.instagram)}</span>` : ''}
          ${segs.youtube ? `<span>YT: ${formatFollowers(segs.youtube)}</span>` : ''}
          ${marcasHist ? `<span style="color:var(--primary)">Marcas: ${escapeHtml(marcasHist)}</span>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');

  resultsDiv.innerHTML = `
    <div style="background:linear-gradient(135deg,rgba(106,13,158,0.06),rgba(148,20,224,0.06));border:1px solid rgba(148,20,224,0.15);border-radius:var(--radius-sm);padding:12px 14px;margin-bottom:12px">
      <div style="font-size:13px;color:var(--text)">${escapeHtml(summary || '')}</div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:12px">
      <span style="color:var(--text-muted)">${_aiRosterResults.length} talentos rankeados</span>
      <span style="color:var(--text-dim)">·</span>
      <span style="font-weight:700;color:var(--primary)">${selectedCount} seleccionados</span>
      <button class="btn btn-ghost" style="font-size:11px;padding:3px 8px;margin-left:auto" onclick="toggleAllAISelect(true)">Todos</button>
      <button class="btn btn-ghost" style="font-size:11px;padding:3px 8px" onclick="toggleAllAISelect(false)">Ninguno</button>
    </div>
    <div style="max-height:400px;overflow-y:auto">${cards}</div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;align-items:center">
      <span style="font-size:11px;color:var(--text-dim)">Click en nombre o foto para ver perfil</span>
      <button class="btn btn-ghost" data-fn="showAIForm">Ajustar y regenerar</button>
      <button class="btn btn-primary" data-fn="createRosterFromAI" ${selectedCount===0?'disabled':''}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
        Crear Roster (${selectedCount})
      </button>
    </div>
  `;
}

function toggleAISelect(id) {
  if (_aiSelectedIds.has(id)) _aiSelectedIds.delete(id);
  else _aiSelectedIds.add(id);
  renderAICards(null, _aiRosterResults);
}

function toggleAllAISelect(selectAll) {
  if (selectAll) _aiSelectedIds = new Set(_aiRosterResults.map(r => r.id));
  else _aiSelectedIds.clear();
  renderAICards(null, _aiRosterResults);
}

function showAIForm() {
  document.getElementById('ai-roster-form').style.display = 'block';
  document.getElementById('ai-roster-results').style.display = 'none';
  document.getElementById('ai-roster-loading').style.display = 'none';
}

async function createRosterFromAI() {
  if (!_aiSelectedIds.size) { showToast('Selecciona al menos un talento', 'error'); return; }
  const marca = document.getElementById('air-marca').value.trim();
  // IDs in relevance order (same order as AI ranking)
  const ids = _aiRosterResults.filter(r => _aiSelectedIds.has(r.id)).map(r => r.id);

  // Build AI descriptions from results
  const aiDescs = {};
  _aiRosterResults.filter(r => _aiSelectedIds.has(r.id)).forEach(r => {
    aiDescs[r.id] = { score: r.score, reason: r.reason };
  });
  const campaignContext = `${marca} - ${document.getElementById('air-producto').value.trim()} | ${document.getElementById('air-categorias').value.trim()} | ${document.getElementById('air-notas').value.trim()}`;

  // Create roster
  const name = `AI: ${marca} (${ids.length})`;
  const newRoster = {
    id: nextRosterId++,
    name,
    description: `Generado por AI Roster Agent para ${marca}`,
    talentIds: ids,
    platforms: {tt:true, ig:true, yt:true},
    public_token: generateToken(),
    created: new Date().toISOString(),
    ai_descriptions: aiDescs,
    ai_campaign_context: campaignContext,
    show_ai_descriptions: true,
  };
  rosters.push(newRoster);

  if (sb && currentUser) {
    try {
      const {error} = await sb.from('rosters').insert({
        id: newRoster.id,
        name: newRoster.name,
        description: newRoster.description,
        talent_ids: ids,
        platforms: newRoster.platforms,
        public_token: newRoster.public_token,
        ai_descriptions: aiDescs,
        ai_campaign_context: campaignContext,
        show_ai_descriptions: true,
      });
      if (error) console.error('Roster insert error:', error);
      await sb.from('app_config').upsert({key:'next_roster_id', value: nextRosterId});
    } catch(e) { console.error('Save roster error:', e); }
  }

  closeModal('ai-roster-modal');
  renderRosters();
  updateStats();
  showToast(`Roster "${name}" creado con ${ids.length} talentos`, 'success');
}

// ===================== AI DESCRIPTIONS FOR ROSTERS =====================
async function toggleAIDescs(rosterId, show) {
  const roster = rosters.find(r => r.id === rosterId);
  if (!roster) return;
  roster.show_ai_descriptions = show;
  if (sb && currentUser) {
    await sb.from('rosters').update({ show_ai_descriptions: show }).eq('id', rosterId);
  }
  viewRoster(rosterId);
}

let _aiDescsRosterId = null;

function openAIDescsModal(rosterId) {
  _aiDescsRosterId = rosterId;
  const roster = rosters.find(r => r.id === rosterId);
  if (!roster) return;
  // Pre-fill from existing context if available
  document.getElementById('aid-marca').value = roster.ai_campaign_context ? roster.ai_campaign_context.split(' - ')[0] || '' : '';
  document.getElementById('aid-producto').value = '';
  document.getElementById('aid-categorias').value = '';
  document.getElementById('aid-notas').value = '';
  openModal('ai-descs-modal');
}

function closeAIDescsModal() {
  closeModal('ai-descs-modal');
}

async function confirmAIDescs() {
  const rosterId = _aiDescsRosterId;
  const roster = rosters.find(r => r.id === rosterId);
  if (!roster) return;

  const marca = document.getElementById('aid-marca').value.trim();
  if (!marca) { showToast('La marca es obligatoria', 'error'); return; }
  const producto = document.getElementById('aid-producto').value.trim();
  const categorias = document.getElementById('aid-categorias').value.trim();
  const notas = document.getElementById('aid-notas').value.trim();

  const rosterTalents = roster.talentIds.map(tid => talents.find(t => t.id === tid)).filter(Boolean);
  if (!rosterTalents.length) { showToast('El roster no tiene talentos', 'error'); return; }

  const btn = document.getElementById('aid-btn-generate');
  btn.textContent = 'Generando...'; btn.disabled = true;

  const talentData = rosterTalents.map(t => ({
    id: t.id, nombre: t.nombre, paises: t.paises || [], genero: t.genero || '',
    categorias: t.categorias || [], keywords: t.keywords || '', valores: t.valores || '',
    tipo_contenido: t.tipo_contenido || '', calidad: t.calidad || '',
    marcas_previas: t.marcas_previas || '', tiene_manager: t.tiene_manager || false,
    seguidores: t.seguidores || {},
    historial: talentCampaigns.filter(tc => tc.talent_id === t.id).map(tc => ({ marca: tc.marca, acciones: tc.acciones })),
  }));

  const campaign = {
    marca, producto, categorias: categorias.split(',').map(s=>s.trim()).filter(Boolean),
    generos: [], paises: [], plataformas: [],
    notas: notas || `Campana para ${marca}${producto ? ' - ' + producto : ''}`,
    cantidad: rosterTalents.length,
  };
  const context = `${marca}${producto ? ' - ' + producto : ''}${categorias ? ' | ' + categorias : ''}`;

  try {
    const resp = await fetch('/.netlify/functions/roster-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign, talents: talentData }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Error del servidor');

    const aiDescs = {};
    (data.roster || []).forEach(r => { aiDescs[r.id] = { score: r.score, reason: r.reason }; });

    roster.ai_descriptions = aiDescs;
    roster.ai_campaign_context = context;
    roster.show_ai_descriptions = true;

    if (sb && currentUser) {
      await sb.from('rosters').update({ ai_descriptions: aiDescs, ai_campaign_context: context, show_ai_descriptions: true }).eq('id', rosterId);
    }

    closeModal('ai-descs-modal');
    viewRoster(rosterId);
    showToast('Descripciones AI generadas', 'success');
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
  btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2.4 7.4H22l-6.2 4.5L18.2 22 12 17.5 5.8 22l2.4-8.1L2 9.4h7.6z"/></svg> Generar';
  btn.disabled = false;
}
