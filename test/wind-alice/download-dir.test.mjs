import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveDownloadDir } from '../../skills/wind-alice/scripts/request.js';

function withTempDir(fn) {
  const root = mkdtempSync(join(tmpdir(), 'wa-download-'));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('wind-alice resolveDownloadDir', () => {
  it('uses user-level .agents/download when skill is installed under home .agents', () => {
    withTempDir((home) => {
      const skillDir = join(home, '.agents', 'skills', 'wind-alice');
      mkdirSync(skillDir, { recursive: true });

      assert.deepEqual(resolveDownloadDir(skillDir, { home }), {
        dir: join(home, '.agents', 'download'),
        source: 'home-agents',
      });
    });
  });

  it('uses nearest project .agents/download when present above the skill', () => {
    withTempDir((home) => {
      const project = join(home, 'project');
      const skillDir = join(project, 'skills', 'wind-alice');
      mkdirSync(join(project, '.agents'), { recursive: true });
      mkdirSync(skillDir, { recursive: true });

      assert.deepEqual(resolveDownloadDir(skillDir, { home }), {
        dir: join(project, '.agents', 'download'),
        source: 'project-agents',
      });
    });
  });

  it('falls back to user-level .agents/download when no project .agents exists', () => {
    withTempDir((home) => {
      const skillDir = join(home, 'source', 'skills', 'wind-alice');
      mkdirSync(skillDir, { recursive: true });

      assert.deepEqual(resolveDownloadDir(skillDir, { home }), {
        dir: join(home, '.agents', 'download'),
        source: 'home-agents-fallback',
      });
    });
  });
});
