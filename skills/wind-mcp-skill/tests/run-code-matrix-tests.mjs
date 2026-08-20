// Deterministic test of the CLI's business-code success boundary.
// Contract: inner data.code === 0 OR any 2xx (200..299) => success; anything
// else => backend_error. Both number and string code forms must agree.
// No network, no credentials — uses tests/mock-code.mjs to fake the backend.
// Usage: node tests/run-code-matrix-tests.mjs
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = dirname(TESTS_DIR);
const CLI = join(SKILL_DIR, 'scripts', 'cli.mjs');
const PRELOAD = join(TESTS_DIR, 'mock-code.mjs');

// [code, asString, expectSuccess]
const CASES = [
  ['0', false, true], ['200', false, true], ['201', false, true], ['250', false, true], ['299', false, true],
  ['200', true, true], ['0', true, true],
  ['1', false, false], ['2', false, false], ['100', false, false], ['199', false, false],
  ['300', false, false], ['400', false, false], ['404', false, false], ['500', false, false],
  ['1003', false, false], ['-1', false, false], ['1003', true, false],
];

let pass = 0, fail = 0;
for (const [code, asStr, expectSuccess] of CASES) {
  const env = { ...process.env, WIND_API_KEY: 'test-key-dummy', WIND_MOCK_CODE: code, WIND_MOCK_STR: asStr ? '1' : '0' };
  const r = spawnSync('node', ['--import', PRELOAD, CLI, 'call', 'stock_data', 'get_stock_basicinfo', '{"question":"x"}'], { env, encoding: 'utf8' });
  let ok = null, ecode = null;
  try { const d = JSON.parse(r.stdout); ok = !(d && d.ok === false); ecode = d?.code; } catch { /* unparseable */ }
  const good = expectSuccess ? (ok === true) : (ok === false && ecode === 'backend_error');
  good ? pass++ : fail++;
  const label = `code=${code}${asStr ? '(str)' : ''}`;
  process.stdout.write(`${good ? 'PASS' : 'FAIL'}  ${label.padEnd(14)} expect ${expectSuccess ? 'success' : 'backend_error'} -> got ${ok === true ? 'success' : (ok === false ? ecode : 'unparseable')}\n`);
}
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
