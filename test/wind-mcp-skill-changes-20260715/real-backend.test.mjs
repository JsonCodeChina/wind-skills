import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const SKILL = resolve(REPO, 'skills', 'wind-mcp-skill');
const CLI = resolve(SKILL, 'scripts', 'cli.mjs');

function call(serverType, toolName, params, timeout = 660_000) {
  const run = spawnSync(process.execPath, [CLI, 'call', serverType, toolName, JSON.stringify(params)], {
    cwd: SKILL,
    encoding: 'utf8',
    timeout,
    maxBuffer: 20 * 1024 * 1024,
  });
  assert.equal(run.signal, null, `${serverType}.${toolName} timed out or was terminated: ${run.signal}`);
  assert.ok(run.stdout.trim(), `${serverType}.${toolName} returned empty stdout; stderr=${run.stderr}`);
  let output;
  try {
    output = JSON.parse(run.stdout);
  } catch (error) {
    assert.fail(`stdout is not JSON: ${error.message}\n${run.stdout.slice(0, 1000)}`);
  }
  console.log(JSON.stringify({ serverType, toolName, params, exitCode: run.status, output }, null, 2));
  return { ...run, output };
}

function assertBackendSuccess(result) {
  assert.equal(result.status, 0, JSON.stringify(result.output));
  assert.notEqual(result.output?.ok, false, JSON.stringify(result.output));
  assert.ok(Array.isArray(result.output?.content), 'successful call should return MCP result.content');
}

test('A-share stock screening uses unified search_stocks', () => {
  assertBackendSuccess(call('stock_data', 'search_stocks', {
    question: '筛选A股中的银行股',
    lang: '中文',
  }));
});

test('Hong Kong stock screening uses the same search_stocks tool', () => {
  assertBackendSuccess(call('stock_data', 'search_stocks', {
    question: '筛选港股中的科技股',
    lang: '中文',
  }));
});

test('US stock screening uses the same search_stocks tool', () => {
  assertBackendSuccess(call('stock_data', 'search_stocks', {
    question: '筛选美股中的半导体股',
    lang: '中文',
  }));
});

test('A-share and US price indicators use the same tool', () => {
  assertBackendSuccess(call('stock_data', 'get_stock_price_indicators', {
    windcode: '600519.SH',
    indexes: '中文简称,最新成交价,涨跌幅',
  }));
  assertBackendSuccess(call('stock_data', 'get_stock_price_indicators', {
    windcode: 'AAPL.O',
    indexes: '中文简称,最新成交价,涨跌幅',
  }));
});

test('both explicit market-cap calibers reach the real backend', () => {
  assertBackendSuccess(call('stock_data', 'get_stock_price_indicators', {
    windcode: '600026.SH',
    indexes: '中文简称,总市值1',
  }));
  assertBackendSuccess(call('stock_data', 'get_stock_price_indicators', {
    windcode: '600026.SH',
    indexes: '中文简称,总市值2',
  }));
});

test('known index alias reaches real K-line backend', () => {
  assertBackendSuccess(call('index_data', 'get_index_kline', {
    windcode: 'DJI',
    begin_date: '2026-07-08',
    end_date: '2026-07-08',
    period: '10',
  }));
});

test('real NER failure returns structured inputs and trips batch circuit breaker', () => {
  const result = call('index_data', 'get_index_kline', {
    windcode: '__CODEX_NER_NOT_FOUND_20260715__',
    begin_date: '2026-07-08',
    end_date: '2026-07-08',
    period: '10',
  });
  assert.equal(result.status, 1);
  assert.equal(result.output.error.code, 'MARKET_TARGET_NOT_FOUND');
  assert.equal(result.output.error.details.original_input, '__CODEX_NER_NOT_FOUND_20260715__');
  assert.deepEqual(result.output.error.details.attempted_inputs, ['__CODEX_NER_NOT_FOUND_20260715__']);
  assert.equal(result.output.error.circuit_breaker.tripped, true);
  assert.equal(result.output.error.circuit_breaker.action, 'abort_remaining_calls');
  assert.equal(result.output.error.correction.requires_user_input, true);
  assert.equal(result.output.error.retry.allowed, false);
});

test('multi-target windcode is no longer rejected by local single-target validation', () => {
  const result = call('stock_data', 'get_stock_price_indicators', {
    windcode: '600519.SH,000001.SZ',
    indexes: '中文简称,最新成交价',
  });
  if (result.status === 1) {
    assert.notEqual(result.output.error.code, 'PARAM_VALIDATION_ERROR');
    assert.notEqual(result.output.error.code, 'PARAM_TYPE_ERROR');
  } else {
    assertBackendSuccess(result);
  }
});

test('invalid params are short-circuited with inline expectations before backend call', () => {
  const result = call('economic_data', 'natural_language_get_edb_data', {
    executionMode: 'retrieve',
    question: '中国GDP',
    beginDate: '20200101',
    endDate: '2026-07-09',
  });
  assert.equal(result.status, 1);
  assert.equal(result.output.error.code, 'INVALID_PARAM_VALUE');
  assert.equal(result.output.error.circuit_breaker.tripped, true);
  assert.equal(result.output.error.circuit_breaker.action, 'abort_remaining_calls');
  const details = result.output.error.details;
  assert.ok(details.some(item => item.field === 'beginDate' && item.expected_format === 'yyyy-MM-dd'));
  assert.ok(details.some(item => item.field === 'executionMode' && item.allowed_values.includes('searchFetch')));
});

test('double-serialized params report only the root params type error', () => {
  const params = JSON.stringify({ question: 'VLCC产业链' });
  const result = call('analytics_data', 'get_financial_data', params);
  assert.equal(result.status, 1);
  assert.equal(result.output.error.code, 'PARAM_TYPE_ERROR');
  assert.equal(result.output.error.details.length, 1);
  assert.equal(result.output.error.details[0].field, 'params');
  assert.equal(result.output.error.details[0].expected_type, 'object');
  assert.doesNotMatch(result.output.error.agent_action, /缺少.*question/);
});
