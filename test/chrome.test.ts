import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultMixerState } from '../src/audio/mixer.js';
import { CellBuffer } from '../src/renderer/buffer.js';
import { computeLayout } from '../src/renderer/layout.js';
import { renderChrome } from '../src/ui/chrome.js';

function rowText(buffer: CellBuffer, y: number): string {
  let text = '';
  for (let x = 0; x < buffer.width; x++) {
    text += buffer.get(x, y)?.char ?? ' ';
  }
  return text;
}

test('renderChrome groups track and ambience with exact 0.05 values', () => {
  const mixer = defaultMixerState();
  mixer.music = 0.8;
  mixer.rain = 0.75;
  mixer.thunder = 0.55;
  mixer.city = 0.05;

  const width = 80;
  const height = 30;
  const layout = computeLayout(width, height);
  const buffer = new CellBuffer(width, height);

  renderChrome(buffer, layout, {
    mixer,
    track: 'stacks-of-quiet-hours',
    category: 'activities',
    sourceLabel: 'Bedroom Lofi',
    sourceKind: 'folder',
    queuePosition: 1,
    queueTotal: 24,
    queueMode: 'curated',
    paused: false,
    muted: false,
    selectedChannel: 6,
    canSeek: false,
    positionSeconds: null,
    durationSeconds: null,
  });

  const trackHeader = rowText(buffer, layout.volumeBars.y);
  const firstLane = rowText(buffer, layout.volumeBars.y + 1);
  const ambienceHeader = rowText(buffer, layout.volumeBars.y + 2);
  const rainLane = rowText(buffer, layout.volumeBars.y + 3);
  const thunderLane = rowText(buffer, layout.volumeBars.y + 6);
  const cityLane = rowText(buffer, layout.volumeBars.y + 8);
  const hintsRow = rowText(buffer, layout.hints.y);

  assert.match(trackHeader, /TRACK/);
  assert.match(firstLane, /\b01\b/);
  assert.match(firstLane, /track/);
  assert.match(firstLane, /0\.80/);

  assert.match(ambienceHeader, /AMBIENCE/);
  assert.match(rainLane, /\b02\b/);
  assert.match(rainLane, /rain/);
  assert.match(rainLane, /0\.75/);

  assert.match(thunderLane, /\b05\b/);
  assert.match(thunderLane, /thunder/);
  assert.match(thunderLane, /0\.55/);

  assert.match(cityLane, /\b07\b/);
  assert.match(cityLane, /city/);
  assert.match(cityLane, /0\.05/);
  assert.ok(cityLane.includes('▕') && cityLane.includes('▏'));
  assert.match(hintsRow, /n\/b/);
  assert.doesNotMatch(hintsRow, /seek/);
  assert.match(hintsRow, /q/);
});

test('renderChrome shows progress and seek hints when the current source can seek', () => {
  const mixer = defaultMixerState();
  mixer.music = 0.65;

  const width = 112;
  const height = 26;
  const layout = computeLayout(width, height);
  const buffer = new CellBuffer(width, height);

  renderChrome(buffer, layout, {
    mixer,
    track: 'rooftop-drift',
    category: 'late-night',
    sourceLabel: 'Bedroom Lofi',
    sourceKind: 'folder',
    queuePosition: 3,
    queueTotal: 18,
    queueMode: 'curated',
    paused: false,
    muted: false,
    selectedChannel: 0,
    canSeek: true,
    positionSeconds: 72,
    durationSeconds: 228,
  });

  const nowPlayingRow = rowText(buffer, layout.nowPlaying.y);
  const hintsRow = rowText(buffer, layout.hints.y);

  assert.match(nowPlayingRow, /01:12\/03:48/);
  assert.match(hintsRow, /\[\[\]\] seek/);
});
