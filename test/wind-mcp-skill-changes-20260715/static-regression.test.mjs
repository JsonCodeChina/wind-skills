import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const readRepo = relative => readFileSync(resolve(REPO, relative), 'utf8');

const skill = read('SKILL.md');
const readme = readRepo('docs/wind-mcp-skill.md');
const contractByServer = {
  stock_data: 'references/stock.md',
  fund_data: 'references/fund.md',
  index_data: 'references/index.md',
  bond_data: 'references/bond.md',
  financial_docs: 'references/financial-docs.md',
  economic_data: 'references/economic.md',
  analytics_data: 'references/analytics.md',
};
const contractBodies = Object.fromEntries(
  Object.entries(contractByServer).map(([serverType, file]) => [serverType, read(file)]),
);
const contracts = Object.values(contractBodies).join('\n');
const manifest = JSON.parse(read('scripts/tool-manifest.json'));
const stockIndicators = contractBodies.stock_data;
const fundIndicators = contractBodies.fund_data;
const indexIndicators = contractBodies.index_data;
const callRules = JSON.parse(read('scripts/call-rules.json'));
const normalization = callRules;
const validation = callRules;
const cli = read('scripts/cli.mjs');
const cliModule = await import(pathToFileURL(resolve(SKILL, 'scripts', 'cli.mjs')).href);
const errorDefinitions = cliModule.ERROR_DEFINITIONS;

test('temporary request files are ignored and the repository contains only a safe example', () => {
  const ignore = readRepo('skills/.gitignore');
  assert.match(ignore, /\*\*\/scripts\/request\.json/);
  assert.match(ignore, /\*\*\/scripts\/request-\*\.json/);
  assert.equal(existsSync(resolve(SKILL, 'scripts', 'request.json')), false);
  assert.equal(existsSync(resolve(SKILL, 'scripts', 'request.example.json')), true);
});

test('backend failures use the structured error envelope', () => {
  assert.doesNotMatch(cli, /dieBackendRaw/);
  assert.match(cli, /dieMcp\(code, message, \{ backendError \}\)/);
  assert.match(cli, /dieBackend\([\s\S]*?'NETWORK_ERROR'\)/);
});

test('explicit QUERY_FAILED no-data payload is a successful empty result', () => {
  assert.equal(cliModule.isExplicitNoDataResult({
    data: null,
    error: { code: 'QUERY_FAILED', message: '没找到数据' },
  }), true);
  assert.equal(cliModule.isExplicitNoDataResult({
    data: null,
    error: { code: 'QUERY_FAILED', message: '查询执行异常' },
  }), false);
});

test('fetch failures retry internally and do not surface when retry succeeds', async () => {
  let attempts = 0;
  const optionsSeen = [];
  const response = { ok: true };
  const actual = await cliModule.fetchWithRetry(async (_url, options) => {
    attempts += 1;
    optionsSeen.push(options);
    if (attempts < 3) throw new TypeError('fetch failed');
    return response;
  }, 'https://example.invalid', attempt => ({ attempt }), { attempts: 3, delaysMs: [0, 0] });
  assert.equal(actual, response);
  assert.equal(attempts, 3);
  assert.deepEqual(optionsSeen, [{ attempt: 1 }, { attempt: 2 }, { attempt: 3 }]);
});

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
    assert.equal(typeof errorDefinitions[code].agent_action, 'string');
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
  assert.match(read('references/stock.md'), /A 股、港股、美股共用本服务/);
  assert.doesNotMatch(read('references/stock.md'), /港美股筛选/);
});

test('tool contracts use one-hop server-level progressive disclosure', () => {
  assert.deepEqual(Object.keys(contractByServer), Object.keys(manifest));
  for (const [serverType, relative] of Object.entries(contractByServer)) {
    const body = read(relative);
    for (const tool of manifest[serverType]) assert.match(body, new RegExp(`\\b${tool}\\b`), `${serverType}.${tool}`);
    assert.match(skill, new RegExp(relative.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  for (const removed of [
    'references/contracts/tool-index.json',
    'references/contracts/parameter-conventions.md',
    'references/tool-contracts.md',
  ]) assert.equal(existsSync(resolve(SKILL, removed)), false, removed);
});

test('contract sync preserves flat paths and canonical public parameters', () => {
  assert.equal(existsSync(resolve(SKILL, 'scripts', 'runtime')), false);
  assert.doesNotMatch(cli, /RUNTIME_DIR/);
  assert.match(cli, /join\(SKILL_DIR, 'scripts', 'tool-manifest\.json'\)/);
  assert.match(cli, /join\(SKILL_DIR, 'scripts', 'call-rules\.json'\)/);
  assert.equal(existsSync(resolve(SKILL, 'scripts', 'normalization-rules.json')), false);
  assert.equal(existsSync(resolve(SKILL, 'scripts', 'tool-validation-rules.json')), false);
  assert.match(cli, /join\(SKILL_DIR, 'references', CONTRACT_REFS\[serverType\]\)/);
  assert.doesNotMatch(cli, /references\/contracts\/parameter-conventions\.md/);
  assert.doesNotMatch(cli, /CLI 转成后端|CLI 在调用边界/);
  assert.doesNotMatch(read('references/financial-docs.md'), /\| `query` \|/);
  assert.doesNotMatch(read('references/economic.md'), /\| `(beginDate|endDate)` \|/);
  for (const domain of ['stock', 'fund', 'index']) {
    assert.doesNotMatch(read(`references/${domain}.md`), /\| `(begin|end)` \|/);
  }
  for (const relative of Object.values(contractByServer)) {
    assert.doesNotMatch(read(relative), /\| `version` \|/);
  }
  assert.match(cli, /\.filter\(\(\[name\]\) => name !== 'version'\)/);
  assert.match(cli, /name === 'period' && tool\.name\.endsWith\('_kline'\)/);
  assert.match(cli, /enum: Array\.from\(PUBLIC_KLINE_PERIODS\), default: '1d'/);
  assert.match(cli, /existing\.slice\(generatedEnd \+ GENERATED_CONTRACT_END\.length\)\.trim\(\)/);
  assert.match(cli, /const preservedSuffix = suffix/);
});

test('contract sync preserves embedded domain indicators', () => {
  const temp = mkdtempSync(resolve(tmpdir(), 'wind-mcp-contract-'));
  const file = resolve(temp, 'stock.md');
  const oldGenerated = '<!-- BEGIN MCP TOOLS/LIST GENERATED CONTRACT -->\nold\n<!-- END MCP TOOLS/LIST GENERATED CONTRACT -->';
  const newGenerated = '<!-- BEGIN MCP TOOLS/LIST GENERATED CONTRACT -->\nnew\n<!-- END MCP TOOLS/LIST GENERATED CONTRACT -->';
  const indicators = '<!-- BEGIN DOMAIN INDICATORS -->\n## `indexes` 行情指标\n`最新成交价`\n<!-- END DOMAIN INDICATORS -->';
  try {
    writeFileSync(file, `old preamble\n\n${oldGenerated}\n\n${indicators}\n`, 'utf8');
    cliModule.mergeGeneratedContract(file, 'new preamble', newGenerated);
    const updated = readFileSync(file, 'utf8');
    assert.match(updated, /^new preamble/);
    assert.match(updated, /\nnew\n/);
    assert.doesNotMatch(updated, /\nold\n/);
    assert.match(updated, /<!-- BEGIN DOMAIN INDICATORS -->/);
    assert.match(updated, /`最新成交价`/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('K-line periods use semantic public values and backend-only numeric codes', () => {
  const publicPeriods = [
    '1min', '5min', '10min', '15min', '30min', '60min', '120min', '240min',
    '1d', '1w', '1mo', '1y', '1q', '6mo',
  ];
  const mappings = {
    '1min': '1',
    '5min': '3',
    '10min': '4',
    '15min': '5',
    '30min': '6',
    '60min': '7',
    '120min': '8',
    '240min': '9',
    '1d': '10',
    '1w': '11',
    '1mo': '12',
    '1y': '13',
    '1q': '14',
    '6mo': '15',
  };
  assert.deepEqual(callRules.kline_period_map, mappings);
  for (const removed of ['kline_periods', 'public_kline_periods', 'period_aliases']) {
    assert.equal(removed in callRules, false, removed);
  }
  assert.doesNotMatch(cli, /PERIOD_ALIASES/);
  for (const domain of ['stock', 'fund', 'index']) {
    const periodRow = read(`references/${domain}.md`)
      .split(/\r?\n/u)
      .find(line => line.startsWith('| `period` |'));
    assert.ok(periodRow, `${domain} period row`);
    assert.match(periodRow, /\| "1d" \| K 线周期。 \|/u);
    for (const value of publicPeriods) assert.match(periodRow, new RegExp(`\\b${value}\\b`, 'u'));
    assert.doesNotMatch(periodRow, /\b(?:1|3|4|5|6|7|8|9|10|11|12|13|14|15)=/u);
  }

  const base = {
    windcode: '600519.SH',
    begin_date: '2026-07-01',
    end_date: '2026-07-22',
  };
  for (const [period, backendPeriod] of Object.entries(mappings)) {
    const normalized = cliModule.normalizeCall(
      'stock_data',
      'get_stock_kline',
      { ...base, period },
    );
    assert.equal(normalized.args.period, backendPeriod, period);
    assert.deepEqual(cliModule.validateToolParams(normalized.toolName, normalized.args), [], period);
  }

  const defaulted = cliModule.normalizeCall('stock_data', 'get_stock_kline', { ...base });
  assert.equal(defaulted.args.period, '10');

  for (const legacyValue of ['1m', 'day', 'daily', '日线', 'm', 'month', '10', '1D']) {
    const normalized = cliModule.normalizeCall(
      'stock_data',
      'get_stock_kline',
      { ...base, period: legacyValue },
    );
    const errors = [
      ...normalized.normalizationErrors,
      ...cliModule.validateToolParams(normalized.toolName, normalized.args),
    ];
    const legacyError = errors.find(error => error.field === 'period');
    assert.ok(legacyError, legacyValue);
    assert.deepEqual(legacyError.allowed_values, publicPeriods, legacyValue);
  }

  const invalid = cliModule.normalizeCall(
    'stock_data',
    'get_stock_kline',
    { ...base, period: '2d' },
  );
  const periodError = cliModule.validateToolParams(invalid.toolName, invalid.args)
    .find(error => error.field === 'period');
  assert.deepEqual(periodError.allowed_values, publicPeriods);
  assert.match(periodError.message, /日 K 请传 '1d'/u);
  assert.doesNotMatch(errorDefinitions.PERIOD_PARSE_ERROR.agent_action, /日线用 '10'/u);
});

test('indicator dictionaries are embedded in their domain contracts', () => {
  assert.doesNotMatch(skill, /references\/indicators/);
  assert.match(skill, /`indexes` 字典已内嵌在对应契约中/);
  for (const domain of ['stock', 'fund', 'index']) {
    const body = read(`references/${domain}.md`);
    assert.match(body, /## 目录/);
    assert.match(body, /<!-- BEGIN DOMAIN INDICATORS -->/);
    assert.match(body, /## `indexes` 行情指标/);
    assert.equal(existsSync(resolve(SKILL, 'references', 'indicators', `${domain}.md`)), false);
  }
  assert.match(stockIndicators, /市盈率\(TTM\)/);
  assert.match(fundIndicators, /基金规模/);
  assert.match(indexIndicators, /成分股贡献点数/);
  assert.doesNotMatch(fundIndicators, /最新YTM/);
});

test('batch requests require a successful first-item probe', () => {
  assert.match(skill, /先只执行该批次的第一个请求作为探针/);
  assert.match(skill, /探针完成前禁止预先启动、排队或并发发送其余请求/);
  assert.match(skill, /探针失败时立即终止该批次/);
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

test('indexes and index codes are not silently aliased', () => {
  assert.equal(normalization.indicator_aliases, undefined);
  assert.equal(normalization.index_code_aliases, undefined);
  assert.doesNotMatch(cli, /INDICATOR_ALIASES|INDEX_CODE_ALIASES|normalizeIndicatorKey/);
  const price = cliModule.normalizeCall(
    'stock_data',
    'get_stock_price_indicators',
    { windcode: '600519.SH', indexes: ' 最新价 , 收盘价 ' },
  );
  assert.equal(price.args.indexes, '最新价,收盘价');
  const namedIndex = cliModule.normalizeCall(
    'index_data',
    'get_index_kline',
    { windcode: '恒生指数', begin_date: '2026-07-01', end_date: '2026-07-02' },
  );
  assert.equal(namedIndex.args.windcode, '恒生指数');
  const unconfirmedCode = cliModule.normalizeCall(
    'index_data',
    'get_index_kline',
    { windcode: 'HSI.HK', begin_date: '2026-07-01', end_date: '2026-07-02' },
  );
  assert.equal(unconfirmedCode.args.windcode, 'HSI.HK');
  assert.match(contracts, /市值口径：.*口径不明确时先询问/);
  assert.match(stockIndicators, /`总市值1` 为不含限售股口径/);
  assert.match(stockIndicators, /`总市值2` 为含限售股口径/);
});

test('failure definitions are embedded, structured and independent of internal docs', () => {
  assert.equal(existsSync(resolve(SKILL, 'scripts/error-codes.json')), false);
  assert.ok(Object.isFrozen(errorDefinitions));
  for (const definition of Object.values(errorDefinitions)) {
    assert.equal(typeof definition.agent_action, 'string');
    assert.equal(typeof definition.retry.allowed, 'boolean');
    assert.equal(typeof definition.circuit_breaker.tripped, 'boolean');
    assert.equal(typeof definition.correction, 'object');
    assert.doesNotMatch(definition.agent_action, /references\/|SKILL\.md/);
  }
});

test('wind-alice fallback is self-contained in SKILL.md', () => {
  assert.equal(existsSync(resolve(SKILL, 'references', 'fallback-alice.md')), false);
  assert.match(skill, /不得自动切换/);
  assert.match(skill, /将用户原始问题原封不动作为 prompt/);
  assert.match(skill, /用户拒绝切换或安装时立即停止/);
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
  assert.deepEqual(quote.args, { begin: '20260708', end: 'last' });

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
  assert.deepEqual(invalid.normalizationErrors[0].allowed_values, ['zh-CN', 'en-US']);
});

test('financial docs accept question, preserve query and reject conflicts', () => {
  assert.deepEqual(cliModule.normalizeCall('financial_docs', 'get_financial_news', { question: '美联储政策' }).args, { query: '美联储政策' });
  assert.deepEqual(cliModule.normalizeCall('financial_docs', 'get_financial_news', { query: '美联储政策' }).args, { query: '美联储政策' });
  const spaced = cliModule.normalizeCall('financial_docs', 'get_financial_news', { question: 'VLCC油轮 运价 航运 2026' });
  assert.deepEqual(spaced.args, { query: 'VLCC油轮 运价 航运 2026' });
  assert.deepEqual(cliModule.validateBasicParams(spaced.args, spaced.toolName), []);
  const blankErrors = cliModule.validateBasicParams({ query: '   ' }, 'get_financial_news');
  assert.equal(blankErrors[0].issue, 'empty_value');
  const conflict = cliModule.normalizeCall('financial_docs', 'get_financial_news', { question: 'A', query: 'B' });
  assert.equal(conflict.normalizationErrors[0].code, 'PARAM_CONFLICT_ERROR');
  assert.deepEqual(conflict.normalizationErrors[0].fields, ['question', 'query']);
});

test('CLI failure envelopes expose lang candidates and parameter conflicts', () => {
  const invalidLang = runCliCall('analytics_data', 'get_financial_data', { question: '测试', lang: 'jp' });
  assert.equal(invalidLang.status, 1);
  assert.equal(invalidLang.body.error.code, 'INVALID_PARAM_VALUE');
  assert.deepEqual(invalidLang.body.error.details[0].allowed_values, ['zh-CN', 'en-US']);
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
  assert.match(skill, /日期使用 `yyyy-MM-dd`/);
  assert.doesNotMatch(skill, /显式填写 `beginDate` \/ `endDate`/);
  const edbContract = read('references/economic.md');
  assert.match(edbContract, /视为后端问题：停止自动修正并透传错误/);
  assert.match(edbContract, /不得把日期范围擅自改成 `observation`/);
});
