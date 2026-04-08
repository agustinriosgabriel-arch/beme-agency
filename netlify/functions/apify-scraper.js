// Netlify Function: proxy Apify para Instagram + TikTok
// POST /.netlify/functions/apify-scraper
// Body: { platform, username, apifyToken }

const ACTORS = {
  tiktok:    'clockworks~tiktok-scraper',       // actor principal de clockworks, acepta profiles[]
  instagram: 'apify~instagram-followers-count-scraper',
};

function buildInput(platform, username) {
  const clean = username.replace(/^@/, '');
  if (platform === 'tiktok') {
    return {
      profiles: ['https://www.tiktok.com/@' + clean],
      resultsPerPage: 1,  // solo necesitamos datos del perfil, no los videos
    };
  }
  if (platform === 'instagram') {
    return { usernames: [clean] };
  }
  return null;
}

function parseFollowers(platform, item) {
  if (!item) return null;
  const str = JSON.stringify(item);

  if (platform === 'tiktok') {
    // clockworks/tiktok-scraper — los datos del autor están en authorMeta
    if (item.authorMeta) {
      const a = item.authorMeta;
      if (typeof a.fans         === 'number') return a.fans;
      if (typeof a.followers    === 'number') return a.followers;
      if (typeof a.followerCount=== 'number') return a.followerCount;
    }
    // A veces viene directo en el item
    if (typeof item.fans          === 'number') return item.fans;
    if (typeof item.followerCount === 'number') return item.followerCount;
    if (typeof item.followers     === 'number') return item.followers;
    // Búsqueda amplia en JSON
    const m = str.match(/"fans":(\d+)/)
           || str.match(/"followerCount":(\d+)/)
           || str.match(/"followers":(\d+)/);
    if (m) return parseInt(m[1]);
  }

  if (platform === 'instagram') {
    if (typeof item.followersCount === 'number') return item.followersCount;
    if (typeof item.followers      === 'number') return item.followers;
    if (item.userInfo && typeof item.userInfo.followersCount === 'number')
      return item.userInfo.followersCount;
    const m = str.match(/"followersCount":(\d+)/) || str.match(/"followers":(\d+)/);
    if (m) return parseInt(m[1]);
  }

  return null;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { platform, username, apifyToken } = body || {};
  if (!platform || !username || !apifyToken)
    return { statusCode: 400, headers,
             body: JSON.stringify({ error: 'Faltan parámetros: platform, username, apifyToken' }) };

  const actorId = ACTORS[platform];
  if (!actorId)
    return { statusCode: 400, headers,
             body: JSON.stringify({ error: 'Plataforma no soportada: ' + platform }) };

  const input  = buildInput(platform, username);
  // timeout=60s, memory=256MB
  const runUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items`
               + `?token=${apifyToken}&timeout=60&memory=256`;

  console.log(`[apify] ${platform} @${username} → ${actorId}`);

  try {
    const resp = await fetch(runUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.log(`[apify] HTTP ${resp.status}:`, text.substring(0, 300));
      if (resp.status === 401)
        return { statusCode: 200, headers,
                 body: JSON.stringify({ error: 'Token inválido o sin permisos' }) };
      if (resp.status === 402)
        return { statusCode: 200, headers,
                 body: JSON.stringify({ error: 'Sin créditos en Apify — recargá tu cuenta' }) };
      return { statusCode: 200, headers,
               body: JSON.stringify({ error: `Apify HTTP ${resp.status}: ${text.substring(0,100)}` }) };
    }

    const items = await resp.json();
    const firstKeys = items[0] ? Object.keys(items[0]).slice(0, 10).join(',') : 'none';
    console.log(`[apify] ${platform} items: ${items.length} | keys: ${firstKeys}`);

    if (!items || items.length === 0)
      return { statusCode: 200, headers,
               body: JSON.stringify({ error: 'Perfil no encontrado o privado', followers: null }) };

    const followers = parseFollowers(platform, items[0]);

    // Si no parseamos los seguidores, loguear para debug
    if (followers === null) {
      const authorMeta = items[0].authorMeta;
      console.log(`[apify] parse failed — authorMeta keys: ${authorMeta ? Object.keys(authorMeta).join(',') : 'none'}`);
      console.log(`[apify] item top-level keys: ${Object.keys(items[0]).join(',')}`);
    }

    console.log(`[apify] ${platform} @${username} → ${followers}`);
    return { statusCode: 200, headers,
             body: JSON.stringify({ followers, platform, username }) };

  } catch (e) {
    console.log(`[apify] Exception:`, e.message);
    return { statusCode: 200, headers,
             body: JSON.stringify({ error: e.message, followers: null }) };
  }
};
