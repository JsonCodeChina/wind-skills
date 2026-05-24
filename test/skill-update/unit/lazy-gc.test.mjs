// P1 单测: lazyGC — 清理孤儿 cache entry (测试矩阵 C15)
// lockPath 已不存在的 entry (客户卸载/换目录后残留) 在探活时被静默删除
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MOD = new URL('../../../skills/wind-mcp-skill/scripts/update-check.mjs', import.meta.url);
const load = () => import(MOD);

test('lazyGC 已实现', async () => {
  const { lazyGC } = await load();
  assert.equal(typeof lazyGC, 'function');
});

test('C15: lockPath 不存在的 entry 删除, 存在的保留', async () => {
  const { lazyGC } = await load();
  const dir = mkdtempSync(join(tmpdir(), 'wind-gc-'));
  const realLock = join(dir, 'skills-lock.json');
  writeFileSync(realLock, '{}');
  try {
    const cache = {
      version: 1, meta: { callCount: 1 },
      entries: {
        [`wind-mcp-skill|${realLock}`]: { latestSha: 'a' },
        'wind-mcp-skill|/gone/skills-lock.json': { latestSha: 'b' },
        'wind-alice|/also-gone/.skill-lock.json': { latestSha: 'c' },
      },
    };
    const gc = lazyGC(cache);
    assert.ok(gc.entries[`wind-mcp-skill|${realLock}`], '存在的 lockPath 保留');
    assert.equal(gc.entries['wind-mcp-skill|/gone/skills-lock.json'], undefined, '不存在 → 删');
    assert.equal(gc.entries['wind-alice|/also-gone/.skill-lock.json'], undefined, '其它 skill 孤儿也删');
    assert.deepEqual(gc.meta, cache.meta, 'meta 不动');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('lazyGC: 空 entries 不报错', async () => {
  const { lazyGC } = await load();
  assert.deepEqual(lazyGC({ version: 1, meta: {}, entries: {} }).entries, {});
});

test('lazyGC: 畸形 key (无 |) 跳过不崩', async () => {
  const { lazyGC } = await load();
  const gc = lazyGC({ version: 1, meta: {}, entries: { 'malformed-key': { x: 1 } } });
  assert.equal(gc.entries['malformed-key'], undefined, '无 lockPath 的畸形 key 删除');
});
