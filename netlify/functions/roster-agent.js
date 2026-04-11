// Netlify Function: AI Roster Recommendation Agent
// POST /.netlify/functions/roster-agent
// Uses Claude Sonnet to rank talents against campaign requirements

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }) };
  }

  try {
    const { campaign, talents } = JSON.parse(event.body || '{}');

    if (!campaign || !talents || !talents.length) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing campaign or talents data' }) };
    }

    const cantidad = campaign.cantidad || 10;

    // Build compact talent descriptions to minimize tokens
    const talentDescriptions = talents.map(t => {
      const segs = t.seguidores || {};
      const totalSeg = (segs.tiktok||0) + (segs.instagram||0) + (segs.youtube||0);
      const platforms = [];
      if (segs.tiktok) platforms.push(`TT:${formatNum(segs.tiktok)}`);
      if (segs.instagram) platforms.push(`IG:${formatNum(segs.instagram)}`);
      if (segs.youtube) platforms.push(`YT:${formatNum(segs.youtube)}`);
      const hist = (t.historial||[]).map(h => h.marca).filter(Boolean).join(', ');
      return `[${t.id}] ${t.nombre} | ${(t.paises||[]).join(',')} | ${t.genero||'?'} | ${platforms.join(' ')} | cats:${(t.categorias||[]).join(',')} | kw:${t.keywords||''} | vals:${t.valores||''} ${hist ? '| marcas:'+hist : ''}`;
    }).join('\n');

    const systemPrompt = `Eres un agente experto en influencer marketing para la agencia BEME. Tu trabajo es analizar talentos y recomendar los mejores para una campana.

CRITERIOS DE RANKING (en orden de importancia):
1. KEYWORDS MATCH: Si el producto/marca tiene relacion directa con las keywords del talento, es prioridad MAXIMA. Ej: campana de Fortnite + talento con keyword "fortnite" = score alto.
2. CATEGORIAS MATCH: Match de categorias entre lo que pide la marca y las del talento.
3. HISTORIAL DE MARCAS SIMILARES: Si el talento ya trabajo con marcas del mismo rubro/industria, sube el score.
4. COHERENCIA MARCA-TALENTO: Analisis semantico - el perfil del talento (valores, keywords, categorias) debe ser coherente con la marca y producto.
5. SEGUIDORES EN PLATAFORMA RELEVANTE: Mas seguidores en la plataforma que pide la marca = bonus.

IMPORTANTE:
- Se especifico en las razones. No uses frases genericas.
- El score va de 0 a 100.
- Si las keywords o categorias hacen match directo, el score minimo debe ser 70.
- Analiza la semantica: "futbolista" es relevante para "Mundial de Futbol" aunque no diga "mundial" en keywords.
- Prioriza talentos que tengan experiencia con marcas similares.

Responde SOLO con JSON valido, sin markdown, sin explicacion fuera del JSON.`;

    const userPrompt = `CAMPANA:
Marca: ${campaign.marca || ''}
Producto: ${campaign.producto || ''}
Categorias buscadas: ${(campaign.categorias||[]).join(', ')}
Genero: ${(campaign.generos||[]).join(', ')}
Paises: ${(campaign.paises||[]).join(', ')}
Plataformas: ${(campaign.plataformas||[]).join(', ')}
Seguidores min: ${campaign.seguidores_min||0} max: ${campaign.seguidores_max||0}
Cantidad deseada: ${cantidad}
Notas: ${campaign.notas || 'ninguna'}

TALENTOS DISPONIBLES (${talents.length}):
${talentDescriptions}

Analiza TODOS los talentos y devuelve los TOP ${cantidad} mas relevantes.
Responde con este formato JSON exacto:
{
  "summary": "Resumen breve del analisis (2-3 oraciones en espanol)",
  "roster": [
    {"id": 123, "score": 95, "reason": "Razon especifica en espanol de por que este talento es ideal"},
    ...
  ]
}`;

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'API error ' + response.status + ': ' + err.substring(0, 300) }) };
    }

    const result = await response.json();
    let aiText = result.content?.[0]?.text || '{}';

    // Clean markdown wrapping if present
    const jsonMatch = aiText.match(/```(?:json)?\n?([\s\S]*?)```/);
    if (jsonMatch) aiText = jsonMatch[1].trim();

    const parsed = JSON.parse(aiText);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        summary: parsed.summary || '',
        roster: parsed.roster || [],
        tokens: {
          input: result.usage?.input_tokens || 0,
          output: result.usage?.output_tokens || 0,
        },
      }),
    };

  } catch (err) {
    console.error('roster-agent error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

function formatNum(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}
