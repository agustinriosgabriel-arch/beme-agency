// Netlify Function: Contract Generator + AI Agent
// POST /.netlify/functions/contract-agent
// Body: { action, data, idioma }
// Actions: generate (template), customize (AI), translate (AI)

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// ══════════════════════════════════════════════════════════
// TEMPLATE-BASED CONTRACT GENERATION (instant, no AI needed)
// ══════════════════════════════════════════════════════════

function formatDate(dateStr, lang) {
  if (!dateStr) return lang === 'en' ? 'N/A' : 'N/A';
  const d = new Date(dateStr + 'T00:00:00');
  const months_es = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const months_en = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const months = lang === 'en' ? months_en : months_es;
  return `${d.getDate().toString().padStart(2,'0')} de ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function generateContractES(d) {
  const fecha = formatDate(d.fecha_contrato, 'es');
  const derechos = d.derechos_imagen
    ? `<p><strong>DERECHOS DE IMAGEN:</strong> ${d.derechos_dias || 0} dias por $${d.derechos_valor || 0} ${d.moneda} desde ${d.derechos_desde || 'la publicacion'}.</p>`
    : '';

  return `<h1>HOJA DE CONFIRMACION</h1>

<p><em>${d.ciudad_contrato || 'Mexico City'}, ${fecha}</em></p>

<p>De una parte, <strong>${d.parte_a_nombre}</strong>${d.parte_a_rfc ? ' con RFC ' + d.parte_a_rfc : ''}${d.parte_a_domicilio ? ' y domiciliado en ' + d.parte_a_domicilio : ''}. Y, de otra, <strong>${d.parte_b_nombre}</strong>${d.parte_b_rfc ? ' con RFC ' + d.parte_b_rfc : ''}${d.parte_b_domicilio ? ', domiciliado en ' + d.parte_b_domicilio : ''}. <strong>NUMERO DE CONTRATO: ${d.numero_contrato || 'Pendiente'}</strong></p>

<p><strong>INFLUENCER/S:</strong> ${d.influencer_nombre}</p>
<p><strong>SERVICIOS:</strong> ${d.servicios}</p>
<p><strong>CANALES:</strong> ${d.canales}</p>
<p><strong>HASHTAGS:</strong> ${d.hashtags || 'A Definir en Brief'}</p>
<p><strong>MARCA/PRODUCTO:</strong> ${d.marca_producto}</p>
<p><strong>TARIFA:</strong> ${d.tarifa_tipo === 'canje' ? 'Canje' : d.tarifa_tipo === 'mixto' ? 'Mixto' : 'Pago'}</p>

<p><strong>METODO DE PAGO:</strong> Como contraprestacion por la totalidad de los servicios prestados por el INFLUENCER, ${d.tipo === 'marca' ? d.parte_a_nombre : 'BEME IMKT'} pagara la cantidad de <strong>$${Number(d.monto||0).toLocaleString()} ${d.moneda}</strong>${d.monto_texto ? ' (' + d.monto_texto + ')' : ''}, que se efectuara mediante ${d.metodo_pago || 'transferencia bancaria'}, dentro del plazo de ${d.plazo_pago_dias || 45} dias una vez publicada la campana.</p>

${derechos}

<p><strong>COMENTARIOS ADICIONALES:</strong> ${d.comentarios || 'En todas las publicaciones se debera colocar los hashtags y mencion a marca, en caso de no ser asi no se pagara dicha publicacion. Todo el contenido generado debera enviarse para aprobacion con 48 hrs de antelacion para que la marca pueda validar y realizar los ajustes pertinentes. No se podra publicar contenido sin validar por la marca. Deberas enviar las metricas completas correspondientes de cada contenido, asi como los testigos de lo contrario no se podra hacer el pago de la publicacion. No mostrar otros productos o marcas dentro de las Publicaciones.'}</p>

<h2>ANEXO I — Declaraciones y Clausulas</h2>

<p>La aceptacion de esta Hoja de Confirmacion queda sujeta a los siguientes terminos y condiciones:</p>

<ol>
<li>${d.tipo === 'marca' ? d.parte_b_nombre : 'La Agencia'} es conocedora de que ${d.tipo === 'marca' ? d.parte_a_nombre : 'BEME IMKT'} ha recibido el encargo de la <strong>${d.marca_producto}</strong> (en adelante, la "Marca") de identificar uno o varios INFLUENCERS, para que estos lleven a cabo, bajo su unica y exclusiva responsabilidad y con sus propios medios y recursos, las acciones integrantes de la CAMPANA (en adelante, las Publicaciones).</li>

<li>Las Publicaciones deberan cumplir los requisitos exigidos en esta Hoja de Confirmacion, asi como permanecer visibles en los perfiles sociales del INFLUENCER por un plazo de veinticuatro (24) horas para los Stories, cuatro (4) meses para los posts y cuatro (4) meses para reels, tiktoks y formatos de video, no pudiendo utilizar la opcion de "remove from profile grid". El incumplimiento de lo anterior sera responsabilidad del INFLUENCER, quedando BEME IMKT indemne frente a cualesquiera acciones legales que se pudieran derivar de las Publicaciones.</li>

<li>El Influencer debera mantener activos los comentarios en las publicaciones, no pudiendo desactivarlos en ningun caso mediante la opcion "turn off commenting". El incumplimiento de lo anterior pudiendo ocasionar la baja del Influencer de la CAMPANA.</li>

<li>La Agencia es responsable de trasladar al INFLUENCER el brief y cualesquiera indicaciones o directrices adicionales recibidas de la Marca, siendo obligados solidarios con el INFLUENCER al cumplimiento de esta obligacion.</li>

<li>BEME IMKT se reserva el derecho de terminar anticipadamente el acuerdo si el Influencer incumple cualquiera de las declaraciones y clausulas establecidas, directrices integrantes del Brief o ha danado la imagen y/o reputacion de la Marca, la Campana y/o los productos objeto de la presente prestacion de servicios. Se pagaran las acciones realizadas hasta dicho momento.</li>

<li>La Agencia manifiesta y garantiza que el INFLUENCER no pondra a la venta los productos proporcionados por la Marca y/o BEME IMKT para su promocion, en plataformas de productos de segunda mano (como GO TRENDIER, MERCADO LIBRE, entre otras) durante la vigencia de la campana y por un periodo de doce meses adicionales tras la finalizacion de la misma.</li>

<li>Durante la vigencia del presente acuerdo, el INFLUENCER debera abstenerse de cualquier acto y/o manifestacion sobre la marca o producto que pueda danar la imagen y/o reputacion de la misma, los productos de esta o de la Campana objeto del presente acuerdo. En caso de incumplimiento, el INFLUENCER hara frente a cualquier penalizacion por danos y perjuicios que se produzcan, dejando a BEME IMKT indemne.</li>

<li>BEME IMKT no sera responsable de las opiniones o comportamiento propios del INFLUENCER que realicen de forma ajena de la prestacion de los servicios.</li>

<li>En todo caso, BEME IMKT y/o la Marca, se reservan el derecho a rechazar las Publicaciones que, razonablemente, considere que infringen la normativa aplicable o puedan ser consideradas hostiles, groseras o inapropiadas o que puedan vulnerar derechos fundamentales. BEME IMKT debera comunicar al INFLUENCER dicha eventualidad, a ser posible con antelacion suficiente, para que este pueda entregar materiales alternativos.</li>

<li>El INFLUENCER debera enviar a BEME IMKT, con un minimo de 48 (cuarenta y ocho) horas de anticipacion, las Publicaciones realizadas, antes de ser publicadas y para su aprobacion junto a la Marca.</li>

<li>El INFLUENCER debera tener acceso a las estadisticas de la red social utilizada para ejecutar la Campana y debera enviar a BEME IMKT, todos los datos reflejados en las mismas antes de que la red las borre.</li>

<li>La modalidad de "paid media" o cualquier tipo de promocion pagada, quedan excluidas. En el caso de que la MARCA quisiera hacer paid media y/o utilizar los contenidos creados por el INFLUENCER en otros medios online y offline que no sean expresamente pactados en el presente contrato, un nuevo acuerdo tendra que suscribirse entre las partes.</li>

<li>En caso de imposibilidad de cumplir por parte del INFLUENCER con la fecha prevista para la Publicacion en sus redes sociales, la Agencia comunicara a BEME IMKT, a no mas tardar cinco (5) dias previos a la fecha de Publicacion, la causa de dicha imposibilidad y propondra una fecha alternativa. La Marca, a traves de BEME IMKT, sera la unica y exclusivamente facultada de aceptar o rechazar la nueva fecha de publicacion.</li>

<li>El incumplimiento de cualquier obligacion aqui prevista podra dar lugar a la terminacion anticipada del presente acuerdo a la absoluta discrecion de BEME IMKT. En este caso, el INFLUENCER solo recibira la tarifa proporcional al contenido que ha publicado, perdiendo el derecho a recibir el pago de la tarifa restante.</li>

<li>Para todos los contenidos que se realicen con la marca, no pueden existir otras marcas visibles en fotos, videos o audios, ya sean marcas de otras categorias, de la competencia o de la misma compania contratante. Durante la creacion del contenido, se deben utilizar accesorios, vestuario y/o utileria, "neutra", respetando que el contenido realizado sea exclusivo para la marca que lo patrocina. Por tanto, queda prohibido el placement de otras marcas en la produccion de contenido durante el periodo de campana.</li>

<li>En caso de que la informacion compartida por las Partes, incluya Datos Personales y/o Datos Personales Sensibles en los terminos del articulo 3 Fraccion V y VI de la Ley Federal de Proteccion de Datos Personales en Posesion de los Particulares (en lo sucesivo "LFPDPPP"), las Partes se comprometen a cumplir con las obligaciones que les correspondan y que se desprendan de dicha legislacion. Las Partes como responsables del tratamiento de los Datos Personales, haran del conocimiento de los propietarios de los Datos Personales que la informacion sera tratada de conformidad con lo indicado en el Aviso de Privacidad correspondiente. Cada parte se obliga a adoptar las medidas, mecanismos y procedimientos necesarios para la proteccion de los Datos Personales y/o Datos Personales Sensibles de los Titulares.</li>

<li>El INFLUENCER se obliga a crear contenido en estricto apego a la guia de estilo y se obliga a utilizar la guia de estilo unicamente para la CAMPANA, tratando la guia de estilo como Informacion Confidencial.</li>

<li>Las Partes asumen esta obligacion de confidencialidad durante la vigencia de este acuerdo y en un plazo adicional de 2 anos contados a partir de la terminacion del mismo. Las Partes reconocen y convienen que por ningun motivo divulgaran o revelaran, cualquier informacion financiera, contable, legal, corporativa, comercial, industrial, de negocios, planes, programas, secretos industriales, ideas creativas, conversaciones, negociaciones o contenido en general relacionado con la CAMPANA que les sea revelada durante la vigencia de este acuerdo.</li>

<li>El INFLUENCER reconoce y acepta que no iniciara relaciones comerciales directamente con los contactos comerciales, proveedores, Marcas de la otra Parte que hubiere conocido en virtud de la celebracion del presente acuerdo. En el supuesto de que alguna de las Partes desee iniciar relaciones comerciales con dichos contactos, podra hacerlo previa notificacion y autorizacion de la otra Parte. El presente deber de no elusion continuara vigente 1 (un) ano posterior a la terminacion de la vigencia.</li>

<li>El INFLUENCER garantiza que esta al corriente en el cumplimiento de sus obligaciones laborales y sociales, manifestando y garantizando asimismo que el INFLUENCER es un profesional independiente que interviene por cuenta propia, sin que exista por tanto, ni se cree ningun tipo de vinculo laboral con BEME IMKT, quien queda exonerada de cualquier tipo de obligacion de caracter laboral o social respecto del INFLUENCER.</li>

<li>Las partes aceptan que todo lo no previsto en este acuerdo se regira por las disposiciones en la materia, ya de indole local de la Ciudad de Mexico o federal segun corresponda. En caso de que las Partes no puedan resolver alguna Controversia, se resolvera por la jurisdiccion de los Tribunales Federales con sede en la Ciudad de Mexico. Renunciando las partes a cualquier otra jurisdiccion que les corresponda por su domicilio o nacionalidad.</li>

<li>Las Partes de ninguna manera seran responsables por el rechazo o falta de cumplimiento a las obligaciones que asume en el presente Contrato, cuando estos deriven de caso fortuito o causas de fuerza mayor dentro de su empresa o imputable a sus proveedores.</li>
</ol>

<p>Todos los avisos y notificaciones entre las Partes deberan realizarse por escrito y ser entregados ya sea personalmente, por mensajeria especializada o por correo electronico y confirmado por el mismo medio, a los domicilios o direccion de correo electronico, senalados en la caratula de este acuerdo a no ser que las Partes notifiquen su cambio de domicilio o correo electronico en los terminos anteriores.</p>`;
}

function generateContractEN(d) {
  const fecha = formatDate(d.fecha_contrato, 'en');
  const derechos = d.derechos_imagen
    ? `<p><strong>IMAGE RIGHTS:</strong> ${d.derechos_dias || 0} days for $${d.derechos_valor || 0} ${d.moneda} from ${d.derechos_desde || 'publication date'}.</p>`
    : '';

  return `<h1>CONFIRMATION SHEET</h1>

<p><em>${d.ciudad_contrato || 'Mexico City'}, ${fecha}</em></p>

<p>On one part, <strong>${d.parte_a_nombre}</strong>${d.parte_a_rfc ? ' with Tax ID ' + d.parte_a_rfc : ''}${d.parte_a_domicilio ? ', domiciled at ' + d.parte_a_domicilio : ''}. And, on the other, <strong>${d.parte_b_nombre}</strong>${d.parte_b_rfc ? ' with Tax ID ' + d.parte_b_rfc : ''}${d.parte_b_domicilio ? ', domiciled at ' + d.parte_b_domicilio : ''}. <strong>CONTRACT NUMBER: ${d.numero_contrato || 'Pending'}</strong></p>

<p><strong>INFLUENCER(S):</strong> ${d.influencer_nombre}</p>
<p><strong>SERVICES:</strong> ${d.servicios}</p>
<p><strong>CHANNELS:</strong> ${d.canales}</p>
<p><strong>HASHTAGS:</strong> ${d.hashtags || 'To be defined in Brief'}</p>
<p><strong>BRAND/PRODUCT:</strong> ${d.marca_producto}</p>
<p><strong>RATE:</strong> ${d.tarifa_tipo === 'canje' ? 'Trade/Barter' : d.tarifa_tipo === 'mixto' ? 'Mixed' : 'Payment'}</p>

<p><strong>PAYMENT METHOD:</strong> As compensation for all services rendered by the INFLUENCER, ${d.tipo === 'marca' ? d.parte_a_nombre : 'BEME IMKT'} shall pay the amount of <strong>$${Number(d.monto||0).toLocaleString()} ${d.moneda}</strong>${d.monto_texto ? ' (' + d.monto_texto + ')' : ''}, to be made via ${d.metodo_pago || 'bank transfer'}, within ${d.plazo_pago_dias || 45} days after the campaign is published.</p>

${derechos}

<p><strong>ADDITIONAL COMMENTS:</strong> ${d.comentarios || 'All publications must include the designated hashtags and brand mention; failure to do so will result in non-payment for said publication. All generated content must be submitted for approval at least 48 hours in advance so the brand can validate and make necessary adjustments. Content may not be published without brand validation. Complete metrics for each piece of content must be submitted, as well as proof of publication; otherwise payment cannot be processed. No other products or brands may be shown within the Publications.'}</p>

<h2>ANNEX I — Declarations and Clauses</h2>

<p>Acceptance of this Confirmation Sheet is subject to the following terms and conditions:</p>

<ol>
<li>The Agency acknowledges that ${d.tipo === 'marca' ? d.parte_a_nombre : 'BEME IMKT'} has been commissioned by <strong>${d.marca_producto}</strong> (hereinafter, the "Brand") to identify one or more INFLUENCERS to carry out, under their sole and exclusive responsibility and with their own means and resources, the actions comprising the CAMPAIGN (hereinafter, the Publications).</li>

<li>Said Publications must comply with the requirements set forth in this Confirmation Sheet and remain visible on the INFLUENCER's social media profiles for a period of twenty-four (24) hours for Stories, four (4) months for posts, and four (4) months for reels, TikToks, and video formats, and may not use the "remove from profile grid" option. Non-compliance shall be the INFLUENCER's responsibility, and BEME IMKT shall be held harmless against any legal actions arising from the Publications.</li>

<li>The Influencer must keep comments active on all publications and may under no circumstances disable them using the "turn off commenting" option. Non-compliance may result in the Influencer's removal from the CAMPAIGN.</li>

<li>The Agency is responsible for conveying to the INFLUENCER the brief and any additional instructions or guidelines received from the Brand, being jointly liable with the INFLUENCER for compliance with this obligation.</li>

<li>BEME IMKT reserves the right to terminate the agreement early if the Influencer breaches any of the established declarations and clauses, Brief guidelines, or has damaged the image and/or reputation of the Brand, the Campaign, and/or the products subject to this service agreement. Actions completed up to that point shall be paid.</li>

<li>The Agency represents and warrants that the INFLUENCER will not sell products provided by the Brand and/or BEME IMKT for promotion on second-hand product platforms (such as GO TRENDIER, MERCADO LIBRE, among others) during the campaign period and for an additional twelve-month period after its conclusion.</li>

<li>During the term of this agreement, the INFLUENCER shall refrain from any act and/or statement about the brand or product that may damage its image and/or reputation. In case of non-compliance, the INFLUENCER shall bear any penalties for damages, holding BEME IMKT harmless.</li>

<li>BEME IMKT shall not be responsible for the INFLUENCER's own opinions or behavior that occur outside the scope of service provision.</li>

<li>In any case, BEME IMKT and/or the Brand reserve the right to reject Publications that they reasonably consider to infringe applicable regulations or may be considered hostile, rude, inappropriate, or that may violate fundamental rights. BEME IMKT shall communicate such eventuality to the INFLUENCER, if possible with sufficient advance notice, so that alternative materials may be delivered.</li>

<li>The INFLUENCER must submit to BEME IMKT, with a minimum of 48 (forty-eight) hours advance notice, all Publications before they are published, for approval together with the Brand.</li>

<li>The INFLUENCER must have access to the statistics of the social network used to execute the Campaign and must send BEME IMKT all data reflected therein before the network deletes them.</li>

<li>"Paid media" or any type of paid promotion is excluded. Should the BRAND wish to do paid media and/or use content created by the INFLUENCER in other online and offline media not expressly agreed upon in this contract, a new agreement must be entered into between the parties.</li>

<li>In case of the INFLUENCER's inability to comply with the scheduled Publication date on their social networks, the Agency shall notify BEME IMKT no later than five (5) days prior to the Publication date, stating the cause and proposing an alternative date. The Brand, through BEME IMKT, shall be solely and exclusively empowered to accept or reject the new publication date.</li>

<li>Non-compliance with any obligation herein may result in early termination of this agreement at BEME IMKT's absolute discretion. In this case, the INFLUENCER shall only receive the proportional rate for content already published, forfeiting the right to receive payment of the remaining rate.</li>

<li>For all content created with the brand, no other brands may be visible in photos, videos, or audio, whether brands from other categories, competitors, or the same contracting company. During content creation, "neutral" accessories, wardrobe, and/or props must be used, ensuring that the content is exclusive to the sponsoring brand. Therefore, placement of other brands in content production during the campaign period is prohibited.</li>

<li>Should information shared by the Parties include Personal Data and/or Sensitive Personal Data under the terms of Article 3, Sections V and VI of the Federal Law on Protection of Personal Data Held by Private Parties ("LFPDPPP"), the Parties commit to complying with applicable obligations. Each party undertakes to adopt the necessary measures, mechanisms, and procedures for the protection of Personal Data.</li>

<li>The INFLUENCER agrees to create content in strict adherence to the style guide and to use the style guide solely for the CAMPAIGN, treating it as Confidential Information.</li>

<li>The Parties assume this confidentiality obligation during the term of this agreement and for an additional period of 2 years from its termination. The Parties acknowledge and agree that under no circumstances shall they disclose any financial, accounting, legal, corporate, commercial, industrial, business information, plans, programs, trade secrets, creative ideas, conversations, negotiations, or any content related to the CAMPAIGN revealed during the term of this agreement.</li>

<li>The INFLUENCER acknowledges and accepts that they will not initiate commercial relationships directly with the commercial contacts, suppliers, or Brands of the other Party known by virtue of this agreement. Should either Party wish to initiate such relationships, they may do so with prior notification and authorization from the other Party. This non-circumvention duty shall remain in force for 1 (one) year after the term expires.</li>

<li>The INFLUENCER warrants compliance with all labor and social obligations, representing and warranting that the INFLUENCER is an independent professional acting on their own behalf, with no employment relationship being created with BEME IMKT, who is exempt from any labor or social obligation regarding the INFLUENCER.</li>

<li>The parties agree that all matters not addressed in this agreement shall be governed by applicable provisions, whether local to Mexico City or federal as appropriate. Should the Parties be unable to resolve any Dispute, it shall be resolved under the jurisdiction of the Federal Courts located in Mexico City. The parties waive any other jurisdiction that may correspond to them by domicile or nationality.</li>

<li>The Parties shall in no way be liable for rejection or failure to comply with obligations assumed in this Contract when such failures result from acts of God or force majeure within their company or attributable to their suppliers.</li>
</ol>

<p>All notices and notifications between the Parties must be made in writing and delivered either personally, by specialized courier, or by email and confirmed by the same means, to the addresses or email addresses indicated on the cover page of this agreement unless the Parties notify a change of address or email in the aforementioned terms.</p>`;
}

// ══════════════════════════════════════════════════════════
// AI — only for customize and translate (shorter, faster)
// ══════════════════════════════════════════════════════════

const AI_SYSTEM = `You are a legal assistant for BEME IMKT, an influencer marketing agency in Mexico City. You modify or translate contracts. Always return clean HTML using h1, h2, p, ol, li, strong, em tags. No markdown, no code blocks — just raw HTML.`;

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

  try {
    const { action, data, idioma } = JSON.parse(event.body);
    const lang = idioma === 'en' ? 'en' : 'es';

    // ── GENERATE: template-based, instant ──
    if (action === 'generate') {
      const html = lang === 'en' ? generateContractEN(data) : generateContractES(data);
      return { statusCode: 200, headers, body: JSON.stringify({ html }) };
    }

    // ── TRANSLATE: template-based, instant ──
    if (action === 'translate') {
      const newLang = lang === 'es' ? 'en' : 'es';
      const html = newLang === 'en' ? generateContractEN(data) : generateContractES(data);
      return { statusCode: 200, headers, body: JSON.stringify({ html }) };
    }

    // ── CUSTOMIZE: AI-powered ──
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }) };
    }

    let userMessage = '';
    if (action === 'customize') {
      userMessage = `Modify this contract HTML based on these instructions. Return ONLY the full modified HTML, nothing else.\n\nInstructions: ${data.instrucciones}\n\nContract:\n${data.contenido_html}`;
    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid action' }) };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 24000);

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 6000,
        system: AI_SYSTEM,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      return { statusCode: response.status, headers, body: JSON.stringify({ error: 'API error: ' + errText.substring(0, 200) }) };
    }

    const result = await response.json();
    let html = result.content?.[0]?.text || '';
    const htmlMatch = html.match(/```html\n?([\s\S]*?)```/);
    if (htmlMatch) html = htmlMatch[1].trim();

    return { statusCode: 200, headers, body: JSON.stringify({ html }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
