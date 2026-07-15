#!/usr/bin/env node
// wind-mcp-skill CLI: thin JSON-envelope wrapper around Wind MCP servers
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const SKILL_VERSION = '1.9.8';

// 本地 registry: 工具选择可在任何网络调用前失败
const SERVERS = {
  stock_data: {
    endpoint: 'https://mcp.wind.com.cn/vserver_stock_data/mcp/',
    label: 'Wind 股票（选股筛选 + 档案/财务/股本/事件/技术/风险 + 行情/K线/分钟）',
  },
  fund_data: {
    endpoint: 'https://mcp.wind.com.cn/vserver_fund_data/mcp/',
    label: 'Wind 基金（基金筛选 + 档案/财务/持仓/业绩/持有人/公司 + 行情/K线/分钟）',
  },
  index_data: {
    endpoint: 'https://mcp.wind.com.cn/vserver_index_data/mcp/',
    label: 'Wind 指数/板块（档案/基本面/技术 + 行情/K线/分钟）',
  },
  bond_data: {
    endpoint: 'https://mcp.wind.com.cn/vserver_bond_data/mcp/',
    label: 'Wind 债券（基本档案/发债主体/行情估值/主体财务）',
  },
  financial_docs: {
    endpoint: 'https://mcp.wind.com.cn/vserver_financial_docs/mcp/',
    label: 'Wind 金融文档 RAG（公告 / 新闻）',
  },
  economic_data: {
    endpoint: 'https://mcp.wind.com.cn/vserver_economic_data/mcp/',
    label: 'Wind EDB 宏观/行业经济指标',
  },
  analytics_data: {
    endpoint: 'https://mcp.wind.com.cn/vserver_analytics_data/mcp/',
    label: 'Wind 通用分析数据（NL → Wind 数据）',
  },
};

const PORTAL_URL = 'https://aifinmarket.wind.com.cn/#/user/overview';

const SKILL_DIR = dirname(dirname(fileURLToPath(
  import.meta.url)));

const UPDATE_CHECK_PATH = join(SKILL_DIR, 'scripts', 'update-check.mjs');
const TOOL_MANIFEST_PATH = join(SKILL_DIR, 'references', 'tool-manifest.json');
const ERROR_CODES_PATH = join(SKILL_DIR, 'references', 'error-codes.json');
const NORMALIZATION_RULES_PATH = join(SKILL_DIR, 'references', 'normalization-rules.json');
const TOOL_VALIDATION_RULES_PATH = join(SKILL_DIR, 'references', 'tool-validation-rules.json');
const SKILL_NAME = basename(SKILL_DIR);

const CALL_EXAMPLES = [
  `cli.mjs call stock_data search_stocks '{"question":"筛选沪深市场市值超500亿且连续5日上涨的股票"}'`,
  `cli.mjs call stock_data search_stocks '{"question":"筛选港股中市值超1000亿港元的科技股"}'`,
  `cli.mjs call fund_data search_funds '{"question":"筛选股票型基金中近一年收益率超20%的产品"}'`,
  `cli.mjs call stock_data get_stock_basicinfo '{"question":"600519.SH公司基本档案"}'`,
  `cli.mjs call stock_data get_stock_price_indicators '{"windcode":"600519.SH","indexes":"中文简称,最新成交价,涨跌幅"}'`,
  `cli.mjs call fund_data get_fund_kline '{"windcode":"588200.SH","begin_date":"20260401","end_date":"20260430"}'`,
  `cli.mjs call stock_data get_stock_quote '{"windcode":"AAPL.O"}'`,
  `cli.mjs call index_data get_index_kline '{"windcode":"000300.SH","begin_date":"20260401","end_date":"20260430"}'`,
  `cli.mjs call financial_docs get_financial_news '{"query":"美联储利率政策","top_k":3}'`,
  `cli.mjs call economic_data natural_language_get_edb_data '{"executionMode":"searchFetch","question":"中国GDP","observation":"10"}'`,
  `cli.mjs call analytics_data get_financial_data '{"question":"查询中国A股市场过去一年的平均成交量"}'`,
];

// ───── 自动更新 ─────
// 每天首次使用 skill 时异步执行一次 npx skills update，不阻塞主流程。

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizePath(value) {
  const normalized = resolve(value).replace(/\\/g, '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function updateScope() {
  const globalRoot = normalizePath(join(homedir(), '.agents', 'skills'));
  const skillDir = normalizePath(SKILL_DIR);
  return skillDir.startsWith(globalRoot + '/') ? 'global' : 'project';
}

function updateStateFile() {
  return join(SKILL_DIR, 'scripts', 'update-state.json');
}

function readUpdateState() {
  try {
    const stateFile = updateStateFile();
    if (!existsSync(stateFile)) return null;
    return JSON.parse(readFileSync(stateFile, 'utf8'));
  } catch {
    return null;
  }
}

function writeUpdateStatePatch(patch) {
  const stateFile = updateStateFile();
  mkdirSync(dirname(stateFile), { recursive: true });
  const state = { ...(readUpdateState() || {}), ...patch };
  writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
}

function alreadyUpdatedToday() {
  try {
    const state = readUpdateState();
    return state && state.date === todayKey() && state.status === 'success';
  } catch {
    return false;
  }
}

function markSkillUsed() {
  writeUpdateStatePatch({
    lastUsedAt: new Date().toISOString(),
    lastUsedPid: process.pid,
  });
}

function triggerUpdateCheck() {
  try {
    if (!existsSync(UPDATE_CHECK_PATH)) return;
    if (alreadyUpdatedToday()) return;
    markSkillUsed();
    const tmpDir = join(homedir(), '.cache', 'wind-aifinmarket');
    mkdirSync(tmpDir, { recursive: true });
    const runnerPath = join(tmpDir, `update-check-${SKILL_NAME}-${process.pid}.mjs`);
    copyFileSync(UPDATE_CHECK_PATH, runnerPath);
    const child = spawn('node', [runnerPath, SKILL_DIR], { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => {});
    child.unref();
  } catch {}
}

export { triggerUpdateCheck };

// section: 工具函数

// call 成功: 完整透传 MCP result, 不抽取; agent 自行 parse content[0].text
function writeRawCallSuccess(result) {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

function writePlainSuccess(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

function defaultRetryPolicy(code) {
  if (code === 'RATE_LIMIT_ERROR') return { allowed: true, mode: 'same_request_after_wait', max_attempts: 1, after_ms: 5000 };
  if (code === 'TEMPORARILY_UNAVAILABLE' || code === 'NETWORK_ERROR') return { allowed: true, mode: 'same_request', max_attempts: 1 };
  return { allowed: false, mode: 'after_correction', max_attempts: 0 };
}

function defaultCircuitBreaker(code) {
  const trips = new Set(['MARKET_TARGET_NOT_FOUND', 'PARAM_TYPE_ERROR', 'PARAM_VALIDATION_ERROR', 'INVALID_PARAM_NAME', 'INVALID_PARAM_VALUE']);
  return {
    tripped: trips.has(code),
    scope: trips.has(code) ? 'remaining_batch' : 'current_call',
    action: trips.has(code) ? 'abort_remaining_calls' : 'none',
  };
}

// 失败 envelope 保留 agent_action 向后兼容，同时提供机器可读的诊断与重试策略。
function writeErrorEnvelope(code, detail, metadata = {}) {
  const envelope = {
    ok: false,
    error: {
      code,
      details: metadata.details || (detail ? { message: String(detail).slice(0, 500) } : {}),
      retry: metadata.retry || defaultRetryPolicy(code),
      circuit_breaker: metadata.circuit_breaker || defaultCircuitBreaker(code),
      correction: metadata.correction || {},
      agent_action: buildAgentAction(code, detail),
    },
  };
  process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
}

function die(code, detail = null, exitCode = 1, metadata = {}) {
  writeErrorEnvelope(code, detail, metadata);
  process.exit(exitCode);
}

function exitWithUsage(usage, exitCode = 0) {
  die('USAGE_ERROR', `USAGE:\n${usage}`, exitCode);
}

function maskKey(key) {
  if (!key || key.length < 8) return '***';
  return key.slice(0, 4) + '***' + key.slice(-4);
}

// dotenv 解析: 兼容注释 / 引号 / export 前缀
function parseDotenv(content) {
  const env = {};
  for (const rawLine of content.split('\n')) {
    let line = rawLine.replace(/^﻿/, '').trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice(7).trim();
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    } else {
      const hashIdx = val.indexOf(' #');
      if (hashIdx >= 0) val = val.slice(0, hashIdx).trim();
    }
    env[key] = val;
  }
  return env;
}

function getServer(server_type) {
  const server = SERVERS[server_type];
  if (!server) {
    die('ROUTE_ERROR', `未知 server_type: ${server_type}. 可用: ${Object.keys(SERVERS).join(' / ')}`, 1, {
      details: { field: 'server_type', issue: 'invalid_enum', actual: server_type, allowed_values: Object.keys(SERVERS) },
      retry: { allowed: true, mode: 'after_correction', max_attempts: 1 },
      correction: { change_only: ['server_type'] },
    });
  }
  return server;
}

function loadToolManifest() {
  try {
    // tool-manifest.json is the authority for legal server_type + tool_name combinations.
    const manifest = JSON.parse(readFileSync(TOOL_MANIFEST_PATH, 'utf8'));
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      throw new Error('manifest 顶层必须是对象');
    }
    for (const [serverType, tools] of Object.entries(manifest)) {
      if (!SERVERS[serverType]) {
        throw new Error(`manifest 包含未知 server_type: ${serverType}`);
      }
      if (!Array.isArray(tools) || tools.some(tool => typeof tool !== 'string' || !tool)) {
        throw new Error(`manifest 中 ${serverType} 的工具清单必须是非空字符串数组`);
      }
    }
    for (const serverType of Object.keys(SERVERS)) {
      if (!Array.isArray(manifest[serverType])) {
        throw new Error(`manifest 缺少 server_type: ${serverType}`);
      }
    }
    return manifest;
  } catch (err) {
    die('UNKNOWN', `工具清单读取失败: ${err.message}`);
  }
}

function validateToolSelection(server_type, toolName) {
  getServer(server_type);
  const manifest = loadToolManifest();
  const tools = manifest[server_type];
  if (!tools.includes(toolName)) {
    die('ROUTE_ERROR', `工具名 "${toolName}" 不属于 server_type "${server_type}"。`, 1, {
      details: { field: 'tool_name', issue: 'invalid_enum', actual: toolName, server_type, allowed_values: tools },
      retry: { allowed: true, mode: 'after_correction', max_attempts: 1 },
      correction: { change_only: ['tool_name'], preserve_server_type: true },
    });
  }
}

const PRICE_INDICATOR_TOOLS = new Set(['get_stock_price_indicators', 'get_fund_price_indicators', 'get_index_price_indicators']);
const QUOTE_TOOLS = new Set(['get_stock_quote', 'get_fund_quote', 'get_index_quote']);
const EDB_EXECUTION_MODE_ALIASES = new Map([
  ['仅搜索', 'search'],
  ['仅提数', 'fetch'],
  ['搜索并提数', 'searchFetch'],
]);

function readNormalizationRules() {
  const rules = JSON.parse(readFileSync(NORMALIZATION_RULES_PATH, 'utf8'));
  return {
    klinePeriods: new Set(rules.kline_periods || []),
    periodAliases: new Map(Object.entries(rules.period_aliases || {})),
    indicatorAliases: new Map(Object.entries(rules.indicator_aliases || {})),
    indexCodeAliases: new Map(Object.entries(rules.index_code_aliases || {})),
    legacyToolAliases: new Map(Object.entries(rules.legacy_tool_aliases || {})),
    toolByDomain: rules.tool_by_domain || {},
  };
}

const NORMALIZATION_RULES = readNormalizationRules();
const KLINE_PERIODS = NORMALIZATION_RULES.klinePeriods;
const PERIOD_ALIASES = NORMALIZATION_RULES.periodAliases;
const INDICATOR_ALIASES = NORMALIZATION_RULES.indicatorAliases;
const INDEX_CODE_ALIASES = NORMALIZATION_RULES.indexCodeAliases;
const LEGACY_TOOL_ALIASES = NORMALIZATION_RULES.legacyToolAliases;
const TOOL_BY_DOMAIN = NORMALIZATION_RULES.toolByDomain;

function readToolValidationRules() {
  try {
    const rules = JSON.parse(readFileSync(TOOL_VALIDATION_RULES_PATH, 'utf8'));
    return {
      basic: rules.basic || {},
      toolRules: Array.isArray(rules.tool_rules) ? rules.tool_rules : [],
    };
  } catch (err) {
    die('UNKNOWN', `工具参数校验规则读取失败: ${err.message}`);
  }
}

const TOOL_VALIDATION_RULES = readToolValidationRules();
const KLINE_TOOLS = new Set(TOOL_VALIDATION_RULES.toolRules.find(rule => rule.name === 'kline')?.tools || []);

function isValidBasicDate(value) {
  if (!/^\d{8}$/.test(value)) return false;
  const y = Number(value.slice(0, 4));
  const m = Number(value.slice(4, 6));
  const d = Number(value.slice(6, 8));
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function normalizeIndicatorKey(value) {
  return String(value || '').trim().replace(/\s+/g, '').replace(/[（]/g, '(').replace(/[）]/g, ')').toLowerCase();
}

function normalizeIndexes(indexes) {
  if (typeof indexes !== 'string') return indexes;
  return indexes.split(',').map((item) => INDICATOR_ALIASES.get(normalizeIndicatorKey(item)) || item.trim()).filter(Boolean).join(',');
}

function normalizeWindcode(windcode) {
  if (typeof windcode !== 'string') return windcode;
  const raw = windcode.trim();
  const upper = raw.toUpperCase();
  const alias = INDEX_CODE_ALIASES.get(upper);
  if (alias) return alias;
  // Keep natural-language names untouched. Wind's backend NER is responsible
  // for resolving names/aliases; the CLI must not guess exchange suffixes.
  if (/[\u4e00-\u9fff]/.test(raw)) return raw;
  if (/^0\d{4}\.HK$/.test(upper)) return upper.slice(1);
  if (/^\d{4}\.HK$/.test(upper)) return upper;
  if (/^\d{6}\.(SH|SZ|BJ|OF)$/.test(upper)) return upper;
  if (/^[A-Z]{1,5}\.(O|N|A|HK|SH|SZ|BJ)$/.test(upper)) return upper;
  return raw;
}

function toolFamily(toolName) {
  if (PRICE_INDICATOR_TOOLS.has(toolName)) return 'price';
  if (KLINE_TOOLS.has(toolName)) return 'kline';
  if (QUOTE_TOOLS.has(toolName)) return 'quote';
  return null;
}

function normalizeCall(server_type, toolName, args) {
  const originalToolName = toolName;
  const legacyTool = LEGACY_TOOL_ALIASES.get(toolName);
  if (legacyTool) [server_type, toolName] = legacyTool;
  const normalizedArgs = { ...args };
  if (toolName === 'natural_language_get_edb_data' && typeof normalizedArgs.executionMode === 'string') {
    normalizedArgs.executionMode = EDB_EXECUTION_MODE_ALIASES.get(normalizedArgs.executionMode) || normalizedArgs.executionMode;
  }
  if (typeof normalizedArgs.indexes === 'string') normalizedArgs.indexes = normalizeIndexes(normalizedArgs.indexes);
  if (typeof normalizedArgs.windcode === 'string') normalizedArgs.windcode = normalizeWindcode(normalizedArgs.windcode);
  if (typeof normalizedArgs.period === 'string') {
    const key = normalizedArgs.period.trim().toLowerCase();
    normalizedArgs.period = PERIOD_ALIASES.get(key) || normalizedArgs.period.trim();
  }
  const family = toolFamily(toolName);
  if (family) {
    toolName = TOOL_BY_DOMAIN[family]?.[server_type] || toolName;
  }
  return { server_type, toolName, args: normalizedArgs };
}

function validateBasicParams(params) {
  const errors = [];
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return [{
      code: 'PARAM_TYPE_ERROR',
      message: 'params 必须是 JSON object',
      field: 'params',
      issue: 'invalid_type',
      expected_type: 'object',
      actual_type: Array.isArray(params) ? 'array' : typeof params,
    }];
  }

  const basic = TOOL_VALIDATION_RULES.basic;
  for (const key of basic.string_keys || []) {
    if (!(key in params)) continue;
    if (typeof params[key] !== 'string') {
      errors.push({ message: `字段 '${key}' 必须是字符串`, field: key, issue: 'invalid_type', expected_type: 'string', actual_type: Array.isArray(params[key]) ? 'array' : typeof params[key] });
    } else if (params[key].trim().length === 0) {
      errors.push({ message: `字段 '${key}' 不能为空或全空白`, field: key, issue: 'empty_value', expected: 'non-empty string' });
    }
  }

  for (const key of basic.no_whitespace_keys || []) {
    if (typeof params[key] === 'string' && /\s/.test(params[key])) {
      errors.push({ message: `字段 '${key}' 不得含空格或其它空白字符`, field: key, issue: 'invalid_format', expected_format: 'no whitespace' });
    }
  }

  for (const key of basic.date_keys || []) {
    if (!(key in params)) continue;
    if (typeof params[key] === 'string' && !isValidBasicDate(params[key])) {
      errors.push({ message: `字段 '${key}' 日期格式错误，要求 yyyyMMdd`, field: key, issue: 'invalid_format', actual: params[key], expected_format: 'yyyyMMdd', example: '20260708' });
    }
  }

  for (const rule of basic.ambiguous_market_target_patterns || []) {
    const value = params[rule.field];
    if (typeof value !== 'string') continue;
    if (!new RegExp(rule.pattern).test(value)) continue;
    errors.push({
      code: rule.code || 'AMBIGUOUS_MARKET_TARGET',
      message: renderValidationTemplate(rule.message, { ...params, value }),
    });
  }

  return errors;
}

function hasParamValue(params, key) {
  return params[key] !== undefined && params[key] !== null && params[key] !== '';
}

function resolveValidationValues(fieldRule) {
  if (Array.isArray(fieldRule.values)) return fieldRule.values.map(String);
  if (fieldRule.values_from === 'normalization.kline_periods') return Array.from(KLINE_PERIODS).map(String);
  return [];
}

function renderValidationMessage(template, values) {
  return String(template || '').replace('${values}', values.join('/'));
}

function renderValidationTemplate(template, params) {
  return String(template || '').replace(/\$\{([^}]+)\}/g, (_, key) => {
    const value = params[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function validationErrorMessage(error) {
  return typeof error === 'string' ? error : error.message;
}

function validationErrorCode(error) {
  return typeof error === 'object' && error?.code ? error.code : null;
}

function validateToolParams(toolName, params) {
  const errors = [];
  const rules = TOOL_VALIDATION_RULES.toolRules.filter(rule => Array.isArray(rule.tools) && rule.tools.includes(toolName));

  for (const rule of rules) {
    const ruleLabel = rule.label || rule.name || toolName;
    if (Array.isArray(rule.allowed)) {
      const allowedKeys = new Set(rule.allowed);
      for (const key of Object.keys(params)) {
        if (!allowedKeys.has(key)) errors.push({ message: `${ruleLabel} 工具不支持字段 '${key}'`, field: key, issue: 'unknown_field', allowed_fields: [...allowedKeys] });
      }
    }

    for (const key of rule.required || []) {
      if (!hasParamValue(params, key)) errors.push({ message: `${ruleLabel} 工具缺少必填字段 '${key}'`, field: key, issue: 'missing_required', required_fields: rule.required || [] });
    }

    for (const [field, fieldRule] of Object.entries(rule.enum_fields || {})) {
      if (!(field in params)) continue;
      const values = resolveValidationValues(fieldRule);
      if (!values.includes(String(params[field]))) {
        errors.push({ message: renderValidationMessage(fieldRule.message, values), field, issue: 'invalid_enum', actual: params[field], allowed_values: values });
      }
    }

    for (const fields of rule.paired || []) {
      const present = fields.filter(key => hasParamValue(params, key));
      if (present.length > 0 && present.length < fields.length) {
        errors.push({ message: `字段 '${fields.join("' 和 '")}' 应成对填写`, fields, issue: 'incomplete_pair', expected_fields: fields });
      }
    }

    for (const fields of rule.mutually_exclusive || []) {
      const present = fields.filter(key => hasParamValue(params, key));
      if (present.length > 1) {
        errors.push({ message: `字段 '${fields.join('/')}' 互斥，不应同时填写`, fields, issue: 'mutually_exclusive' });
      }
    }

    for (const [startKey, endKey] of rule.ordered_dates || []) {
      if (params[startKey] && params[endKey] && params[startKey] > params[endKey]) {
        errors.push({ message: `字段 '${startKey}' 不能晚于 '${endKey}'`, fields: [startKey, endKey], issue: 'invalid_order', expected: `${startKey} <= ${endKey}` });
      }
    }

    for (const [field, patternRule] of Object.entries(rule.patterns || {})) {
      if (!(field in params)) continue;
      const pattern = new RegExp(patternRule.pattern);
      if (!pattern.test(String(params[field]))) {
        errors.push({ message: patternRule.message || `字段 '${field}' 格式不合法`, field, issue: 'invalid_format', actual: params[field], expected_pattern: patternRule.pattern });
      }
    }

    for (const conditional of rule.required_one_of_when || []) {
      if (!conditional.values?.map(String).includes(String(params[conditional.field]))) continue;
      const satisfied = conditional.one_of?.some(group => group.every(key => hasParamValue(params, key)));
      if (!satisfied) errors.push({ message: conditional.message || `字段 '${conditional.field}' 当前取值缺少配套参数`, field: conditional.field, issue: 'missing_conditional_fields', one_of: conditional.one_of });
    }
  }
  return errors;
}

// ───── 认证 ─────

function getApiKey() {
  const globalConfig = join(homedir(), '.wind-aifinmarket', 'config');
  if (existsSync(globalConfig)) {
    try {
      const env = parseDotenv(readFileSync(globalConfig, 'utf8'));
      const key = env.WIND_API_KEY?.trim();
      if (key) return key;
    } catch {}
  }

  const localConfig = join(SKILL_DIR, 'config.json');
  if (existsSync(localConfig)) {
    try {
      const cfg = JSON.parse(readFileSync(localConfig, 'utf8'));
      const key = typeof cfg.wind_api_key === 'string' ? cfg.wind_api_key.trim() : '';
      if (key) return key;
    } catch {}
  }

  const envKey = process.env.WIND_API_KEY?.trim();
  if (envKey) return envKey;

  die('AUTH_ERROR', 'WIND_API_KEY 未配置（CLI 已完整检查：用户全局配置 > Skill 本地配置 > 环境变量）');
}

// section: 错误码 — message 来自 HTTP / JSON-RPC / 工具内嵌 JSON, 统一映射成稳定 code

const ERROR_PATTERNS = [
  ['TEMPORARILY_UNAVAILABLE', /temporarily_unavailable/i, '后端偶发不可用。'],
  ['EDB_INDICATOR_NOT_FOUND', /未找到匹配的(?:经济)?指标|indicator_not_found/i, 'EDB 未找到用户想查询的指标。'],
  ['MARKET_TARGET_NOT_FOUND', /market_target_not_found|NER-API error.*(?:识别合并后无结果|请确认输入内容是否包含实体)|comm_exception.*NER-API|未识别实体|未识别到有效的金融标的|ner_error/i, '行情类查询对象未识别。'],
  ['PARAM_TYPE_ERROR', /attribute_error|(?:'list' object has no attribute '(?:split|strip)')|(?:list object has no attribute (?:split|strip))/i, '参数类型错误：列表传给了只接受字符串的字段。'],
  ['PERIOD_PARSE_ERROR', /srv_internal_error|For input string:\s*\\?["\x27]?(?:day|daily|monthly|week|weekly|month|D|M|W)\\?["\x27]?/i, 'K 线周期值无法解析。'],
  ['INVALID_PARAM_VALUE', /invalid_param_value|Invalid value .* for field|参数值.*不合法|参数值错误/i, '后端参数值错误。'],
  ['INVALID_PARAM_NAME', /invalid_param_name|缺少必填参数|missing required/i, '后端参数名错误。'],
  ['DAILY_LIMIT_ERROR', /单日请求次数超限|daily.*(?:request|quota)?.*limit|daily.*limit.*exceed/i, '单日请求次数已超限。'],
  ['BALANCE_ERROR', /余额不足|请先充值|insufficient.*balance/i, '账户余额不足。'],
  ['RATE_LIMIT_ERROR', /请求过于频繁|qps.*limit|too.*frequent|rate.*limit/i, 'QPS 限流。'],
  ['AUTH_ERROR', /密钥无效|key.*invalid|unauthorized|认证失败|auth.*fail/i, '认证/权限错误。按 Key 机制修复后原样重试。'],
  ['NO_RESULTS', /未获取到数据|"NO_RESULTS"|no\s*results?|not\s*found|empty\s*result/i, '未获取到匹配数据。先在不改变用户意图的前提下调整关键词或参数。'],
  ['PARAM_VALIDATION_ERROR', /参数验证失败|参数.*(错误|非法|无效)|字段.*(不存在|不识别|不支持|非法)|invalid\s*(param|argument|field)|missing\s*(param|argument|field|required)/i, '后端参数验证失败。先按 SKILL.md 工具表核对字段名、必填项、日期格式和枚举值后重试。'],
  ['NETWORK_ERROR', /服务.*暂不可用|服务.*不可用|service\s+unavailable|temporarily\s+unavailable/i, '网络/后端错误。先核对参数再稍后重试。'],
  ['TOOL_RUNTIME_ERROR', /TOOL_ERROR|tool.*error|工具.*(执行|运行).*错误|runtime.*error/i, '后端工具运行错误。保留后端原文，先检查请求是否过大或口径是否受支持；不要直接切换工具绕过。'],
];

function inferErrorCode(msg) {
  if (!msg) return 'UNKNOWN';
  for (const [code, pat] of ERROR_PATTERNS) {
    if (pat.test(msg)) return code;
  }
  return 'UNKNOWN';
}

function inferBusinessErrorCode(inner, serverType) {
  const body = inner && typeof inner === 'object' ? inner.data : null;
  if (!body || typeof body !== 'object') return null;
  if (typeof body.code !== 'number' || body.code === 0) return null;
  const message = typeof body.message === 'string' ? body.message : JSON.stringify(body);
  if (serverType === 'economic_data' && body.code === 1003) return ['EDB_INDICATOR_NOT_FOUND', message];
  return [inferErrorCode(message), message];
}

// agent_action = 诊断 + 行动 一体的 NL 处方; 唯一总表在 references/error-codes.json
function loadAgentActions() {
  const fallback = {
    UNKNOWN: '未归类错误，不代表参数、工具或标的可修复。禁止原样重试、猜测参数、切换工具或扩大查询；先保留 detail 原文并判断是否属于本地命令/参数/认证/网络问题。只有能明确定位且有确定修正项时才允许修正后重试一次；无法明确定位则停止并将 detail 原文告知用户。',
  };
  try {
    const doc = JSON.parse(readFileSync(ERROR_CODES_PATH, 'utf8'));
    const codes = doc && typeof doc.codes === 'object' ? doc.codes : null;
    if (!codes) return fallback;
    return {
      ...fallback,
      ...Object.fromEntries(
        Object.entries(codes).filter(([, action]) => typeof action === 'string' && action.trim()),
      ),
    };
  } catch {
    return fallback;
  }
}

const AGENT_ACTIONS = loadAgentActions();

// detail 只保留短诊断，避免后端长文本淹没 agent_action。
function buildAgentAction(code, detail) {
  const template = AGENT_ACTIONS[code] || AGENT_ACTIONS.UNKNOWN;
  if (code === 'USAGE_ERROR') return template;
  if (detail && typeof detail === 'string' && detail.trim()) {
    const d = detail.trim().slice(0, 500);
    return `[${d}] ${template}`;
  }
  return template;
}

// section: MCP 调用 — 裸 HTTP + JSON-RPC, 响应兼容 SSE / 纯 JSON

function parseSSE(text) {
  const trimmed = text.trim();
  // 后端正常 SSE, 部分错误场景纯 JSON
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed);
    } catch {}
  }
  const lines = text.split(/\r?\n/);
  let last = null;
  for (const line of lines) {
    if (line.startsWith('data: ')) last = line.slice(6);
  }
  if (last) {
    try {
      return JSON.parse(last);
    } catch (e) {
      throw new Error(`SSE data 行 JSON 解析失败：${e.message}。原文前 200 字符：${text.slice(0, 200)}`);
    }
  }
  throw new Error(`响应格式无法识别（既非 SSE 也非纯 JSON）。原文前 200 字符：${text.slice(0, 200)}`);
}

const HTTP_ERROR_MAP = {
  401: ['AUTH_ERROR', 'API Key 无效或过期'],
  429: ['RATE_LIMIT_ERROR', '请求过于频繁'],
  500: ['NETWORK_ERROR', '服务端异常'],
  502: ['NETWORK_ERROR', '网关异常'],
  503: ['NETWORK_ERROR', '服务暂不可用'],
  504: ['NETWORK_ERROR', '网关超时'],
};

async function mcpRequest(server_type, method, params, {
  timeoutMs = 60_000,
  diagnosticContext = null,
} = {}) {
  const server = getServer(server_type);
  const apiKey = getApiKey();
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
  };

  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params
  });
  const dieMcp = (code, detail) => {
    if (code !== 'MARKET_TARGET_NOT_FOUND') die(code, detail);
    const originalInput = diagnosticContext?.original_input ?? params?.arguments?.windcode ?? null;
    const attemptedInput = diagnosticContext?.normalized_input ?? params?.arguments?.windcode ?? null;
    die(code, detail, 1, {
      details: {
        message: String(detail || '').slice(0, 500),
        field: 'windcode',
        issue: 'instrument_not_resolved',
        original_input: originalInput,
        normalized_input: attemptedInput,
        attempted_inputs: attemptedInput == null ? [] : [attemptedInput],
        candidates: [],
      },
      retry: { allowed: false, mode: 'after_user_correction', max_attempts: 0 },
      circuit_breaker: { tripped: true, scope: 'remaining_batch', action: 'abort_remaining_calls' },
      correction: {
        required: ['instrument_full_name_or_windcode'],
        requires_user_input: true,
        user_prompt: '请提供该标的的准确全称或 Wind 标准代码。',
        preserve_server_type: true,
        preserve_tool_name: true,
      },
    });
  };
  let resp;
  try {
    resp = await fetch(server.endpoint, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    die('NETWORK_ERROR', `${err.message} (server=${server_type})`);
  }

  if (!resp.ok) {
    const bodyText = await resp.text().catch(() => '');
    const code = HTTP_ERROR_MAP[resp.status]?.[0] || 'UNKNOWN';
    const detail = `HTTP ${resp.status} ${resp.statusText} (server=${server_type})` + (bodyText ? ` | body: ${bodyText.slice(0, 200)}` : '');
    die(code, detail);
  }

  const text = await resp.text();
  let payload;
  try {
    payload = parseSSE(text);
  } catch (err) {
    die('TOOL_RUNTIME_ERROR', `${err.message} (server=${server_type})`);
  }

  if (payload.error) {
    const msg = payload.error.message || JSON.stringify(payload.error);
    dieMcp(inferErrorCode(msg), `${msg} (server=${server_type})`);
  }

  if (payload.result?.isError) {
    const msg = payload.result.content?.[0]?.text || JSON.stringify(payload.result);
    dieMcp(inferErrorCode(msg), `${msg} (server=${server_type})`);
  }

  // 部分工具把业务错误包在 content[0].text 的 JSON 字符串里, 必须二次解析
  const innerText = payload.result?.content?.[0]?.text;
  if (typeof innerText === 'string') {
    let inner;
    try {
      inner = JSON.parse(innerText);
    } catch {
      inner = null;
    }
    if (inner) {
      if (typeof inner.mcp_tool_error_code === 'number' && inner.mcp_tool_error_code !== 0) {
        const msg = inner.mcp_tool_error_msg || JSON.stringify(inner);
        dieMcp(inferErrorCode(msg), `${msg} (server=${server_type})`);
      }
      if (inner.error && (inner.error.code || inner.error.message)) {
        const errCode = inner.error.code || '';
        const errMsg = inner.error.message || '';
        const combined = errCode ? `${errCode}: ${errMsg}` : errMsg;
        dieMcp(inferErrorCode(combined), `${combined} (server=${server_type})`);
      }
      const businessError = inferBusinessErrorCode(inner, server_type);
      if (businessError) {
        const [code, msg] = businessError;
        dieMcp(code, `${msg} (server=${server_type})`);
      }
    }
  }

  return payload.result;
}

async function mcpInitializeAndCall(server_type, method, params, diagnosticContext = null) {
  await mcpRequest(server_type, 'initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: {
      name: SKILL_NAME,
      version: SKILL_VERSION
    },
  }, {
    timeoutMs: 30_000
  });

  return mcpRequest(server_type, method, params, {
    timeoutMs: 600_000,
    diagnosticContext,
  });
}

// section: 命令

async function cmdCall(server_type, toolName, paramsJson) {
  if (!server_type || !toolName || !paramsJson) {
    exitWithUsage(
      `用法：call <server_type> <tool_name> '<params_json>'\n` +
      `可用 server_type: ${Object.keys(SERVERS).join(' / ')}\n` +
      `典型：\n  ${CALL_EXAMPLES.join('\n  ')}`,
      1,
    );
  }

  let args;
  try {
    args = JSON.parse(paramsJson);
  } catch (e) {
    die('INVALID_PARAMS_JSON', `params JSON 解析失败：${e.message} | 原文：${paramsJson.slice(0, 200)}`);
  }

  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    const actualType = Array.isArray(args) ? 'array' : typeof args;
    die('PARAM_TYPE_ERROR', 'params 必须是 JSON object', 1, {
      details: [{ field: 'params', issue: 'invalid_type', expected_type: 'object', actual_type: actualType }],
      retry: { allowed: true, mode: 'after_correction', max_attempts: 1 },
      circuit_breaker: { tripped: true, scope: 'remaining_batch', action: 'abort_remaining_calls' },
      correction: { change_only: ['params'], strategy: 'fix_from_error_details', requires_user_input: false, preserve_server_type: true, preserve_tool_name: true },
    });
  }

  const originalArgs = args && typeof args === 'object' && !Array.isArray(args) ? { ...args } : args;
  ({ server_type, toolName, args } = normalizeCall(server_type, toolName, args));
  validateToolSelection(server_type, toolName);

  const validationErrors = validateBasicParams(args);
  const paramsShapeInvalid = validationErrors.some(error => validationErrorCode(error) === 'PARAM_TYPE_ERROR' && error.field === 'params');
  if (!paramsShapeInvalid) validationErrors.push(...validateToolParams(toolName, args));
  if (validationErrors.length > 0) {
    const explicitCode = validationErrors.map(validationErrorCode).find(Boolean);
    const messages = validationErrors.map(validationErrorMessage);
    const hasTypeError = validationErrors.some(error => typeof error === 'object' && error?.issue === 'invalid_type');
    die(explicitCode || (hasTypeError ? 'PARAM_TYPE_ERROR' : 'PARAM_VALIDATION_ERROR'), messages.join('；'), 1, {
      details: validationErrors.map(error => typeof error === 'string' ? { message: error } : { ...error, code: undefined, message: undefined }),
      retry: { allowed: true, mode: 'after_correction', max_attempts: 1 },
      circuit_breaker: { tripped: true, scope: 'remaining_batch', action: 'abort_remaining_calls' },
      correction: {
        change_only: [...new Set(validationErrors.flatMap(error => error?.field ? [error.field] : error?.fields || []))],
        strategy: 'fix_from_error_details',
        requires_user_input: validationErrors.some(error => error?.issue === 'ambiguous_value'),
        preserve_server_type: true,
        preserve_tool_name: true,
      },
    });
  }

  const result = await mcpInitializeAndCall(server_type, 'tools/call', {
    name: toolName,
    arguments: args,
    _meta: { clientVersion: SKILL_VERSION },
  }, {
    original_input: originalArgs && typeof originalArgs === 'object' ? originalArgs.windcode : null,
    normalized_input: args && typeof args === 'object' ? args.windcode : null,
  });
  return {
    server_type,
    tool: toolName,
    result,
  };
}

async function cmdSetupKey(...rawArgs) {
  const key = rawArgs[0];

  if (!key || key.startsWith('--')) {
    exitWithUsage(
      `用法：cli.mjs setup-key <KEY> --scope <global|skill>\n\n` +
      `scope: global=全局共享；skill=仅当前 skill。调用前先让用户选择。`,
      1,
    );
  }

  let scope = null;
  for (let i = 1; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (a === '--scope' && rawArgs[i + 1]) {
      scope = rawArgs[i + 1];
      break;
    }
    if (a.startsWith('--scope=')) {
      scope = a.slice(8);
      break;
    }
  }

  if (!scope) {
    exitWithUsage(
      `setup-key 缺 --scope 参数。\n\n` +
      `先让用户选择 global 或 skill，再重试：cli.mjs setup-key ${maskKey(key)} --scope <global|skill>`,
      1,
    );
  }

  if (!['global', 'skill'].includes(scope)) {
    die('SETUP_ERROR', `setup-key 未知 scope: ${scope} (可选: global / skill)`);
  }

  let file;
  try {
    if (scope === 'global') {
      const dir = join(homedir(), '.wind-aifinmarket');
      if (!existsSync(dir)) mkdirSync(dir, {
        recursive: true
      });
      file = join(dir, 'config');
      let lines = [];
      if (existsSync(file)) {
        lines = readFileSync(file, 'utf8').split('\n')
          .filter(l => l.length > 0 && !/^\s*(export\s+)?WIND_API_KEY\s*=/.test(l));
      }
      lines.push(`WIND_API_KEY=${key}`);
      writeFileSync(file, lines.join('\n') + '\n', {
        mode: 0o600
      });
    } else {
      file = join(SKILL_DIR, 'config.json');
      writeFileSync(file, JSON.stringify({ wind_api_key: key }, null, 2) + '\n', { mode: 0o600 });
    }
  } catch (err) {
    die('SETUP_ERROR', `配置写入失败 (scope=${scope}, path=${file || 'n/a'}): ${err.message}`);
  }

  return {
    scope,
    path: file,
    key_masked: maskKey(key),
    next: '现在可以重试原 Wind 调用',
  };
}

async function cmdOpenPortal() {
  const platform = process.platform;
  let bin, args;
  if (platform === 'darwin') {
    bin = 'open';
    args = [PORTAL_URL];
  } else if (platform === 'win32') {
    bin = 'cmd';
    args = ['/c', 'start', '', PORTAL_URL];
  } else {
    bin = 'xdg-open';
    args = [PORTAL_URL];
  }

  let spawnError = null;
  try {
    const child = spawn(bin, args, {
      stdio: 'ignore',
      detached: true,
      windowsHide: true
    });
    child.unref();
    spawnError = await new Promise((resolve) => {
      child.once('error', resolve);
      setTimeout(() => resolve(null), 300);
    });
  } catch (err) {
    spawnError = err;
  }

  const data = {
    url: PORTAL_URL,
    platform,
    spawn_command: `${bin} ${args.join(' ')}`,
    flow_note: '未登录时会自动跳转到登录页（/#/login）；登录完成后回到 overview 页面即可获取 API Key。',
    fallback_message: `如果浏览器没有自动弹出，请手动访问：${PORTAL_URL}`,
  };
  if (spawnError) {
    die('SETUP_ERROR', `本地无法启动浏览器: ${spawnError.message} | 用户应手动打开 ${data.url}`);
  }
  return data;
}

// 诊断: 输出自动更新状态
async function cmdDiagnose() {
  let updateState = null;
  try {
    const stateFile = updateStateFile();
    if (existsSync(stateFile)) {
      updateState = JSON.parse(readFileSync(stateFile, 'utf8'));
    }
  } catch {
    updateState = { status: 'unreadable' };
  }
  return {
    platform: process.platform,
    node_pid: process.pid,
    update_scope: updateScope(),
    update_state_file: updateStateFile(),
    update_state: updateState,
    next_update_needed: !alreadyUpdatedToday(),
  };
}

// section: 主入口 — IS_MAIN guard 让单元测试 import 不副作用
const IS_MAIN = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (IS_MAIN) runMain();

function runMain() {
const [cmd, ...args] = process.argv.slice(2);

const USAGE =
  `wind-mcp-skill\n` +
  `访问万得 Wind 金融数据（按数据域分类调用）\n\n` +
  `用法:\n` +
  `  cli.mjs call <server_type> <tool_name> '<params_json>'\n` +
  `  cli.mjs open-portal                                # 打开万得开发者中心拿 API Key\n` +
  `  cli.mjs setup-key <KEY> --scope <global|skill>     # 配置 API Key（先问用户存放位置）\n\n` +
  `可用 server_type:\n` +
  Object.entries(SERVERS).map(([k, v]) => `  ${k.padEnd(20)}${v.label}`).join('\n') + '\n\n' +
  `典型:\n` +
  `  ${CALL_EXAMPLES.join('\n  ')}`;

const commands = {
  call: () => cmdCall(args[0], args[1], args[2]),
  'open-portal': () => cmdOpenPortal(),
  'setup-key': () => cmdSetupKey(...args),
  diagnose: () => cmdDiagnose(),
};

if (!cmd) {
  // help: 直接输出 USAGE 纯文本
  process.stdout.write(USAGE + '\n');
  process.exit(0);
}

if (!commands[cmd]) {
  die('USAGE_ERROR', `未知命令: ${cmd}\nUSAGE:\n${USAGE}`);
}

commands[cmd]()
  .then((data) => {
    if (cmd === 'call') {
      // call: 透传 result 内容 (parse JSON if applicable, else raw text)
      writeRawCallSuccess(data?.result);
      setTimeout(triggerUpdateCheck, 0);
    } else {
      // open-portal / setup-key: 直接输出结构化数据 (无 envelope 包裹)
      writePlainSuccess(data);
    }
  })
  .catch((err) => {
    die('UNKNOWN', `执行失败: ${err.message || err}${err.stack ? ' | stack: ' + err.stack.slice(0, 300) : ''}`);
  });
}
