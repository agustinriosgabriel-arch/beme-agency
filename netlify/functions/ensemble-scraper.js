// Netlify Function: EnsembleData API proxy (primary) + Apify fallback
// POST /.netlify/functions/ensemble-scraper
// Body: { platform, username, action, ensembleToken, apifyToken? }
// action: "followers" (default) | "engagement"

const ENSEMBLE_BASE = 'https://ensembledata.com/apis';

const APIFY_ACTORS = {
  tiktok:    'clockworks~tiktok-scraper',
  instagram: 'apify~instagram-followers-count-scraper',
};

// ─── EnsembleData: user info ────────────────────────────────
async function ensembleUserInfo(platform, username, token) {
  const endpoint = platform === 'tiktok'
    ? `/tt/user/info?username=${encodeURIComponent(username)}&token=${token}`
    : `/instagram/user/info?username=${encodeURIComponent(username)}&token=${token}`;

  const resp = await fetch(ENSEMBLE_BASE + endpoint);
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    console.log(`[info] ${platform} HTTP ${resp.status}: ${errText.substring(0, 300)}`);
    throw new Error(`Ensemble HTTP ${resp.status}`);
  }
  const json = await resp.json();
  const topKeys = Object.keys(json).join(',');
  console.log(`[info] ${platform} raw keys: ${topKeys}`);

  if (platform === 'tiktok') {
    const d = json.data || json;
    const user = d.user || d.userInfo?.user || {};
    const stats = d.stats || d.userInfo?.stats || {};
    return {
      followers: stats.followerCount ?? stats.follower_count ?? null,
      bio: user.signature || '',
      nickname: user.nickname || '',
      verified: !!user.verified,
      region: user.region || '',
      instagram_id: user.ins_id || '',
      youtube_id: user.youtube_channel_id || '',
      videoCount: stats.videoCount ?? stats.aweme_count ?? 0,
      heartCount: stats.heartCount ?? stats.total_favorited ?? 0,
    };
  }

  if (platform === 'instagram') {
    const d = json.data || json;
    return {
      followers: d.edge_followed_by?.count ?? d.follower_count ?? null,
      bio: d.biography || '',
      nickname: d.full_name || '',
      verified: !!d.is_verified,
      category: d.category_name || '',
      external_url: d.external_url || '',
      is_business: !!d.is_business_account,
      mediaCount: d.edge_owner_to_timeline_media?.count ?? d.media_count ?? 0,
    };
  }

  return null;
}

// ─── EnsembleData: user posts (for engagement) ──────────────
async function ensembleUserPosts(platform, username, token) {
  if (platform === 'tiktok') {
    const url = `${ENSEMBLE_BASE}/tt/user/posts?username=${encodeURIComponent(username)}&depth=1&token=${token}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.log(`[posts] TT HTTP ${resp.status}: ${errText.substring(0, 300)}`);
      throw new Error(`Ensemble posts HTTP ${resp.status}`);
    }
    const json = await resp.json();
    // Debug: log raw structure
    const topKeys = Object.keys(json).join(',');
    const rawPosts = json.data || json.posts || json.items || json.aweme_list || [];
    console.log(`[posts] TT raw keys: ${topKeys} | posts array length: ${rawPosts.length}`);
    if (rawPosts.length > 0) {
      const first = rawPosts[0];
      const firstKeys = Object.keys(first).slice(0, 15).join(',');
      console.log(`[posts] TT first post keys: ${firstKeys}`);
      if (first.stats) console.log(`[posts] TT first.stats:`, JSON.stringify(first.stats));
      else if (first.statistics) console.log(`[posts] TT first.statistics:`, JSON.stringify(first.statistics));
      else console.log(`[posts] TT first post (partial):`, JSON.stringify(first).substring(0, 500));
    }
    return rawPosts.map(p => ({
      likes: p.stats?.diggCount ?? p.diggCount ?? p.statistics?.digg_count ?? 0,
      comments: p.stats?.commentCount ?? p.commentCount ?? p.statistics?.comment_count ?? 0,
      shares: p.stats?.shareCount ?? p.shareCount ?? p.statistics?.share_count ?? 0,
      plays: p.stats?.playCount ?? p.playCount ?? p.statistics?.play_count ?? 0,
      saves: p.stats?.collectCount ?? p.collectCount ?? p.statistics?.collect_count ?? 0,
    }));
  }

  if (platform === 'instagram') {
    const url = `${ENSEMBLE_BASE}/instagram/user/posts?username=${encodeURIComponent(username)}&depth=1&token=${token}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.log(`[posts] IG HTTP ${resp.status}: ${errText.substring(0, 300)}`);
      throw new Error(`Ensemble IG posts HTTP ${resp.status}`);
    }
    const json = await resp.json();
    // Debug: log raw structure
    const topKeys = Object.keys(json).join(',');
    console.log(`[posts] IG raw keys: ${topKeys}`);
    // Instagram posts can be nested in different structures
    let rawPosts = json.data || [];
    if (Array.isArray(rawPosts) && rawPosts.length === 0) {
      // Try alternate structures
      rawPosts = json.posts || json.items || json.edge_owner_to_timeline_media?.edges?.map(e => e.node) || [];
    }
    console.log(`[posts] IG posts array length: ${rawPosts.length}`);
    if (rawPosts.length > 0) {
      const first = rawPosts[0];
      const firstKeys = Object.keys(first).slice(0, 15).join(',');
      console.log(`[posts] IG first post keys: ${firstKeys}`);
      console.log(`[posts] IG first post (partial):`, JSON.stringify(first).substring(0, 500));
    }
    return rawPosts.map(p => ({
      likes: p.like_count ?? p.edge_liked_by?.count ?? p.likes?.count ?? 0,
      comments: p.comment_count ?? p.edge_media_to_comment?.count ?? p.comments?.count ?? 0,
      plays: p.video_view_count ?? p.play_count ?? p.video_views ?? 0,
    }));
  }

  return [];
}

function calculateEngagement(posts, followers) {
  if (!posts || posts.length === 0 || !followers || followers === 0) return null;
  const total = posts.reduce((sum, p) => {
    return sum + (p.likes || 0) + (p.comments || 0) + (p.shares || 0);
  }, 0);
  const avg = total / posts.length;
  return Math.round((avg / followers) * 10000) / 100; // 2 decimals
}

function calculateAvgViews(posts) {
  if (!posts || posts.length === 0) return null;
  const withPlays = posts.filter(p => (p.plays || 0) > 0);
  if (withPlays.length === 0) return null;
  const total = withPlays.reduce((sum, p) => sum + (p.plays || 0), 0);
  return Math.round(total / withPlays.length);
}

// ─── Apify fallback (followers only) ────────────────────────
async function apifyFallback(platform, username, apifyToken) {
  if (!apifyToken) return null;

  const actorId = APIFY_ACTORS[platform];
  if (!actorId) return null;

  const clean = username.replace(/^@/, '');
  const input = platform === 'tiktok'
    ? { profiles: ['https://www.tiktok.com/@' + clean], resultsPerPage: 1 }
    : { usernames: [clean] };

  const runUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}&timeout=60&memory=256`;

  const resp = await fetch(runUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!resp.ok) return null;
  const items = await resp.json();
  if (!items || items.length === 0) return null;

  const item = items[0];
  const str = JSON.stringify(item);

  if (platform === 'tiktok') {
    if (item.authorMeta) {
      const a = item.authorMeta;
      if (typeof a.fans === 'number') return a.fans;
      if (typeof a.followers === 'number') return a.followers;
      if (typeof a.followerCount === 'number') return a.followerCount;
    }
    if (typeof item.fans === 'number') return item.fans;
    if (typeof item.followerCount === 'number') return item.followerCount;
    if (typeof item.followers === 'number') return item.followers;
    const m = str.match(/"fans":(\d+)/) || str.match(/"followerCount":(\d+)/) || str.match(/"followers":(\d+)/);
    if (m) return parseInt(m[1]);
  }

  if (platform === 'instagram') {
    if (typeof item.followersCount === 'number') return item.followersCount;
    if (typeof item.followers === 'number') return item.followers;
    if (item.userInfo && typeof item.userInfo.followersCount === 'number') return item.userInfo.followersCount;
    const m = str.match(/"followersCount":(\d+)/) || str.match(/"followers":(\d+)/);
    if (m) return parseInt(m[1]);
  }

  return null;
}

// ─── Handler ────────────────────────────────────────────────
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { platform, username, action = 'followers', ensembleToken: bodyEnsemble, apifyToken: bodyApify } = body || {};
  // Env var as default, body param as override
  const ensembleToken = bodyEnsemble || process.env.ENSEMBLE_TOKEN || '';
  const apifyToken = bodyApify || process.env.APIFY_TOKEN || '';

  if (!platform || !username)
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Faltan: platform, username' }) };
  if (!ensembleToken && !apifyToken)
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Se necesita ensembleToken o apifyToken' }) };

  const clean = username.replace(/^@/, '');
  console.log(`[scraper] ${action} ${platform} @${clean}`);

  // ── ACTION: posts_only (engagement without re-fetching user info) ──
  // Saves 1 unit TT / 3 units IG when followers are already fresh
  if (action === 'posts_only') {
    if (!ensembleToken)
      return { statusCode: 200, headers, body: JSON.stringify({ error: 'posts_only requiere EnsembleData token' }) };

    const existingFollowers = body.followers || 0;
    try {
      const posts = await ensembleUserPosts(platform, clean, ensembleToken);
      const engagementRate = calculateEngagement(posts, existingFollowers);
      const avgViews = calculateAvgViews(posts);
      const postsAnalyzed = posts?.length ?? 0;

      console.log(`[scraper] posts_only ${platform} @${clean} → ${engagementRate}% avgViews:${avgViews} (${postsAnalyzed} posts, existing followers: ${existingFollowers})`);

      return { statusCode: 200, headers, body: JSON.stringify({
        platform, username: clean, action: 'posts_only',
        followers: existingFollowers, engagementRate, avgViews, postsAnalyzed,
        source: 'ensemble',
      }) };
    } catch (e) {
      console.log(`[scraper] posts_only error:`, e.message);
      return { statusCode: 200, headers, body: JSON.stringify({ error: e.message }) };
    }
  }

  // ── ACTION: engagement (full — user info + posts) ─────────
  if (action === 'engagement') {
    if (!ensembleToken)
      return { statusCode: 200, headers, body: JSON.stringify({ error: 'Engagement requiere EnsembleData token' }) };

    try {
      const [info, posts] = await Promise.all([
        ensembleUserInfo(platform, clean, ensembleToken),
        ensembleUserPosts(platform, clean, ensembleToken),
      ]);

      const followers = info?.followers ?? null;
      const engagementRate = calculateEngagement(posts, followers);
      const avgViews = calculateAvgViews(posts);
      const postsAnalyzed = posts?.length ?? 0;

      console.log(`[scraper] engagement ${platform} @${clean} → ${engagementRate}% avgViews:${avgViews} (${postsAnalyzed} posts)`);

      return { statusCode: 200, headers, body: JSON.stringify({
        platform, username: clean, action: 'engagement',
        followers, engagementRate, avgViews, postsAnalyzed,
        // Profile metadata
        bio: info?.bio || '',
        nickname: info?.nickname || '',
        verified: info?.verified || false,
        category: info?.category || '',
        // TikTok-specific
        region: info?.region || '',
        instagram_id: info?.instagram_id || '',
        youtube_id: info?.youtube_id || '',
        // Instagram-specific
        external_url: info?.external_url || '',
        is_business: info?.is_business || false,
        source: 'ensemble',
      }) };
    } catch (e) {
      console.log(`[scraper] engagement error:`, e.message);
      return { statusCode: 200, headers, body: JSON.stringify({ error: e.message }) };
    }
  }

  // ── ACTION: followers (default) ────────────────────────────
  let source = null;
  let result = null;

  // Try EnsembleData first
  if (ensembleToken) {
    try {
      const info = await ensembleUserInfo(platform, clean, ensembleToken);
      if (info && info.followers !== null && info.followers !== undefined) {
        result = {
          followers: info.followers,
          bio: info.bio || '',
          nickname: info.nickname || '',
          category: info.category || '',
          verified: info.verified || false,
        };
        source = 'ensemble';
        console.log(`[scraper] ${platform} @${clean} → ${info.followers} (ensemble)`);
      }
    } catch (e) {
      console.log(`[scraper] Ensemble failed for ${platform} @${clean}:`, e.message);
    }
  }

  // Fallback to Apify
  if (!result && apifyToken && (platform === 'tiktok' || platform === 'instagram')) {
    try {
      const followers = await apifyFallback(platform, clean, apifyToken);
      if (followers !== null) {
        result = { followers, bio: '', nickname: '' };
        source = 'apify';
        console.log(`[scraper] ${platform} @${clean} → ${followers} (apify fallback)`);
      }
    } catch (e) {
      console.log(`[scraper] Apify fallback failed:`, e.message);
    }
  }

  if (!result)
    return { statusCode: 200, headers, body: JSON.stringify({ error: 'No se pudo obtener datos del perfil', followers: null }) };

  return { statusCode: 200, headers, body: JSON.stringify({
    ...result, platform, username: clean, source,
  }) };
};
