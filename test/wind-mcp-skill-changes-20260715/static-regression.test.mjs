import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const SKILL = resolve(REPO, 'skills', 'wind-mcp-skill');
const read = relative => readFileSync(resolve(SKILL, relative), 'utf8');

const skill = read('SKILL.md');
const readme = read('README.md');
const contractFiles = [
  'references/contracts/stock-data.md',
  'references/contracts/fund-data.md',
  'references/contracts/index-data.md',
  'references/contracts/bond-data.md',
  'references/contracts/financial-docs.md',
  'references/contracts/economic-data.md',
  'references/contracts/analytics-data.md',
];
const contracts = contractFiles.map(read).join('\n');
const contractIndex = JSON.parse(read('references/contracts/tool-index.json'));
const manifest = JSON.parse(read('references/tool-manifest.json'));
const indicators = read('references/indicators.md');
const normalization = JSON.parse(read('references/normalization-rules.json'));
const validation = JSON.parse(read('references/tool-validation-rules.json'));
const errorCodes = JSON.parse(read('references/error-codes.json'));
const cli = read('scripts/cli.mjs');
const cliModule = await import(pathToFileURL(resolve(SKILL, 'scripts', 'cli.mjs')).href);
const runCliCall = (serverType, toolName, params) => {
  const result = spawnSync(process.execPath, ['scripts/cli.mjs', 'call', serverType, toolName, JSON.stringify(params)], {
    cwd: SKILL,
    encoding: 'utf8',
  });
  return { ...result, body: JSON.parse(result.stdout) };
};

test('quota, balance, QPS and concurrency-limit errors are independent', () => {
  assert.match(cli, /DAILY_LIMIT_ERROR/);
  assert.match(cli, /BALANCE_ERROR/);
  assert.match(cli, /RATE_LIMIT_ERROR/);
  assert.match(cli, /CONCURRENCY_LIMIT_ERROR/);
  assert.doesNotMatch(cli, /\['QUOTA_ERROR'/);
  for (const code of ['DAILY_LIMIT_ERROR', 'BALANCE_ERROR', 'RATE_LIMIT_ERROR', 'CONCURRENCY_LIMIT_ERROR']) {
    assert.equal(typeof errorCodes.codes[code], 'string');
  }
});

test('@file loads UTF-8 params without shell JSON escaping', () => {
  const temp = mkdtempSync(resolve(tmpdir(), 'wind-mcp-params-'));
  const file = resolve(temp, 'params with spaces.json');
  try {
    writeFileSync(file, '\uFEFF{"windcode":"600519.SH","indexes":"中文简称,最新成交价"}', 'utf8');
    const loaded = cliModule.loadParamsInput(`@${file}`);
    assert.equal(loaded.source, 'file');
    assert.deepEqual(JSON.parse(loaded.jsonText), {
      windcode: '600519.SH',
      indexes: '中文简称,最新成交价',
    });
    assert.throws(
      () => cliModule.loadParamsInput('@missing-params.json'),
      error => error.code === 'PARAMS_FILE_ERROR' && /missing-params\.json/.test(error.file),
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('tool calls are serial by default and explicit concurrency is capped at ten', () => {
  assert.match(cli, /const DEFAULT_TOOL_CONCURRENCY = 1;/);
  assert.match(cli, /const MAX_TOOL_CONCURRENCY = 10;/);
  assert.match(cli, /recommended_concurrency: DEFAULT_TOOL_CONCURRENCY/);
  assert.match(cli, /recommended_max_concurrency: MAX_TOOL_CONCURRENCY/);
  assert.match(skill, /默认串行调用 Wind 工具（并发数 1）/);
  assert.match(skill, /最大并发数为 10/);
  assert.match(skill, /超过 10 的请求必须排队分批执行/);
});

test('search_stocks has one unified stock-screening contract', () => {
  assert.equal(manifest.stock_data.filter(tool => tool === 'search_stocks').length, 1);
  assert.match(read('references/contracts/stock-data.md'), /A 股、港股、美股共用本服务/);
  assert.doesNotMatch(read('references/contracts/stock-data.md'), /港美股筛选/);
});

test('tool contracts use server-level progressive disclosure', () => {
  assert.deepEqual(Object.keys(contractIndex.servers), Object.keys(manifest));
  for (const [serverType, entry] of Object.entries(contractIndex.servers)) {
    assert.equal(typeof entry.contract_ref, 'string', serverType);
    const relative = entry.contract_ref.replace(/^references\//, 'references/');
    const body = read(relative);
    for (const tool of manifest[serverType]) assert.match(body, new RegExp(`\\b${tool}\\b`), `${serverType}.${tool}`);
  }
  assert.match(skill, /不得读取其它服务契约/);
  assert.ok(read('references/tool-contracts.md').split(/\r?\n/).length < 40);
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
  assert.equal(errorCodes.schema_version, 10);
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

test('public dates require ISO 8601 and map to backend formats', () => {
  const kline = cliModule.normalizeCall('stock_data', 'get_stock_kline', { begin_date: '2026-07-08', end_date: '2026-07-09' });
  assert.equal(kline.args.begin_date, '20260708');
  assert.equal(kline.args.end_date, '20260709');
  assert.deepEqual(kline.normalizationErrors, []);

  const quote = cliModule.normalizeCall('stock_data', 'get_stock_quote', { begin_date: '2026-07-08', end_date: 'last' });
  assert.deepEqual(quote.args, { begin: '20260708', end: 'LAST' });

  const edb = cliModule.normalizeCall('economic_data', 'natural_language_get_edb_data', { begin_date: '2026-07-08', end_date: '2026-07-09' });
  assert.equal(edb.args.beginDate, '20260708');
  assert.equal(edb.args.endDate, '20260709');

  for (const invalid of ['20260708', '2026/07/08', '2026-02-30']) {
    const rejected = cliModule.normalizeCall('stock_data', 'get_stock_kline', { begin_date: invalid });
    assert.equal(rejected.normalizationErrors[0].code, 'INVALID_PARAM_VALUE');
    assert.equal(rejected.normalizationErrors[0].expected_format, 'yyyy-MM-dd');
  }

  const legacyCli = runCliCall('stock_data', 'get_stock_kline', {
    windcode: '600519.SH',
    begin_date: '20260708',
    end_date: '2026-07-09',
  });
  assert.equal(legacyCli.status, 1);
  assert.equal(legacyCli.body.error.code, 'INVALID_PARAM_VALUE');
  assert.equal(legacyCli.body.error.details[0].expected_format, 'yyyy-MM-dd');
});

test('validation coverage matches the three requested phases', () => {
  const byName = new Map(validation.tool_rules.map(rule => [rule.name, rule]));
  assert.equal(byName.get('kline').tools.length, 3);
  assert.equal(Object.keys(normalization.parameter_mappings_by_tool).filter(name => name.endsWith('_quote')).length, 3);
  assert.ok(normalization.parameter_mappings_by_tool.natural_language_get_edb_data);
  assert.equal(byName.get('standard_lang').tools.length + byName.get('analytics_lang').tools.length, 22);
  assert.equal(byName.get('question_required').tools.length + byName.get('financial_docs_query_required').tools.length + 1, 25);
});

test('lang uses one public vocabulary and analytics backend encoding', () => {
  assert.equal(cliModule.normalizeCall('stock_data', 'search_stocks', { lang: 'zh' }).args.lang, '中文');
  assert.equal(cliModule.normalizeCall('analytics_data', 'get_financial_data', { lang: '中文' }).args.lang, 'CNS');
  assert.equal(cliModule.normalizeCall('analytics_data', 'get_financial_data', { lang: 'ENS' }).args.lang, 'ENS');
  const invalid = cliModule.normalizeCall('analytics_data', 'get_financial_data', { lang: 'jp' });
  assert.equal(invalid.normalizationErrors[0].code, 'INVALID_PARAM_VALUE');
  assert.deepEqual(invalid.normalizationErrors[0].allowed_values, ['中文', 'English']);
});

test('financial docs accept question, preserve query and reject conflicts', () => {
  assert.deepEqual(cliModule.normalizeCall('financial_docs', 'get_financial_news', { question: '美联储政策' }).args, { query: '美联储政策' });
  assert.deepEqual(cliModule.normalizeCall('financial_docs', 'get_financial_news', { query: '美联储政策' }).args, { query: '美联储政策' });
  const conflict = cliModule.normalizeCall('financial_docs', 'get_financial_news', { question: 'A', query: 'B' });
  assert.equal(conflict.normalizationErrors[0].code, 'PARAM_CONFLICT_ERROR');
  assert.deepEqual(conflict.normalizationErrors[0].fields, ['question', 'query']);
});

test('CLI failure envelopes expose lang candidates and parameter conflicts', () => {
  const invalidLang = runCliCall('analytics_data', 'get_financial_data', { question: '测试', lang: 'jp' });
  assert.equal(invalidLang.status, 1);
  assert.equal(invalidLang.body.error.code, 'INVALID_PARAM_VALUE');
  assert.deepEqual(invalidLang.body.error.details[0].allowed_values, ['中文', 'English']);
  assert.ok(invalidLang.body.error.details[0].accepted_aliases.includes('cns'));

  const conflict = runCliCall('financial_docs', 'get_financial_news', { question: 'A', query: 'B' });
  assert.equal(conflict.status, 1);
  assert.equal(conflict.body.error.code, 'PARAM_CONFLICT_ERROR');
  assert.equal(conflict.body.error.circuit_breaker.tripped, true);
  assert.deepEqual(conflict.body.error.details[0].fields, ['question', 'query']);
});

test('LAST is rejected outside Quote tools at the CLI boundary', () => {
  const result = runCliCall('stock_data', 'get_stock_kline', { windcode: '600519.SH', begin_date: 'LAST', end_date: '2026-07-09' });
  assert.equal(result.status, 1);
  assert.equal(result.body.error.code, 'INVALID_PARAM_VALUE');
  assert.deepEqual(result.body.error.details[0].allowed_special_values, []);
});

test('successful JSON payloads normalize INVALID and distrust declared counts', () => {
  const result = cliModule.normalizeCallSuccess({
    content: [{
      type: 'text',
      text: JSON.stringify({
        data: { columns: ['close', 'volume'], rows: [['10.5', 'INVALID']], excelTotalCount: 8 },
        meta: { status: 'INVALID' },
        article: 'INVALID',
      }),
    }],
    isError: false,
  }, { server_type: 'stock_data', tool_name: 'get_stock_quote' });

  const inner = JSON.parse(result.content[0].text);
  assert.equal(inner.data.rows[0][1], null);
  assert.equal(inner.data.excelTotalCount, 8);
  assert.equal(inner.meta.status, 'INVALID');
  assert.equal(inner.article, 'INVALID');
  assert.equal(result.cli_meta.tables[0].actual_row_count, 1);
  assert.equal(result.cli_meta.completeness, 'unknown');
  assert.ok(result.cli_meta.warnings.some(warning => warning.code === 'BACKEND_INVALID_AS_NULL'));
  assert.ok(result.cli_meta.warnings.some(warning => warning.code === 'UNRELIABLE_DECLARED_COUNT'));
});

test('skill forbids unsafe quote return and unit inference', () => {
  assert.match(skill, /禁止用 `\(收盘-开盘\)\/开盘` 冒充日涨跌幅/);
  assert.match(skill, /单位缺失时保留原值并说明单位未知/);
  assert.match(skill, /不得使用 `excelTotalCount` 判断总数/);
  assert.match(skill, /不得只读取第一个块/);
});

test('EDB uses canonical public date fields and does not repair backend observation errors', () => {
  assert.match(skill, /对外统一填写 `begin_date` \/ `end_date`/);
  assert.doesNotMatch(skill, /显式填写 `beginDate` \/ `endDate`/);
  const edbContract = read('references/contracts/economic-data.md');
  assert.match(edbContract, /视为后端问题：停止自动修正并透传错误/);
  assert.match(edbContract, /不得把日期范围擅自改成 `observation`/);
});
