import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const SKILL = resolve(REPO, 'skills', 'wind-mcp-skill');
const read = relative => readFileSync(resolve(SKILL, relative), 'utf8');

const skill = read('SKILL.md');
const readme = read('README.md');
const contracts = read('references/tool-contracts.md');
const indicators = read('references/indicators.md');
const normalization = JSON.parse(read('references/normalization-rules.json'));
const validation = JSON.parse(read('references/tool-validation-rules.json'));
const errorCodes = JSON.parse(read('references/error-codes.json'));
const cli = read('scripts/cli.mjs');

test('quota, balance and rate-limit errors are independent', () => {
  assert.match(cli, /DAILY_LIMIT_ERROR/);
  assert.match(cli, /BALANCE_ERROR/);
  assert.match(cli, /RATE_LIMIT_ERROR/);
  assert.doesNotMatch(cli, /\['QUOTA_ERROR'/);
  for (const code of ['DAILY_LIMIT_ERROR', 'BALANCE_ERROR', 'RATE_LIMIT_ERROR']) {
    assert.equal(typeof errorCodes.codes[code], 'string');
  }
});

test('search_stocks has one unified stock-screening contract', () => {
  assert.equal((contracts.match(/^## 股票筛选$/gm) || []).length, 1);
  assert.doesNotMatch(contracts, /^## 港美股筛选$/m);
  assert.match(contracts, /A 股、港股或美股/);
});

test('stock indicator example is not split into A-share and US routes', () => {
  assert.match(indicators, /# 股票（A 股、港股、美股共用同一工具）/);
  assert.doesNotMatch(indicators, /^# A股$/m);
  assert.doesNotMatch(indicators, /^# 美股$/m);
});

test('no blanket single-target validator or calling recommendation remains', () => {
  assert.equal(validation.basic.single_target_keys, undefined);
  assert.doesNotMatch(cli, /single_target_keys/);
  assert.doesNotMatch(skill, /单次工具调用只允许一个标的/);
  assert.doesNotMatch(readme, /只支持单标的/);
});

test('foreign exchange is not declared unsupported', () => {
  for (const text of [skill, readme]) {
    assert.doesNotMatch(text, /外汇|汇率|forex/i);
  }
});

test('bare total market cap is not silently normalized', () => {
  assert.equal(normalization.indicator_aliases['总市值'], undefined);
  assert.equal(normalization.indicator_aliases['总市值含限售'], '总市值2');
  assert.equal(normalization.indicator_aliases['总市值不含限售'], '总市值1');
  assert.match(contracts, /用户只说“总市值”.*必须询问/);
  assert.match(indicators, /`总市值1` 是不含限售股/);
  assert.match(indicators, /`总市值2` 是含限售股/);
});

test('failure contract is structured and independent of internal docs', () => {
  assert.equal(errorCodes.schema_version, 7);
  assert.match(errorCodes.envelope_contract.failure, /details/);
  assert.match(errorCodes.envelope_contract.failure, /retry/);
  assert.match(errorCodes.envelope_contract.failure, /circuit_breaker/);
  assert.match(errorCodes.envelope_contract.failure, /correction/);
  for (const action of Object.values(errorCodes.codes)) {
    assert.doesNotMatch(action, /references\/|SKILL\.md/);
  }
});

test('NER and parameter errors trip the remaining-batch circuit breaker', () => {
  assert.match(cli, /abort_remaining_calls/);
  assert.match(skill, /circuit_breaker\.tripped=true/);
  assert.match(skill, /NER 失败时必须询问用户/);
});
