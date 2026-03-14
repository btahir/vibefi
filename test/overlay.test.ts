import assert from 'node:assert/strict';
import test from 'node:test';
import { CellBuffer } from '../src/renderer/buffer.js';
import { createLineEditor } from '../src/ui/line-editor.js';
import { renderSourceEditorOverlay, renderSourcesOverlay, renderWelcomeOverlay } from '../src/ui/overlay.js';

function bufferText(buffer: CellBuffer): string {
  let text = '';
  for (let y = 0; y < buffer.height; y++) {
    for (let x = 0; x < buffer.width; x++) {
      text += buffer.get(x, y)?.char ?? ' ';
    }
    text += '\n';
  }
  return text;
}

test('renderWelcomeOverlay shows local and stream options', () => {
  const buffer = new CellBuffer(96, 24);

  renderWelcomeOverlay(buffer, {
    selectedIndex: 0,
    folderPickerSupported: true,
    options: [
      {
        id: 'local',
        label: 'Local Folder',
        detail: 'Browse for a folder on your machine and start there.',
        recommended: true,
      },
      {
        id: 'stream',
        label: 'Stream URL',
        detail: 'Play a YouTube URL or another HTTP audio stream.',
      },
    ],
  });

  const text = bufferText(buffer);
  assert.match(text, /Your focus room starts here/);
  assert.match(text, /Local Folder/);
  assert.match(text, /Stream URL/);
  assert.match(text, /Nothing plays until you choose a source/i);
  assert.match(text, /system picker/i);
  assert.match(text, /← → \/ ↑ ↓ move/);
});

test('renderSourceEditorOverlay shows type, name, target, and errors', () => {
  const buffer = new CellBuffer(90, 24);

  renderSourceEditorOverlay(buffer, {
    mode: 'edit',
    type: 'stream',
    focusedField: 'target',
    label: createLineEditor('Lofi Girl'),
    target: createLineEditor('https://www.youtube.com/watch?v=jfKfPfyJRdk'),
    folderPickerSupported: true,
    error: 'Use a full http:// or https:// URL.',
  });

  const text = bufferText(buffer);
  assert.match(text, /Edit Source/);
  assert.match(text, /Stream URL/);
  assert.match(text, /Lofi Girl/);
  assert.match(text, /youtube\.com\/watch\?v=jfKfPfyJRdk/);
  assert.match(text, /Use a full http:\/\/ or https:\/\/ URL\./);
});

test('renderSourcesOverlay shows actions, sources, and details', () => {
  const buffer = new CellBuffer(96, 24);

  renderSourcesOverlay(buffer, {
    query: 'lofi',
    items: [
      {
        kind: 'action',
        action: 'add-local',
        label: 'Add Local Folder',
        detail: 'Point Musicli at a music folder',
        value: 'action:add-local',
      },
      {
        kind: 'folder',
        label: 'Bedroom Lofi',
        detail: '/Users/example/Music/Bedroom Lofi',
        target: '/Users/example/Music/Bedroom Lofi',
        slug: 'bedroom-lofi',
        value: 'bedroom-lofi',
        editable: true,
        deletable: true,
      },
      {
        kind: 'stream',
        label: 'Lofi Girl',
        detail: 'saved stream',
        target: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
        slug: 'lofi-girl',
        value: 'lofi-girl',
        editable: true,
        deletable: true,
      },
    ],
    selectedIndex: 2,
    folderPickerSupported: true,
    activeKind: 'stream',
    activeValue: 'lofi-girl',
  });

  const text = bufferText(buffer);
  assert.match(text, /Sources/);
  assert.match(text, /Add Local Folder/);
  assert.match(text, /Bedroom Lofi/);
  assert.match(text, /Lofi Girl/);
  assert.match(text, /saved stream/);
  assert.match(text, /Current source/);
});
