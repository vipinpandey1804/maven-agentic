/* ============================================================================
 * RAG TEST HARNESS  (development / testing only — not used in production)
 *
 * Run:
 *   node --experimental-sqlite tools/ragHarness.js "how many active employees?"
 *   node --experimental-sqlite tools/ragHarness.js              # runs default suite
 *   node --experimental-sqlite tools/ragHarness.js -i           # interactive mode
 *
 * For each query it prints:
 *   - the user's query
 *   - the retrieved SOURCES (rank, similarity score, type, title)
 *   - the LLM's ANSWER
 *   - a CLARITY assessment (grounding + confidence + flags)
 *
 * Requires DATABASE_URL (pg + pgvector) and an OpenAI key configured in Settings,
 * exactly like the running app. Reads the same code paths the app uses.
 * ==========================================================================*/
const readline = require('readline');
const rag = require('../src/services/ragService');
const { migrate } = require('../src/db/migrate');

const DEFAULT_QUERIES = [
  'hi',
  'how many active employees are there?',
  'list all active employees with their email and department',
  'what is Asha Verma salary history?',
  'whose salary slip failed last month?',
  'total payout in the last batch?',
  'what does Maven offer?',
  'what is the capital of France?', // off-topic guard check
];

const C = { reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', mag: '\x1b[35m' };
const bar = (n) => '█'.repeat(Math.round(n * 20)).padEnd(20, '·');

function clarity(answer, sources, usedLlm) {
  const top = sources[0]?.score ?? 0;
  const refused = /(do not have|don't have|off track|going off|knowledge base looks empty|requires postgre|add an openai)/i.test(answer);
  const grounded = sources.length > 0;
  let level, color;
  if (refused) { level = 'REFUSED/UNKNOWN'; color = C.yellow; }
  else if (top >= 0.5 && grounded) { level = 'HIGH'; color = C.green; }
  else if (top >= 0.3 && grounded) { level = 'MEDIUM'; color = C.yellow; }
  else { level = 'LOW'; color = C.red; }
  return { level, color, top, grounded, refused, usedLlm };
}

async function runOne(query) {
  const line = '─'.repeat(78);
  console.log(`\n${C.cyan}${line}${C.reset}`);
  console.log(`${C.bold}🟦 QUERY:${C.reset} ${query}`);

  // 1) retrieval — where the result comes from
  let sources = [];
  try {
    const hits = await rag.search(query, 8);
    sources = hits.map((h) => ({ title: h.title, type: h.source_type, score: Number(h.score) }));
  } catch (e) {
    console.log(`${C.red}  (retrieval skipped: ${e.message})${C.reset}`);
  }

  console.log(`\n${C.mag}📚 SOURCES (retrieved):${C.reset}`);
  if (!sources.length) console.log(`${C.dim}   (none — greeting/off-topic or empty index)${C.reset}`);
  sources.forEach((s, i) => {
    const sc = Number(s.score || 0);
    console.log(`   ${String(i + 1).padStart(2)}. ${C.dim}${bar(sc)}${C.reset} ${sc.toFixed(3)}  [${(s.type || '?').padEnd(14)}] ${s.title}`);
  });

  // 2) the actual answer
  const res = await rag.answer(query);
  console.log(`\n${C.bold}🤖 ANSWER${C.reset} ${C.dim}(LLM used: ${res.usedLlm})${C.reset}`);
  console.log('   ' + String(res.answer).replace(/\n/g, '\n   '));

  // 3) clarity assessment
  const cl = clarity(res.answer, res.sources || sources, res.usedLlm);
  console.log(`\n${C.bold}🎯 CLARITY:${C.reset} ${cl.color}${cl.level}${C.reset}  ` +
    `${C.dim}top-score=${cl.top.toFixed(3)} | grounded=${cl.grounded} | refused=${cl.refused} | llm=${cl.usedLlm}${C.reset}`);
}

async function main() {
  await migrate(); // ensure tables exist
  const args = process.argv.slice(2);

  if (args[0] === '-i' || args[0] === '--interactive') {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = () => rl.question(`\n${C.cyan}rag>${C.reset} ask a query (or "exit"): `, async (q) => {
      if (!q || q.trim().toLowerCase() === 'exit') { rl.close(); process.exit(0); }
      try { await runOne(q.trim()); } catch (e) { console.error(C.red + e.stack + C.reset); }
      ask();
    });
    console.log(`${C.bold}RAG harness — interactive mode.${C.reset}`);
    ask();
    return;
  }

  const queries = args.length ? [args.join(' ')] : DEFAULT_QUERIES;
  console.log(`${C.bold}RAG harness — running ${queries.length} query(ies)${C.reset}`);
  for (const q of queries) {
    try { await runOne(q); } catch (e) { console.error(`${C.red}ERROR on "${q}": ${e.message}${C.reset}`); }
  }
  console.log(`\n${C.green}Done.${C.reset}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
