// Netlify Function: extract profile photo from TikTok or Instagram profile pages
// Uses multiple strategies: crawler UAs, platform-specific JSON parsing, meta tags
// Returns the image as base64 data URL so it persists (CDN URLs expire)

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { url } = body;
  if (!url) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'URL is required' }) };
  }

  // Normalize the URL - handle usernames, handles, partial URLs
  const normalized = normalizeUrl(url.trim());
  if (!normalized) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'No se pudo reconocer la URL. Usa un link completo de TikTok o Instagram (ej: https://www.tiktok.com/@usuario)' }),
    };
  }

  const { profileUrl, platform } = normalized;

  try {
    let photoUrl = null;

    if (platform === 'tiktok') {
      photoUrl = await extractTikTokPhoto(profileUrl);
    } else {
      photoUrl = await extractInstagramPhoto(profileUrl);
    }

    if (!photoUrl) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          error: 'No se encontró foto de perfil. Verifica que el perfil sea público y que el link sea correcto.',
          platform,
        }),
      };
    }

    // Convert the image to base64 so it persists (CDN URLs expire)
    const base64 = await imageToBase64(photoUrl);
    if (!base64) {
      // If conversion fails, return the raw URL as fallback
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ photoUrl, platform }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ photoUrl: base64, platform }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ error: 'Error al buscar foto: ' + err.message, platform }),
    };
  }
};

// ── URL normalization ──────────────────────────────────────────
function normalizeUrl(input) {
  // Detect platform from full URLs
  if (/tiktok\.com/i.test(input)) {
    let url = input;
    if (!url.startsWith('http')) url = 'https://' + url;
    return { profileUrl: url, platform: 'tiktok' };
  }
  if (/instagram\.com/i.test(input)) {
    let url = input;
    if (!url.startsWith('http')) url = 'https://' + url;
    // Ensure trailing slash for Instagram profiles
    if (!url.endsWith('/') && !url.includes('?')) url += '/';
    return { profileUrl: url, platform: 'instagram' };
  }

  // If it's just a username/handle (no domain), we can't determine the platform
  // Return null - the frontend should provide full URLs
  return null;
}

// ── TikTok extraction ──────────────────────────────────────────
async function extractTikTokPhoto(profileUrl) {
  // Strategy 1: Fetch with Facebook crawler UA (TikTok whitelists this for link previews)
  const strategies = [
    {
      ua: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      accept: 'text/html',
    },
    {
      ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      accept: 'text/html,application/xhtml+xml',
    },
    {
      ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  ];

  for (const strategy of strategies) {
    try {
      const resp = await fetch(profileUrl, {
        headers: {
          'User-Agent': strategy.ua,
          'Accept': strategy.accept,
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      });

      if (!resp.ok) continue;
      const html = await resp.text();
      const photo = extractFromHtml(html, 'tiktok');
      if (photo) return photo;
    } catch {
      continue;
    }
  }

  return null;
}

// ── Instagram extraction ───────────────────────────────────────
async function extractInstagramPhoto(profileUrl) {
  // Strategy 1: Facebook crawler UA (Instagram is Meta, so their own crawler is whitelisted)
  const strategies = [
    {
      ua: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      accept: 'text/html',
    },
    {
      ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      accept: 'text/html,application/xhtml+xml',
    },
    {
      ua: 'Twitterbot/1.0',
      accept: 'text/html',
    },
    {
      ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  ];

  for (const strategy of strategies) {
    try {
      const resp = await fetch(profileUrl, {
        headers: {
          'User-Agent': strategy.ua,
          'Accept': strategy.accept,
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      });

      if (!resp.ok) continue;
      const html = await resp.text();
      const photo = extractFromHtml(html, 'instagram');
      if (photo) return photo;
    } catch {
      continue;
    }
  }

  return null;
}

// ── HTML parsing with multiple extraction methods ──────────────
function extractFromHtml(html, platform) {
  let photoUrl = null;

  // 1. og:image meta tag (most reliable for crawler UAs)
  photoUrl = extractMetaTag(html, 'property', 'og:image');
  if (photoUrl && isValidImageUrl(photoUrl, platform)) return photoUrl;

  // 2. twitter:image meta tag
  photoUrl = extractMetaTag(html, 'name', 'twitter:image');
  if (photoUrl && isValidImageUrl(photoUrl, platform)) return photoUrl;
  photoUrl = extractMetaTag(html, 'property', 'twitter:image');
  if (photoUrl && isValidImageUrl(photoUrl, platform)) return photoUrl;

  // 3. TikTok-specific: __UNIVERSAL_DATA_FOR_REHYDRATION__ script
  if (platform === 'tiktok') {
    photoUrl = extractTikTokRehydrationData(html);
    if (photoUrl) return photoUrl;

    // Also try SIGI_STATE (older TikTok format)
    photoUrl = extractTikTokSigiState(html);
    if (photoUrl) return photoUrl;
  }

  // 4. Instagram-specific: embedded JSON data
  if (platform === 'instagram') {
    photoUrl = extractInstagramEmbeddedData(html);
    if (photoUrl) return photoUrl;
  }

  // 5. JSON-LD structured data
  photoUrl = extractJsonLd(html);
  if (photoUrl) return photoUrl;

  return null;
}

function extractMetaTag(html, attrName, attrValue) {
  // Try both orderings: property/name before content, and content before property/name
  const patterns = [
    new RegExp(`<meta[^>]*${attrName}=["']${attrValue}["'][^>]*content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*${attrName}=["']${attrValue}["']`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return decodeHtmlEntities(match[1]);
    }
  }
  return null;
}

function isValidImageUrl(url, platform) {
  if (!url) return false;
  // Filter out generic placeholder/logo images
  if (url.includes('logo') && !url.includes('profile')) return false;
  // Must be an actual URL
  if (!url.startsWith('http')) return false;
  return true;
}

function extractTikTokRehydrationData(html) {
  try {
    const match = html.match(/<script[^>]*id=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!match) return null;
    const data = JSON.parse(match[1]);
    // Navigate the TikTok data structure to find avatar
    // The structure is typically: __DEFAULT_SCOPE__["webapp.user-detail"].userInfo.user.avatarLarger
    const defaultScope = data.__DEFAULT_SCOPE__ || data['__DEFAULT_SCOPE__'];
    if (defaultScope) {
      const userDetail = defaultScope['webapp.user-detail'] || defaultScope['webapp.user-detail-non-ssr'];
      if (userDetail && userDetail.userInfo && userDetail.userInfo.user) {
        const user = userDetail.userInfo.user;
        return user.avatarLarger || user.avatarMedium || user.avatarThumb;
      }
    }
    // Try alternative structure
    const stringified = JSON.stringify(data);
    const avatarMatch = stringified.match(/"avatarLarger":"([^"]+)"/);
    if (avatarMatch) return avatarMatch[1].replace(/\\u002F/g, '/');
    const avatarMedMatch = stringified.match(/"avatarMedium":"([^"]+)"/);
    if (avatarMedMatch) return avatarMedMatch[1].replace(/\\u002F/g, '/');
  } catch { /* ignore */ }
  return null;
}

function extractTikTokSigiState(html) {
  try {
    const match = html.match(/<script[^>]*id=["']SIGI_STATE["'][^>]*>([\s\S]*?)<\/script>/i)
      || html.match(/<script[^>]*id=["']sigi-persisted-data["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!match) return null;
    const data = JSON.parse(match[1]);
    // Look for user module
    const userModule = data.UserModule || data.userModule;
    if (userModule && userModule.users) {
      const users = Object.values(userModule.users);
      if (users.length > 0) {
        return users[0].avatarLarger || users[0].avatarMedium || users[0].avatarThumb;
      }
    }
  } catch { /* ignore */ }
  return null;
}

function extractInstagramEmbeddedData(html) {
  try {
    // Try window._sharedData (classic Instagram)
    let match = html.match(/window\._sharedData\s*=\s*({[\s\S]*?});\s*<\/script>/i);
    if (match) {
      const data = JSON.parse(match[1]);
      const user = data?.entry_data?.ProfilePage?.[0]?.graphql?.user;
      if (user && user.profile_pic_url_hd) return user.profile_pic_url_hd;
      if (user && user.profile_pic_url) return user.profile_pic_url;
    }
  } catch { /* ignore */ }

  try {
    // Try window.__additionalDataLoaded
    let match = html.match(/window\.__additionalDataLoaded\s*\(\s*['"][^'"]*['"]\s*,\s*({[\s\S]*?})\s*\)\s*;?\s*<\/script>/i);
    if (match) {
      const data = JSON.parse(match[1]);
      const user = data?.graphql?.user || data?.user;
      if (user && user.profile_pic_url_hd) return user.profile_pic_url_hd;
      if (user && user.profile_pic_url) return user.profile_pic_url;
    }
  } catch { /* ignore */ }

  try {
    // Try to find profile_pic_url directly in any script tag
    const match = html.match(/"profile_pic_url_hd"\s*:\s*"([^"]+)"/i)
      || html.match(/"profile_pic_url"\s*:\s*"([^"]+)"/i);
    if (match) {
      return match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
    }
  } catch { /* ignore */ }

  return null;
}

function extractJsonLd(html) {
  try {
    const matches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    if (!matches) return null;
    for (const scriptTag of matches) {
      try {
        const jsonStr = scriptTag.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
        const data = JSON.parse(jsonStr);
        const img = data.image || data.thumbnailUrl ||
          (data.author && data.author.image) ||
          (data.mainEntity && data.mainEntity.image);
        if (img) {
          const url = typeof img === 'string' ? img : (img.url || (Array.isArray(img) ? img[0] : null));
          if (url && url.startsWith('http')) return url;
        }
      } catch { /* skip invalid */ }
    }
  } catch { /* ignore */ }
  return null;
}

function decodeHtmlEntities(str) {
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

// ── Image to base64 conversion ─────────────────────────────────
async function imageToBase64(imageUrl) {
  try {
    // Clean up escaped characters in URLs
    const cleanUrl = imageUrl.replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/\\u0026/g, '&');

    const resp = await fetch(cleanUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'image/*,*/*;q=0.8',
        'Referer': cleanUrl.includes('tiktok') ? 'https://www.tiktok.com/' : 'https://www.instagram.com/',
      },
      redirect: 'follow',
    });

    if (!resp.ok) return null;

    const contentType = resp.headers.get('content-type') || 'image/jpeg';
    const buffer = await resp.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mimeType = contentType.split(';')[0].trim();

    return `data:${mimeType};base64,${base64}`;
  } catch {
    return null;
  }
}
