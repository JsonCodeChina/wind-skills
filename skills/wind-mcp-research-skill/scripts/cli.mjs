#!/usr/bin/env node
// wind-mcp-research-skill CLI —— 7 个 Wind MCP server / 132 个工具的统一入口。
//
// 契约：stdout 只有两种形态。成功是数据对象；失败是 {"ok":false,"code":...,"message":...}。
//
// 本文件是**运行时**的全部内容，按四段组织：传输层 → 参数校验 → 注册表读取 → 命令与信封。
// 重建注册表和契约文档的代码在 build.mjs（`refresh` 时才动态加载）；skill 自更新在 update-check.mjs。
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = dirname(SCRIPTS_DIR);
const SKILL_NAME = basename(SKILL_DIR);
const UPDATE_CHECK_PATH = join(SCRIPTS_DIR, 'update-check.mjs');

export const REGISTRY_PATH = join(SCRIPTS_DIR, 'registry.json');
export const ANNOTATIONS_PATH = join(SCRIPTS_DIR, 'annotations.json');

// #region 传输层：MCP Streamable HTTP（JSON-RPC 2.0 over POST，服务端 stateless、无 session id）
export const ENDPOINT_BASE = 'https://mcp.wind.com.cn';
export const PROTOCOL_VERSION = '2025-03-26';
export const CLIENT_INFO = { name: 'wind-mcp-research-skill', version: '1.0.0' };

// 结构化异常：CLI 据此选错误码，不必再解析 message 文本。
export class McpError extends Error {
  constructor(code, message, meta = {}) {
    super(message);
    this.code = code;
    this.meta = meta;
  }
}

const HTTP_ERROR_MAP = {
  400: 'BACKEND_ERROR',
  401: 'AUTH_ERROR',
  403: 'AUTH_ERROR',
  404: 'ROUTE_ERROR',
  429: 'RATE_LIMIT_ERROR',
  500: 'NETWORK_ERROR',
  502: 'NETWORK_ERROR',
  503: 'NETWORK_ERROR',
  504: 'NETWORK_ERROR',
};

// ---- API Key：~/.wind-aifinmarket/config > <skill>/config.json > $WIND_API_KEY ----
export function getApiKey() {
  const sources = [];
  const globalConfig = join(homedir(), '.wind-aifinmarket', 'config');
  sources.push(globalConfig);
  if (existsSync(globalConfig)) {
    const m = readFileSync(globalConfig, 'utf8').match(/^\s*WIND_API_KEY\s*=\s*(.+)$/m);
    const v = m && m[1].trim().replace(/^["']|["']$/g, '');
    if (v) return { key: v, source: globalConfig };
  }
  const localConfig = join(SKILL_DIR, 'config.json');
  sources.push(localConfig);
  if (existsSync(localConfig)) {
    try {
      const v = JSON.parse(readFileSync(localConfig, 'utf8')).wind_api_key?.trim();
      if (v) return { key: v, source: localConfig };
    } catch { /* 配置损坏时继续找下一个来源 */ }
  }
  sources.push('$WIND_API_KEY');
  if (process.env.WIND_API_KEY?.trim()) return { key: process.env.WIND_API_KEY.trim(), source: '$WIND_API_KEY' };
  throw new McpError('AUTH_ERROR', `未找到 WIND_API_KEY，依次查过：${sources.join('、')}`, { sources });
}

// ---- 响应体：正常走 SSE，部分错误场景直接返回纯 JSON，两种都要兼容 ----
export function parseBody(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    try { return JSON.parse(trimmed); } catch { /* 落到 SSE 分支 */ }
  }
  let last = null;
  for (const line of text.split(/\r?\n/)) if (line.startsWith('data: ')) last = line.slice(6);
  if (last) return JSON.parse(last);
  throw new McpError('NETWORK_ERROR', `响应无法解析（长度 ${text.length}）：${text.slice(0, 200)}`);
}

// 业务错误的判定：七个 server 普遍把「服务暂时不可用」这类错误当成 isError=false 的纯文本返回，
// 只看协议层会把报错当数据交给用户。文本短 + 命中错误词才算，避免误伤正常的短答案。
const BUSINESS_ERROR_RE = /服务暂时不可用|数据源当前不可用|请稍后重试|未识别到有效|没有搜索到|数据为空|内部错误|不能大于|参数错误|请填写|不正确|无效的|不支持的|非法|Invalid |Error:/;
export const BUSINESS_ERROR_MAX_LEN = 200;

export function sniffBusinessError(text) {
  if (typeof text !== 'string') return false;
  const t = text.trim();
  if (!t) return true;
  if (t.length > BUSINESS_ERROR_MAX_LEN) return false;
  return BUSINESS_ERROR_RE.test(t);
}

export function endpointOf(fullName) {
  return `${ENDPOINT_BASE}/${fullName}/mcp/`;
}

async function rpc(endpoint, method, params, { key, timeoutMs, fetchFn = fetch }) {
  let res;
  try {
    res = await fetchFn(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
      },
      // id 必须是整数：传浮点数服务端会返回空响应体
      body: JSON.stringify({ jsonrpc: '2.0', id: Math.floor(Date.now()), method, params }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const aborted = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    throw new McpError('NETWORK_ERROR', aborted ? `请求超时（${timeoutMs}ms）：${method}` : `网络请求失败：${e?.message || e}`);
  }
  const text = await res.text();
  if (!res.ok) {
    throw new McpError(HTTP_ERROR_MAP[res.status] || 'NETWORK_ERROR', `HTTP ${res.status}：${text.slice(0, 300)}`, { status: res.status });
  }
  const payload = parseBody(text);
  if (payload.error) {
    throw new McpError('BACKEND_ERROR', payload.error.message || JSON.stringify(payload.error), { jsonrpc: payload.error });
  }
  return payload.result;
}

// 服务端 stateless：每条 tools/* 请求前都要重新 initialize。
export async function session(fullName, { timeoutMs = 300000, fetchFn = fetch, key } = {}) {
  const endpoint = endpointOf(fullName);
  const apiKey = key ?? getApiKey().key;
  await rpc(endpoint, 'initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO }, { key: apiKey, timeoutMs: Math.min(timeoutMs, 60000), fetchFn });
  return (method, params) => rpc(endpoint, method, params, { key: apiKey, timeoutMs, fetchFn });
}

export async function listTools(fullName, opts = {}) {
  const send = await session(fullName, { timeoutMs: 60000, ...opts });
  return (await send('tools/list', {})).tools || [];
}

export async function callTool(fullName, toolName, args, opts = {}) {
  const send = await session(fullName, opts);
  const result = await send('tools/call', { name: toolName, arguments: args });
  const text = (result?.content || []).map((c) => c.text || '').join('\n');
  return {
    result,
    text,
    isError: !!result?.isError,
    suspectError: !result?.isError && sniffBusinessError(text),
  };
}
// #endregion 传输层

// #region 参数校验：全部规则从 registry.json 的 inputSchema 推导，不维护第二份工具清单。
export function checkUnknownKeys(schema, params) {
  const allowed = Object.keys(schema.properties || {});
  const unknown = Object.keys(params).filter((k) => !allowed.includes(k));
  if (!unknown.length) return null;
  return {
    code: 'PARAM_VALIDATION_ERROR',
    message: `未知参数 ${unknown.map((k) => `'${k}'`).join('、')}；该工具只接受：${allowed.join('、') || '（无参数）'}。后端会静默忽略未知字段并返回默认范围的数据，因此本地直接拦截。`,
  };
}

export function checkRequired(schema, params) {
  const missing = (schema.required || []).filter((k) => params[k] === undefined || params[k] === null || params[k] === '');
  if (!missing.length) return null;
  return {
    code: 'PARAM_VALIDATION_ERROR',
    message: `缺少必填参数 ${missing.map((k) => `'${k}'`).join('、')}。`,
  };
}

function typeName(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function typeMatches(expected, value) {
  const actual = typeName(value);
  if (!expected) return true;
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  if (expected === 'integer') return actual === 'integer';
  return actual === expected;
}

export function checkTypes(schema, params) {
  const errors = [];
  for (const [k, v] of Object.entries(params)) {
    const p = (schema.properties || {})[k];
    if (!p || !p.type) continue;
    // 部分工具 schema 声明 type=integer 却给出字符串 enum（如 finance.quote_get_historical_data_series.type）。
    // 有 enum 时以 enum 为准，类型放行，交给 checkEnums 判。
    if (p.enum && p.type !== 'array') continue;
    if (!typeMatches(p.type, v)) {
      errors.push(`'${k}' 应为 ${p.type}，实际是 ${typeName(v)}`);
    }
  }
  if (!errors.length) return null;
  return { code: 'PARAM_TYPE_ERROR', message: `参数类型不符：${errors.join('；')}。` };
}

// 有些字段的 enum 只声明了英文系统值，说明里却写明「中文键与英文值等价」并附一段「映射关系」
// （futures 的 sector / warehouse_receipt.type）。实测后端两种都收，所以别名要一并放行，
// 否则本地会把合法调用挡在门外。
export function enumAliases(prop) {
  const aliases = new Set();
  if (!prop?.enum) return aliases;
  const canonical = new Set(prop.enum.map(String));
  for (const m of String(prop.description || '').matchAll(/^\s*[•·*-]\s*(.+?)\s*=\s*(.+?)\s*$/gm)) {
    const [, left, right] = m;
    if (canonical.has(left) && !canonical.has(right)) aliases.add(right);
    else if (canonical.has(right) && !canonical.has(left)) aliases.add(left);
  }
  return aliases;
}

export function checkEnums(schema, params) {
  const errors = [];
  for (const [k, v] of Object.entries(params)) {
    const p = (schema.properties || {})[k];
    if (!p?.enum) continue;
    const aliases = enumAliases(p);
    const allowed = p.enum.map(String);
    const accepted = new Set([...allowed, ...aliases]);
    // type=array 时 enum 约束的是数组元素，不是数组本身。
    const values = p.type === 'array' ? (Array.isArray(v) ? v : [v]) : [v];
    for (const one of values) {
      if (!accepted.has(String(one))) {
        const shown = allowed.length > 12 ? allowed.slice(0, 12).join('、') + ` …（共 ${allowed.length} 项，用 describe 看全）` : allowed.join('、');
        const aliasNote = aliases.size ? `；另接受等价写法：${[...aliases].slice(0, 12).join('、')}` : '';
        errors.push(`'${k}' 的值 ${JSON.stringify(one)} 不在允许集合内：${shown}${aliasNote}`);
      }
    }
  }
  if (!errors.length) return null;
  return { code: 'PARAM_VALIDATION_ERROR', message: `参数取值不符：${errors.join('；')}。` };
}

// 数组类字段的 minItems / maxItems / uniqueItems 由 schema 声明（如 fund 批量工具的 windCodes 上限 50）。
// 本地拦住超限比让后端截断或报错更省一次调用。
export function checkArrayBounds(schema, params) {
  const errors = [];
  for (const [k, v] of Object.entries(params)) {
    const p = (schema.properties || {})[k];
    if (!p || p.type !== 'array' || !Array.isArray(v)) continue;
    if (p.minItems !== undefined && v.length < p.minItems) errors.push(`'${k}' 至少 ${p.minItems} 项，实际 ${v.length} 项`);
    if (p.maxItems !== undefined && v.length > p.maxItems) errors.push(`'${k}' 最多 ${p.maxItems} 项，实际 ${v.length} 项，请分批调用`);
    if (p.uniqueItems && new Set(v.map((x) => JSON.stringify(x))).size !== v.length) errors.push(`'${k}' 不允许重复元素`);
  }
  if (!errors.length) return null;
  return { code: 'PARAM_VALIDATION_ERROR', message: `数组参数越界：${errors.join('；')}。` };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/;

// 日期格式要求直接从 schema 的 description 推导：写了 YYYY-MM-DD 且带 HH 的是日期时间，否则是纯日期。
export function dateKindOf(prop) {
  const text = `${prop?.title || ''} ${prop?.description || ''}`;
  if (!/YYYY-MM-DD/.test(text)) return null;
  if (/LAST/.test(text)) return null; // 允许传 LAST 的字段不做格式校验
  return /HH/.test(text) ? 'datetime' : 'date';
}

export function checkDateFormats(schema, params) {
  const errors = [];
  for (const [k, v] of Object.entries(params)) {
    const p = (schema.properties || {})[k];
    if (!p || typeof v !== 'string') continue;
    const kind = dateKindOf(p);
    if (!kind) continue;
    if (kind === 'date' && !DATE_RE.test(v)) errors.push(`'${k}' 应为 YYYY-MM-DD，实际是 ${JSON.stringify(v)}`);
    if (kind === 'datetime' && !DATETIME_RE.test(v)) errors.push(`'${k}' 应为 YYYY-MM-DD HH:mm，实际是 ${JSON.stringify(v)}`);
  }
  if (!errors.length) return null;
  return { code: 'PARAM_VALIDATION_ERROR', message: `日期格式不符：${errors.join('；')}。` };
}

const DATE_PAIRS = [
  ['startDate', 'endDate'],
  ['timeFrom', 'timeTo'],
  ['averagingStartDate', 'averagingEndDate'],
  ['barrierStartDate', 'barrierEndDate'],
];

export function checkDateOrder(schema, params) {
  for (const [from, to] of DATE_PAIRS) {
    const a = params[from];
    const b = params[to];
    if (typeof a === 'string' && typeof b === 'string' && a && b && a > b) {
      return { code: 'PARAM_VALIDATION_ERROR', message: `日期区间颠倒：'${from}'(${a}) 不能晚于 '${to}'(${b})。` };
    }
  }
  return null;
}

// 互斥关系写在 schema 的 description 里（「与 observation 参数互斥」），按同一 schema 内出现的字段名提取。
export function checkMutualExclusion(schema, params) {
  const props = schema.properties || {};
  const conflicts = new Set();
  for (const k of Object.keys(params)) {
    const desc = props[k]?.description || '';
    if (!desc.includes('互斥')) continue;
    for (const other of Object.keys(props)) {
      if (other === k) continue;
      if (params[other] === undefined) continue;
      if (desc.includes(other)) conflicts.add([k, other].sort().join(' 与 '));
    }
  }
  if (!conflicts.size) return null;
  return { code: 'PARAM_VALIDATION_ERROR', message: `参数互斥，不能同时填写：${[...conflicts].join('；')}。` };
}

const CHECKS = [checkUnknownKeys, checkRequired, checkTypes, checkEnums, checkArrayBounds, checkDateFormats, checkDateOrder, checkMutualExclusion];

// 返回第一个错误（null 表示通过）。按顺序检查，先报最根本的问题。
export function validateParams(schema, params, { allowUnknown = false } = {}) {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    return { code: 'PARAM_TYPE_ERROR', message: '参数必须是 JSON 对象。' };
  }
  for (const check of CHECKS) {
    if (allowUnknown && check === checkUnknownKeys) continue;
    const err = check(schema, params);
    if (err) return err;
  }
  return null;
}
// #endregion 参数校验

// #region 注册表读取：registry.json 是生成物，annotations.json 是人工维护的注解。
export function readAnnotations() {
  return JSON.parse(readFileSync(ANNOTATIONS_PATH, 'utf8'));
}

export function readRegistry() {
  if (!existsSync(REGISTRY_PATH)) {
    throw new Error(`缺少 ${REGISTRY_PATH}，先运行：node scripts/build.mjs`);
  }
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
}

// 线上 schema 与本地注册表的差异，供 refresh / diff 报告用。
export function diffTools(oldTools = {}, liveTools = []) {
  const liveNames = liveTools.map((t) => t.name);
  const added = liveNames.filter((n) => !(n in oldTools));
  const removed = Object.keys(oldTools).filter((n) => !liveNames.includes(n));
  const changed = [];
  for (const t of liveTools) {
    const prev = oldTools[t.name];
    if (!prev) continue;
    const before = Object.keys(prev.inputSchema?.properties || {}).join(',');
    const after = Object.keys(t.inputSchema?.properties || {}).join(',');
    if (before !== after) changed.push({ name: t.name, before, after });
  }
  return { added, removed, changed };
}
// #endregion 注册表读取

// #region 信封
function out(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

function fail(code, message, extra = {}) {
  out({ ok: false, code, message, ...extra });
  process.exitCode = 1;
}

const USAGE = `wind-mcp-research-skill —— Wind 7 个 MCP server / 132 个工具

取数
  node scripts/cli.mjs call <server> <tool> '<params_json>'   调用工具（params 也可写 @path/to.json）
      --allow-unknown   跳过未知字段拦截（仅在确认注册表过期时用）
      --raw             不做业务错误嗅探，原样输出后端返回

查工具（全部离线，不消耗积分）
  node scripts/cli.mjs list-servers                7 个 server 与工具数
  node scripts/cli.mjs list-tools <server>         该 server 的工具与入参签名
  node scripts/cli.mjs describe <server> <tool>    单个工具的完整契约（说明 + 参数表 + 样例）
  node scripts/cli.mjs find <keyword>              按关键词跨 server 搜工具

维护
  node scripts/cli.mjs doctor                      检查 Key、连通性、注册表是否过期
  node scripts/cli.mjs diff [server]               线上 schema vs 本地注册表（只读不写）
  node scripts/cli.mjs refresh [server]            重新拉取 schema 并写回注册表
  node scripts/cli.mjs smoke [server]              用注册表里的实测样例跑冒烟

重建（后端 schema 变了才用）
  node scripts/build.mjs [server]                  拉最新 schema 重建 registry.json 并重新生成 references/*.md

server: finance / stock / fund / edb / futures / options / company

call 成功后会在后台检查一次 skill 更新（每天最多一次，不阻塞取数）；设 WIND_SKILL_NO_UPDATE=1 关闭。`;
// #endregion

// #region 注册表访问
let REGISTRY = null;
function registry() {
  if (!REGISTRY) REGISTRY = readRegistry();
  return REGISTRY;
}

function resolveServer(alias) {
  const reg = registry();
  const direct = reg.servers[alias];
  if (direct) return { alias, ...direct };
  const byFull = Object.entries(reg.servers).find(([, s]) => s.full === alias);
  if (byFull) return { alias: byFull[0], ...byFull[1] };
  throw new McpError('ROUTE_ERROR', `未知 server '${alias}'。可用：${Object.keys(reg.servers).join(' / ')}`);
}

// 名字写错时给出近似工具名。工具名都是 a_b_c 结构，按下划线切词后比共有词数，
// 比子串包含更宽容：stock_get_valuation 也能命中 stock_get_company_valuation。
// 「get / list / search」这类通用词不计分，否则同一 server 内所有工具得分都一样。
const GENERIC_TOKENS = new Set(['get', 'list', 'search', 'query', 'calc', 'data', 'info']);

export function nearestTools(names, input, limit = 5) {
  const want = input.toLowerCase();
  const wantTokens = new Set(want.split('_').filter(Boolean));
  const scored = names.map((n) => {
    const low = n.toLowerCase();
    if (low === want) return { n, score: 99 };
    let score = 0;
    if (low.includes(want) || want.includes(low)) score += 3;
    for (const t of low.split('_')) {
      if (wantTokens.has(t)) score += GENERIC_TOKENS.has(t) ? 0.2 : 1;
    }
    return { n, score };
  });
  return scored.filter((x) => x.score >= 2).sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.n);
}

function resolveTool(server, toolName) {
  const tool = server.tools[toolName];
  if (tool) return tool;
  const near = nearestTools(Object.keys(server.tools), toolName);
  throw new McpError(
    'ROUTE_ERROR',
    `server '${server.alias}' 下没有工具 '${toolName}'。${near.length ? `是否想找：${near.join('、')}。` : `用 list-tools ${server.alias} 看全部 ${Object.keys(server.tools).length} 个工具。`}若确认工具存在，说明本地注册表已过期，运行 refresh ${server.alias} 后重试。`,
  );
}
// #endregion

// #region 参数输入
function loadParams(input) {
  if (input === undefined || input === null || input === '') return {};
  if (input.startsWith('@')) {
    const path = resolve(SKILL_DIR, input.slice(1));
    if (!existsSync(path)) throw new McpError('PARAMS_FILE_ERROR', `参数文件不存在：${path}`);
    let text;
    try { text = readFileSync(path, 'utf8'); } catch (e) { throw new McpError('PARAMS_FILE_ERROR', `参数文件读取失败：${e.message}`); }
    try { return JSON.parse(text); } catch (e) { throw new McpError('INVALID_PARAMS_JSON', `参数文件不是合法 JSON：${e.message}`); }
  }
  try { return JSON.parse(input); } catch (e) {
    throw new McpError('INVALID_PARAMS_JSON', `参数不是合法 JSON：${e.message}。POSIX shell 用单引号包住整个 JSON；PowerShell/cmd 改用 @文件 传参。`);
  }
}
// #endregion

// #region 命令
async function cmdCall(alias, toolName, paramsInput, flags) {
  const server = resolveServer(alias);
  const tool = resolveTool(server, toolName);
  const params = loadParams(paramsInput);

  const invalid = validateParams(tool.inputSchema, params, { allowUnknown: flags.allowUnknown });
  if (invalid) {
    return fail(invalid.code, invalid.message, { server: server.alias, tool: toolName, hint: `完整契约：node scripts/cli.mjs describe ${server.alias} ${toolName}` });
  }

  const started = Date.now();
  const r = await callTool(server.full, toolName, params);
  const elapsed = Date.now() - started;

  if (r.isError || (r.suspectError && !flags.raw)) {
    return fail('backend_error', r.text.trim() || '（后端返回空内容）', {
      server: server.alias,
      tool: toolName,
      detected_by: r.isError ? 'protocol' : 'text',
      ...(tool.knownIssue ? { known_issue: tool.knownIssue } : {}),
    });
  }

  out({ ...r.result, cli_meta: { server: server.alias, tool: toolName, elapsed_ms: elapsed, text_len: r.text.length, ...(r.suspectError ? { suspect_error: true } : {}) } });
}

function cmdListServers() {
  const reg = registry();
  const rows = Object.entries(reg.servers).map(([alias, s]) => ({ server: alias, full: s.full, title: s.title, tools: s.toolCount, params: s.paramCount }));
  out({ generatedAt: reg.generatedAt, total_tools: rows.reduce((n, r) => n + r.tools, 0), servers: rows });
}

function signatureOf(tool) {
  const props = tool.inputSchema?.properties || {};
  const req = new Set(tool.inputSchema?.required || []);
  return Object.entries(props).map(([k, p]) => `${k}${req.has(k) ? '*' : ''}:${p.type || '?'}`).join(', ');
}

function summaryOf(tool) {
  return (tool.description || '').replace(/【功能】/, '').split(/\n|【/)[0].trim();
}

function cmdListTools(alias) {
  const server = resolveServer(alias);
  out({
    server: server.alias,
    title: server.title,
    scope: server.scope,
    guidance: server.guidance,
    reference: `references/${server.alias}.md`,
    tools: Object.entries(server.tools).map(([name, t]) => ({
      name,
      signature: `${name}(${signatureOf(t)})`,
      summary: summaryOf(t),
      ...(t.knownIssue ? { known_issue: t.knownIssue } : {}),
    })),
  });
}

function cmdDescribe(alias, toolName) {
  const server = resolveServer(alias);
  const tool = resolveTool(server, toolName);
  const req = new Set(tool.inputSchema?.required || []);
  out({
    server: server.alias,
    tool: toolName,
    description: tool.description,
    params: Object.entries(tool.inputSchema?.properties || {}).map(([k, p]) => ({
      name: k,
      required: req.has(k),
      type: p.type || null,
      ...(p.enum ? { enum: p.enum } : {}),
      ...(p.default !== undefined ? { default: p.default } : {}),
      description: p.description || p.title || '',
    })),
    ...(tool.sample ? { verified_sample_args: tool.sample } : {}),
    ...(tool.knownIssue ? { known_issue: tool.knownIssue } : {}),
    call_example: `node scripts/cli.mjs call ${server.alias} ${toolName} '${JSON.stringify(tool.sample || {})}'`,
  });
}

// 命中要按相关度排，否则「基差」会把 warehouse_receipt 排在 futures_get_basis 前面。
// 权重：工具名 > 【功能】一句话 > 【适用场景】/【返回】/【边界】正文。
function relevance(name, tool, kw) {
  let score = 0;
  if (name.toLowerCase().includes(kw)) score += 10;
  if (summaryOf(tool).toLowerCase().includes(kw)) score += 5;
  const desc = (tool.description || '').toLowerCase();
  if (desc.includes(kw)) score += 1;
  return score;
}

function cmdFind(keyword) {
  if (!keyword) throw new McpError('USAGE_ERROR', '用法：find <keyword>');
  const kw = keyword.toLowerCase();
  const hits = [];
  const servers = registry().servers;
  // 工具说明里未必出现用户的词（「GDP」「CPI」在 edb 三个工具的描述里一个字都没有），
  // 所以除了逐工具匹配，还按 server 级的领域关键词兜一层，命中就把该 server 整体推荐出去。
  const serverHits = [];
  for (const [alias, s] of Object.entries(servers)) {
    for (const [name, t] of Object.entries(s.tools)) {
      const score = relevance(name, t, kw);
      if (score > 0) hits.push({ score, server: alias, tool: name, signature: `${name}(${signatureOf(t)})`, summary: summaryOf(t) });
    }
    const matched = (s.keywords || []).filter((k) => k.toLowerCase().includes(kw) || kw.includes(k.toLowerCase()));
    if (matched.length || s.scope.toLowerCase().includes(kw) || s.title.toLowerCase().includes(kw)) {
      serverHits.push({ server: alias, title: s.title, matched_keywords: matched, reference: `references/${alias}.md` });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  const payload = { keyword, count: hits.length, hits: hits.map(({ score, ...rest }) => rest) };
  if (serverHits.length) payload.related_servers = serverHits;
  if (!hits.length) {
    payload.note = serverHits.length
      ? `没有工具的名称或说明里出现「${keyword}」，但 related_servers 里的 server 覆盖这个领域——用 list-tools <server> 看该 server 的全部工具。`
      : `没有命中。**这不构成「不支持」的证据**：工具说明里未必出现用户的用词。判定 OUT_OF_SCOPE 前必须回 SKILL.md 第 1 节的路由表逐行复核，或换更泛的词再搜（如把「GDP」换成「宏观」）。`;
  }
  out(payload);
}

async function cmdDoctor() {
  const report = { key: null, servers: [], registry: { path: REGISTRY_PATH, generatedAt: null, drift: [] } };
  try {
    const { source } = getApiKey();
    report.key = { ok: true, source };
  } catch (e) {
    report.key = { ok: false, message: e.message };
    return out(report);
  }
  const reg = registry();
  report.registry.generatedAt = reg.generatedAt;
  for (const [alias, s] of Object.entries(reg.servers)) {
    try {
      const live = await listTools(s.full);
      const d = diffTools(s.tools, live);
      const drifted = d.added.length || d.removed.length || d.changed.length;
      report.servers.push({ server: alias, ok: true, live_tools: live.length, registry_tools: s.toolCount, drift: drifted ? d : null });
      if (drifted) report.registry.drift.push(alias);
    } catch (e) {
      report.servers.push({ server: alias, ok: false, code: e.code || 'NETWORK_ERROR', message: e.message });
    }
  }
  if (report.registry.drift.length) {
    report.registry.action = `线上 schema 已变动，运行：node scripts/cli.mjs refresh ${report.registry.drift.join(' ')}`;
  }
  const update = readUpdateState();
  report.skill_update = update
    ? { date: update.date, status: update.status, changed: update.changed, command: update.command, error: update.error }
    : { status: 'never_run', note: 'call 成功后会在后台触发一次；设 WIND_SKILL_NO_UPDATE=1 可关闭' };
  out(report);
}

async function cmdDiff(alias) {
  const reg = registry();
  const targets = alias ? [resolveServer(alias).alias] : Object.keys(reg.servers);
  const result = {};
  for (const a of targets) {
    const s = reg.servers[a];
    const live = await listTools(s.full);
    result[a] = diffTools(s.tools, live);
  }
  out({ compared: targets, diff: result });
}

// 重建走子进程而不是 import：build.mjs 反过来要 import 本文件，
// 直接 import 会形成 ESM 循环依赖，撞上本文件入口处未结算的顶层 await 而死锁。
// 子进程还有个好处：更新注册表和文档不会污染当前进程已经读进内存的 registry。
function cmdRefresh(alias) {
  const target = alias ? resolveServer(alias).alias : null;
  const args = [join(SCRIPTS_DIR, 'build.mjs')];
  if (target) args.push(target);
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) {
    return fail('SETUP_ERROR', `重建失败（exit ${r.status}）：${(r.stderr || r.stdout || '').trim().slice(0, 500)}`);
  }
  out({
    refreshed: target || 'all',
    registry: REGISTRY_PATH,
    log: (r.stdout || '').trim().split('\n').filter(Boolean),
  });
}

async function cmdSmoke(alias) {
  const reg = registry();
  const targets = alias ? [resolveServer(alias).alias] : Object.keys(reg.servers);
  const results = [];
  let ok = 0; let bad = 0; let skipped = 0;
  for (const a of targets) {
    const s = reg.servers[a];
    for (const [name, t] of Object.entries(s.tools)) {
      if (!t.sample) { skipped++; results.push({ server: a, tool: name, status: 'skipped', reason: '无样例入参' }); continue; }
      const invalid = validateParams(t.inputSchema, t.sample);
      if (invalid) { bad++; results.push({ server: a, tool: name, status: 'invalid_sample', message: invalid.message }); continue; }
      try {
        const r = await callTool(s.full, name, t.sample);
        const failed = r.isError || r.suspectError || !r.text.length;
        failed ? bad++ : ok++;
        results.push({ server: a, tool: name, status: failed ? 'fail' : 'pass', len: r.text.length, ...(failed ? { text: r.text.slice(0, 160), known_issue: t.knownIssue || null } : {}) });
      } catch (e) {
        bad++;
        results.push({ server: a, tool: name, status: 'error', code: e.code || 'UNKNOWN', message: String(e.message).slice(0, 160) });
      }
    }
  }
  out({ summary: { pass: ok, fail: bad, skipped, total: ok + bad + skipped }, results });
}
// #endregion


// #region 自动更新：仅在 call 成功后触发；今天已成功过就跳过。
// detached 起 update-check.mjs 并先复制到临时目录——更新会替换整个 skill 目录，
// 脚本不能在自己即将被覆盖的位置上运行。任何失败都只记录，绝不阻塞取数。
const UPDATE_STATE_PATH = join(SCRIPTS_DIR, 'update-state.json');

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function readUpdateState() {
  try {
    if (!existsSync(UPDATE_STATE_PATH)) return null;
    return JSON.parse(readFileSync(UPDATE_STATE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function writeUpdateStatePatch(patch) {
  try {
    mkdirSync(SCRIPTS_DIR, { recursive: true });
    writeFileSync(UPDATE_STATE_PATH, JSON.stringify({ ...(readUpdateState() || {}), ...patch }, null, 2) + '\n');
  } catch { /* 状态写不进去也不能影响取数 */ }
}

function alreadyUpdatedToday() {
  const state = readUpdateState();
  return !!state && state.date === todayKey() && state.status === 'success';
}

export function triggerUpdateCheck() {
  try {
    if (process.env.WIND_SKILL_NO_UPDATE) return;
    if (!existsSync(UPDATE_CHECK_PATH)) return;
    if (alreadyUpdatedToday()) return;
    writeUpdateStatePatch({ lastUsedAt: new Date().toISOString(), lastUsedPid: process.pid });
    const tmpDir = join(homedir(), '.cache', 'wind-aifinmarket');
    mkdirSync(tmpDir, { recursive: true });
    const runnerPath = join(tmpDir, `update-check-${SKILL_NAME}-${process.pid}.mjs`);
    copyFileSync(UPDATE_CHECK_PATH, runnerPath);
    const child = spawn('node', [runnerPath, SKILL_DIR], { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => { /* 起不来就算了，更新不能挡住取数 */ });
    child.unref();
  } catch { /* 同上 */ }
}
// #endregion 自动更新

// #region 入口
function parseFlags(argv) {
  const flags = { allowUnknown: false, raw: false };
  const rest = [];
  for (const a of argv) {
    if (a === '--allow-unknown') flags.allowUnknown = true;
    else if (a === '--raw') flags.raw = true;
    else rest.push(a);
  }
  return { flags, rest };
}

export async function main(argv) {
  const { flags, rest } = parseFlags(argv);
  const [cmd, ...args] = rest;
  switch (cmd) {
    case undefined:
    case 'help':
    case '-h':
    case '--help':
      process.stdout.write(USAGE + '\n');
      return;
    case 'call':
      if (args.length < 2) throw new McpError('USAGE_ERROR', `用法：call <server> <tool> '<params_json>'`);
      return cmdCall(args[0], args[1], args[2], flags);
    case 'list-servers': return cmdListServers();
    case 'list-tools':
      if (!args[0]) throw new McpError('USAGE_ERROR', '用法：list-tools <server>');
      return cmdListTools(args[0]);
    case 'describe':
      if (args.length < 2) throw new McpError('USAGE_ERROR', '用法：describe <server> <tool>');
      return cmdDescribe(args[0], args[1]);
    case 'find': return cmdFind(args[0]);
    case 'doctor': return cmdDoctor();
    case 'diff': return cmdDiff(args[0]);
    case 'refresh': return cmdRefresh(args[0]);
    case 'smoke': return cmdSmoke(args[0]);
    default:
      throw new McpError('USAGE_ERROR', `未知命令 '${cmd}'。\n\n${USAGE}`);
  }
}

const IS_MAIN = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (IS_MAIN) {
  const argv = process.argv.slice(2);
  try {
    await main(argv);
  } catch (e) {
    if (e instanceof McpError) fail(e.code, e.message);
    else fail('UNKNOWN', `未预期的错误：${e?.message || e}`);
  }
  // 只在取数真的成功之后才检查更新：失败时用户正在排障，不该再引入一个后台进程。
  if (argv[0] === 'call' && !process.exitCode) triggerUpdateCheck();
}
