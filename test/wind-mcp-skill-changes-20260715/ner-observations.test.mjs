import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const SKILL = resolve(REPO, 'skills', 'wind-mcp-skill');
const CLI = resolve(SKILL, 'scripts', 'cli.mjs');

function call(windcode) {
  const params = { windcode, begin_date: '20260708', end_date: '20260708', period: '10' };
  const run = spawnSync(process.execPath, [CLI, 'call', 'index_data', 'get_index_kline', JSON.stringify(params)], {
    cwd: SKILL,
    encoding: 'utf8',
    timeout: 660_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  assert.ok(run.stdout.trim(), `empty stdout for ${windcode}: ${run.stderr}`);
  const output = JSON.parse(run.stdout);
  console.log(JSON.stringify({ windcode, exitCode: run.status, output }, null, 2));
  return { status: run.status, output };
}

function assertSuccessOrStructuredNer(result, original) {
  if (result.status === 0) {
    assert.ok(Array.isArray(result.output.content));
    return;
  }
  if (result.output.error.code === 'NETWORK_ERROR') {
    assert.equal(result.output.error.retry.allowed, true);
    assert.equal(result.output.error.retry.max_attempts, 1);
    return 'network_error';
  }
  assert.equal(result.output.error.code, 'MARKET_TARGET_NOT_FOUND');
  assert.equal(result.output.error.details.original_input, original);
  assert.ok(result.output.error.details.attempted_inputs.length >= 1);
  assert.equal(result.output.error.circuit_breaker.tripped, true);
  assert.equal(result.output.error.correction.requires_user_input, true);
  return 'ner_error';
}

test('observe real RUT NER behavior', () => {
  assertSuccessOrStructuredNer(call('RUT'), 'RUT');
});

test('observe real Chinese Russell 2000 NER behavior', () => {
  const first = call('罗素2000');
  const outcome = assertSuccessOrStructuredNer(first, '罗素2000');
  if (outcome === 'network_error') {
    const retry = call('罗素2000');
    assertSuccessOrStructuredNer(retry, '罗素2000');
  }
});

test('observe real BDTI.HI NER behavior', () => {
  assertSuccessOrStructuredNer(call('BDTI.HI'), 'BDTI.HI');
});
