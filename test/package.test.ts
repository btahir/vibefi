import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

function npmCommand(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

test('npm pack includes scenes, ambience assets, and install scripts', () => {
  const cacheDir = mkdtempSync(join(tmpdir(), 'musicli-npm-cache-'));
  const raw = execFileSync(npmCommand(), ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      npm_config_cache: cacheDir,
    },
  });
  const packResult = JSON.parse(raw)[0] as { files: Array<{ path: string }> };
  const paths = new Set(packResult.files.map((file) => file.path));

  assert.ok([...paths].some((path) => path.startsWith('sounds/') && path.endsWith('.mp3')));
  assert.ok([...paths].some((path) => path.startsWith('assets/scenes/') && path.endsWith('.png')));
  assert.ok(![...paths].some((path) => path.startsWith('tracks/')));
  assert.ok(paths.has('scripts/patch-speaker-coreaudio.mjs'));
});
