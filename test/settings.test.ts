import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { DEFAULT_TRACK_VOLUME } from '../src/audio/mixer.js';
import { loadTrackVolume, normalizeTrackVolume, saveTrackVolume } from '../src/library/settings.js';

test('normalizeTrackVolume clamps and rounds values safely', () => {
  assert.equal(normalizeTrackVolume(0.253), 0.25);
  assert.equal(normalizeTrackVolume(5), 1);
  assert.equal(normalizeTrackVolume(-1), 0);
  assert.equal(normalizeTrackVolume('bad'), DEFAULT_TRACK_VOLUME);
});

test('saveTrackVolume persists the last used track level', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'musicli-settings-'));
  const settingsPath = join(tempRoot, 'settings.json');

  try {
    assert.equal(loadTrackVolume(settingsPath), null);
    saveTrackVolume(0.35, settingsPath);
    assert.equal(loadTrackVolume(settingsPath), 0.35);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
