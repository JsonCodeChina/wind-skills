#!/usr/bin/env node
// wind-mcp-skill
// 访问万得 Wind 金融数据 — 按数据域分类调用
// SERVERS: fund_data / financial_docs / stock_data / economic_data / analytics_data
// 调用签名: call(server_type, tool_name, params)
// 注: fund_data / stock_data 各包含行情类工具(*_price_indicators / *_kline / *_quote) + NL 类工具(财务 / 档案等),入参模式不同,见 SKILL.md 工具表

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const SKILL_VERSION = '1.4.0';

const SERVERS = {
  fund_data: {
    endpoint: 'https://mcp.wind.com.cn/vserver_fund_data/mcp/',
    label: 'Wind 基金（档案/财务/持仓/业绩/持有人/公司 + 行情/K线/分钟）',
  },
  financial_docs: {
    endpoint: 'https://mcp.wind.com.cn/vserver_financial_docs/mcp/',
    label: 'Wind 金融文档 RAG（公告 / 新闻）',
  },
  stock_data: {
    endpoint: 'https://mcp.wind.com.cn/vserver_stock_data/mcp/',
    label: 'Wind 股票（档案/财务/股本/事件/技术/风险 + 行情/K线/分钟）',
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

const PORTAL_URL = 'https://aimarket.wind.com.cn/#/user/overview';

const SKILL_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

const UPDATE_CHECK_PATH = join(SKILL_DIR, 'scripts', 'update-check.mjs');
const UPDATE_STATE_FILE = join(homedir(), '.cache', 'wind-aimarket', 'update-state.json');

// 异步 spawn 探活子进程,detached + 静默,不阻塞主流程
function spawnUpdateCheck() {
  try {
    if (!existsSync(UPDATE_CHECK_PATH)) return;
    const child = spawn('node', [UPDATE_CHECK_PATH], { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
  } catch {}
}

// 主流程末尾读 cache,有 outdated 且未 snooze → stderr 输出
function maybePrintUpdateNotice() {
  try {
    if (!existsSync(UPDATE_STATE_FILE)) return;
    const state = JSON.parse(readFileSync(UPDATE_STATE_FILE, 'utf8'));
    if (state.status !== 'available') return;
    if (!Array.isArray(state.outdated) || state.outdated.length === 0) return;
    if (state.snoozedUntil && new Date(state.snoozedUntil) > new Date()) return;

    const lines = ['', `[wind-skills] 检测到 ${state.outdated.length} 个 skill 有新版:`];
    for (const o of state.outdated) {
      const upgradeCmd = o.source === 'gitee'
        ? `npx skills add https://gitee.com/wind_info/wind-skills.git --skill ${o.name} -g -y  # Gitee 装的需重装`
        : `npx skills update ${o.name} -g -y`;
      lines.push(`  • ${o.name.padEnd(34)} ${o.current || '?'} → ${o.latest}`);
      lines.push(`    升级: ${upgradeCmd}`);
    }
    lines.push('');
    process.stderr.write(lines.join('\n') + '\n');
  } catch {}
}

// ───── 工具函数 ─────

// 注：die() 强制走错误码体系（formatError），输出格式统一。
//     纯帮助信息（USAGE / 缺参提示）走 exitWithUsage()，不套错误码。
function die(code, message, ctx = {}, exitCode = 1) {
  process.stderr.write(formatError(code, message, ctx) + '\n');
  process.exit(exitCode);
}

function exitWithUsage(usage, exitCode = 0) {
  process.stderr.write(usage + '\n');
  process.exit(exitCode);
}

function maskKey(key) {
  if (!key || key.length < 8) return '***';
  return key.slice(0, 4) + '***' + key.slice(-4);
}

// 解析 dotenv 风格配置文件（KEY=VALUE 每行一对）
// 支持：# 注释、空行、引号包裹值、export 前缀、行内注释
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
    die('UNKNOWN_SERVER_TYPE', `未知 server_type: ${server_type}`, {
      extraHint: `可用 server_type: ${Object.keys(SERVERS).join(' / ')}`,
    });
  }
  return server;
}

// ───── 认证（三级兜底：env > skill config > 全局 config）─────

function getApiKey() {
  if (process.env.WIND_API_KEY) return process.env.WIND_API_KEY;

  const localConfig = join(SKILL_DIR, 'config.json');
  if (existsSync(localConfig)) {
    try {
      const cfg = JSON.parse(readFileSync(localConfig, 'utf8'));
      if (cfg.wind_api_key) return cfg.wind_api_key;
    } catch {}
  }

  const globalConfig = join(homedir(), '.wind-aimarket', 'config');
  if (existsSync(globalConfig)) {
    try {
      const env = parseDotenv(readFileSync(globalConfig, 'utf8'));
      if (env.WIND_API_KEY) return env.WIND_API_KEY;
    } catch {}
  }

  die('KEY_MISSING', 'WIND_API_KEY 未配置（env / skill config / 全局 config 三级兜底全失败）', {
    extraHint:
      `获取 Key（推荐先问用户是否同意打开浏览器）：\n` +
      `  $ node ${join(SKILL_DIR, 'scripts', 'cli.mjs')} open-portal\n` +
      `  或手动访问：${PORTAL_URL}（未登录会自动跳到 /#/login）\n\n` +
      `配置 Key（任选其一）：\n` +
      `  A. export WIND_API_KEY=ak_xxx\n` +
      `  B. echo '{"wind_api_key":"ak_xxx"}' > ${join(SKILL_DIR, 'config.json')}\n` +
      `  C. mkdir -p ~/.wind-aimarket && echo "WIND_API_KEY=ak_xxx" > ~/.wind-aimarket/config  (推荐：所有 wind skill 共享)`,
  });
}

// ───── 错误码体系 ─────

// 错误码识别 + 处理建议（按 message 模式匹配）
// 注：第三列 hint 仅是 inferErrorCode + getErrorHint 的默认提示；
//     具体调用 formatError 时可通过 extraHint 覆盖（client 端错误码常用此机制）。
const ERROR_PATTERNS = [
  // ── 后端 / 协议错误（mcpRequest 自动识别）──
  ['RATE_LIMIT_DAILY',     /单日请求次数超限|daily.*limit/i,                       'API Key 当日请求额度已用尽。等次日 0 点刷新或换备用 Key。'],
  ['BALANCE_INSUFFICIENT', /余额不足|请先充值|insufficient.*balance/i,             'API Key 计费余额不足。开发者中心充值或换备用 Key。'],
  ['RATE_LIMIT_QPS',       /请求过于频繁|qps.*limit|too.*frequent/i,               '请求过于频繁。等几秒重试（可重试）。'],
  ['BACKEND_BUG_STR_GET',  /'str' object has no attribute 'get'/,                  '换 analytics_data.get_financial_data 兜底。'],
  ['KEY_INVALID',          /密钥无效|key.*invalid|unauthorized|认证失败|auth.*fail/i,   'API Key 无效或过期 → 开发者中心重新生成。'],
  ['NO_RESULTS',           /未获取到数据|"NO_RESULTS"/,                            '未获取到匹配数据。调整 question 关键词，或换工具/server 重试。'],
  ['TOOL_RUNTIME_ERROR',   /TOOL_ERROR.*查询失败|tool.*runtime.*error/i,           'economic_data 失败时换 analytics_data.get_financial_data 兜底。'],
  // ── client 端错误（cli.mjs 主动 die）──
  ['KEY_MISSING',          /WIND_API_KEY 未配置/,                                   'API Key 未配置。先 `node scripts/cli.mjs open-portal` 拿 Key，再选三种方式之一配置。'],
  ['UNKNOWN_SERVER_TYPE',  /未知 server_type/,                                      'server_type 不在可用列表内。先 `cli.mjs` 看 USAGE 列表，按列表填。'],
  ['INVALID_PARAMS_JSON',  /params JSON 解析失败/,                                  '`call` 命令第三参数必须是合法 JSON 字符串。注意 shell 转义（建议外层用单引号包裹整个 JSON）。'],
];

function inferErrorCode(msg) {
  if (!msg) return 'UNKNOWN';
  for (const [code, pat] of ERROR_PATTERNS) {
    if (pat.test(msg)) return code;
  }
  return 'UNKNOWN';
}

function getErrorHint(code, fallback) {
  for (const [c, , hint] of ERROR_PATTERNS) {
    if (c === code) return hint;
  }
  return fallback || '未知错误，参考后端原文 + 联系万得支持。';
}

function formatError(code, backendMsg, ctx = {}) {
  const { server_type, apiKey, extraHint } = ctx;
  const hint = extraHint || getErrorHint(code);
  return [
    `❌ MCP 错误 [${code}]`,
    ``,
    server_type ? `server_type: ${server_type}` : '',
    apiKey ? `api key:     ${maskKey(apiKey)}` : '',
    `后端消息:    ${backendMsg}`,
    `处理建议:    ${hint}`,
  ].filter(Boolean).join('\n');
}

// ───── MCP 调用（裸 HTTP + JSON-RPC + 响应解析兼容 SSE/纯 JSON）─────

// 万得后端响应有两种形态：
// (1) 正常调用 → SSE 包装：event: message\ndata: {JSON-RPC}\n\n
// (2) 限流 / 余额不足 / HTTP 5xx 等 → 纯 JSON：{...JSON-RPC}
function parseSSE(text) {
  const trimmed = text.trim();
  // 形态 (2) 优先：纯 JSON
  if (trimmed.startsWith('{')) {
    try { return JSON.parse(trimmed); } catch {}
  }
  // 形态 (1)：SSE 包装，取最后一行 data: 后的 JSON
  const lines = text.split(/\r?\n/);
  let last = null;
  for (const line of lines) {
    if (line.startsWith('data: ')) last = line.slice(6);
  }
  if (last) {
    try { return JSON.parse(last); } catch (e) {
      throw new Error(`SSE data 行 JSON 解析失败：${e.message}。原文前 200 字符：${text.slice(0, 200)}`);
    }
  }
  throw new Error(`响应格式无法识别（既非 SSE 也非纯 JSON）。原文前 200 字符：${text.slice(0, 200)}`);
}

// HTTP 状态码 → 错误码 + 提示
const HTTP_ERROR_MAP = {
  401: ['KEY_INVALID',          'API Key 无效或过期 → 开发者中心重新生成'],
  403: ['KEY_FORBIDDEN_SERVER', 'API Key 权限不足或该 server 未订阅 → 开发者中心确认'],
  429: ['RATE_LIMIT_QPS',       '请求过于频繁 → 等几秒重试'],
  500: ['SERVER_5XX',           '服务端异常 → 稍后重试或查 status.wind.com.cn'],
  502: ['SERVER_5XX',           '网关异常 → 稍后重试'],
  503: ['SERVER_5XX',           '服务暂不可用 → 稍后重试'],
  504: ['SERVER_5XX',           '网关超时 → 稍后重试，或减小请求复杂度'],
};

async function mcpRequest(server_type, method, params, { timeoutMs = 60_000 } = {}) {
  const server = getServer(server_type);
  const apiKey = getApiKey();
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
  };

  const body = JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params });
  let resp;
  try {
    resp = await fetch(server.endpoint, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    die('NETWORK_ERROR', err.message, {
      server_type, apiKey,
      extraHint: '网络不通 / DNS 解析失败 / 代理拦截 / 超时。检查网络后重试。',
    });
  }

  // ───── HTTP 层错误检测 ─────
  if (!resp.ok) {
    const bodyText = await resp.text().catch(() => '');
    const [code, hint] = HTTP_ERROR_MAP[resp.status] || ['UNKNOWN', '检查参数构造'];
    const detail = `HTTP ${resp.status} ${resp.statusText}` + (bodyText ? ` | body: ${bodyText.slice(0, 200)}` : '');
    die(code, detail, { server_type, apiKey, extraHint: hint });
  }

  // ───── 响应解析（兼容 SSE / 纯 JSON）─────
  const text = await resp.text();
  let payload;
  try {
    payload = parseSSE(text);
  } catch (err) {
    die('RESPONSE_PARSE_ERROR', err.message, {
      server_type, apiKey,
      extraHint: '响应格式异常，可能是后端版本变更。把后端原文发给万得支持。',
    });
  }

  // ───── JSON-RPC 协议层错误 ─────
  if (payload.error) {
    const msg = payload.error.message || JSON.stringify(payload.error);
    die('MCP_PROTOCOL_ERROR', msg, { server_type, apiKey });
  }

  // ───── MCP 工具层错误（result.isError = true）─────
  // 限流 / 余额不足 / 部分协议错误走这条路径
  if (payload.result?.isError) {
    const msg = payload.result.content?.[0]?.text || JSON.stringify(payload.result);
    die(inferErrorCode(msg), msg, { server_type, apiKey });
  }

  // ───── 工具内业务错误（content[0].text 内嵌 JSON 含 mcp_tool_error_code 或 error.code）─────
  // 万得后端在 economic_data 等场景把 bug 包在嵌套 JSON 里；ok 状态会误导
  const innerText = payload.result?.content?.[0]?.text;
  if (typeof innerText === 'string') {
    let inner;
    try { inner = JSON.parse(innerText); } catch { inner = null; }
    if (inner) {
      // 万得专属：mcp_tool_error_code 非 0
      if (typeof inner.mcp_tool_error_code === 'number' && inner.mcp_tool_error_code !== 0) {
        const msg = inner.mcp_tool_error_msg || JSON.stringify(inner);
        die(inferErrorCode(msg), msg, { server_type, apiKey });
      }
      // 通用：含 error.code（如 NO_RESULTS）
      if (inner.error && (inner.error.code || inner.error.message)) {
        const errCode = inner.error.code || '';
        const errMsg = inner.error.message || '';
        const combined = errCode ? `${errCode}: ${errMsg}` : errMsg;
        die(inferErrorCode(combined), combined, { server_type, apiKey });
      }
    }
  }

  return payload.result;
}

async function mcpInitializeAndCall(server_type, method, params) {
  await mcpRequest(server_type, 'initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'wind-mcp-skill', version: SKILL_VERSION },
  }, { timeoutMs: 30_000 });

  return mcpRequest(server_type, method, params, { timeoutMs: 600_000 });
}

// ───── 命令 ─────

async function cmdCall(server_type, toolName, paramsJson) {
  if (!server_type || !toolName || !paramsJson) {
    exitWithUsage(
      `用法：call <server_type> <tool_name> '<params_json>'\n` +
      `可用 server_type: ${Object.keys(SERVERS).join(' / ')}\n` +
      `例：\n` +
      `  call analytics_data get_financial_data '{"question":"贵州茅台 2024 年 ROE"}'\n` +
      `  call stock_data get_stock_basicinfo '{"question":"600519.SH 公司基本档案"}'\n` +
      `  call fund_data get_fund_info '{"question":"005827.OF 基金档案"}'\n` +
      `  call financial_docs get_financial_news '{"query":"美联储利率政策","top_k":3}'\n` +
      `  call economic_data get_economic_data '{"metricIdsStr":"中国GDP"}'`,
      1,
    );
  }

  let args;
  try {
    args = JSON.parse(paramsJson);
  } catch (e) {
    die('INVALID_PARAMS_JSON', `params JSON 解析失败：${e.message} | 原文：${paramsJson.slice(0, 200)}`);
    // extraHint 不传，使用 ERROR_PATTERNS 默认 hint（含 shell 转义建议）
  }

  const result = await mcpInitializeAndCall(server_type, 'tools/call', {
    name: toolName,
    arguments: args,
  });
  console.log(JSON.stringify({ ok: true, server_type, tool: toolName, ...result }, null, 2));
}

async function cmdOpenPortal() {
  const platform = process.platform;
  let bin, args;
  if (platform === 'darwin') { bin = 'open'; args = [PORTAL_URL]; }
  else if (platform === 'win32') { bin = 'cmd'; args = ['/c', 'start', '', PORTAL_URL]; }
  else { bin = 'xdg-open'; args = [PORTAL_URL]; }

  let spawnError = null;
  try {
    const child = spawn(bin, args, { stdio: 'ignore', detached: true });
    child.unref();
    spawnError = await new Promise((resolve) => {
      child.once('error', resolve);
      setTimeout(() => resolve(null), 300);
    });
  } catch (err) {
    spawnError = err;
  }

  const result = {
    ok: !spawnError,
    action: 'open-portal',
    url: PORTAL_URL,
    platform,
    spawn_command: `${bin} ${args.join(' ')}`,
    flow_note: '未登录时会自动跳转到登录页（/#/login）；登录完成后回到 overview 页面即可获取 API Key。',
    fallback_message: `如果浏览器没有自动弹出，请手动访问：${PORTAL_URL}`,
  };
  if (spawnError) {
    result.error = spawnError.message;
    result.headless_hint = '本地无法启动浏览器（headless / 无 GUI / 命令不存在）。请把 url 字段告知用户，让他在自己设备的浏览器里打开。';
  }
  console.log(JSON.stringify(result, null, 2));
}

// ───── 主入口 ─────

const [cmd, ...args] = process.argv.slice(2);

const USAGE =
  `wind-mcp-skill\n` +
  `访问万得 Wind 金融数据（按数据域分类调用）\n\n` +
  `用法:\n` +
  `  cli.mjs call <server_type> <tool_name> '<params_json>'\n` +
  `  cli.mjs open-portal                       # 打开万得开发者中心拿 API Key\n\n` +
  `可用 server_type:\n` +
  Object.entries(SERVERS).map(([k, v]) => `  ${k.padEnd(20)}${v.label}`).join('\n') + '\n\n' +
  `典型:\n` +
  `  cli.mjs call stock_data get_stock_basicinfo '{"question":"600519.SH 公司基本档案"}'   # NL 类\n` +
  `  cli.mjs call stock_data get_stock_price_indicators '{"windcode":"600519.SH","indexes":"NAME,MATCH,CHANGERANGE"}'   # 行情类(结构化)\n` +
  `  cli.mjs call fund_data get_fund_kline '{"windcode":"588200.SH","period":"10","count":30}'   # 基金 K 线\n` +
  `  cli.mjs call analytics_data get_financial_data '{"question":"贵州茅台 2024 年 ROE"}'`;

const commands = {
  call: () => cmdCall(args[0], args[1], args[2]),
  'open-portal': () => cmdOpenPortal(),
};

if (!cmd || !commands[cmd]) {
  process.stderr.write(USAGE + '\n');
  process.exit(cmd ? 1 : 0);
}

// 仅对实际调用类命令触发探活(open-portal 类管理命令跳过)
if (cmd === 'call') {
  spawnUpdateCheck();
}

commands[cmd]()
  .then(maybePrintUpdateNotice)
  .catch((err) => {
    die('UNKNOWN', `执行失败：${err.message || err}`, {
      extraHint: err.stack ? `stack:\n${err.stack}` : '未知异常，建议联系万得支持。',
    });
  });
