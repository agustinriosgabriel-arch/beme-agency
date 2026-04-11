// Netlify Function: Contract Generator + AI Customizer
// POST /.netlify/functions/contract-agent
// Actions: generate (template), translate (template), customize (AI)

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// ══════════════════════════════════════════════════════════
// TEMPLATE GENERATION
// ══════════════════════════════════════════════════════════

function formatDate(dateStr, lang) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr + 'T00:00:00');
  const months_es = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const months_en = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const months = lang === 'en' ? months_en : months_es;
  return `${d.getDate().toString().padStart(2,'0')} de ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function generateContractES(d) {
  const fecha = formatDate(d.fecha_contrato, 'es');
  const derechos = d.derechos_imagen
    ? `<p><strong>DERECHOS DE IMAGEN:</strong> ${d.derechos_dias || 0} dias por $${d.derechos_valor || 0} ${d.moneda} desde ${d.derechos_desde || 'la publicacion'}.</p>` : '';

  return `<div class="contract-header">
  <img src="/assets/brand/logos/Beme1Color.png" alt="Beme">
  <div class="contract-header-info">
    <div class="contract-num">${d.numero_contrato || 'Pendiente'}</div>
    <div>${d.ciudad_contrato || 'Mexico City'}, ${fecha}</div>
  </div>
</div>
<div class="contract-body">
<div class="contract-title">Hoja de Confirmacion</div>
<div class="contract-subtitle">Contrato de Servicios de Influencer Marketing</div>

<div class="contract-summary">
  <dt>Parte A</dt><dd>${d.parte_a_nombre}${d.parte_a_rfc ? ' &mdash; RFC: ' + d.parte_a_rfc : ''}</dd>
  <dt>Parte B</dt><dd>${d.parte_b_nombre}${d.parte_b_rfc ? ' &mdash; RFC: ' + d.parte_b_rfc : ''}</dd>
  <dt>Influencer(s)</dt><dd>${d.influencer_nombre}</dd>
  <dt>Marca / Producto</dt><dd>${d.marca_producto}</dd>
  <dt>Servicios</dt><dd>${d.servicios}</dd>
  <dt>Canales</dt><dd>${d.canales}</dd>
  <dt>Hashtags</dt><dd>${d.hashtags || 'A Definir en Brief'}</dd>
  <dt>Tarifa</dt><dd>${d.tarifa_tipo === 'canje' ? 'Canje' : d.tarifa_tipo === 'mixto' ? 'Mixto' : 'Pago'} &mdash; <strong>$${Number(d.monto||0).toLocaleString()} ${d.moneda}</strong></dd>
</div>

${d.parte_a_domicilio ? `<p>De una parte, <strong>${d.parte_a_nombre}</strong>${d.parte_a_domicilio ? ', domiciliado en ' + d.parte_a_domicilio : ''}. Y, de otra, <strong>${d.parte_b_nombre}</strong>${d.parte_b_domicilio ? ', domiciliado en ' + d.parte_b_domicilio : ''}.</p>` : ''}

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
<li>En caso de que la informacion compartida por las Partes, incluya Datos Personales y/o Datos Personales Sensibles en los terminos del articulo 3 Fraccion V y VI de la Ley Federal de Proteccion de Datos Personales en Posesion de los Particulares (en lo sucesivo "LFPDPPP"), las Partes se comprometen a cumplir con las obligaciones que les correspondan y que se desprendan de dicha legislacion. Cada parte se obliga a adoptar las medidas, mecanismos y procedimientos necesarios para la proteccion de los Datos Personales.</li>
<li>El INFLUENCER se obliga a crear contenido en estricto apego a la guia de estilo y se obliga a utilizar la guia de estilo unicamente para la CAMPANA, tratando la guia de estilo como Informacion Confidencial.</li>
<li>Las Partes asumen esta obligacion de confidencialidad durante la vigencia de este acuerdo y en un plazo adicional de 2 anos contados a partir de la terminacion del mismo. Las Partes reconocen y convienen que por ningun motivo divulgaran o revelaran, cualquier informacion financiera, contable, legal, corporativa, comercial, industrial, de negocios, planes, programas, secretos industriales, ideas creativas, conversaciones, negociaciones o contenido en general relacionado con la CAMPANA que les sea revelada durante la vigencia de este acuerdo.</li>
<li>El INFLUENCER reconoce y acepta que no iniciara relaciones comerciales directamente con los contactos comerciales, proveedores, Marcas de la otra Parte que hubiere conocido en virtud de la celebracion del presente acuerdo. En el supuesto de que alguna de las Partes desee iniciar relaciones comerciales con dichos contactos, podra hacerlo previa notificacion y autorizacion de la otra Parte. El presente deber de no elusion continuara vigente 1 (un) ano posterior a la terminacion de la vigencia.</li>
<li>El INFLUENCER garantiza que esta al corriente en el cumplimiento de sus obligaciones laborales y sociales, manifestando y garantizando asimismo que el INFLUENCER es un profesional independiente que interviene por cuenta propia, sin que exista por tanto, ni se cree ningun tipo de vinculo laboral con BEME IMKT, quien queda exonerada de cualquier tipo de obligacion de caracter laboral o social respecto del INFLUENCER.</li>
<li>Las partes aceptan que todo lo no previsto en este acuerdo se regira por las disposiciones en la materia, ya de indole local de la Ciudad de Mexico o federal segun corresponda. En caso de que las Partes no puedan resolver alguna Controversia, se resolvera por la jurisdiccion de los Tribunales Federales con sede en la Ciudad de Mexico. Renunciando las partes a cualquier otra jurisdiccion que les corresponda por su domicilio o nacionalidad.</li>
<li>Las Partes de ninguna manera seran responsables por el rechazo o falta de cumplimiento a las obligaciones que asume en el presente Contrato, cuando estos deriven de caso fortuito o causas de fuerza mayor dentro de su empresa o imputable a sus proveedores.</li>
</ol>
<p>Todos los avisos y notificaciones entre las Partes deberan realizarse por escrito y ser entregados ya sea personalmente, por mensajeria especializada o por correo electronico y confirmado por el mismo medio, a los domicilios o direccion de correo electronico, senalados en la caratula de este acuerdo a no ser que las Partes notifiquen su cambio de domicilio o correo electronico en los terminos anteriores.</p>

<div class="contract-footer">
  <div class="signature-block">
    <div class="signature-line"></div>
    <div class="signature-label">Por ${d.tipo === 'marca' ? d.parte_a_nombre : 'BEME IMKT'}</div>
    <div class="signature-name">${d.parte_a_nombre}</div>
  </div>
  <div class="signature-block">
    <div class="signature-line"></div>
    <div class="signature-label">Por ${d.parte_b_nombre}</div>
    <div class="signature-name">${d.influencer_nombre}</div>
  </div>
</div>

<div class="contract-legal-footer">
  BEME IMKT &mdash; Influencer Marketing Agency<br>
  Este documento es confidencial y esta protegido por las leyes de propiedad intelectual aplicables.
</div>
</div>`;
}

function generateContractEN(d) {
  const fecha = formatDate(d.fecha_contrato, 'en');
  const derechos = d.derechos_imagen
    ? `<p><strong>IMAGE RIGHTS:</strong> ${d.derechos_dias || 0} days for $${d.derechos_valor || 0} ${d.moneda} from ${d.derechos_desde || 'publication date'}.</p>` : '';

  return `<div class="contract-header">
  <img src="/assets/brand/logos/Beme1Color.png" alt="Beme">
  <div class="contract-header-info">
    <div class="contract-num">${d.numero_contrato || 'Pending'}</div>
    <div>${d.ciudad_contrato || 'Mexico City'}, ${fecha}</div>
  </div>
</div>
<div class="contract-body">
<div class="contract-title">Confirmation Sheet</div>
<div class="contract-subtitle">Influencer Marketing Services Agreement</div>

<div class="contract-summary">
  <dt>Party A</dt><dd>${d.parte_a_nombre}${d.parte_a_rfc ? ' &mdash; Tax ID: ' + d.parte_a_rfc : ''}</dd>
  <dt>Party B</dt><dd>${d.parte_b_nombre}${d.parte_b_rfc ? ' &mdash; Tax ID: ' + d.parte_b_rfc : ''}</dd>
  <dt>Influencer(s)</dt><dd>${d.influencer_nombre}</dd>
  <dt>Brand / Product</dt><dd>${d.marca_producto}</dd>
  <dt>Services</dt><dd>${d.servicios}</dd>
  <dt>Channels</dt><dd>${d.canales}</dd>
  <dt>Hashtags</dt><dd>${d.hashtags || 'To be defined in Brief'}</dd>
  <dt>Rate</dt><dd>${d.tarifa_tipo === 'canje' ? 'Trade/Barter' : d.tarifa_tipo === 'mixto' ? 'Mixed' : 'Payment'} &mdash; <strong>$${Number(d.monto||0).toLocaleString()} ${d.moneda}</strong></dd>
</div>

${d.parte_a_domicilio ? `<p>On one part, <strong>${d.parte_a_nombre}</strong>${d.parte_a_domicilio ? ', domiciled at ' + d.parte_a_domicilio : ''}. And, on the other, <strong>${d.parte_b_nombre}</strong>${d.parte_b_domicilio ? ', domiciled at ' + d.parte_b_domicilio : ''}.</p>` : ''}

<p><strong>PAYMENT METHOD:</strong> As compensation for all services rendered by the INFLUENCER, ${d.tipo === 'marca' ? d.parte_a_nombre : 'BEME IMKT'} shall pay the amount of <strong>$${Number(d.monto||0).toLocaleString()} ${d.moneda}</strong>${d.monto_texto ? ' (' + d.monto_texto + ')' : ''}, to be made via ${d.metodo_pago || 'bank transfer'}, within ${d.plazo_pago_dias || 45} days after the campaign is published.</p>
${derechos}
<p><strong>ADDITIONAL COMMENTS:</strong> ${d.comentarios || 'All publications must include the designated hashtags and brand mention; failure to do so will result in non-payment. All content must be submitted for approval at least 48 hours in advance. Content may not be published without brand validation. Complete metrics must be submitted. No other products or brands may be shown within the Publications.'}</p>
<h2>ANNEX I — Declarations and Clauses</h2>
<p>Acceptance of this Confirmation Sheet is subject to the following terms and conditions:</p>
<ol>
<li>The Agency acknowledges that ${d.tipo === 'marca' ? d.parte_a_nombre : 'BEME IMKT'} has been commissioned by <strong>${d.marca_producto}</strong> (hereinafter, the "Brand") to identify one or more INFLUENCERS to carry out, under their sole and exclusive responsibility and with their own means and resources, the actions comprising the CAMPAIGN (hereinafter, the Publications).</li>
<li>Said Publications must comply with the requirements set forth in this Confirmation Sheet and remain visible on the INFLUENCER's social media profiles for twenty-four (24) hours for Stories, four (4) months for posts, and four (4) months for reels, TikToks, and video formats. The "remove from profile grid" option may not be used. Non-compliance shall be the INFLUENCER's responsibility, and BEME IMKT shall be held harmless.</li>
<li>The Influencer must keep comments active on all publications and may not disable them using "turn off commenting". Non-compliance may result in removal from the CAMPAIGN.</li>
<li>The Agency is responsible for conveying the brief and any additional instructions from the Brand to the INFLUENCER, being jointly liable for compliance.</li>
<li>BEME IMKT reserves the right to terminate the agreement early if the Influencer breaches any established clauses, Brief guidelines, or has damaged the Brand's image and/or reputation. Actions completed up to that point shall be paid.</li>
<li>The INFLUENCER will not sell products provided by the Brand on second-hand platforms (GO TRENDIER, MERCADO LIBRE, etc.) during the campaign and for twelve additional months after its conclusion.</li>
<li>During the term of this agreement, the INFLUENCER shall refrain from any act that may damage the brand's image or reputation. In case of non-compliance, the INFLUENCER shall bear any penalties, holding BEME IMKT harmless.</li>
<li>BEME IMKT shall not be responsible for the INFLUENCER's own opinions or behavior outside the scope of service provision.</li>
<li>BEME IMKT and/or the Brand reserve the right to reject Publications that infringe applicable regulations or may be considered hostile, inappropriate, or that violate fundamental rights.</li>
<li>The INFLUENCER must submit Publications to BEME IMKT at least 48 hours in advance for approval together with the Brand.</li>
<li>The INFLUENCER must have access to social media statistics and send all data to BEME IMKT before the platform deletes them.</li>
<li>"Paid media" or any paid promotion is excluded. A new agreement is required for paid media or use of content in other media.</li>
<li>If the INFLUENCER cannot meet the scheduled Publication date, notice must be given at least five (5) days prior, proposing an alternative date. The Brand, through BEME IMKT, shall accept or reject the new date.</li>
<li>Non-compliance with any obligation may result in early termination at BEME IMKT's discretion. The INFLUENCER shall only receive proportional payment for published content.</li>
<li>No other brands may be visible in content. "Neutral" accessories, wardrobe, and props must be used. Placement of other brands during the campaign period is prohibited.</li>
<li>The Parties commit to complying with the Federal Law on Protection of Personal Data (LFPDPPP) and adopting necessary measures for data protection.</li>
<li>The INFLUENCER agrees to create content in strict adherence to the style guide, treating it as Confidential Information.</li>
<li>The Parties assume confidentiality obligations during the agreement term and for 2 additional years. No financial, legal, commercial, or campaign-related information shall be disclosed.</li>
<li>The INFLUENCER shall not initiate commercial relationships with contacts known through this agreement without prior authorization. This non-circumvention duty remains in force for 1 year after termination.</li>
<li>The INFLUENCER warrants they are an independent professional with no employment relationship with BEME IMKT.</li>
<li>Disputes shall be resolved under the jurisdiction of Federal Courts in Mexico City. The parties waive any other jurisdiction.</li>
<li>Neither Party shall be liable for non-compliance resulting from force majeure.</li>
</ol>
<p>All notices must be in writing, delivered personally, by courier, or by email to the addresses indicated in this agreement.</p>

<div class="contract-footer">
  <div class="signature-block">
    <div class="signature-line"></div>
    <div class="signature-label">For ${d.tipo === 'marca' ? d.parte_a_nombre : 'BEME IMKT'}</div>
    <div class="signature-name">${d.parte_a_nombre}</div>
  </div>
  <div class="signature-block">
    <div class="signature-line"></div>
    <div class="signature-label">For ${d.parte_b_nombre}</div>
    <div class="signature-name">${d.influencer_nombre}</div>
  </div>
</div>

<div class="contract-legal-footer">
  BEME IMKT &mdash; Influencer Marketing Agency<br>
  This document is confidential and protected by applicable intellectual property laws.
</div>
</div>`;
}

// ══════════════════════════════════════════════════════════
// HANDLER
// ══════════════════════════════════════════════════════════

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { action, data, idioma } = JSON.parse(event.body);
    const lang = idioma === 'en' ? 'en' : 'es';

    // ── GENERATE: template, instant ──
    if (action === 'generate') {
      const html = lang === 'en' ? generateContractEN(data) : generateContractES(data);
      return { statusCode: 200, headers, body: JSON.stringify({ html }) };
    }

    // ── TRANSLATE: template in other language, instant ──
    if (action === 'translate') {
      const newLang = lang === 'es' ? 'en' : 'es';
      const html = newLang === 'en' ? generateContractEN(data) : generateContractES(data);
      return { statusCode: 200, headers, body: JSON.stringify({ html }) };
    }

    // ── CUSTOMIZE: AI with search/replace (small response, fast) ──
    if (action === 'customize') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }) };

      // Send the contract + instructions, ask for search/replace pairs
      const prompt = `Here is a legal contract in HTML:

${data.contenido_html}

The user wants these modifications:
"${data.instrucciones}"

Return a JSON array of find-and-replace operations. Each object has "find" (exact substring from the contract) and "replace" (the new text). Include enough context in "find" to be unique. For adding new clauses, use "find" to locate the insertion point (e.g. the closing </ol> tag) and include the new clause in "replace".

IMPORTANT: Return ONLY a valid JSON array. No markdown, no explanation. Example:
[{"find":"cuatro (4) meses para los posts","replace":"doce (12) meses para los posts"}]`;

      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'API error ' + response.status + ': ' + err.substring(0, 200) }) };
      }

      const result = await response.json();
      let aiText = result.content?.[0]?.text || '[]';

      // Clean markdown wrapping if present
      const jsonMatch = aiText.match(/```(?:json)?\n?([\s\S]*?)```/);
      if (jsonMatch) aiText = jsonMatch[1].trim();

      let html = data.contenido_html;
      try {
        const ops = JSON.parse(aiText);
        let applied = 0;
        for (const op of ops) {
          if (op.find && op.replace !== undefined && html.includes(op.find)) {
            html = html.split(op.find).join(op.replace);
            applied++;
          }
        }
        console.log(`Applied ${applied}/${ops.length} replacements`);
        if (applied === 0) {
          // Fallback: if no exact matches, return error with details
          return { statusCode: 200, headers, body: JSON.stringify({ html, warning: 'No se pudieron aplicar los cambios. Intenta con instrucciones mas especificas.' }) };
        }
      } catch(e) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'AI response invalida: ' + aiText.substring(0, 100) }) };
      }

      return { statusCode: 200, headers, body: JSON.stringify({ html }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid action' }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
