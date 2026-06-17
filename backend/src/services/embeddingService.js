// Embeddings with two backends:
//  - OpenAI text-embedding-3-small (1536 dims) when an OpenAI key is set
//  - deterministic local hashing embedding (256 dims) otherwise (offline / tests)
// Embeddings need OpenAI specifically (Anthropic has no embeddings endpoint),
// so we look at openaiApiKey regardless of the chat provider selection.
const settings = require('./settingsService');

const LOCAL_DIM = 256;
const LOCAL_MODEL = 'local-hash-256';

function localEmbed(text) {
  const v = new Array(LOCAL_DIM).fill(0);
  const toks = String(text).toLowerCase().match(/[a-z0-9]+/g) || [];
  for (const t of toks) {
    // FNV-1a hash -> bucket; simple but stable bag-of-words signal
    let h = 2166136261;
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
    v[Math.abs(h) % LOCAL_DIM] += 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

async function backend() {
  const cfg = await settings.get('llm');
  if (cfg.openaiApiKey) return { kind: 'openai', key: cfg.openaiApiKey, model: 'text-embedding-3-small' };
  return { kind: 'local', model: LOCAL_MODEL };
}

async function info() {
  const b = await backend();
  return { backend: b.kind, model: b.model, dim: b.kind === 'openai' ? 1536 : LOCAL_DIM };
}

/** Embed an array of strings -> { vectors:number[][], model, dim } */
async function embed(texts) {
  const list = Array.isArray(texts) ? texts : [texts];
  const b = await backend();
  if (b.kind === 'openai') {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${b.key}` },
      body: JSON.stringify({ model: b.model, input: list }),
    });
    if (!res.ok) throw new Error(`OpenAI embeddings ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const vectors = data.data.map((d) => d.embedding);
    return { vectors, model: b.model, dim: vectors[0]?.length || 1536 };
  }
  return { vectors: list.map(localEmbed), model: LOCAL_MODEL, dim: LOCAL_DIM };
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / ((Math.sqrt(na) * Math.sqrt(nb)) || 1);
}

module.exports = { embed, info, cosine, localEmbed, LOCAL_DIM, LOCAL_MODEL };
