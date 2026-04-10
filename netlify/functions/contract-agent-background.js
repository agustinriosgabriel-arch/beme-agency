// Netlify Background Function: AI Contract Customization
// POST /.netlify/functions/contract-agent-background
// Returns 202 immediately, processes async, saves result to Supabase
// Body: { contractId, accessToken, instrucciones, contenido_html }

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const SUPABASE_URL = 'https://ngstqwbzvnpggpklifat.supabase.co';
const SUPABASE_KEY = 'sb_publishable_1E2K-9D-KzOSVCgROnfa-g_-WCnWCDb';

async function saveToSupabase(contractId, html, accessToken) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/contratos?id=eq.${contractId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${accessToken}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      contenido_html: html,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) console.error('Supabase save error:', await res.text());
  else console.log('Saved to Supabase, contract:', contractId);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405 };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not set');
    return { statusCode: 200 };
  }

  try {
    const { contractId, accessToken, instrucciones, contenido_html } = JSON.parse(event.body);
    console.log('Background: customizing contract', contractId);

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        system: 'You are a legal assistant for BEME IMKT, a Mexican influencer marketing agency. Modify the contract HTML based on the user instructions. Return ONLY the modified HTML, no markdown, no code blocks, no explanation.',
        messages: [{
          role: 'user',
          content: `Modify this contract based on these instructions:\n\n"${instrucciones}"\n\nContract HTML:\n${contenido_html}`,
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('API error:', response.status, err);
      await saveToSupabase(contractId, contenido_html + `\n<!-- AI_ERROR: ${response.status} -->`, accessToken);
      return { statusCode: 200 };
    }

    const result = await response.json();
    let html = result.content?.[0]?.text || '';
    const htmlMatch = html.match(/```html\n?([\s\S]*?)```/);
    if (htmlMatch) html = htmlMatch[1].trim();

    console.log('AI done, tokens:', JSON.stringify(result.usage));
    await saveToSupabase(contractId, html, accessToken);

  } catch (err) {
    console.error('Background error:', err);
    try {
      const { contractId, accessToken, contenido_html } = JSON.parse(event.body);
      await saveToSupabase(contractId, contenido_html + `\n<!-- AI_ERROR: ${err.message} -->`, accessToken);
    } catch(e) {}
  }

  return { statusCode: 200 };
};
