#!/usr/bin/env node
// Daily background updater for wind-mcp-skill.
// The CLI starts this script detached; failures are recorded but never block data calls.

import { existsSync, mkdirSync, openSync, closeSync, unlinkSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = dirname(SCRIPT_DIR);
const LOCK_FILE = join(SCRIPT_DIR, 'update.lock');
const SKILL_NAME = 'wind-mcp-skill';
const LOCK_STALE_MS = 30 * 60 * 1000;

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

function updateStateFile() {
  return join(SKILL_DIR, 'update-state.json');
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
  return state && state.date === todayKey() && state.status === 'success';
}

function acquireLock() {
  try {
    if (!existsSync(SCRIPT_DIR)) mkdirSync(SCRIPT_DIR, { recursive: true });
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

function writeState(patch) {
  const now = new Date();
  const command = updateCommand();
  const stateFile = updateStateFile();
  const state = {
    date: todayKey(),
    scope: updateScope(),
    command: command.join(' '),
    updatedAt: now.toISOString(),
    ...patch,
  };
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
}

function runUpdate() {
  const command = updateCommand();
  const cwd = updateScope() === 'global' ? homedir() : projectRoot();
  const isWin = process.platform === 'win32';
  const bin = isWin ? 'cmd.exe' : 'npx';
  const args = isWin ? ['/d', '/s', '/c', command.join(' ')] : command.slice(1);
  const result = spawnSync(bin, args, {
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    cwd,
    timeout: 10 * 60 * 1000,
  });

  writeState({
    status: result.status === 0 ? 'success' : 'failed',
    finishedAt: new Date().toISOString(),
    exitCode: result.status,
    error: result.error ? String(result.error.message || result.error) : null,
  });
}

async function main() {
  if (alreadyUpdatedToday()) return;
  const fd = acquireLock();
  if (fd === null) return;
  try {
    if (alreadyUpdatedToday()) return;
    runUpdate();
  } finally {
    releaseLock(fd);
  }
}

main().catch(() => {});
