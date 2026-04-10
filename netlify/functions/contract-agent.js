// Netlify Function: Claude AI Contract Agent
// POST /.netlify/functions/contract-agent
// Body: { action, data, idioma }
// Env: ANTHROPIC_API_KEY

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT_ES = `Eres el asistente legal de BEME IMKT SAS de CV (RFC: BIM2412116G7), una agencia de marketing de influencers con sede en Mexico City (Popocatepetl 233, int 808, Santa Cruz Atoyac, Benito Juarez, 03310, Ciudad de Mexico, Mexico).

Tu trabajo es generar contratos profesionales de prestacion de servicios de influencer marketing. Los contratos siguen la ley mexicana (LFPDPPP, Codigo Penal Federal, jurisdiccion de Tribunales Federales de Ciudad de Mexico).

ESTRUCTURA DEL CONTRATO:
1. HOJA DE CONFIRMACION - Encabezado con datos de las partes, fecha, numero de contrato
2. Datos clave: Influencer, Servicios, Canales, Hashtags, Marca/Producto, Tarifa
3. METODO DE PAGO - Monto en numero y letra, forma de pago, plazo
4. COMENTARIOS ADICIONALES - Reglas de publicacion, aprobacion de contenido, metricas
5. ANEXO I - Declaraciones y Clausulas (21+ clausulas legales)

CLAUSULAS ESTANDAR:
1. Conocimiento del encargo por la Marca
2. Permanencia de publicaciones (24h stories, 4 meses posts/reels/tiktoks)
3. Mantener comentarios activos
4. Traslado de brief e indicaciones
5. Terminacion anticipada por incumplimiento
6. Prohibicion de venta de productos (12 meses)
7. No danar imagen de marca
8. No responsabilidad por opiniones personales
9. Derecho a rechazar publicaciones inapropiadas
10. Envio con 48h anticipacion para aprobacion
11. Acceso a estadisticas
12. Exclusion de paid media
13. Comunicacion de imposibilidad con 5 dias anticipacion
14. Terminacion anticipada y pago proporcional
15. Exclusividad de marca en contenido
16. Proteccion de datos personales (LFPDPPP)
17. Apego a guia de estilo
18. Confidencialidad 2 anos post-terminacion
19. No elucion comercial 1 ano
20. Independencia laboral del influencer
21. Jurisdiccion Tribunales Federales CDMX
22. Fuerza mayor
23. Notificaciones por escrito

HAY DOS TIPOS DE CONTRATO:
- TIPO "marca": Parte A = La Marca, Parte B = BEME IMKT (agencia). Monto = fee que la marca paga a la agencia.
- TIPO "talento": Parte A = BEME IMKT (agencia), Parte B = El Influencer. Monto = fee que la agencia paga al talento.

Son contratos espejo: misma estructura y clausulas, solo cambian las partes y el monto.

Genera HTML limpio y profesional. Usa <h1>, <h2>, <p>, <ol>, <li>, <strong>, <em>. No uses CSS inline complejo. El HTML sera renderizado en un contenedor con estilos propios.`;

const SYSTEM_PROMPT_EN = `You are the legal assistant for BEME IMKT SAS de CV (RFC: BIM2412116G7), an influencer marketing agency based in Mexico City (Popocatepetl 233, int 808, Santa Cruz Atoyac, Benito Juarez, 03310, Mexico City, Mexico).

Your job is to generate professional influencer marketing service contracts. Contracts follow Mexican law (LFPDPPP, Federal Penal Code, jurisdiction of Federal Courts of Mexico City).

CONTRACT STRUCTURE:
1. CONFIRMATION SHEET - Header with party data, date, contract number
2. Key data: Influencer, Services, Channels, Hashtags, Brand/Product, Rate
3. PAYMENT METHOD - Amount in number and words, payment form, term
4. ADDITIONAL COMMENTS - Publication rules, content approval, metrics
5. ANNEX I - Declarations and Clauses (21+ legal clauses)

There are TWO contract types:
- TYPE "marca" (brand): Party A = The Brand, Party B = BEME IMKT (agency). Amount = fee the brand pays the agency.
- TYPE "talento" (talent): Party A = BEME IMKT (agency), Party B = The Influencer. Amount = fee the agency pays the talent.

They are mirror contracts: same structure and clauses, only the parties and amount change.

Generate clean, professional HTML. Use <h1>, <h2>, <p>, <ol>, <li>, <strong>, <em>. No complex inline CSS. The HTML will be rendered in a container with its own styles.`;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }) };
  }

  try {
    const { action, data, idioma } = JSON.parse(event.body);
    const lang = idioma === 'en' ? 'en' : 'es';
    const systemPrompt = lang === 'en' ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_ES;

    let userMessage = '';

    if (action === 'generate') {
      // Generate a full contract from campaign data
      const d = data;
      userMessage = lang === 'es'
        ? `Genera el contrato completo en HTML. Datos:
- Tipo: ${d.tipo === 'marca' ? 'Contrato Marca ↔ Agencia' : 'Contrato Agencia ↔ Talento'}
- Numero de contrato: ${d.numero_contrato || 'Auto-generado'}
- Fecha: ${d.fecha_contrato || new Date().toLocaleDateString('es-MX')}
- Ciudad: ${d.ciudad_contrato || 'Mexico City'}

PARTE A:
- Nombre: ${d.parte_a_nombre}
- RFC: ${d.parte_a_rfc || 'N/A'}
- Domicilio: ${d.parte_a_domicilio || 'N/A'}

PARTE B:
- Nombre: ${d.parte_b_nombre}
- RFC: ${d.parte_b_rfc || 'N/A'}
- Domicilio: ${d.parte_b_domicilio || 'N/A'}

INFLUENCER: ${d.influencer_nombre}
SERVICIOS: ${d.servicios}
CANALES: ${d.canales}
HASHTAGS: ${d.hashtags || 'A Definir en Brief'}
MARCA/PRODUCTO: ${d.marca_producto}
TARIFA: ${d.tarifa_tipo === 'canje' ? 'Canje' : d.tarifa_tipo === 'mixto' ? 'Mixto' : 'Pago'}
MONTO: $${d.monto} ${d.moneda} ${d.monto_texto ? '(' + d.monto_texto + ')' : ''}
METODO DE PAGO: ${d.metodo_pago || 'Transferencia bancaria'}
PLAZO DE PAGO: ${d.plazo_pago_dias || 45} dias despues de publicada la campana
${d.derechos_imagen ? `DERECHOS DE IMAGEN: Si - ${d.derechos_dias || 0} dias por $${d.derechos_valor || 0} ${d.moneda} desde ${d.derechos_desde || 'la publicacion'}` : 'DERECHOS DE IMAGEN: Incluidos en tarifa'}
COMENTARIOS ADICIONALES: ${d.comentarios || 'Estandar'}

Genera el HTML completo del contrato incluyendo la Hoja de Confirmacion y el Anexo I con todas las clausulas.`
        : `Generate the full contract in HTML. Data:
- Type: ${d.tipo === 'marca' ? 'Brand ↔ Agency Contract' : 'Agency ↔ Talent Contract'}
- Contract number: ${d.numero_contrato || 'Auto-generated'}
- Date: ${d.fecha_contrato || new Date().toLocaleDateString('en-US')}
- City: ${d.ciudad_contrato || 'Mexico City'}

PARTY A:
- Name: ${d.parte_a_nombre}
- Tax ID: ${d.parte_a_rfc || 'N/A'}
- Address: ${d.parte_a_domicilio || 'N/A'}

PARTY B:
- Name: ${d.parte_b_nombre}
- Tax ID: ${d.parte_b_rfc || 'N/A'}
- Address: ${d.parte_b_domicilio || 'N/A'}

INFLUENCER: ${d.influencer_nombre}
SERVICES: ${d.servicios}
CHANNELS: ${d.canales}
HASHTAGS: ${d.hashtags || 'To be defined in Brief'}
BRAND/PRODUCT: ${d.marca_producto}
RATE: ${d.tarifa_tipo === 'canje' ? 'Trade/Barter' : d.tarifa_tipo === 'mixto' ? 'Mixed' : 'Payment'}
AMOUNT: $${d.monto} ${d.moneda} ${d.monto_texto ? '(' + d.monto_texto + ')' : ''}
PAYMENT METHOD: ${d.metodo_pago || 'Bank transfer'}
PAYMENT TERM: ${d.plazo_pago_dias || 45} days after campaign publication
${d.derechos_imagen ? `IMAGE RIGHTS: Yes - ${d.derechos_dias || 0} days for $${d.derechos_valor || 0} ${d.moneda} from ${d.derechos_desde || 'publication date'}` : 'IMAGE RIGHTS: Included in rate'}
ADDITIONAL COMMENTS: ${d.comentarios || 'Standard'}

Generate the full HTML contract including the Confirmation Sheet and Annex I with all clauses.`;

    } else if (action === 'customize') {
      // Customize an existing contract based on user instructions
      userMessage = lang === 'es'
        ? `Tengo este contrato existente:\n\n${data.contenido_html}\n\nModificaciones solicitadas: ${data.instrucciones}\n\nDevuelve el HTML completo del contrato modificado.`
        : `I have this existing contract:\n\n${data.contenido_html}\n\nRequested modifications: ${data.instrucciones}\n\nReturn the full modified contract HTML.`;

    } else if (action === 'translate') {
      const targetLang = lang === 'es' ? 'ingles' : 'Spanish';
      userMessage = lang === 'es'
        ? `Traduce este contrato al ${targetLang}, manteniendo el formato HTML exacto y la estructura legal:\n\n${data.contenido_html}`
        : `Translate this contract to ${targetLang}, keeping the exact HTML format and legal structure:\n\n${data.contenido_html}`;

    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid action. Use: generate, customize, translate' }) };
    }

    console.log('Calling Anthropic API, action:', action, 'key starts with:', apiKey.substring(0, 10));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 22000);

    let response;
    try {
      response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
      });
    } catch(fetchErr) {
      clearTimeout(timeout);
      console.error('Fetch error:', fetchErr.message);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Timeout o error de conexion con Anthropic API: ' + fetchErr.message }) };
    }
    clearTimeout(timeout);

    console.log('Anthropic response status:', response.status);
    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', response.status, errText);
      return { statusCode: response.status, headers, body: JSON.stringify({ error: 'API error ' + response.status + ': ' + errText.substring(0, 200) }) };
    }

    const result = await response.json();
    console.log('Anthropic response received, usage:', JSON.stringify(result.usage));
    const content = result.content?.[0]?.text || '';

    // Extract HTML from response (might be wrapped in ```html blocks)
    let html = content;
    const htmlMatch = content.match(/```html\n?([\s\S]*?)```/);
    if (htmlMatch) html = htmlMatch[1].trim();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ html, usage: result.usage }),
    };

  } catch (err) {
    console.error('Contract agent error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
