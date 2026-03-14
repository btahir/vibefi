import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { DEFAULT_TRACK_VOLUME } from '../src/audio/mixer.js';
import {
  loadLastSource,
  loadTrackVolume,
  normalizeTrackVolume,
  saveLastSource,
  saveTrackVolume,
} from '../src/library/settings.js';

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

test('saveLastSource persists the last used source', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'musicli-settings-'));
  const settingsPath = join(tempRoot, 'settings.json');

  try {
    assert.equal(loadLastSource(settingsPath), null);
    saveLastSource({ kind: 'local', path: '/Users/example/Music/Lofi', label: 'Bedroom Crates' }, settingsPath);
    assert.deepEqual(loadLastSource(settingsPath), {
      kind: 'local',
      path: '/Users/example/Music/Lofi',
      label: 'Bedroom Crates',
    });
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('track volume and last source are preserved together', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'musicli-settings-'));
  const settingsPath = join(tempRoot, 'settings.json');

  try {
    saveTrackVolume(0.35, settingsPath);
    saveLastSource({ kind: 'stream', input: 'https://example.com/live.m3u8', label: 'Live' }, settingsPath);

    assert.equal(loadTrackVolume(settingsPath), 0.35);
    assert.deepEqual(loadLastSource(settingsPath), {
      kind: 'stream',
      input: 'https://example.com/live.m3u8',
      label: 'Live',
    });

    saveTrackVolume(0.25, settingsPath);

    assert.equal(loadTrackVolume(settingsPath), 0.25);
    assert.deepEqual(loadLastSource(settingsPath), {
      kind: 'stream',
      input: 'https://example.com/live.m3u8',
      label: 'Live',
    });
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
