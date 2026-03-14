import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { loadLocalFolderCatalog } from '../src/library/local-folder.js';

test('loadLocalFolderCatalog scans nested audio files into runtime tracks', () => {
  const root = mkdtempSync(join(tmpdir(), 'musicli-local-folder-'));

  try {
    mkdirSync(join(root, 'Jazzhop'));
    mkdirSync(join(root, 'Night', 'Side B'), { recursive: true });
    writeFileSync(join(root, 'Jazzhop', 'last-call.mp3'), '');
    writeFileSync(join(root, 'Night', 'Side B', 'city-lights.flac'), '');
    writeFileSync(join(root, 'notes.txt'), 'ignore');

    const catalog = loadLocalFolderCatalog(root, 'Bedroom Crates');

    assert.equal(catalog.source, 'local');
    assert.equal(catalog.trackCount, 2);
    assert.deepEqual(catalog.categories.map((category) => category.slug), ['jazzhop', 'night']);
    assert.match(catalog.tracks[0]?.filePath ?? '', /last-call\.mp3$/);
    assert.match(catalog.tracks[1]?.filePath ?? '', /city-lights\.flac$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
