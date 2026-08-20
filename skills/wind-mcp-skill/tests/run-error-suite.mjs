// Runs tests/error-suite.cases.json against the real cli.mjs with a mock backend
// (capture-fetch.mjs stands in for the network so validation-passing calls return
// a deterministic success). Asserts each case's {ok, code}. No key / network needed.
//   node tests/run-error-suite.mjs            # run all, summarize, list mismatches
//   node tests/run-error-suite.mjs --only route-wrong-tool   # filter by category
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = dirname(TESTS_DIR);
const CLI = join(SKILL_DIR, 'scripts', 'cli.mjs');
const MOCK = join(TESTS_DIR, 'capture-fetch.mjs');
const CASES = JSON.parse(readFileSync(join(TESTS_DIR, 'error-suite.cases.json'), 'utf8'));

const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null;
const env = { ...process.env, WIND_API_KEY: 'test-key-dummy' };

function runOne(argv) {
  const r = spawnSync('node', ['--import', MOCK, CLI, ...argv], { env, encoding: 'utf8', timeout: 30000 });
  let ok = null, code = null;
  try {
    const d = JSON.parse(r.stdout);
    if (d && d.ok === false) { ok = false; code = d.code; } else ok = true;
  } catch { ok = null; }
  return { ok, code, exit: r.status };
}

let pass = 0, fail = 0;
const byCat = {};
const mismatches = [];
for (const c of CASES) {
  if (only && c.category !== only) continue;
  const a = runOne(c.argv);
  const want = c.expect;
  const good = want.ok === true
    ? a.ok === true
    : (a.ok === false && a.code === want.code);
  byCat[c.category] ??= { pass: 0, fail: 0 };
  good ? (pass++, byCat[c.category].pass++) : (fail++, byCat[c.category].fail++, mismatches.push({ c, a }));
}

console.log('category                 pass  fail');
for (const [cat, v] of Object.entries(byCat).sort()) {
  console.log(`  ${cat.padEnd(22)} ${String(v.pass).padStart(4)} ${String(v.fail).padStart(5)}${v.fail ? '  <=' : ''}`);
}
console.log(`\nTOTAL ${pass + fail}  PASS=${pass}  FAIL=${fail}`);
if (mismatches.length) {
  console.log(`\n--- mismatches (expected vs actual) [${mismatches.length}] ---`);
  for (const m of mismatches.slice(0, 60)) {
    const want = m.c.expect.ok === true ? 'success' : m.c.expect.code;
    const got = m.a.ok === true ? 'success' : (m.a.ok === false ? m.a.code : `unparseable(exit=${m.a.exit})`);
    console.log(`  ${m.c.id} [${m.c.angle}]  want ${want}  got ${got}`);
    console.log(`      argv: ${JSON.stringify(m.c.argv)}`);
  }
  if (mismatches.length > 60) console.log(`  ... +${mismatches.length - 60} more`);
}
process.exit(fail ? 1 : 0);
