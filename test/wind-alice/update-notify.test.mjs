import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../..');
const UPDATE_MOD = join(REPO, 'skills/wind-alice/scripts/update-check.mjs');
const UPDATE_CHECK = join(REPO, 'skills/wind-alice/scripts/update-check.mjs');

function runModuleSnippet(source) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env },
  });
}

describe('wind-alice update trigger', () => {
  it('maybePrintUpdateNotice is a compatibility no-op', () => {
    const script = `const m = await import(${JSON.stringify(pathToFileURL(UPDATE_MOD).href)}); m.maybePrintUpdateNotice();`;
    const r = runModuleSnippet(script);
    assert.equal(r.status, 0);
    assert.equal((r.stderr || '') + (r.stdout || ''), '');
  });

  it('exports the non-blocking update trigger', async () => {
    const mod = await import(pathToFileURL(UPDATE_MOD).href);
    assert.equal(typeof mod.spawnUpdateCheck, 'function');
    assert.equal(typeof mod.maybePrintUpdateNotice, 'function');
  });

  it('update-check.mjs parses successfully', () => {
    const r = spawnSync(process.execPath, ['--check', UPDATE_CHECK], {
      cwd: REPO,
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr || r.stdout);
  });
});
