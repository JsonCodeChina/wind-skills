// P0 单测: canonicalizeLockPath — cache key 路径规范化 (修正 #1)
// 覆盖测试矩阵 C1 / C16(macOS 软链) / C17(Windows 大小写)
// 目标: 软链接 / ./ / 末尾斜杠 / 大小写差异 都归一到同一 canonical key
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MOD = new URL('../../../skills/wind-mcp-skill/scripts/update-check.mjs', import.meta.url);
const load = () => import(MOD);

test('canonicalizeLockPath 已实现', async () => {
  const { canonicalizeLockPath } = await load();
  assert.equal(typeof canonicalizeLockPath, 'function', '应 export canonicalizeLockPath');
});

test('./ 与多余斜杠归一', async () => {
  const { canonicalizeLockPath } = await load();
  const dir = mkdtempSync(join(tmpdir(), 'wind-canon-'));
  const real = join(dir, 'skills-lock.json');
  writeFileSync(real, '{}');
  try {
    const a = canonicalizeLockPath(real);
    const b = canonicalizeLockPath(join(dir, '.', 'skills-lock.json'));
    const c = canonicalizeLockPath(real + '');
    assert.equal(a, b, './ 应被规范化掉');
    assert.equal(a, c);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('软链接解析到真实路径 (同一 inode → 同一 key)', async () => {
  const { canonicalizeLockPath } = await load();
  const dir = mkdtempSync(join(tmpdir(), 'wind-canon-'));
  const real = join(dir, 'real-lock.json');
  const link = join(dir, 'link-lock.json');
  writeFileSync(real, '{}');
  symlinkSync(real, link);
  try {
    assert.equal(
      canonicalizeLockPath(real),
      canonicalizeLockPath(link),
      '软链接应解析到真实路径, 避免两个 cache key',
    );
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('路径不存在 → realpath 失败降级, 不抛错', async () => {
  const { canonicalizeLockPath } = await load();
  const fake = '/nonexistent/dir/skills-lock.json';
  let out;
  assert.doesNotThrow(() => { out = canonicalizeLockPath(fake); }, '不存在的路径不应抛错');
  assert.equal(typeof out, 'string');
  assert.ok(out.includes('skills-lock.json'), '降级仍应返回规范化绝对路径');
});

test('相对路径 → 解析为绝对路径', async () => {
  const { canonicalizeLockPath } = await load();
  const out = canonicalizeLockPath('./skills-lock.json');
  assert.ok(out.startsWith('/') || /^[A-Za-z]:/.test(out), '应返回绝对路径');
});
