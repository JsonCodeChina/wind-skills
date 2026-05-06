#!/usr/bin/env node
// update-check.mjs — wind-skills 升级感知探活脚本
// 由 cli.mjs 异步 spawn,读 lock 文件 + 调 tree API 比对 hash,写 cache
// 设计: 完全静默,绝不阻塞主流程,任何异常吞掉

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_GH = 'Wind-Information-Co-Ltd/wind-skills';
const REPO_GITEE = 'wind_info/wind-skills';
const GITEE_URL_FRAGMENT = 'gitee.com/wind_info/wind-skills';

const CACHE_DIR = join(homedir(), '.cache', 'wind-aimarket');
const CACHE_FILE = join(CACHE_DIR, 'update-state.json');

const TTL_OK_MS = 60 * 60 * 1000;            // 已最新 60 min
const TTL_AVAIL_MS = 12 * 60 * 60 * 1000;    // 有新版 720 min (12h)
const NETWORK_TIMEOUT_MS = 5_000;

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

// ───── cache ─────

function readCache() {
  if (!existsSync(CACHE_FILE)) return null;
  try { return JSON.parse(readFileSync(CACHE_FILE, 'utf8')); } catch { return null; }
}

function writeCache(state) {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(state, null, 2));
  } catch {}
}

function isCacheFresh(cache) {
  if (!cache?.lastCheck || !cache?.ttlMs) return false;
  return Date.now() - new Date(cache.lastCheck).getTime() < cache.ttlMs;
}

// ───── lock 文件探测(4 路径策略)─────

function walkUp(startDir) {
  const dirs = [];
  let dir = resolve(startDir);
  while (true) {
    dirs.push(dir);
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dirs;
}

function findLockFiles() {
  const candidates = new Set();

  // ① 全局 lock(XDG 优先,fallback HOME)
  const xdg = process.env.XDG_STATE_HOME;
  candidates.add(xdg
    ? join(xdg, 'skills', '.skill-lock.json')
    : join(homedir(), '.agents', '.skill-lock.json'));

  // ② 从 SCRIPT_DIR 向上找项目 lock
  for (const dir of walkUp(SCRIPT_DIR)) {
    candidates.add(join(dir, 'skills-lock.json'));
  }

  // ③ 从 process.cwd() 向上找项目 lock
  for (const dir of walkUp(process.cwd())) {
    candidates.add(join(dir, 'skills-lock.json'));
  }

  return [...candidates].filter(p => existsSync(p));
}

function loadAllSkills() {
  const allSkills = {};
  for (const lockPath of findLockFiles()) {
    try {
      const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
      Object.assign(allSkills, lock.skills || {});
    } catch {}
  }
  return allSkills;
}

function isOurSkill(entry) {
  if (!entry) return false;
  if (entry.source === REPO_GH) return true;
  if (typeof entry.sourceUrl === 'string' && entry.sourceUrl.includes(GITEE_URL_FRAGMENT)) return true;
  return false;
}

function isFromGitee(entry) {
  return entry?.sourceType === 'git' &&
         typeof entry?.sourceUrl === 'string' &&
         entry.sourceUrl.includes(GITEE_URL_FRAGMENT);
}

// ───── tree API ─────

async function fetchJson(url) {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'wind-mcp-skill-update-check' },
      signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch { return null; }
}

async function fetchGitHubTree() {
  const data = await fetchJson(`https://api.github.com/repos/${REPO_GH}/git/trees/main?recursive=1`);
  return Array.isArray(data?.tree) ? data : null;
}

async function fetchGiteeTree() {
  // Gitee 默认分支可能是 main 或 master,都试一下
  for (const branch of ['main', 'master']) {
    const data = await fetchJson(`https://gitee.com/api/v5/repos/${REPO_GITEE}/git/trees/${branch}?recursive=1`);
    if (Array.isArray(data?.tree)) return data;
  }
  return null;
}

// 把 skillPath 标准化成目录路径,然后在 tree 里找同名 tree 节点 SHA
// "skills/X/SKILL.md" / "skills/X/" / "skills/X" 都归一到 "skills/X"
// "SKILL.md" / "" → 根级 skill,返回整棵 tree 的 SHA
function findSkillSha(tree, skillPath) {
  const dir = String(skillPath || '')
    .replace(/\\/g, '/')
    .replace(/\/?SKILL\.md$/i, '')
    .replace(/\/+$/, '');
  if (!dir) return tree.sha || null;
  return tree.tree.find(t => t.type === 'tree' && t.path === dir)?.sha || null;
}

// ───── 主逻辑 ─────

async function main() {
  // Step 1. cache 还新鲜 → 不做事
  const cache = readCache();
  if (isCacheFresh(cache)) return;

  // Step 2. 读 lock,过滤本仓 skill
  const allSkills = loadAllSkills();
  const ourSkills = Object.entries(allSkills).filter(([, e]) => isOurSkill(e));

  if (ourSkills.length === 0) {
    // 没装本仓任何 skill(理论上不会到这,但稳健起见)
    writeCache({
      lastCheck: new Date().toISOString(),
      status: 'ok',
      outdated: [],
      ttlMs: TTL_OK_MS,
    });
    return;
  }

  // Step 3. 拉 tree(GitHub 优先 → Gitee 兜底)
  const tree = await fetchGitHubTree() ?? await fetchGiteeTree();
  if (!tree) {
    // 两个都不通,静默退出,保留旧 cache 不动(下次再试)
    return;
  }

  // Step 4. 比对 hash
  const outdated = [];
  for (const [name, entry] of ourSkills) {
    const skillPath = entry.skillPath || `skills/${name}`;
    const remoteSha = findSkillSha(tree, skillPath);
    if (!remoteSha) continue;
    if (remoteSha === entry.skillFolderHash) continue;
    outdated.push({
      name,
      source: isFromGitee(entry) ? 'gitee' : 'github',
      current: (entry.skillFolderHash || '').slice(0, 7),
      latest: remoteSha.slice(0, 7),
    });
  }

  // Step 5. 写 cache(保留 snooze 状态)
  const newState = {
    lastCheck: new Date().toISOString(),
    status: outdated.length > 0 ? 'available' : 'ok',
    outdated,
    ttlMs: outdated.length > 0 ? TTL_AVAIL_MS : TTL_OK_MS,
  };
  if (cache?.snoozedUntil) newState.snoozedUntil = cache.snoozedUntil;
  if (typeof cache?.snoozeLevel === 'number') newState.snoozeLevel = cache.snoozeLevel;
  writeCache(newState);
}

main().catch(() => {});
