#!/usr/bin/env node
// wind-mcp-skill CLI: thin JSON-envelope wrapper around Wind MCP servers
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, unlinkSync, closeSync, openSync, utimesSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { buildUpgradeCommand, cleanupStaleSentinels } from './update-check.mjs';
export { cleanupStaleSentinels };

const SKILL_VERSION = '1.6.1';

// 本地 registry: 工具选择可在任何网络调用前失败
const SERVERS = {
  stock_data: {
    endpoint: 'https://mcp.wind.com.cn/vserver_stock_data/mcp/',
    label: 'Wind A 股股票（档案/财务/股本/事件/技术/风险 + 行情/K线/分钟）',
  },
  global_stock_data: {
    endpoint: 'https://mcp.wind.com.cn/vserver_global_stock_data/mcp/',
    label: 'Wind 全球股票/港股美股（档案/财务/股本/事件/技术/风险 + 行情/K线/分钟）',
  },
  fund_data: {
    endpoint: 'https://mcp.wind.com.cn/vserver_fund_data/mcp/',
    label: 'Wind 基金（档案/财务/持仓/业绩/持有人/公司 + 行情/K线/分钟）',
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
const CACHE_DIR = join(homedir(), '.cache', 'wind-aifinmarket');
const UPDATE_STATE_FILE = join(CACHE_DIR, 'update-state.json');
const TOOL_MANIFEST_PATH = join(SKILL_DIR, 'references', 'tool-manifest.json');
const SKILL_NAME = 'wind-mcp-skill';

// per-skill + per-session sentinel: ~/.cache/wind-aifinmarket/{failure,update}-shown-<skill>-<sid>
// mtime ≤ 6h 视为本会话已展示 (静默), > 6h 过期 — 实际过期清理由 update-check.mjs 兜底
const FAILURE_SENTINEL_PREFIX = 'failure-shown-';
const UPDATE_SENTINEL_PREFIX = 'update-shown-';
const SENTINEL_FRESH_MS = 6 * 60 * 60 * 1000;

const CALL_EXAMPLES = [
  `cli.mjs call stock_data get_stock_basicinfo '{"question":"600519.SH公司基本档案"}'`,
  `cli.mjs call stock_data get_stock_price_indicators '{"windcode":"600519.SH","indexes":"中文简称,最新成交价,涨跌幅"}'`,
  `cli.mjs call fund_data get_fund_kline '{"windcode":"588200.SH","begin_date":"20260401","end_date":"20260430"}'`,
  `cli.mjs call global_stock_data get_global_stock_quote '{"windcode":"AAPL.O"}'`,
  `cli.mjs call index_data get_index_kline '{"windcode":"000300.SH","begin_date":"20260401","end_date":"20260430"}'`,
  `cli.mjs call financial_docs get_financial_news '{"query":"美联储利率政策","top_k":3}'`,
  `cli.mjs call economic_data get_economic_data '{"metricIdsStr":"中国GDP"}'`,
  `cli.mjs call analytics_data get_financial_data '{"question":"查询中国A股市场过去一年的平均成交量"}'`,
];

function spawnUpdateCheck() {
  try {
    if (!existsSync(UPDATE_CHECK_PATH)) return;
    // env 传 sid 让子进程命中相同 sentinel; DETACHED=1 标记 stderr ignore, 走 sentinel 中转
    const child = spawn('node', [UPDATE_CHECK_PATH], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: {
        ...process.env,
        WIND_SKILLS_UPDATE_CHECK_DETACHED: '1',
        WIND_SKILLS_SESSION_ID: getSessionId(),
      },
    });
    child.on('error', () => {});
    child.unref();
  } catch {}
}

// 与 update-check.mjs 同名函数对齐, 按 scope 区分 -g
function globalLockPaths() {
  const xdg = process.env.XDG_STATE_HOME;
  return [
    xdg ? join(xdg, 'skills', '.skill-lock.json') : null,
    join(homedir(), '.agents', '.skill-lock.json'),
  ].filter(Boolean);
}

function classifyLockScope(lockPath) {
  return globalLockPaths().includes(lockPath) ? 'global' : 'project';
}

// 按 scope 隔离的 live hash → { [name]: { global?: hash, project?: hash } }
// 半升级状态 (global 升 / project 没升) 时 filter 按 scope 才能保留 project 那条
function getInstalledHashes() {
  const result = {};
  const candidates = new Set();
  for (const p of globalLockPaths()) candidates.add(p);
  for (const start of [SKILL_DIR, process.cwd()]) {
    let dir = resolve(start);
    while (true) {
      candidates.add(join(dir, 'skills-lock.json'));
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  for (const lockPath of candidates) {
    if (!existsSync(lockPath)) continue;
    const scope = classifyLockScope(lockPath);
    try {
      const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
      for (const [name, entry] of Object.entries(lock?.skills || {})) {
        const hash = entry?.skillFolderHash || entry?.computedHash;
        if (!hash) continue;
        if (!result[name]) result[name] = {};
        if (!result[name][scope]) result[name][scope] = hash;
      }
    } catch {}
  }
  return result;
}

function filterAlreadyUpgraded(outdated) {
  const installed = getInstalledHashes();
  return outdated.filter(o => {
    const scopeMap = installed[o.name];
    if (!scopeMap) return true; // 找不到任何 lock,保守保留
    // outdated 缺 scope (旧缓存) → 跨 scope 取首个可用 hash, 维持原行为
    const liveHash = o.scope
      ? scopeMap[o.scope]
      : (scopeMap.global || scopeMap.project);
    if (!liveHash) return true; // 该 scope 下没装(异常),保守保留
    if (o.installedHash) return liveHash === o.installedHash;
    // 兼容旧缓存条目：退化到 shortHash 前缀匹配
    const cur = o.current || '';
    if (!cur) return true;
    return liveHash.startsWith(cur);
  });
}

// Cache schema 兼容: v3 unified ({schemaVersion, skills:{<name>:{...}}}) vs legacy 顶层平铺
function readCacheView() {
  if (!existsSync(UPDATE_STATE_FILE)) return null;
  try {
    const raw = JSON.parse(readFileSync(UPDATE_STATE_FILE, 'utf8'));
    if (raw?.schemaVersion === 3 && raw?.skills && typeof raw.skills === 'object') {
      return {
        raw,
        state: raw.skills[SKILL_NAME] || null,
        isV3: true
      };
    }
    return {
      raw,
      state: raw,
      isV3: false
    };
  } catch {
    return null;
  }
}

function writeCacheView(view, newState) {
  try {
    if (view.isV3) {
      view.raw.skills[SKILL_NAME] = newState;
      writeFileSync(UPDATE_STATE_FILE, JSON.stringify(view.raw, null, 2));
    } else {
      writeFileSync(UPDATE_STATE_FILE, JSON.stringify(newState, null, 2));
    }
  } catch {}
}

export function collectUpdateNotices() {
  try {
    const view = readCacheView();
    if (!view || !view.state) return [];
    let state = view.state;

    // legacy v2 顶层 schema 兼容: 过滤掉非本 skill 的 outdated; v3 path 不会有此问题
    if (state.status === 'update_available' && Array.isArray(state.outdated)) {
      const filtered = state.outdated.filter(o => o?.name === SKILL_NAME);
      if (filtered.length < state.outdated.length) {
        state = filtered.length === 0 ?
          {
            ...state,
            status: 'up_to_date',
            outdated: []
          } :
          {
            ...state,
            outdated: filtered
          };
      }
    }

    // 已升级但 cache TTL 未过期 → 修正状态再决定是否通知
    if (state.status === 'update_available' && Array.isArray(state.outdated) && state.outdated.length > 0) {
      const stillOutdated = filterAlreadyUpgraded(state.outdated);
      if (stillOutdated.length === 0) {
        state = {
          status: 'up_to_date',
          ttlMs: 60 * 60 * 1000,
          lastCheck: new Date().toISOString(),
        };
        if (view.state.snoozedUntil) state.snoozedUntil = view.state.snoozedUntil;
        if (typeof view.state.snoozeLevel === 'number') state.snoozeLevel = view.state.snoozeLevel;
        writeCacheView(view, state);
      } else if (stillOutdated.length < state.outdated.length) {
        state = {
          ...state,
          outdated: stillOutdated
        };
        writeCacheView(view, state);
      }
    }

    if (state.snoozedUntil && new Date(state.snoozedUntil) > new Date()) return [];

    if (state.status === 'update_available') {
      return [{
        type: 'update_available',
        severity: 'info',
        message: `检测到 ${state.outdated.length} 个 skill 有新版`,
        items: state.outdated.map((o) => {
          const scope = o.scope || 'global';
          const isGitee = typeof o.sourceUrl === 'string' && o.sourceUrl.includes('gitee.com');
          return {
            name: o.name,
            current: o.current || null,
            latest: o.latest || null,
            source: isGitee ? 'gitee' : 'github',
            source_url: o.sourceUrl || null,
            scope,
            upgrade_command: buildUpgradeCommand(o),
          };
        }),
      }];
    }

    // transient_error / unknown 走 stderr 一次性, 不进 notices; 见 maybeNotifyFailureOnce
  } catch {}
  return [];
}

// sessionId: walk 进程树跳 shell, 找首个非 shell 祖先。Claude Code/Codex/Cursor 每次 spawn 新 shell, ppid 不稳定
const SHELL_NAMES = new Set([
  'bash', 'sh', 'zsh', 'dash', 'fish', 'csh', 'ksh', 'tcsh',
  'xonsh', 'nu', 'nushell', 'ion', 'elvish', 'oksh', 'mksh', 'yash', 'rc', 'es',
  'cmd.exe', 'powershell.exe', 'pwsh.exe',
  'bash.exe', 'sh.exe', 'zsh.exe', 'dash.exe', 'fish.exe', 'tcsh.exe', 'ksh.exe',
  'wsl.exe', 'wslhost.exe',
  'conhost.exe', 'mintty.exe', 'msys-1.0.dll', 'cygwin1.dll',
]);
const SESSION_CACHE_FILE = join(CACHE_DIR, 'session.id');
const SESSION_CACHE_TTL_MS = 5 * 60 * 1000;

// Linux / WSL / Git Bash (MSYS2): /proc/<pid>/stat
function tryProcWalk() {
  try {
    let pid = process.ppid;
    let hops = 0;
    while (pid && pid > 1 && hops < 10) {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      const commEnd = stat.lastIndexOf(')');
      const name = stat.slice(stat.indexOf('(') + 1, commEnd);
      const after = stat.slice(commEnd + 2).split(' ');
      const parentPid = parseInt(after[1], 10);
      const starttime = after[19];
      if (!SHELL_NAMES.has(name.toLowerCase())) {
        return `${pid}-${starttime}`;
      }
      pid = parentPid;
      hops++;
    }
  } catch {}
  return null;
}

// macOS: ps -o ppid,lstart,comm
function tryMacWalk() {
  try {
    let pid = process.ppid;
    let hops = 0;
    while (pid && pid > 1 && hops < 10) {
      const out = execFileSync('ps', ['-p', String(pid), '-o', 'ppid=,lstart=,comm='], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 3000,
      }).trim();
      if (!out) break;
      // 格式: "<ppid> <lstart 5字段> <comm>"
      const parts = out.split(/\s+/);
      if (parts.length < 7) break;
      const parentPid = parseInt(parts[0], 10);
      const lstart = parts.slice(1, 6).join(' ');
      const comm = parts.slice(6).join(' ');
      const name = (comm.split('/').pop() || '').toLowerCase();
      if (!SHELL_NAMES.has(name)) {
        const cleanStart = lstart.replace(/[^a-zA-Z0-9]/g, '');
        return `${pid}-${cleanStart}`;
      }
      pid = parentPid;
      hops++;
    }
  } catch {}
  return null;
}

// Windows: 一次 EncodedCommand 调用走全树, 避免多次 spawn
function tryWindowsWalk() {
  try {
    const ps = [
      "$shells = @('cmd.exe','powershell.exe','pwsh.exe','bash.exe','sh.exe','zsh.exe','dash.exe','fish.exe','tcsh.exe','ksh.exe','wsl.exe','wslhost.exe','conhost.exe','mintty.exe')",
      `$cur = ${process.ppid}`,
      "$hops = 0",
      "while ($cur -gt 4 -and $hops -lt 10) {",
      "  try { $p = Get-CimInstance Win32_Process -Filter \"ProcessId=$cur\" } catch { break }",
      "  if (!$p) { break }",
      "  $name = $p.Name.ToLower()",
      "  if (-not ($shells -contains $name)) {",
      "    $ct = if ($p.CreationDate) { $p.CreationDate.Ticks } else { 0 }",
      "    Write-Output (\"MATCH:\" + $cur + \":\" + $ct)",
      "    exit 0",
      "  }",
      "  $cur = [int]$p.ParentProcessId",
      "  $hops++",
      "}",
      "Write-Output 'NONE'",
    ].join('; ');
    const encoded = Buffer.from(ps, 'utf16le').toString('base64');
    const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 8000,
    }).trim();
    const m = out.match(/MATCH:(\d+):(\d+)/);
    if (m) return `${m[1]}-${m[2]}`;
  } catch {}
  return null;
}

// 文件缓存: Windows PowerShell walk ~500ms-1s, 5min 内复用避免重算
function readSessionCache() {
  try {
    if (!existsSync(SESSION_CACHE_FILE)) return null;
    const st = statSync(SESSION_CACHE_FILE);
    if (Date.now() - st.mtimeMs > SESSION_CACHE_TTL_MS) return null;
    const content = readFileSync(SESSION_CACHE_FILE, 'utf8').trim();
    return content || null;
  } catch { return null; }
}
function writeSessionCache(sid) {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(SESSION_CACHE_FILE, sid);
  } catch {}
}

let _sessionIdMemo = null;

export function getSessionId() {
  if (_sessionIdMemo) return _sessionIdMemo;
  // env 注入用于嵌套子进程 / 测试显式锁定 sid
  if (process.env.WIND_SKILLS_SESSION_ID) {
    _sessionIdMemo = process.env.WIND_SKILLS_SESSION_ID;
    return _sessionIdMemo;
  }
  const cached = readSessionCache();
  if (cached) { _sessionIdMemo = cached; return cached; }
  let sid = tryProcWalk();
  if (!sid) {
    if (process.platform === 'darwin') sid = tryMacWalk();
    else if (process.platform === 'win32') sid = tryWindowsWalk();
  }
  // fallback: ppid, 同 shell 内仍可 dedup
  if (!sid) sid = String(process.ppid);
  _sessionIdMemo = sid;
  writeSessionCache(sid);
  return sid;
}

// sentinel 路径: per-skill + per-sid 隔离, 多 skill 共用 CACHE_DIR 时各自独立 dedup
export function failureSentinelPath(sid = getSessionId()) {
  return join(CACHE_DIR, `${FAILURE_SENTINEL_PREFIX}${SKILL_NAME}-${sid}`);
}
export function updateSentinelPath(sid = getSessionId()) {
  return join(CACHE_DIR, `${UPDATE_SENTINEL_PREFIX}${SKILL_NAME}-${sid}`);
}

// 通用 sentinel 时效检查 + 触发
function sentinelFresh(sentinelPath) {
  if (!existsSync(sentinelPath)) return false;
  try {
    const st = statSync(sentinelPath);
    return Date.now() - st.mtimeMs <= SENTINEL_FRESH_MS;
  } catch { return false; }
}
function touchSentinel(sentinelPath) {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    const fd = openSync(sentinelPath, 'a');
    closeSync(fd);
    const now = new Date();
    utimesSync(sentinelPath, now, now);
  } catch {}
}

// cache 失败状态 → sentinel 未 fresh 则首次 stderr 通知 + touch; 不动 stdout
export function maybeNotifyFailureOnce() {
  try {
    const view = readCacheView();
    if (!view || !view.state) return;
    const state = view.state;
    if (state.status !== 'transient_error' && state.status !== 'unknown') return;
    if (state.snoozedUntil && new Date(state.snoozedUntil) > new Date()) return;

    const sentinel = failureSentinelPath();
    if (sentinelFresh(sentinel)) return;

    const reason = state.reason || 'unknown';
    // 与 update-check.mjs printNotice 对齐: transient (网络等可恢复) vs unknown (lock/配置等)
    if (state.status === 'transient_error') {
      process.stderr.write(`[wind-skills] 检查更新失败,可能是网络问题(reason=${reason})\n`);
    } else {
      process.stderr.write(`[wind-skills] 无法确认是否最新(reason=${reason})\n`);
    }
    touchSentinel(sentinel);
  } catch {}
}

// 检测到新版 → 复用 collectUpdateNotices 过滤逻辑, sentinel 未 fresh 则首次 stderr + touch
export function maybeNotifyUpdateOnce() {
  try {
    const notices = collectUpdateNotices();
    const updateNotice = notices.find(n => n && n.type === 'update_available');
    if (!updateNotice || !Array.isArray(updateNotice.items) || updateNotice.items.length === 0) return;

    const sentinel = updateSentinelPath();
    if (sentinelFresh(sentinel)) return;

    // 格式化 stderr 输出
    const lines = ['[wind-skills] 检测到新版可用:'];
    for (const item of updateNotice.items) {
      const ver = item.current && item.latest ? `${item.current} → ${item.latest}` : (item.latest || '?');
      lines.push(`  ${item.name}: ${ver}`);
      lines.push(`  升级命令: ${item.upgrade_command}`);
    }
    process.stderr.write(lines.join('\n') + '\n');
    touchSentinel(sentinel);
  } catch {}
}

// section: 工具函数

// call 成功: 完整透传 MCP result, 不抽取; agent 自行 parse content[0].text
function writeRawCallSuccess(result) {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

function writePlainSuccess(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

// 失败 envelope { ok:false, error:{code, agent_action} }; update 信号走 stderr 不进 stdout
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
    die('UNKNOWN_SERVER_TYPE', `未知 server_type: ${server_type}. 可用: ${Object.keys(SERVERS).join(' / ')}`);
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
    die('TOOL_MANIFEST_INVALID', `工具清单读取失败: ${err.message}`);
  }
}

function validateToolSelection(server_type, toolName) {
  getServer(server_type);
  const manifest = loadToolManifest();
  const tools = manifest[server_type];
  if (!tools.includes(toolName)) {
    die('UNKNOWN_TOOL_NAME', `工具名 "${toolName}" 不属于 server_type "${server_type}"。`);
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

  die('KEY_MISSING', 'WIND_API_KEY 未配置');
}

// section: 错误码 — message 来自 HTTP / JSON-RPC / 工具内嵌 JSON, 统一映射成稳定 code

const ERROR_PATTERNS = [
  ['RATE_LIMIT_DAILY', /单日请求次数超限|daily.*limit/i, 'API Key 当日请求额度已用尽。等次日 0 点刷新或换备用 Key。'],
  ['BALANCE_INSUFFICIENT', /余额不足|请先充值|insufficient.*balance/i, 'API Key 计费余额不足。开发者中心充值或换备用 Key。'],
  ['RATE_LIMIT_QPS', /请求过于频繁|qps.*limit|too.*frequent/i, '请求过于频繁。等几秒重试（可重试）。'],
  ['KEY_INVALID', /密钥无效|key.*invalid|unauthorized|认证失败|auth.*fail/i, 'API Key 无效或过期 → 开发者中心重新生成。'],
  ['NO_RESULTS', /未获取到数据|"NO_RESULTS"|no\s*results?|not\s*found|empty\s*result/i, '未获取到匹配数据。先在不改变用户意图的前提下调整关键词或参数。'],
  ['PARAM_VALIDATION_ERROR', /参数验证失败|参数.*(错误|非法|无效)|字段.*(不存在|不识别|不支持|非法)|invalid\s*(param|argument|field)|missing\s*(param|argument|field|required)/i, '后端参数验证失败。先按 SKILL.md 工具表核对字段名、必填项、日期格式和枚举值后重试。'],
  ['TOOL_RUNTIME_ERROR', /TOOL_ERROR|tool.*error|工具.*(执行|运行).*错误|runtime.*error/i, '后端工具运行错误。保留后端原文，先检查请求是否过大或口径是否受支持；不要直接切换工具绕过。'],
  ['KEY_MISSING', /WIND_API_KEY 未配置/, 'API Key 未配置。先 `node scripts/cli.mjs open-portal` 拿 Key，再选三种方式之一配置。'],
  ['UNKNOWN_SERVER_TYPE', /未知 server_type/, 'server_type 不在可用列表内。先 `cli.mjs` 看 USAGE 列表，按列表填。'],
  ['UNKNOWN_TOOL_NAME', /工具名不属于/, 'tool_name 不在该 server_type 的工具清单内。按 SKILL.md 和 references/tool-manifest.json 重新选择。'],
  ['TOOL_MANIFEST_INVALID', /工具清单读取失败/, '本地工具清单文件异常。检查 references/tool-manifest.json。'],
  ['INVALID_PARAMS_JSON', /params JSON 解析失败/, '`call` 命令第三参数必须是合法 JSON 字符串。注意 shell 转义（建议外层用单引号包裹整个 JSON）。'],
];

function inferErrorCode(msg) {
  if (!msg) return 'UNKNOWN';
  for (const [code, pat] of ERROR_PATTERNS) {
    if (pat.test(msg)) return code;
  }
  return 'UNKNOWN';
}

// agent_action = 诊断 + 行动 一体的 NL 处方; agent 读完即可决定下一步, 后端原 message 由 buildAgentAction 拼前面
const AGENT_ACTIONS = {
  USAGE_ERROR: '命令用法不正确。读取 stdout 中的 USAGE 文本（每条 cli 调用都会输出），按可用子命令和参数格式重新构造命令后重试。',
  INVALID_PARAMS_JSON: '`call` 命令第三参数必须是合法 JSON 字符串。按当前 shell 类型调整转义（Bash 用外层单引号、PowerShell 用 \\" 转义内部双引号），修正后重试同一 server_type + tool_name；不要切换工具。',
  UNKNOWN_SERVER_TYPE: 'server_type 不在可用列表内。运行 `node scripts/cli.mjs`（无参）查看 USAGE 列出的合法 server_type，或读 SKILL.md 第 1 节"数据范围"重新选择，再重试。',
  UNKNOWN_TOOL_NAME: 'tool_name 不属于该 server_type。读取 `references/tool-manifest.json` 查询当前 server_type 的合法 tool 清单，按意图路由规则（SKILL.md "意图判定与路由顺序"）重新选择 tool 后重试；不要直接 fallback 到 analytics_data。',
  TOOL_MANIFEST_INVALID: '本地 `references/tool-manifest.json` 缺失或非法 JSON。skill 安装可能不完整,提示用户重装：`npx skills update wind-mcp-skill -g -y`。',
  UNKNOWN_SCOPE: '`setup-key` 命令必须带 --scope global 或 --scope skill。先用 AskUserQuestion 询问用户 Key 存放位置后,带上 --scope 参数重试。',
  OPEN_PORTAL_FAILED: '本地无法自动打开浏览器。把 stdout 中的 `url` 字段告知用户,让用户在自己的浏览器中手动打开开发者中心。',
  PARAM_VALIDATION_ERROR: '后端参数验证失败。按 SKILL.md "## 3. 工具表"和 `references/indicators.md` 逐字段核对：字段名、必填项、日期格式、枚举值、server_type、tool_name。修正后重试同一工具；若多次修正仍不通过且属于结构化取数问题,可改用 `analytics_data.get_financial_data`,但 question 必须忠实反映用户原始意图。',
  CONFIG_WRITE_ERROR: '配置文件写入失败。检查目标路径权限,或用 AskUserQuestion 询问用户改用另一种 scope 后重试 setup-key。',
  KEY_MISSING: 'WIND_API_KEY 未配置。立即执行 `node scripts/cli.mjs open-portal` 打开万得开发者中心；获取 Key 后执行 `node scripts/cli.mjs setup-key <KEY> --scope <global|skill>`（先用 AskUserQuestion 询问 scope）再重试原调用。不要只把 URL 发给用户,也不要改用 analytics_data 绕过。',
  KEY_INVALID: 'API Key 无效或过期。引导用户在开发者中心重新生成 Key,用 setup-key 配置后重试；不要通过切换 Wind 工具绕过。',
  KEY_FORBIDDEN_SERVER: '当前 Key 未订阅该 server 的权限。让用户在开发者中心确认权限,或选择已授权的其他 server；不要换 server 绕过。',
  RATE_LIMIT_DAILY: 'API Key 当日请求额度已用尽。等次日额度刷新,或让用户更换备用 Key；不要换工具绕过。',
  RATE_LIMIT_QPS: '请求过于频繁触发 QPS 限流。等待 3-5 秒后原样重试同一工具；不要为绕过限流而切换工具。',
  BALANCE_INSUFFICIENT: 'API Key 计费余额不足。提示用户在开发者中心充值,或更换有余额的 Key 后重试。',
  NETWORK_ERROR: '网络请求失败（DNS / 代理 / 超时 / 沙箱拦截）。检查网络环境；在 Codex 环境中确认使用 `sandbox_permissions: "require_escalated"` 联网。修复后原样重试。',
  SERVER_5XX: '万得后端服务异常。稍后原样重试同一请求；若提示超时,可降低请求复杂度（缩短时间范围、减少字段）。',
  RESPONSE_PARSE_ERROR: '后端响应格式异常。保留 stdout 错误原文,联系万得支持；不要盲目重试或切换工具。',
  NO_RESULTS: '查询命中数据为空。先在不改变用户意图的前提下调整关键词或参数重试；若专项路径仍无结果且属于结构化取数,可改用 `analytics_data.get_financial_data` 兜底,question 必须忠实反映用户原始意图。',
  MCP_PROTOCOL_ERROR: 'MCP 协议层错误。读 stdout 错误原文,若能明确指向请求形态问题则修正后重试,否则保留原文联系万得支持。',
  TOOL_RUNTIME_ERROR: '后端工具运行错误。读 stdout 错误原文,检查请求规模是否过大、字段口径是否受支持、数据覆盖范围；不能明确修正时停止并告知用户,不要盲目切换工具。',
  UNKNOWN: '未知错误。不要盲目重试；先读 stdout 错误原文,能定位本地问题（参数 / 配置 / 网络）则修正后重试一次,否则保留原文告知用户并停止。',
};

// USAGE_ERROR 例外: 完整 USAGE 不截断; 其它 code 上限 500 字防污染 envelope
function buildAgentAction(code, detail) {
  const template = AGENT_ACTIONS[code] || AGENT_ACTIONS.UNKNOWN;
  if (detail && typeof detail === 'string' && detail.trim()) {
    const d = code === 'USAGE_ERROR' ? detail.trim() : detail.trim().slice(0, 500);
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
  401: ['KEY_INVALID', 'API Key 无效或过期 → 开发者中心重新生成'],
  403: ['KEY_FORBIDDEN_SERVER', 'API Key 权限不足或该 server 未订阅 → 开发者中心确认'],
  429: ['RATE_LIMIT_QPS', '请求过于频繁 → 等几秒重试'],
  500: ['SERVER_5XX', '服务端异常 → 稍后重试或查 status.wind.com.cn'],
  502: ['SERVER_5XX', '网关异常 → 稍后重试'],
  503: ['SERVER_5XX', '服务暂不可用 → 稍后重试'],
  504: ['SERVER_5XX', '网关超时 → 稍后重试，或减小请求复杂度'],
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
    die('RESPONSE_PARSE_ERROR', `${err.message} (server=${server_type})`);
  }

  if (payload.error) {
    const msg = payload.error.message || JSON.stringify(payload.error);
    die('MCP_PROTOCOL_ERROR', `${msg} (server=${server_type})`);
  }

  if (payload.result?.isError) {
    const msg = payload.result.content?.[0]?.text || JSON.stringify(payload.result);
    die(inferErrorCode(msg), `${msg} (server=${server_type})`);
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
      name: 'wind-mcp-skill',
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
    die('UNKNOWN_SCOPE', `setup-key 未知 scope: ${scope} (可选: global / skill)`);
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
    die('CONFIG_WRITE_ERROR', `配置写入失败 (scope=${scope}, path=${file || 'n/a'}): ${err.message}`);
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
    die('OPEN_PORTAL_FAILED', `本地无法启动浏览器: ${spawnError.message} | 用户应手动打开 ${data.url}`);
  }
  return data;
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

// 诊断: 输出 sid + 检测方法; 在不同 agent / 终端各跑一次比对 sid 是否稳定
async function cmdDiagnose() {
  const sid = getSessionId();
  _sessionIdMemo = null;
  try { unlinkSync(SESSION_CACHE_FILE); } catch {}
  return {
    platform: process.platform,
    node_pid: process.pid,
    node_ppid: process.ppid,
    session_id: sid,
    detection_method: (function() {
      if (tryProcWalk()) return 'proc';
      if (process.platform === 'darwin' && tryMacWalk()) return 'macos_ps';
      if (process.platform === 'win32' && tryWindowsWalk()) return 'windows_powershell';
      return 'ppid_fallback';
    })(),
    cache_dir: CACHE_DIR,
    sentinel_failure: failureSentinelPath(sid),
    sentinel_update: updateSentinelPath(sid),
    notes: '在两个独立终端/Bash tool 调用里各跑一次,比对 session_id 是否相同。' +
           '相同表示跨调用 dedup 工作。不同表示当前环境没有稳定的非 shell 祖先。',
  };
}

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

if (cmd === 'call') {
  spawnUpdateCheck();
  // 必须在 die() / stdout 输出前: die 直接 exit 跳过, stdout/stderr 交错会污染输出
  maybeNotifyFailureOnce();
  maybeNotifyUpdateOnce();
}

commands[cmd]()
  .then((data) => {
    if (cmd === 'call') {
      // call: 透传 result 内容 (parse JSON if applicable, else raw text)
      writeRawCallSuccess(data?.result);
    } else {
      // open-portal / setup-key: 直接输出结构化数据 (无 envelope 包裹)
      writePlainSuccess(data);
    }
  })
  .catch((err) => {
    die('UNKNOWN', `执行失败: ${err.message || err}${err.stack ? ' | stack: ' + err.stack.slice(0, 300) : ''}`);
  });
}
