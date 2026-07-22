const { corsOrigin } = require('./lib/cors');

// Netlify Function: agente de copys para los artes de redes.
// POST /.netlify/functions/artes-agent
// Recibe los datos reales de una campaña y devuelve los textos de cada pieza
// (titulares, frase, dato, slides de carrusel y captions con hashtags).
// El render de las piezas lo hace artes-engine.js en el navegador.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.ARTES_MODEL || 'claude-sonnet-5';

const VOZ_BEME = `Sos el redactor de Beme Agency, una agencia de marketing de influencers que trabaja
con marcas globales en LATAM, Estados Unidos y Europa.

Tono de marca:
- Directo y seguro, sin humo de agencia. Nada de "potenciamos sinergias" ni "soluciones 360".
- Frases cortas. Verbos concretos. Datos antes que adjetivos.
- Español rioplatense neutro (voseo suave: "sumate", "escribinos"), entendible en todo LATAM.
- Nunca prometemos resultados que no estén en los datos que te paso.

Los titulares se muestran en MAYÚSCULAS y muy grandes, así que tienen que ser cortos:
máximo 5 palabras por titular, idealmente 3 o 4. Si son más largos, no entran.`;

function esquema() {
  return {
    type: 'object',
    required: ['titulo', 'subtitulo', 'frase', 'dato', 'slides', 'captions', 'hashtags'],
    properties: {
      titulo:    { type: 'string', description: 'Titular principal de la campaña. Máximo 5 palabras.' },
      subtitulo: { type: 'string', description: 'Una sola frase de apoyo, máximo 110 caracteres.' },
      frase:     { type: 'string', description: 'Frase de statement de la agencia ligada al rubro de la marca. Máximo 12 palabras. Sin comillas.' },
      dato: {
        type: 'object',
        required: ['n', 'txt', 'fuente'],
        properties: {
          n:      { type: 'string', description: 'Cifra corta y contundente sacada de los datos de la campaña, ej "4.8M" o "61%".' },
          txt:    { type: 'string', description: 'Qué significa esa cifra. Máximo 130 caracteres.' },
          fuente: { type: 'string', description: 'De dónde sale el dato.' }
        }
      },
      slides: {
        type: 'array',
        description: 'Dos slides de carrusel que cuenten cómo se ejecutó la campaña.',
        items: {
          type: 'object',
          required: ['n', 'titulo', 'texto'],
          properties: {
            n:      { type: 'string', description: 'Número de slide: "01", "02".' },
            titulo: { type: 'string', description: 'Máximo 6 palabras.' },
            texto:  { type: 'string', description: 'Máximo 240 caracteres.' }
          }
        }
      },
      captions: {
        type: 'object',
        description: 'Textos para el pie de cada publicación, listos para pegar en Instagram.',
        required: ['nueva_campana', 'caso_exito', 'talento', 'story'],
        properties: {
          nueva_campana: { type: 'string' },
          caso_exito:    { type: 'string' },
          talento:       { type: 'string' },
          story:         { type: 'string' }
        }
      },
      hashtags: {
        type: 'array',
        description: 'Entre 6 y 10 hashtags relevantes, sin repetir, empezando con #.',
        items: { type: 'string' }
      }
    }
  };
}

function resumenCampana(c) {
  const talentos = (c.talentos || [])
    .map(t => `  · ${t.nombre} (${t.handle || 's/handle'}) — ${(t.categorias || []).join(', ') || 'sin categoría'} — ` +
              `IG ${t.seguidores?.instagram || 0}, TikTok ${t.seguidores?.tiktok || 0}, YouTube ${t.seguidores?.youtube || 0}`)
    .join('\n') || '  (sin talentos cargados)';

  const piezas = (c.contenidos || [])
    .map(x => `  · ${x.tipo}${x.titulo ? ' — ' + x.titulo : ''}${x.fecha_publicacion ? ' — publicado ' + x.fecha_publicacion : ''}`)
    .join('\n') || '  (sin contenidos cargados)';

  return `MARCA: ${c.marca || 'sin marca'}
CAMPAÑA: ${c.campana || 'sin nombre'}
ESTADO: ${c.estado || 'sin estado'}
PERIODO: ${c.periodo || 'sin fechas'}
DESCRIPCIÓN / BRIEF: ${c.descripcion || '(no hay brief cargado)'}

CREADORES QUE PARTICIPARON (${(c.talentos || []).length}):
${talentos}

PIEZAS DE CONTENIDO (${(c.contenidos || []).length}):
${piezas}

MÉTRICAS CALCULADAS:
${(c.metricas || []).map(m => `  · ${m.l}: ${m.n}`).join('\n') || '  (sin métricas)'}`;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': corsOrigin(event),
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método no permitido' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Falta ANTHROPIC_API_KEY en las variables de entorno' }) };
  }

  let campana;
  try {
    campana = JSON.parse(event.body || '{}').campana;
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Body inválido' }) };
  }
  if (!campana) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta el objeto campana' }) };
  }

  const instrucciones = (JSON.parse(event.body).instrucciones || '').trim();

  const prompt = `Estos son los datos reales de una campaña que Beme acaba de ejecutar:

${resumenCampana(campana)}
${instrucciones ? `\nINDICACIONES EXTRA DEL EQUIPO:\n${instrucciones}\n` : ''}
Escribí los textos para publicar los artes de esta campaña en Instagram.

Reglas:
- Usá únicamente datos que aparecen arriba. Si algo no está, no lo inventes ni lo insinúes.
- El "dato" tiene que salir de las métricas calculadas, no de una estadística de internet.
- Los captions van en primera persona del plural ("cerramos", "trabajamos") y terminan con una
  línea de hashtags. Máximo 500 caracteres cada uno.
- No uses emojis en los titulares. En los captions, como mucho uno.

Devolvé el resultado llamando a la herramienta copys_para_artes.`;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3000,
        system: VOZ_BEME,
        tools: [{
          name: 'copys_para_artes',
          description: 'Devuelve los textos de todas las piezas gráficas de la campaña.',
          input_schema: esquema(),
        }],
        tool_choice: { type: 'tool', name: 'copys_para_artes' },
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      // El detalle queda en los logs de Netlify, no se expone al cliente.
      console.error('Anthropic error', response.status, await response.text());
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'El agente de copys no respondió. Probá de nuevo en un momento.' }) };
    }

    const data = await response.json();
    const bloque = (data.content || []).find(c => c.type === 'tool_use');
    if (!bloque) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'El agente no devolvió copys utilizables.' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ copys: bloque.input }) };

  } catch (err) {
    console.error('artes-agent', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error interno generando los copys.' }) };
  }
};
