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
    ? `<p><strong>DERECHOS DE IMAGEN:</strong> ${d.derechos_dias || 0} días por $${d.derechos_valor || 0} ${d.moneda} desde ${d.derechos_desde || 'la publicación'}.</p>` : '';
  const sparkCode = d.spark_code
    ? `<p><strong>SPARK CODE:</strong> Sí, se otorga spark code para uso en promoción pagada del contenido.</p>` : '';

  // Cláusulas dinámicas
  const clausulaDerechos = d.derechos_imagen
    ? `<li>El INFLUENCER cede los derechos de uso de imagen por un periodo de ${d.derechos_dias || 0} días a partir de ${d.derechos_desde || 'la fecha de publicación'}, por un valor adicional de $${d.derechos_valor || 0} ${d.moneda}. Durante dicho periodo, la Marca y/o BEME IMKT podrán utilizar la imagen del INFLUENCER en materiales promocionales relacionados con la CAMPAÑA. Una vez finalizado el periodo, todo uso de la imagen del INFLUENCER deberá cesar de inmediato, salvo que se acuerde una extensión por escrito entre las partes.</li>` : '';
  const clausulaSpark = d.spark_code
    ? `<li>El INFLUENCER se compromete a proporcionar el spark code del contenido publicado para que la Marca pueda utilizarlo en campañas de promoción pagada (paid media). El spark code deberá ser entregado dentro de las 24 horas siguientes a la publicación del contenido. El uso del spark code queda limitado exclusivamente a la promoción del contenido creado en el marco de esta CAMPAÑA.</li>` : '';

  return `<h1>HOJA DE CONFIRMACIÓN</h1>
<p><em>${d.ciudad_contrato || 'Mexico City'}, ${fecha}</em></p>
<p>De una parte, <strong>${d.parte_a_nombre}</strong>${d.parte_a_rfc ? ' con RFC ' + d.parte_a_rfc : ''}${d.parte_a_domicilio ? ' y domiciliado en ' + d.parte_a_domicilio : ''}. Y, de otra, <strong>${d.parte_b_nombre}</strong>${d.parte_b_rfc ? ' con RFC ' + d.parte_b_rfc : ''}${d.parte_b_domicilio ? ', domiciliado en ' + d.parte_b_domicilio : ''}. <strong>NÚMERO DE CONTRATO: ${d.numero_contrato || 'Pendiente'}</strong></p>
<p><strong>INFLUENCER/S:</strong> ${d.influencer_nombre}</p>
<p><strong>SERVICIOS:</strong> ${d.servicios}</p>
<p><strong>CANALES:</strong> ${d.canales}</p>
<p><strong>HASHTAGS:</strong> ${d.hashtags || 'A Definir en Brief'}</p>
<p><strong>MARCA/PRODUCTO:</strong> ${d.marca_producto}</p>
<p><strong>TARIFA:</strong> ${d.tarifa_tipo === 'canje' ? 'Canje' : d.tarifa_tipo === 'mixto' ? 'Mixto' : 'Pago'}</p>
<p><strong>MÉTODO DE PAGO:</strong> Como contraprestación por la totalidad de los servicios prestados por el INFLUENCER, ${d.tipo === 'marca' ? d.parte_a_nombre : 'BEME IMKT'} pagará la cantidad de <strong>$${Number(d.monto||0).toLocaleString()} ${d.moneda}</strong>${d.monto_texto ? ' (' + d.monto_texto + ')' : ''}, que se efectuará mediante ${d.metodo_pago || 'transferencia bancaria'}, dentro del plazo de ${d.plazo_pago_dias || 45} días una vez publicada la campaña.</p>
${derechos}
${sparkCode}
<p><strong>COMENTARIOS ADICIONALES:</strong> ${d.comentarios || 'En todas las publicaciones se deberá colocar los hashtags y mención a marca. Todo el contenido generado deberá enviarse para aprobación con 48 hrs de antelación para que la marca pueda validar y realizar los ajustes pertinentes. No se podrá publicar contenido sin validar por la marca. Deberás enviar las métricas completas correspondientes de cada contenido, así como los testigos de lo contrario no se podrá hacer el pago de la publicación. No mostrar otros productos o marcas dentro de las Publicaciones.'}</p>
<h2>ANEXO I — Declaraciones y Cláusulas</h2>
<p>La aceptación de esta Hoja de Confirmación queda sujeta a los siguientes términos y condiciones:</p>
<ol>
<li>${d.tipo === 'marca' ? d.parte_b_nombre : 'La Agencia'} es conocedora de que ${d.tipo === 'marca' ? d.parte_a_nombre : 'BEME IMKT'} ha recibido el encargo de la <strong>${d.marca_producto}</strong> (en adelante, la "Marca") de identificar uno o varios INFLUENCERS, para que estos lleven a cabo, bajo su única y exclusiva responsabilidad y con sus propios medios y recursos, las acciones integrantes de la CAMPAÑA (en adelante, las Publicaciones).</li>
<li>Las Publicaciones deberán cumplir los requisitos exigidos en esta Hoja de Confirmación, así como permanecer visibles en los perfiles sociales del INFLUENCER por un plazo de veinticuatro (24) horas para los Stories, cuatro (4) meses para los posts y cuatro (4) meses para reels, tiktoks y formatos de video, no pudiendo utilizar la opción de "remove from profile grid". El incumplimiento de lo anterior será responsabilidad del INFLUENCER, quedando BEME IMKT indemne frente a cualesquiera acciones legales que se pudieran derivar de las Publicaciones.</li>
<li>El Influencer deberá mantener activos los comentarios en las publicaciones, no pudiendo desactivarlos en ningún caso mediante la opción "turn off commenting". El incumplimiento de lo anterior pudiendo ocasionar la baja del Influencer de la CAMPAÑA.</li>
<li>La Agencia es responsable de trasladar al INFLUENCER el brief y cualesquiera indicaciones o directrices adicionales recibidas de la Marca, siendo obligados solidarios con el INFLUENCER al cumplimiento de esta obligación.</li>
<li>BEME IMKT se reserva el derecho de terminar anticipadamente el acuerdo si el Influencer incumple cualquiera de las declaraciones y cláusulas establecidas, directrices integrantes del Brief o ha dañado la imagen y/o reputación de la Marca, la Campaña y/o los productos objeto de la presente prestación de servicios. Se pagarán las acciones realizadas hasta dicho momento.</li>
<li>La Agencia manifiesta y garantiza que el INFLUENCER no pondrá a la venta los productos proporcionados por la Marca y/o BEME IMKT para su promoción, en plataformas de productos de segunda mano (como GO TRENDIER, MERCADO LIBRE, entre otras) durante la vigencia de la campaña y por un periodo de doce meses adicionales tras la finalización de la misma.</li>
<li>Durante la vigencia del presente acuerdo, el INFLUENCER deberá abstenerse de cualquier acto y/o manifestación sobre la marca o producto que pueda dañar la imagen y/o reputación de la misma, los productos de esta o de la Campaña objeto del presente acuerdo. En caso de incumplimiento, el INFLUENCER hará frente a cualquier penalización por daños y perjuicios que se produzcan, dejando a BEME IMKT indemne.</li>
<li>BEME IMKT no será responsable de las opiniones o comportamiento propios del INFLUENCER que realicen de forma ajena de la prestación de los servicios.</li>
<li>En todo caso, BEME IMKT y/o la Marca, se reservan el derecho a rechazar las Publicaciones que, razonablemente, considere que infringen la normativa aplicable o puedan ser consideradas hostiles, groseras o inapropiadas o que puedan vulnerar derechos fundamentales. BEME IMKT deberá comunicar al INFLUENCER dicha eventualidad, a ser posible con antelación suficiente, para que este pueda entregar materiales alternativos.</li>
<li>El INFLUENCER deberá enviar a BEME IMKT, con un mínimo de 48 (cuarenta y ocho) horas de anticipación, las Publicaciones realizadas, antes de ser publicadas y para su aprobación junto a la Marca.</li>
<li>El INFLUENCER deberá tener acceso a las estadísticas de la red social utilizada para ejecutar la Campaña y deberá enviar a BEME IMKT, todos los datos reflejados en las mismas antes de que la red las borre.</li>
<li>La modalidad de "paid media" o cualquier tipo de promoción pagada, quedan excluidas. En el caso de que la MARCA quisiera hacer paid media y/o utilizar los contenidos creados por el INFLUENCER en otros medios online y offline que no sean expresamente pactados en el presente contrato, un nuevo acuerdo tendrá que suscribirse entre las partes.</li>
<li>En caso de imposibilidad de cumplir por parte del INFLUENCER con la fecha prevista para la Publicación en sus redes sociales, la Agencia comunicará a BEME IMKT, a no más tardar cinco (5) días previos a la fecha de Publicación, la causa de dicha imposibilidad y propondrá una fecha alternativa. La Marca, a través de BEME IMKT, será la única y exclusivamente facultada de aceptar o rechazar la nueva fecha de publicación.</li>
<li>El incumplimiento de cualquier obligación aquí prevista podrá dar lugar a la terminación anticipada del presente acuerdo a la absoluta discreción de BEME IMKT. En este caso, el INFLUENCER solo recibirá la tarifa proporcional al contenido que ha publicado, perdiendo el derecho a recibir el pago de la tarifa restante.</li>
<li>Para todos los contenidos que se realicen con la marca, no pueden existir otras marcas visibles en fotos, videos o audios, ya sean marcas de otras categorías, de la competencia o de la misma compañía contratante. Durante la creación del contenido, se deben utilizar accesorios, vestuario y/o utilería, "neutra", respetando que el contenido realizado sea exclusivo para la marca que lo patrocina. Por tanto, queda prohibido el placement de otras marcas en la producción de contenido durante el periodo de campaña.</li>
<li>En caso de que la información compartida por las Partes, incluya Datos Personales y/o Datos Personales Sensibles en los términos del artículo 3 Fracción V y VI de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (en lo sucesivo "LFPDPPP"), las Partes se comprometen a cumplir con las obligaciones que les correspondan y que se desprendan de dicha legislación. Cada parte se obliga a adoptar las medidas, mecanismos y procedimientos necesarios para la protección de los Datos Personales.</li>
<li>El INFLUENCER se obliga a crear contenido en estricto apego a la guía de estilo y se obliga a utilizar la guía de estilo únicamente para la CAMPAÑA, tratando la guía de estilo como Información Confidencial.</li>
<li>Las Partes asumen esta obligación de confidencialidad durante la vigencia de este acuerdo y en un plazo adicional de 2 años contados a partir de la terminación del mismo. Las Partes reconocen y convienen que por ningún motivo divulgarán o revelarán, cualquier información financiera, contable, legal, corporativa, comercial, industrial, de negocios, planes, programas, secretos industriales, ideas creativas, conversaciones, negociaciones o contenido en general relacionado con la CAMPAÑA que les sea revelada durante la vigencia de este acuerdo.</li>
<li>El INFLUENCER reconoce y acepta que no iniciará relaciones comerciales directamente con los contactos comerciales, proveedores, Marcas de la otra Parte que hubiere conocido en virtud de la celebración del presente acuerdo. En el supuesto de que alguna de las Partes desee iniciar relaciones comerciales con dichos contactos, podrá hacerlo previa notificación y autorización de la otra Parte. El presente deber de no elusión continuará vigente 1 (un) año posterior a la terminación de la vigencia.</li>
<li>El INFLUENCER garantiza que está al corriente en el cumplimiento de sus obligaciones laborales y sociales, manifestando y garantizando asimismo que el INFLUENCER es un profesional independiente que interviene por cuenta propia, sin que exista por tanto, ni se cree ningún tipo de vínculo laboral con BEME IMKT, quien queda exonerada de cualquier tipo de obligación de carácter laboral o social respecto del INFLUENCER.</li>
${clausulaDerechos}
${clausulaSpark}
<li>Las partes aceptan que todo lo no previsto en este acuerdo se regirá por las disposiciones en la materia, ya de índole local de la Ciudad de México o federal según corresponda. En caso de que las Partes no puedan resolver alguna Controversia, se resolverá por la jurisdicción de los Tribunales Federales con sede en la Ciudad de México. Renunciando las partes a cualquier otra jurisdicción que les corresponda por su domicilio o nacionalidad.</li>
<li>Las Partes de ninguna manera serán responsables por el rechazo o falta de cumplimiento a las obligaciones que asume en el presente Contrato, cuando estos deriven de caso fortuito o causas de fuerza mayor dentro de su empresa o imputable a sus proveedores.</li>
</ol>
<p>Todos los avisos y notificaciones entre las Partes deberán realizarse por escrito y ser entregados ya sea personalmente, por mensajería especializada o por correo electrónico y confirmado por el mismo medio, a los domicilios o dirección de correo electrónico, señalados en la carátula de este acuerdo a no ser que las Partes notifiquen su cambio de domicilio o correo electrónico en los términos anteriores.</p>`;
}

function generateContractEN(d) {
  const fecha = formatDate(d.fecha_contrato, 'en');
  const derechos = d.derechos_imagen
    ? `<p><strong>IMAGE RIGHTS:</strong> ${d.derechos_dias || 0} days for $${d.derechos_valor || 0} ${d.moneda} from ${d.derechos_desde || 'publication date'}.</p>` : '';
  const sparkCode = d.spark_code
    ? `<p><strong>SPARK CODE:</strong> Yes, spark code is granted for paid promotion of the content.</p>` : '';

  const clausulaDerechos = d.derechos_imagen
    ? `<li>The INFLUENCER grants image usage rights for a period of ${d.derechos_dias || 0} days from ${d.derechos_desde || 'the publication date'}, for an additional value of $${d.derechos_valor || 0} ${d.moneda}. During this period, the Brand and/or BEME IMKT may use the INFLUENCER's image in promotional materials related to the CAMPAIGN. Once the period ends, all use of the INFLUENCER's image must cease immediately, unless an extension is agreed in writing between the parties.</li>` : '';
  const clausulaSpark = d.spark_code
    ? `<li>The INFLUENCER agrees to provide the spark code for published content so the Brand may use it in paid promotion campaigns (paid media). The spark code must be delivered within 24 hours of content publication. The use of the spark code is limited exclusively to promoting content created under this CAMPAIGN.</li>` : '';

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
${sparkCode}
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
${clausulaDerechos}
${clausulaSpark}
<li>Disputes shall be resolved under the jurisdiction of Federal Courts in Mexico City. The parties waive any other jurisdiction.</li>
<li>Neither Party shall be liable for non-compliance resulting from force majeure.</li>
</ol>
<p>All notices must be in writing, delivered personally, by courier, or by email to the addresses indicated in this agreement.</p>`;
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
