#!/usr/bin/env node
// wind-mcp-skill CLI (Plan C): thin JSON-envelope wrapper around Wind MCP servers
// WITH built-in JSON Schema-based parameter validation
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const SKILL_VERSION = '2.0.0-plan-c';

// 本地 registry: 工具选择可在任何网络调用前失败
const SERVERS = {
  stock_data: {
    endpoint: 'https://mcp.wind.com.cn/vserver_stock_data/mcp/',
    label: 'Wind A 股股票（选股筛选 + 档案/财务/股本/事件/技术/风险 + 行情/K线/分钟）',
  },
  global_stock_data: {
    endpoint: 'https://mcp.wind.com.cn/vserver_global_stock_data/mcp/',
    label: 'Wind 全球股票/港股美股（港美股筛选 + 档案/财务/股本/事件/技术/风险 + 行情/K线/分钟）',
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
const TOOL_PARAMS_PATH = join(SKILL_DIR, 'scripts', 'schemas', 'tool-params.json');
const INDICATORS_PATH = join(SKILL_DIR, 'scripts', 'schemas', 'indicators.json');
const SKILL_NAME = basename(SKILL_DIR);

const CALL_EXAMPLES = [
  `cli.mjs call stock_data search_stocks '{"question":"筛选沪深市场市值超500亿且连续5日上涨的股票"}'`,
  `cli.mjs call global_stock_data search_global_stocks '{"question":"筛选港股中市值超1000亿港元的科技股"}'`,
  `cli.mjs call fund_data search_funds '{"question":"筛选股票型基金中近一年收益率超20%的产品"}'`,
  `cli.mjs call stock_data get_stock_basicinfo '{"question":"600519.SH公司基本档案"}'`,
  `cli.mjs call stock_data get_stock_price_indicators '{"windcode":"600519.SH","indexes":"中文简称,最新成交价,涨跌幅"}'`,
  `cli.mjs call fund_data get_fund_kline '{"windcode":"588200.SH","begin_date":"20260401","end_date":"20260430"}'`,
  `cli.mjs call global_stock_data get_global_stock_quote '{"windcode":"AAPL.O"}'`,
  `cli.mjs call index_data get_index_kline '{"windcode":"000300.SH","begin_date":"20260401","end_date":"20260430"}'`,
  `cli.mjs call financial_docs get_financial_news '{"query":"美联储利率政策","top_k":3}'`,
  `cli.mjs call economic_data get_economic_data '{"metricIdsStr":"中国GDP"}'`,
  `cli.mjs call analytics_data get_financial_data '{"question":"查询中国A股市场过去一年的平均成交量"}'`,
];

// ───── 自动更新 ─────

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

function writeRawCallSuccess(result) {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

function writePlainSuccess(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

function writeErrorEnvelope(code, detail) {
  const envelope = {
    ok: false,
    error: {
      code,
      agent_action: buildAgentAction(code, detail),
    },
  };
  process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
}

function die(code, detail = null, exitCode = 1) {
  writeErrorEnvelope(code, detail);
  process.exit(exitCode);
}

function exitWithUsage(usage, exitCode = 0) {
  die('USAGE_ERROR', `USAGE:\n${usage}`, exitCode);
}

function maskKey(key) {
  if (!key || key.length < 8) return '***';
  return key.slice(0, 4) + '***' + key.slice(-4);
}

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
    die('ROUTE_ERROR', `未知 server_type: ${server_type}. 可用: ${Object.keys(SERVERS).join(' / ')}`);
  }
  return server;
}

function loadToolManifest() {
  try {
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
    die('ROUTE_ERROR', `工具名 "${toolName}" 不属于 server_type "${server_type}"。`);
  }
}

// ───── 认证 ─────

function getApiKey() {
  if (process.env.WIND_API_KEY) return process.env.WIND_API_KEY;

  const localConfig = join(SKILL_DIR, 'config.json');
  if (existsSync(localConfig)) {
    try {
      const cfg = JSON.parse(readFileSync(localConfig, 'utf8'));
      if (cfg.wind_api_key) return cfg.wind_api_key;
    } catch {}
  }

  const globalConfig = join(homedir(), '.wind-aifinmarket', 'config');
  if (existsSync(globalConfig)) {
    try {
      const env = parseDotenv(readFileSync(globalConfig, 'utf8'));
      if (env.WIND_API_KEY) return env.WIND_API_KEY;
    } catch {}
  }

  die('AUTH_ERROR', 'WIND_API_KEY 未配置');
}

// section: 参数校验 (Plan C core)

let _toolParamsCache = null;
function loadToolParams() {
  if (_toolParamsCache) return _toolParamsCache;
  try {
    _toolParamsCache = JSON.parse(readFileSync(TOOL_PARAMS_PATH, 'utf8'));
    return _toolParamsCache;
  } catch (err) {
    die('UNKNOWN', `工具参数 Schema 读取失败: ${err.message}`);
  }
}

let _indicatorsCache = null;
function loadIndicators() {
  if (_indicatorsCache) return _indicatorsCache;
  try {
    _indicatorsCache = JSON.parse(readFileSync(INDICATORS_PATH, 'utf8'));
    return _indicatorsCache;
  } catch (err) {
    die('UNKNOWN', `指标词典读取失败: ${err.message}`);
  }
}

function buildAllIndicatorSet() {
  const data = loadIndicators();
  const all = new Set();
  for (const indicators of Object.values(data.categories)) {
    for (const ind of indicators) {
      all.add(ind);
    }
  }
  return all;
}

function findIndicatorCategory(name) {
  const data = loadIndicators();
  for (const [category, indicators] of Object.entries(data.categories)) {
    if (indicators.includes(name)) return category;
  }
  return null;
}

function suggestSimilarIndicators(name, allIndicators) {
  // Simple similarity: find indicators sharing at least 2 consecutive characters
  const candidates = [];
  for (const ind of allIndicators) {
    // Check if name is a substring or vice versa
    if (ind.includes(name) || name.includes(ind)) {
      candidates.push(ind);
      continue;
    }
    // Check shared bigrams
    let shared = 0;
    for (let i = 0; i < name.length - 1; i++) {
      const bigram = name.slice(i, i + 2);
      if (ind.includes(bigram)) shared++;
    }
    if (shared >= 2) candidates.push(ind);
  }
  return candidates.slice(0, 8);
}

const YYYYMMDD_REGEX = /^\d{8}$/;
const NON_BLANK_STRING_KEYS = new Set(['question', 'query', 'metricIdsStr', 'windcode', 'indexes']);
const NO_WHITESPACE_STRING_KEYS = new Set(['question', 'query', 'metricIdsStr']);

function isValidDate(val) {
  if (!YYYYMMDD_REGEX.test(val)) return false;
  const y = parseInt(val.slice(0, 4), 10);
  const m = parseInt(val.slice(4, 6), 10);
  const d = parseInt(val.slice(6, 8), 10);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Validate params against the tool's JSON Schema.
 * Returns an array of specific error strings, or empty array if valid.
 */
function validateParams(server_type, tool_name, params) {
  const errors = [];
  const toolParams = loadToolParams();

  const serverSchema = toolParams[server_type];
  if (!serverSchema) return errors; // unknown server_type already caught by route validation

  const toolSchema = serverSchema[tool_name];
  if (!toolSchema) return errors; // unknown tool_name already caught by route validation

  const schema = toolSchema.params;
  const props = schema.properties || {};
  const required = schema.required || [];
  const allowedKeys = new Set(Object.keys(props));

  // 1. Check for unknown properties
  for (const key of Object.keys(params)) {
    if (!allowedKeys.has(key)) {
      const availableList = [...allowedKeys].join(', ');
      errors.push(
        `字段 '${key}' 不存在于工具 ${tool_name} 的参数表中，可用字段：${availableList}`
      );
    }
  }

  // 2. Check required properties
  for (const req of required) {
    if (!(req in params)) {
      errors.push(
        `缺少必填字段 '${req}'。工具 ${tool_name} 的必填字段：${required.join(', ')}`
      );
    }
  }

  // 3. Validate each present property
  for (const [key, value] of Object.entries(params)) {
    const propSchema = props[key];
    if (!propSchema) continue; // already reported as unknown

    // Type check
    if (propSchema.type === 'string' && typeof value !== 'string') {
      errors.push(`字段 '${key}' 必须是字符串，实际类型：${typeof value}`);
      continue;
    }
    if (propSchema.type === 'number' && typeof value !== 'number') {
      errors.push(`字段 '${key}' 必须是数字，实际类型：${typeof value}`);
      continue;
    }
    if (NON_BLANK_STRING_KEYS.has(key) && typeof value === 'string' && value.trim().length === 0) {
      errors.push(`字段 '${key}' 不能为空或全空白`);
      continue;
    }
    if (NO_WHITESPACE_STRING_KEYS.has(key) && typeof value === 'string' && /\s/.test(value)) {
      errors.push(`字段 '${key}' 不得含空格或其它空白字符`);
      continue;
    }

    // singleValue constraint (windcode must be single string, not array)
    if (propSchema.singleValue && typeof value === 'string') {
      if (value.includes(',')) {
        errors.push(
          `字段 '${key}' 只允许单个标的，禁止逗号拼接多代码。当前值包含逗号。多标的对比请拆成多次调用。`
        );
      }
      if (Array.isArray(value) || (typeof value === 'string' && value.startsWith('['))) {
        errors.push(
          `字段 '${key}' 只允许单个标的，禁止数组或多个代码拼接。多标的对比请拆成多次调用。`
        );
      }
    }

    // Date format validation
    if (propSchema.format === 'yyyyMMdd' && typeof value === 'string') {
      if (!isValidDate(value)) {
        errors.push(
          `字段 '${key}' 日期格式错误：'${value}'，要求 yyyyMMdd（如 20260401）`
        );
      }
    }

    // yyyyMMdd or LAST
    if (propSchema.format === 'yyyyMMddOrLAST' && typeof value === 'string') {
      if (value !== 'LAST' && !isValidDate(value)) {
        errors.push(
          `字段 '${key}' 格式错误：'${value}'，要求 yyyyMMdd（如 20260401）或 LAST`
        );
      }
    }

    // Enum validation
    if (propSchema.enum && typeof value === 'string') {
      if (!propSchema.enum.includes(value)) {
        let enumDisplay;
        if (propSchema.enumLabels) {
          enumDisplay = propSchema.enum.map(e => `${e}(${propSchema.enumLabels[e]})`).join(', ');
        } else {
          enumDisplay = propSchema.enum.join(', ');
        }
        errors.push(
          `字段 '${key}' 的值 '${value}' 不合法。可用值：${enumDisplay}`
        );
      }
    }

    // Indicator validation for indexes fields
    if (propSchema.validateIndicators && typeof value === 'string') {
      const allIndicators = buildAllIndicatorSet();
      const indicatorNames = value.split(',').map(s => s.trim()).filter(s => s.length > 0);
      if (indicatorNames.length === 0) {
        errors.push(`字段 '${key}' 至少需要一个指标名`);
        continue;
      }
      for (const indName of indicatorNames) {
        if (!allIndicators.has(indName)) {
          const category = findIndicatorCategory(indName);
          if (!category) {
            const suggestions = suggestSimilarIndicators(indName, [...allIndicators]);
            let msg = `指标 '${indName}' 不在指标词典中。`;
            if (suggestions.length > 0) {
              msg += ` 相似指标：${suggestions.join(', ')}`;
            } else {
              msg += ` 无相似项（可能是英文/拼音/口语词）。运行 node scripts/cli.mjs list-indicators 查看全部类别，再 list-indicators <类别> 查看具体字段。`;
            }
            errors.push(msg);
          }
        }
      }
    }
  }

  return errors;
}

// section: 错误码

const ERROR_PATTERNS = [
  ['TEMPORARILY_UNAVAILABLE', /temporarily_unavailable/i, '后端偶发不可用。'],
  ['INVALID_PARAM_VALUE', /invalid_param_value/i, '后端参数值错误。'],
  ['INVALID_PARAM_NAME', /invalid_param_name/i, '后端参数名错误。'],
  ['QUOTA_ERROR', /单日请求次数超限|daily.*limit|余额不足|请先充值|insufficient.*balance|请求过于频繁|qps.*limit|too.*frequent/i, '额度/限流错误。等待额度刷新、换备用 Key 或充值后原样重试。'],
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

function loadAgentActions() {
  const fallback = {
    UNKNOWN: '未知错误。不要盲目重试；先查看当前错误详情，能定位本地问题（参数 / 配置 / 网络）则修正后重试一次，无法定位则保留原文告知用户并停止。',
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

function buildAgentAction(code, detail) {
  const template = AGENT_ACTIONS[code] || AGENT_ACTIONS.UNKNOWN;
  if (code === 'USAGE_ERROR') return template;
  if (detail && typeof detail === 'string' && detail.trim()) {
    const d = detail.trim().slice(0, 500);
    return `[${d}] ${template}`;
  }
  return template;
}

// section: MCP 调用

function parseSSE(text) {
  const trimmed = text.trim();
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
  429: ['QUOTA_ERROR', '请求过于频繁'],
  500: ['NETWORK_ERROR', '服务端异常'],
  502: ['NETWORK_ERROR', '网关异常'],
  503: ['NETWORK_ERROR', '服务暂不可用'],
  504: ['NETWORK_ERROR', '网关超时'],
};

async function mcpRequest(server_type, method, params, {
  timeoutMs = 60_000
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
    die(inferErrorCode(msg), `${msg} (server=${server_type})`);
  }

  if (payload.result?.isError) {
    const msg = payload.result.content?.[0]?.text || JSON.stringify(payload.result);
    die(inferErrorCode(msg), `${msg} (server=${server_type})`);
  }

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
        die(inferErrorCode(msg), `${msg} (server=${server_type})`);
      }
      if (inner.error && (inner.error.code || inner.error.message)) {
        const errCode = inner.error.code || '';
        const errMsg = inner.error.message || '';
        const combined = errCode ? `${errCode}: ${errMsg}` : errMsg;
        die(inferErrorCode(combined), `${combined} (server=${server_type})`);
      }
    }
  }

  return payload.result;
}

async function mcpInitializeAndCall(server_type, method, params) {
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
    timeoutMs: 600_000
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

  validateToolSelection(server_type, toolName);

  let args;
  try {
    args = JSON.parse(paramsJson);
  } catch (e) {
    die('INVALID_PARAMS_JSON', `params JSON 解析失败：${e.message} | 原文：${paramsJson.slice(0, 200)}`);
  }

  // ───── Plan C: 本地参数校验 ─────
  const validationErrors = validateParams(server_type, toolName, args);
  if (validationErrors.length > 0) {
    const detail = validationErrors.join('；');
    die('PARAM_VALIDATION_ERROR', detail);
  }
  // ───── End Plan C ─────

  const result = await mcpInitializeAndCall(server_type, 'tools/call', {
    name: toolName,
    arguments: args,
    _meta: { clientVersion: SKILL_VERSION },
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

/**
 * show-tool: Display the parameter schema for a specific tool.
 * Usage: cli.mjs show-tool <server_type> <tool_name>
 */
function cmdShowTool(server_type, toolName) {
  if (!server_type || !toolName) {
    exitWithUsage(
      `用法：show-tool <server_type> <tool_name>\n` +
      `示例：show-tool stock_data get_stock_quote\n` +
      `可用 server_type: ${Object.keys(SERVERS).join(' / ')}`,
      1,
    );
  }

  // Validate route exists
  getServer(server_type);
  const manifest = loadToolManifest();
  const tools = manifest[server_type];
  if (!tools.includes(toolName)) {
    die('ROUTE_ERROR', `工具名 "${toolName}" 不属于 server_type "${server_type}"。可用工具：${tools.join(', ')}`);
  }

  const toolParams = loadToolParams();
  const serverSchema = toolParams[server_type];
  if (!serverSchema || !serverSchema[toolName]) {
    die('UNKNOWN', `工具 ${server_type}.${toolName} 的参数 Schema 未定义`);
  }

  const toolSchema = serverSchema[toolName];
  const schema = toolSchema.params;
  const props = schema.properties || {};
  const required = schema.required || [];

  // Build concise output
  const lines = [];
  lines.push(`=== ${server_type}.${toolName} ===`);
  lines.push(`描述: ${toolSchema.description}`);
  lines.push(`必填: ${required.length > 0 ? required.join(', ') : '(无)'}`);
  lines.push('');
  lines.push('参数:');
  for (const [key, prop] of Object.entries(props)) {
    const req = required.includes(key) ? '[必填]' : '[可选]';
    let line = `  ${key} ${req} (${prop.type}) - ${prop.description || ''}`;
    if (prop.enum) {
      if (prop.enumLabels) {
        line += ` | 可选值: ${prop.enum.map(e => `${e}=${prop.enumLabels[e]}`).join(', ')}`;
      } else {
        line += ` | 可选值: ${prop.enum.join(', ')}`;
      }
    }
    lines.push(line);
  }

  process.stdout.write(lines.join('\n') + '\n');
  process.exit(0);
}

/**
 * list-indicators: discover valid indexes values (Plan C dropped indicators.md,
 * so this is the agent's only way to enumerate the indicator dictionary).
 * Usage: cli.mjs list-indicators [category]
 */
function cmdListIndicators(category) {
  const data = loadIndicators();
  const cats = data.categories || {};
  const lines = [];
  if (category) {
    const norm = s => s.replace(/\s/g, '');
    const match = Object.keys(cats).find(c => c === category)
      || Object.keys(cats).find(c => norm(c).includes(norm(category)));
    if (!match) {
      die('UNKNOWN', `未知指标类别: ${category}。可用类别：${Object.keys(cats).join(' / ')}`);
    }
    lines.push(`=== ${match} (${cats[match].length}) ===`);
    lines.push(cats[match].join(', '));
  } else {
    lines.push('指标类别（再用 list-indicators <类别> 查看该类别下的精确字段名，如 list-indicators 估值）:');
    for (const [c, arr] of Object.entries(cats)) {
      lines.push(`  ${c} (${arr.length})`);
    }
  }
  process.stdout.write(lines.join('\n') + '\n');
  process.exit(0);
}

// section: 主入口

const IS_MAIN = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (IS_MAIN) runMain();

function runMain() {
const [cmd, ...args] = process.argv.slice(2);

const USAGE =
  `Wind 万得金融数据 CLI（内置参数校验）\n` +
  `访问万得 Wind 金融数据（按数据域分类调用）\n\n` +
  `用法:\n` +
  `  cli.mjs call <server_type> <tool_name> '<params_json>'\n` +
  `  cli.mjs show-tool <server_type> <tool_name>              # 显示工具参数 Schema\n` +
  `  cli.mjs list-indicators [类别]                           # 列出可用行情指标（indexes 取值）\n` +
  `  cli.mjs open-portal                                # 打开万得开发者中心拿 API Key\n` +
  `  cli.mjs setup-key <KEY> --scope <global|skill>     # 配置 API Key（先问用户存放位置）\n` +
  `  cli.mjs diagnose                                   # 诊断自动更新状态\n\n` +
  `可用 server_type:\n` +
  Object.entries(SERVERS).map(([k, v]) => `  ${k.padEnd(20)}${v.label}`).join('\n') + '\n\n' +
  `典型:\n` +
  `  ${CALL_EXAMPLES.join('\n  ')}`;

const commands = {
  call: () => cmdCall(args[0], args[1], args[2]),
  'show-tool': () => cmdShowTool(args[0], args[1]),
  'list-indicators': () => cmdListIndicators(args[0]),
  'open-portal': () => cmdOpenPortal(),
  'setup-key': () => cmdSetupKey(...args),
  diagnose: () => cmdDiagnose(),
};

if (!cmd) {
  process.stdout.write(USAGE + '\n');
  process.exit(0);
}

if (!commands[cmd]) {
  die('USAGE_ERROR', `未知命令: ${cmd}\nUSAGE:\n${USAGE}`);
}

commands[cmd]()
  .then((data) => {
    if (cmd === 'call') {
      writeRawCallSuccess(data?.result);
      setTimeout(triggerUpdateCheck, 0);
    } else {
      writePlainSuccess(data);
    }
  })
  .catch((err) => {
    die('UNKNOWN', `执行失败: ${err.message || err}${err.stack ? ' | stack: ' + err.stack.slice(0, 300) : ''}`);
  });
}
