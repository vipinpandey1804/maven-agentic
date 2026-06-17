// Provider-agnostic LLM client. Reads provider + key from settings (admin panel).
// Uses global fetch (Node 18+). Falls back gracefully when no key is configured.
const settings = require('./settingsService');

async function getConfig() {
  const llm = await settings.get('llm');
  const provider = llm.provider || 'anthropic';
  if (provider === 'openai') {
    return { provider, apiKey: llm.openaiApiKey, model: llm.openaiModel || 'gpt-4o' };
  }
  return { provider: 'anthropic', apiKey: llm.apiKey, model: llm.model || 'claude-sonnet-4-6' };
}

async function isConfigured() {
  const { apiKey } = await getConfig();
  return !!apiKey;
}

/**
 * Single-shot completion. Returns the model's text.
 * @param {{system?:string, user:string, maxTokens?:number, json?:boolean}} opts
 */
async function complete({ system = '', user, maxTokens = 1024, json = false }) {
  const { provider, apiKey, model } = await getConfig();
  if (!apiKey) {
    const err = new Error('LLM not configured - add an API key in Settings > LLM');
    err.code = 'LLM_NOT_CONFIGURED';
    throw err;
  }
  const sys = system + (json ? '\nRespond with valid JSON only, no markdown fences.' : '');

  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [...(sys ? [{ role: 'system', content: sys }] : []), { role: 'user', content: user }],
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  // anthropic
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model, max_tokens: maxTokens,
      ...(sys ? { system: sys } : {}),
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

// parse JSON the model returned, tolerating stray fences/prose
function parseJson(text) {
  let t = String(text).trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  const start = t.indexOf('{');
  const startArr = t.indexOf('[');
  const s = startArr !== -1 && (start === -1 || startArr < start) ? startArr : start;
  if (s > 0) t = t.slice(s);
  return JSON.parse(t);
}

module.exports = { isConfigured, complete, parseJson, getConfig };
