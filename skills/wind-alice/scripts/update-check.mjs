#!/usr/bin/env node
// wind-skills 更新检测 — 由各 skill CLI 异步 spawn 调用
// 探活远端 tree (ETag/304) → 跟本地 cache 基线对比 → 写 cache; 失败完全静默
// 原则: 不识别会话 / 远端变了才通知 / 失败静默 / lastNotifiedSha 去重

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, openSync, closeSync, statSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, resolve, normalize, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_NAME = basename(dirname(SCRIPT_DIR));

const CACHE_DIR = join(homedir(), '.cache', 'wind-aifinmarket');
const CACHE_FILE = join(CACHE_DIR, 'update-state.json');
const CACHE_VERSION = 1;

const TTL_MS = 6 * 60 * 60 * 1000;                 // 6h
const NETWORK_TIMEOUT_MS = 5_000;
const INSTALLED_AT_TOLERANCE_MS = 60 * 60 * 1000;  // installedAt 反查容差 1h
const LONG_TAIL_MS = 14 * 24 * 60 * 60 * 1000;     // 长尾 fallback: 14d 无成功
const LONG_TAIL_MIN_CALLS = 10;

// ───── 路径规范化 (cache key) ─────

// realpath 解析软链接; 失败 (路径不存在) 降级 resolve+normalize; Windows 大小写不敏感
function canonicalizeLockPath(lockPath) {
  let p = resolve(String(lockPath || ''));
  try { p = realpathSync.native(p); }
  catch { p = normalize(p); }
  if (process.platform === 'win32') p = p.toLowerCase();
  return p;
}

function cacheKeyFor(skillName, lockPath) {
  return `${skillName}|${canonicalizeLockPath(lockPath)}`;
}

// ───── lock 文件探测 ─────

function walkUp(startDir) {
  const dirs = [];
  let dir = resolve(startDir);
  while (true) { dirs.push(dir); const parent = dirname(dir); if (parent === dir) break; dir = parent; }
  return dirs;
}

// global lock 候选 (XDG / ~/.agents); 其它视为 project lock → 决定升级命令是否加 -g
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

function findLockFiles() {
  const candidates = new Set();
  for (const p of globalLockPaths()) candidates.add(p);
  for (const dir of walkUp(SCRIPT_DIR)) candidates.add(join(dir, 'skills-lock.json'));
  try { for (const dir of walkUp(process.cwd())) candidates.add(join(dir, 'skills-lock.json')); } catch {}
  return [...candidates].filter(p => existsSync(p));
}

// lock schema 版本: global 装=v3 (有 sourceUrl/installedAt), project 装=v1 (缺这些)
function detectLockSchemaVersion(lock) {
  return lock?.version === 3 ? 3 : 1;
}

function collectEntries() {
  const found = [];
  for (const lockPath of findLockFiles()) {
    try {
      const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
      const entry = lock?.skills?.[SKILL_NAME];
      if (entry) found.push({
        entry, lockPath,
        scope: classifyLockScope(lockPath),
        schemaVersion: detectLockSchemaVersion(lock),
      });
    } catch {}
  }
  return found;
}

// ───── entry 解析 ─────

// 探活 URL: 有 sourceUrl 直接用; 缺时从 source + sourceType 推导
// SSH URL (git@...) 直接作为探活地址, 不做拼接
function deriveSourceUrl(entry) {
  if (entry?.sourceUrl) return entry.sourceUrl;
  if (typeof entry?.source !== 'string' || !entry.source) return null;
  if (entry.source.startsWith('git@')) return entry.source;        // SSH 直通
  if (/^https?:\/\//.test(entry.source)) return entry.source;
  const t = entry.sourceType;
  if (t === 'github') return `https://github.com/${entry.source}.git`;
  if (t === 'git' || t === 'gitee') return `https://gitee.com/${entry.source}.git`;
  return null;
}

// 从 URL (https 或 ssh) 解析 {host, owner, repo} 供 API 调用
function parseSourceUrl(sourceUrl) {
  if (typeof sourceUrl !== 'string' || !sourceUrl) return null;
  let host = null;
  if (sourceUrl.includes('github.com')) host = 'github';
  else if (sourceUrl.includes('gitee.com')) host = 'gitee';
  else return null;
  const m = sourceUrl.match(/(?:github\.com|gitee\.com)[:/]([^/]+)\/([^/?#]+?)(?:\.git)?(?:$|[/?#])/);
  if (!m) return null;
  return { host, owner: m[1], repo: m[2] };
}

function normalizeSkillDir(skillPath) {
  return String(skillPath || '').replace(/\\/g, '/').replace(/\/?SKILL\.md$/i, '').replace(/\/+$/, '');
}

// 白名单字段签名: v3 用 installedAt, v1 用 computedHash — 变了说明客户重装/升级, 需重探
function buildLockSignature(entry, schemaVer) {
  if (schemaVer === 3) return String(entry?.installedAt || entry?.updatedAt || '');
  return String(entry?.computedHash || entry?.skillFolderHash || '');
}

// ───── cache 读写 (容错 + 文件锁 + only-patch-self) ─────

function emptyCache() {
  return { version: CACHE_VERSION, meta: { callCount: 0, fallbackShownAt: null }, entries: {} };
}

function readCache(cacheFile) {
  try {
    if (!existsSync(cacheFile)) return emptyCache();
    const data = JSON.parse(readFileSync(cacheFile, 'utf8'));
    if (!data || data.version !== CACHE_VERSION || typeof data.entries !== 'object' || !data.entries) {
      return emptyCache();
    }
    return {
      version: CACHE_VERSION,
      meta: (data.meta && typeof data.meta === 'object') ? data.meta : { callCount: 0, fallbackShownAt: null },
      entries: data.entries,
    };
  } catch { return emptyCache(); }
}

const LOCK_STALE_MS = 30_000;
function sleepSync(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch {}
}

// O_EXCL 文件锁; 陈旧锁 >30s 自动清; 拿不到等 100ms 重试 5 次后放弃 (绝不阻塞主流程)
function withLock(cacheFile, fn) {
  const lockFile = cacheFile + '.lock';
  const dir = dirname(cacheFile);
  for (let i = 0; i < 5; i++) {
    try {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      try { const st = statSync(lockFile); if (Date.now() - st.mtimeMs > LOCK_STALE_MS) unlinkSync(lockFile); } catch {}
      const fd = openSync(lockFile, 'wx');
      try { return fn(); }
      finally { try { closeSync(fd); } catch {} try { unlinkSync(lockFile); } catch {} }
    } catch (e) {
      if (e?.code !== 'EEXIST') return undefined;
      sleepSync(100);
    }
  }
  return undefined;
}

// 锁内重读 → 只 patch 自己的 key → 其它 entry 原样透传 (并发写安全)
function mergeCacheEntry(cacheFile, key, patch) {
  withLock(cacheFile, () => {
    const cache = readCache(cacheFile);          // 锁内重读最新磁盘内容
    cache.entries[key] = { ...(cache.entries[key] || {}), ...patch };
    writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  });
}

function bumpCallCount(cacheFile) {
  withLock(cacheFile, () => {
    const cache = readCache(cacheFile);
    if (!cache.meta || typeof cache.meta !== 'object') cache.meta = { callCount: 0, fallbackShownAt: null };
    cache.meta.callCount = (cache.meta.callCount || 0) + 1;
    writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  });
}

// ───── 判定 ─────

// 通知判定: 必须 latestSha + lastNotifiedSha 都有且不等 (首次只写基线不通知)
function computePending(entry) {
  return !!(entry && entry.latestSha && entry.lastNotifiedSha && entry.latestSha !== entry.lastNotifiedSha);
}

// 探活判定: 无 lastCheckedAt / 超 TTL / signature 变 (客户升级后) → 需重探
// abs 兜底 NTP 倒退 (时间被改到过去时不会永远不过期)
function computeStale(entry, now, ttlMs, currentSig) {
  if (!entry || !entry.lastCheckedAt) return true;
  if (currentSig !== undefined && entry.lockSignature !== currentSig) return true;
  const checked = new Date(entry.lastCheckedAt).getTime();
  if (!Number.isFinite(checked)) return true;
  return Math.abs(now - checked) > ttlMs;
}

// ───── 代理 (env → git config 兜底, 沙箱剥 env 时常见) ─────

let _gitProxyMemo;
function loadGitProxy() {
  if (_gitProxyMemo !== undefined) return _gitProxyMemo;
  try {
    const httpsR = spawnSync('git', ['config', '--get', 'https.proxy'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000, windowsHide: true });
    const httpR = spawnSync('git', ['config', '--get', 'http.proxy'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000, windowsHide: true });
    const https = httpsR.error ? '' : (httpsR.stdout || '').trim();
    const http = httpR.error ? '' : (httpR.stdout || '').trim();
    if (!https && !http) { _gitProxyMemo = null; return null; }
    _gitProxyMemo = { HTTPS_PROXY: https || http, HTTP_PROXY: http || https };
    return _gitProxyMemo;
  } catch { _gitProxyMemo = null; return null; }
}

function buildCurlEnv() {
  const merged = { ...process.env };
  const env = process.env;
  const hasEnvProxy = env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy || env.ALL_PROXY || env.all_proxy;
  if (hasEnvProxy) return merged;
  const git = loadGitProxy();
  if (!git) return merged;
  if (git.HTTPS_PROXY) merged.HTTPS_PROXY = git.HTTPS_PROXY;
  if (git.HTTP_PROXY) merged.HTTP_PROXY = git.HTTP_PROXY;
  return merged;
}

// ───── HTTP (curl 优先支持代理+TLS跳过, 解析 ETag; fetch 兜底) ─────

// -i 把 response header 一起输出; -k 跳 TLS 验证 (只 GET 公开 JSON, MITM 最多漏报)
function curlFetch(url, headers = {}) {
  const MARK = '\n__WIND_STATUS__:';
  const args = ['-sS', '-k', '-i', '--max-time', String(Math.ceil(NETWORK_TIMEOUT_MS / 1000)), '-A', `${SKILL_NAME}-update-check`];
  for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
  args.push('-w', `${MARK}%{http_code}`, url);
  const r = spawnSync('curl', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: buildCurlEnv() });
  if (r.error?.code === 'ENOENT') return { _curlMissing: true };
  if (r.error) return { status: 0 };
  const out = r.stdout || '';
  const mi = out.lastIndexOf(MARK);
  const status = mi >= 0 ? Number(out.slice(mi + MARK.length).trim()) : 0;
  const blob = mi >= 0 ? out.slice(0, mi) : out;
  // 取最后一段 HTTP 响应 (跳过代理 CONNECT / 重定向的前置 header 段)
  const lastHttp = blob.lastIndexOf('\nHTTP/') >= 0 ? blob.lastIndexOf('\nHTTP/') + 1 : (blob.startsWith('HTTP/') ? 0 : -1);
  const seg = lastHttp >= 0 ? blob.slice(lastHttp) : blob;
  let sep = seg.indexOf('\r\n\r\n'); let sepLen = 4;
  if (sep < 0) { sep = seg.indexOf('\n\n'); sepLen = 2; }
  const headerBlob = sep >= 0 ? seg.slice(0, sep) : '';
  const body = sep >= 0 ? seg.slice(sep + sepLen) : seg;
  const etagMatch = headerBlob.match(/^etag:[ \t]*(.+?)[ \t]*$/im);
  const etag = etagMatch ? etagMatch[1] : null;
  return {
    status,
    headers: { get: (k) => (String(k).toLowerCase() === 'etag' ? etag : null) },
    async json() { return JSON.parse(body); },
    async text() { return body; },
  };
}

async function defaultFetch(url, opts = {}) {
  const viaCurl = curlFetch(url, opts.headers || {});
  if (!viaCurl._curlMissing) return viaCurl;
  // curl 不在 PATH → Node fetch 兜底 (不走代理)
  return fetch(url, { headers: opts.headers, signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS) });
}

// 探活单个 URL: 带 If-None-Match, 返回 {status, sha, etag, body}; fetchImpl 可注入 (测试用)
async function fetchTreeWithETag(url, etag, { fetchImpl } = {}) {
  const doFetch = fetchImpl || defaultFetch;
  const headers = { 'User-Agent': `${SKILL_NAME}-update-check`, 'Accept': 'application/json' };
  if (etag) headers['If-None-Match'] = etag;
  let resp;
  try { resp = await doFetch(url, { headers, signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS) }); }
  catch (e) { return { status: 0, error: e?.name === 'TimeoutError' ? 'timeout' : 'network' }; }
  const status = resp.status;
  if (status === 304) return { status: 304 };
  if (status >= 200 && status < 300) {
    let body;
    try { body = await resp.json(); } catch { return { status, error: 'shape' }; }
    const getEtag = typeof resp.headers?.get === 'function' ? resp.headers.get('etag') : resp.headers?.etag;
    return { status, sha: body?.sha || null, etag: getEtag || null, body };
  }
  if (status === 403 || status === 429) return { status, error: 'rate_limit' };
  return { status, error: status ? `http_${status}` : 'network' };
}

// ───── 远端 API ─────

function apiBase(host) {
  return host === 'github' ? 'https://api.github.com' : 'https://gitee.com/api/v5';
}

function findSkillSha(treeBody, skillDir) {
  if (!treeBody) return null;
  if (!skillDir) return treeBody.sha || null;
  const arr = Array.isArray(treeBody.tree) ? treeBody.tree : [];
  return arr.find(t => t.type === 'tree' && t.path === skillDir)?.sha || null;
}

// 探活当前 skill 子目录 SHA (带 ETag); 多 branch 尝试
async function fetchSkillSha(parsed, ref, skillDir, etag) {
  const branches = ref ? [ref] : (parsed.host === 'gitee' ? ['main', 'master'] : ['HEAD', 'main', 'master']);
  let lastError = null;
  for (const branch of branches) {
    const url = `${apiBase(parsed.host)}/repos/${parsed.owner}/${parsed.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
    const r = await fetchTreeWithETag(url, etag);
    if (r.status === 304) return { status: 304 };
    if (r.error) { lastError = r.error; if (r.error === 'rate_limit') break; continue; }
    if (r.body && Array.isArray(r.body.tree)) return { status: 200, sha: findSkillSha(r.body, skillDir), etag: r.etag };
    lastError = 'shape';
  }
  return { error: lastError || 'shape' };
}

// v3 path: 反查 installedAt 时刻的 skill SHA (识别"客户装了老版本")
async function fetchInstalledSha(parsed, ref, skillDir, installedAt) {
  try {
    const until = new Date(new Date(installedAt).getTime() + INSTALLED_AT_TOLERANCE_MS).toISOString();
    const params = new URLSearchParams({ until, per_page: '1' });
    if (skillDir) params.set('path', skillDir);
    if (ref) params.set('sha', ref);
    const r = await fetchTreeWithETag(`${apiBase(parsed.host)}/repos/${parsed.owner}/${parsed.repo}/commits?${params}`, null);
    if (r.error || !Array.isArray(r.body) || r.body.length === 0) return null;
    const commitSha = r.body[0]?.sha;
    if (!commitSha) return null;
    const tr = await fetchTreeWithETag(`${apiBase(parsed.host)}/repos/${parsed.owner}/${parsed.repo}/git/trees/${commitSha}?recursive=1`, null);
    if (tr.error || !tr.body) return null;
    return findSkillSha(tr.body, skillDir);
  } catch { return null; }
}

// ───── 升级命令 + GC + 长尾 ─────

// scope=global → -g; project → 不带 (项目级升全局会装错位置)
// Gitee 不支持 npx skills update → 退回 add 重装
function buildUpgradeCommand(o, scope) {
  const sc = scope || o?.scope || 'global';
  const flag = sc === 'global' ? ' -g' : '';
  const isGitee = typeof o?.sourceUrl === 'string' && o.sourceUrl.includes('gitee.com');
  return isGitee
    ? `npx skills add ${o.sourceUrl} --skill ${SKILL_NAME}${flag} -y`
    : `npx skills update ${SKILL_NAME}${flag} -y`;
}

// 删 lockPath 已不存在的孤儿 entry (纯函数)
function lazyGC(cache) {
  const entries = {};
  for (const [key, val] of Object.entries(cache.entries || {})) {
    const idx = key.indexOf('|');
    const lockPath = idx >= 0 ? key.slice(idx + 1) : null;
    if (lockPath && existsSync(lockPath)) entries[key] = val;
  }
  return { ...cache, entries };
}

// 长尾 fallback: 14d 无成功探活 + 累计 ≥10 次调用 + 整个生命周期未提示过
function shouldShowLongTail(cache, now) {
  const meta = cache.meta || {};
  if (meta.fallbackShownAt) return false;
  if ((meta.callCount || 0) < LONG_TAIL_MIN_CALLS) return false;
  for (const e of Object.values(cache.entries || {})) {
    if (!e.lastSuccessAt) continue;
    if (now - new Date(e.lastSuccessAt).getTime() > LONG_TAIL_MS) return true;
  }
  return false;
}

// 标记长尾 fallback 已提示 (生命周期一次)
function setFallbackShown(cacheFile, ts) {
  withLock(cacheFile, () => {
    const cache = readCache(cacheFile);
    if (!cache.meta || typeof cache.meta !== 'object') cache.meta = { callCount: 0, fallbackShownAt: null };
    cache.meta.fallbackShownAt = new Date(ts).toISOString();
    writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  });
}

// ───── 主逻辑 (子进程探活) ─────

async function main() {
  const entries = collectEntries();
  if (entries.length === 0) return;
  bumpCallCount(CACHE_FILE);
  const now = Date.now();

  for (const { entry, lockPath, schemaVersion } of entries) {
    const key = cacheKeyFor(SKILL_NAME, lockPath);
    const state = readCache(CACHE_FILE).entries[key] || {};
    const currentSig = buildLockSignature(entry, schemaVersion);
    if (!computeStale(state, now, TTL_MS, currentSig)) continue;

    const sourceUrl = deriveSourceUrl(entry);
    if (!sourceUrl) continue;
    const parsed = parseSourceUrl(sourceUrl);
    if (!parsed) continue;

    const skillDir = normalizeSkillDir(entry.skillPath);
    const ref = entry.ref || null;
    const result = await fetchSkillSha(parsed, ref, skillDir, state.etag);
    if (result.error) continue;                      // 探活失败 → 完全静默, 不写 cache

    const nowIso = new Date(now).toISOString();
    if (result.status === 304) {                     // 远端没变 → 只刷 lastCheckedAt
      mergeCacheEntry(CACHE_FILE, key, { lastCheckedAt: nowIso, lockSignature: currentSig });
      continue;
    }

    const currentSha = result.sha;
    if (!currentSha) continue;

    // 首次基线: v3 反查装时刻 sha (识别老版本); v1 用 currentSha
    let baselineSha = currentSha;
    if (!state.lastNotifiedSha) {
      const installedAt = entry.updatedAt || entry.installedAt;
      if (schemaVersion === 3 && installedAt) {
        const inst = await fetchInstalledSha(parsed, ref, skillDir, installedAt);
        if (inst) baselineSha = inst;
      }
    }

    const patch = {
      lockSchemaVersion: schemaVersion,
      latestSha: currentSha,
      etag: result.etag || state.etag || null,
      lastCheckedAt: nowIso,
      lastSuccessAt: nowIso,
      lockSignature: currentSig,
    };
    if (!state.lastNotifiedSha) patch.lastNotifiedSha = baselineSha;   // 首次写基线, 不通知
    mergeCacheEntry(CACHE_FILE, key, patch);
  }

  // Lazy GC: 清孤儿 entry
  withLock(CACHE_FILE, () => {
    const cache = readCache(CACHE_FILE);
    const gc = lazyGC(cache);
    if (Object.keys(gc.entries).length !== Object.keys(cache.entries).length) {
      writeFileSync(CACHE_FILE, JSON.stringify(gc, null, 2));
    }
  });
}

export {
  canonicalizeLockPath, cacheKeyFor, detectLockSchemaVersion,
  deriveSourceUrl, parseSourceUrl, normalizeSkillDir, buildLockSignature,
  readCache, mergeCacheEntry, bumpCallCount,
  computePending, computeStale,
  fetchTreeWithETag, fetchSkillSha, findSkillSha,
  collectEntries, globalLockPaths, classifyLockScope,
  buildUpgradeCommand, lazyGC, shouldShowLongTail, setFallbackShown,
  CACHE_FILE, TTL_MS, SKILL_NAME,
};

const IS_MAIN = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (IS_MAIN) main().catch(() => {});
