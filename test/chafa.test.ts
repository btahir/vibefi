import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CellBuffer } from '../src/renderer/buffer.js';
import { loadScenes } from '../src/scenes/catalog.js';
import { parseChafaAnsi } from '../src/scenes/chafa.js';

test('parseChafaAnsi maps sgr colors into scene cells', () => {
  const frame = parseChafaAnsi(
    '\x1b[38;2;210;210;210mA\x1b[48;2;20;20;20mB\x1b[0m \n\x1b[38;2;80;80;80mCD\x1b[0m\n',
    3,
    2,
  );

  assert.equal(frame.cells[0].char, 'A');
  assert.deepEqual(frame.cells[0].fg, [210, 210, 210]);
  assert.equal(frame.cells[1].char, 'B');
  assert.deepEqual(frame.cells[1].bg, [20, 20, 20]);
  assert.equal(frame.cells[3].char, 'C');
  assert.deepEqual(frame.cells[3].fg, [80, 80, 80]);
});

test('loadScenes uses the configured chafa command when requested', () => {
  const dir = mkdtempSync(join(tmpdir(), 'musicli-chafa-test-'));
  const scriptPath = join(dir, 'fake-chafa');
  writeFileSync(
    scriptPath,
    [
      '#!/bin/sh',
      'printf \'\\033[38;2;220;220;220m▀\\033[38;2;120;120;120m█ \\n\\033[38;2;60;60;60m▄  \\033[0m\\n\'',
    ].join('\n'),
  );
  chmodSync(scriptPath, 0o755);

  const previous = process.env.MUSICLI_CHAFA_BIN;
  process.env.MUSICLI_CHAFA_BIN = scriptPath;

  try {
    const { sceneNames, scenes } = loadScenes('chafa');
    assert.ok(sceneNames.length > 0);

    const scene = scenes.get(sceneNames[0]);
    assert.ok(scene);

    scene.init(3, 2);
    const buffer = new CellBuffer(3, 2);
    scene.render(buffer, { x: 0, y: 0, width: 3, height: 2 });

    assert.equal(buffer.get(0, 0)?.char, '▀');
    assert.deepEqual(buffer.get(0, 0)?.fg, [220, 220, 220]);
    assert.equal(buffer.get(1, 0)?.char, '█');
  } finally {
    if (previous === undefined) {
      delete process.env.MUSICLI_CHAFA_BIN;
    } else {
      process.env.MUSICLI_CHAFA_BIN = previous;
    }
  }
});
