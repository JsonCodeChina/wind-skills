#!/usr/bin/env node
// Daily background updater for wind-mcp-skill.
// The CLI starts this script detached; failures are recorded but never block data calls.

import { existsSync, mkdirSync, openSync, closeSync, unlinkSync, writeFileSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = process.argv[2] ? resolve(process.argv[2]) : dirname(SCRIPT_DIR);
const SKILL_SCRIPTS_DIR = join(SKILL_DIR, 'scripts');
const LOCK_FILE = join(SKILL_SCRIPTS_DIR, 'update.lock');
const SKILL_NAME = 'wind-mcp-skill';
const LOCK_STALE_MS = 30 * 60 * 1000;
const QUIET_MS = 10 * 1000;

function normalizePath(value) {
  const normalized = resolve(value).replace(/\\/g, '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function updateScope() {
  const globalRoot = normalizePath(join(homedir(), '.agents', 'skills'));
  const skillDir = normalizePath(SKILL_DIR);
  return skillDir.startsWith(globalRoot + '/') ? 'global' : 'project';
}

function projectRoot() {
  return resolve(SKILL_DIR, '..', '..', '..');
}

function updateCommand() {
  const command = ['npx', 'skills', 'update', SKILL_NAME, '-y'];
  if (updateScope() === 'global') command.push('-g');
  return command;
}

function lockFile() {
  return updateScope() === 'global'
    ? join(homedir(), '.agents', '.skill-lock.json')
    : join(projectRoot(), 'skills-lock.json');
}

function readLockEntry() {
  try {
    const file = lockFile();
    if (!existsSync(file)) return null;
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return data?.skills?.[SKILL_NAME] || null;
  } catch {
    return null;
  }
}

function isGiteeSource(entry) {
  const values = [entry?.sourceType, entry?.source, entry?.sourceUrl]
    .filter(Boolean)
    .map(value => String(value).toLowerCase());
  return values.some(value => value.includes('gitee'));
}

function sourceUrl(entry) {
  if (!entry) return null;
  if (entry.sourceUrl) return entry.sourceUrl;
  if (entry.sourceType === 'github' && /^[^/\s]+\/[^/\s]+$/.test(entry.source || '')) {
    return `https://github.com/${entry.source}.git`;
  }
  return entry.source || null;
}

function remoteHead(entry) {
  const source = sourceUrl(entry);
  if (!source) return null;
  try {
    const result = spawnSync('git', ['ls-remote', source, 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: updateEnv(),
      timeout: 60 * 1000,
    });
    if (result.status !== 0) return null;
    const head = (result.stdout || '').trim().split(/\s+/)[0];
    return /^[0-9a-f]{40}$/i.test(head) ? head : null;
  } catch {
    return null;
  }
}

function addCommand(entry) {
  const source = sourceUrl(entry);
  if (!source) return null;
  const command = ['npx', 'skills', 'add', source, '--skill', SKILL_NAME, '-y'];
  if (updateScope() === 'global') command.push('-g');
  return command;
}

function commandForUpdate() {
  const entry = readLockEntry();
  if (isGiteeSource(entry)) {
    const command = addCommand(entry);
    if (command) return { command, method: 'add', sourceType: entry?.sourceType || null };
  }
  return { command: updateCommand(), method: 'update', sourceType: entry?.sourceType || null };
}

function updateEnv() {
  return { ...process.env };
}

function updateStateFile() {
  return join(SKILL_SCRIPTS_DIR, 'update-state.json');
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function readState() {
  try {
    const stateFile = updateStateFile();
    if (!existsSync(stateFile)) return null;
    return JSON.parse(readFileSync(stateFile, 'utf8'));
  } catch {
    return null;
  }
}

function alreadyUpdatedToday() {
  const state = readState();
  if (!state || state.date !== todayKey() || state.status !== 'success') return false;
  const entry = readLockEntry();
  if (!entry || isGiteeSource(entry)) return true;
  const head = remoteHead(entry);
  return !head || head === state.lastAppliedRemoteHead;
}

function lastUsedAt() {
  try {
    const state = readState();
    const ts = new Date(state?.lastUsedAt).getTime();
    return Number.isFinite(ts) ? ts : 0;
  } catch {
    return 0;
  }
}

function quietLongEnough() {
  const last = lastUsedAt();
  return last === 0 || Date.now() - last >= QUIET_MS;
}

function clearLastUsed() {
  try {
    const state = readState();
    if (!state) return;
    delete state.lastUsedAt;
    delete state.lastUsedPid;
    writeFileSync(updateStateFile(), JSON.stringify(state, null, 2) + '\n');
  } catch {}
}

function acquireLock() {
  try {
    if (!existsSync(SKILL_SCRIPTS_DIR)) mkdirSync(SKILL_SCRIPTS_DIR, { recursive: true });
    try {
      const st = statSync(LOCK_FILE);
      if (Date.now() - st.mtimeMs > LOCK_STALE_MS) unlinkSync(LOCK_FILE);
    } catch {}
    const fd = openSync(LOCK_FILE, 'wx');
    return fd;
  } catch {
    return null;
  }
}

function releaseLock(fd) {
  try { if (fd !== null) closeSync(fd); } catch {}
  try { unlinkSync(LOCK_FILE); } catch {}
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function writeState(patch) {
  const now = new Date();
  const { command, method, sourceType } = commandForUpdate();
  const stateFile = updateStateFile();
  const state = {
    date: todayKey(),
    scope: updateScope(),
    command: command.join(' '),
    method,
    sourceType,
    updatedAt: now.toISOString(),
    ...patch,
  };
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
}

function hashSkillDir() {
  const hash = createHash('sha256');
  const files = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const rel = full.slice(SKILL_DIR.length + 1).replace(/\\/g, '/');
      if (rel === 'config.json' || rel === 'scripts/update-state.json') continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push({ full, rel });
    }
  }
  walk(SKILL_DIR);
  files.sort((a, b) => a.rel.localeCompare(b.rel));
  for (const file of files) {
    hash.update(file.rel);
    hash.update('\0');
    hash.update(readFileSync(file.full));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function runSkillCommand(command, method) {
  const cwd = updateScope() === 'global' ? homedir() : projectRoot();
  const isWin = process.platform === 'win32';
  const bin = isWin ? 'cmd.exe' : 'npx';
  const args = isWin ? ['/d', '/s', '/c', command.join(' ')] : command.slice(1);
  const result = spawnSync(bin, args, {
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: updateEnv(),
    cwd,
    timeout: 10 * 60 * 1000,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  const failedByOutput = /failed to (update|add|install)/i.test(output);
  return {
    command,
    method,
    result,
    output,
    ok: result.status === 0 && !failedByOutput,
    error: result.error ? String(result.error.message || result.error) : (failedByOutput ? `npx skills ${method} reported failure` : null),
  };
}

function runUpdate() {
  const entry = readLockEntry();
  const { command, method, sourceType } = commandForUpdate();
  const state = readState();
  const beforeRemoteHead = remoteHead(entry);
  const remoteChanged = Boolean(beforeRemoteHead && beforeRemoteHead !== state?.lastAppliedRemoteHead);
  const beforeHash = hashSkillDir();
  let attempt = runSkillCommand(command, method);
  let usedFallback = false;
  let fallbackReason = null;

  if ((!attempt.ok || (attempt.ok && remoteChanged && beforeHash === hashSkillDir())) && method !== 'add') {
    const fallbackCommand = addCommand(entry);
    if (fallbackCommand) {
      fallbackReason = attempt.ok ? 'remote changed but update did not change local files' : 'update failed';
      const fallback = runSkillCommand(fallbackCommand, 'add');
      usedFallback = true;
      attempt = {
        ...fallback,
        output: [attempt.output, fallback.output].filter(Boolean).join('\n\n--- fallback: npx skills add ---\n\n'),
        error: fallback.ok ? null : fallback.error || attempt.error,
      };
    }
  }

  const afterHash = hashSkillDir();

  writeState({
    status: attempt.ok ? 'success' : 'failed',
    finishedAt: new Date().toISOString(),
    exitCode: attempt.result.status,
    method: attempt.method,
    usedFallback,
    fallbackReason,
    sourceType,
    command: attempt.command.join(' '),
    error: attempt.error,
    remoteHead: beforeRemoteHead,
    remoteChanged,
    lastAppliedRemoteHead: attempt.ok ? (beforeRemoteHead || state?.lastAppliedRemoteHead || null) : (state?.lastAppliedRemoteHead || null),
    changed: beforeHash !== afterHash,
    beforeHash,
    afterHash,
    output: attempt.output.slice(-2000),
  });
}

async function main() {
  if (alreadyUpdatedToday()) return;
  const fd = acquireLock();
  if (fd === null) return;
  try {
    if (alreadyUpdatedToday()) return;
    await sleep(QUIET_MS);
    if (!quietLongEnough()) {
      clearLastUsed();
      writeState({
        status: 'deferred',
        finishedAt: new Date().toISOString(),
        exitCode: null,
        error: 'skill was used recently; update deferred',
        changed: false,
      });
      return;
    }
    clearLastUsed();
    runUpdate();
  } finally {
    releaseLock(fd);
  }
}

main().catch(() => {});
