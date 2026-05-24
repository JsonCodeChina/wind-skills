// 集成测试: 真实 spawn update-check.mjs 子进程的黑盒行为
// 吸收自旧 test/wind-mcp-skill/update-check.test.mjs 仍有效的集成断言:
//   - exit 0 (never blocks 主流程)
//   - lockfile 跑完清理
//   - 并发多进程 → cache 仍是合法 JSON (race 不破坏文件)
// 用 underivable source 让探活跳过, 不依赖真实网络
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const UC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'skills', 'wind-mcp-skill', 'scripts', 'update-check.mjs');

function setupHome() {
  const home = mkdtempSync(join(tmpdir(), 'wind-uc-sub-'));
  mkdirSync(join(home, '.agents'), { recursive: true });
  // source 无法 derive 出 URL (sourceType 非 github/git/gitee) → 探活跳过, 子进程仍 exit 0
  writeFileSync(join(home, '.agents', '.skill-lock.json'), JSON.stringify({
    version: 1,
    skills: { 'wind-mcp-skill': { source: 'x/y', sourceType: 'unknown', skillPath: 'skills/wind-mcp-skill/SKILL.md', computedHash: 'h' } },
  }));
  return home;
}

function runUC(home) {
  return new Promise((resolve) => {
    const c = spawn('node', [UC], { env: { ...process.env, HOME: home }, stdio: 'ignore' });
    c.on('exit', (code) => resolve(code));
    c.on('error', () => resolve(-1));
  });
}

test('子进程 exit 0 (never blocks 主流程)', async () => {
  const home = setupHome();
  try {
    const code = await runUC(home);
    assert.equal(code, 0, 'update-check 必须 exit 0');
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('跑完 lockfile 被清理, cache 是合法 JSON', async () => {
  const home = setupHome();
  try {
    await runUC(home);
    const cacheFile = join(home, '.cache', 'wind-aifinmarket', 'update-state.json');
    const lockFile = cacheFile + '.lock';
    assert.ok(!existsSync(lockFile), 'lockfile 跑完必须清理');
    if (existsSync(cacheFile)) {
      assert.doesNotThrow(() => JSON.parse(readFileSync(cacheFile, 'utf8')), 'cache 必须合法 JSON');
    }
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('并发 3 子进程 → cache 仍合法 JSON (withLock race 不破坏文件)', async () => {
  const home = setupHome();
  try {
    const codes = await Promise.all([runUC(home), runUC(home), runUC(home)]);
    codes.forEach((c) => assert.equal(c, 0, '并发子进程都应 exit 0'));
    const cacheFile = join(home, '.cache', 'wind-aifinmarket', 'update-state.json');
    if (existsSync(cacheFile)) {
      const parsed = JSON.parse(readFileSync(cacheFile, 'utf8'));  // 不抛 = 合法
      assert.equal(parsed.version, 1);
      assert.ok(parsed.meta.callCount >= 1, 'callCount 至少被 bump 一次');
    }
  } finally { rmSync(home, { recursive: true, force: true }); }
});
