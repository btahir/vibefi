import type { RuntimeTrack } from '../library/types.js';
import type { TrackSearchScope } from '../library/search.js';
import type { CellBuffer } from '../renderer/buffer.js';
import { projectLineEditor, type LineEditorState } from './line-editor.js';

const PANEL_BG: [number, number, number] = [8, 10, 16];
const PANEL_BORDER: [number, number, number] = [92, 110, 140];
const PANEL_TITLE: [number, number, number] = [232, 237, 255];
const PANEL_TEXT: [number, number, number] = [196, 205, 220];
const PANEL_DIM: [number, number, number] = [120, 128, 146];
const PANEL_ACCENT: [number, number, number] = [128, 203, 196];
const PANEL_SELECTED_BG: [number, number, number] = [32, 44, 72];
const PANEL_SELECTED_TEXT: [number, number, number] = [250, 252, 255];
const PANEL_CURSOR_BG: [number, number, number] = [180, 140, 255];
const PANEL_CURSOR_TEXT: [number, number, number] = [8, 10, 16];

export interface SearchOverlayState {
  query: string;
  scope: TrackSearchScope;
  selectedIndex: number;
  results: RuntimeTrack[];
  totalResults: number;
}

export interface WelcomeOption {
  id: 'local' | 'stream' | 'sources';
  label: string;
  detail: string;
  recommended?: boolean;
}

export interface WelcomeOverlayState {
  options: WelcomeOption[];
  selectedIndex: number;
  folderPickerSupported?: boolean;
  error?: string;
}

export interface SourceListItem {
  kind: 'action' | 'folder' | 'stream' | 'recent';
  label: string;
  detail: string;
  value?: string;
  action?: 'add-local' | 'add-stream';
  editable?: boolean;
  deletable?: boolean;
}

export interface SourcesOverlayState {
  query: string;
  items: SourceListItem[];
  selectedIndex: number;
  folderPickerSupported?: boolean;
  activeKind?: 'folder' | 'stream' | 'recent';
  activeValue?: string;
  error?: string;
}

export interface SourceEditorOverlayState {
  mode: 'add' | 'edit';
  type: 'local' | 'stream';
  label: LineEditorState;
  target: LineEditorState;
  focusedField: 'type' | 'label' | 'target';
  folderPickerSupported?: boolean;
  error?: string;
}

interface HelpRow {
  key: string;
  action: string;
}

function truncate(text: string, width: number): string {
  if (width <= 0) return '';
  if (text.length <= width) return text;
  if (width <= 1) return text.slice(0, width);
  return `${text.slice(0, width - 1)}…`;
}

function drawPanel(buffer: CellBuffer, width: number, height: number) {
  const panelWidth = Math.max(12, Math.min(width - 2, 86));
  const panelHeight = Math.max(8, Math.min(height - 2, 24));
  const x = Math.max(1, Math.floor((width - panelWidth) / 2));
  const y = Math.max(1, Math.floor((height - panelHeight) / 2));

  buffer.fillRect(x, y, panelWidth, panelHeight, ' ', PANEL_TEXT, PANEL_BG);

  for (let col = x; col < x + panelWidth; col++) {
    buffer.set(col, y, '─', PANEL_BORDER, PANEL_BG);
    buffer.set(col, y + panelHeight - 1, '─', PANEL_BORDER, PANEL_BG);
  }
  for (let row = y; row < y + panelHeight; row++) {
    buffer.set(x, row, '│', PANEL_BORDER, PANEL_BG);
    buffer.set(x + panelWidth - 1, row, '│', PANEL_BORDER, PANEL_BG);
  }

  buffer.set(x, y, '╭', PANEL_BORDER, PANEL_BG);
  buffer.set(x + panelWidth - 1, y, '╮', PANEL_BORDER, PANEL_BG);
  buffer.set(x, y + panelHeight - 1, '╰', PANEL_BORDER, PANEL_BG);
  buffer.set(x + panelWidth - 1, y + panelHeight - 1, '╯', PANEL_BORDER, PANEL_BG);

  return { x, y, width: panelWidth, height: panelHeight };
}

function sectionFits(panel: { y: number; height: number }, row: number, rows: HelpRow[]): boolean {
  const footerRow = panel.y + panel.height - 2;
  const lastContentRow = footerRow - 1;
  const sectionHeight = 1 + rows.length;
  return row + sectionHeight - 1 <= lastContentRow;
}

function sectionFitsCompact(panel: { y: number; height: number }, row: number, rows: HelpRow[]): boolean {
  const footerRow = panel.y + panel.height - 2;
  const lastContentRow = footerRow - 1;
  const sectionHeight = 1 + rows.length * 2;
  return row + sectionHeight - 1 <= lastContentRow;
}

function renderHelpSection(
  buffer: CellBuffer,
  x: number,
  y: number,
  width: number,
  title: string,
  rows: HelpRow[],
): number {
  if (width < 40) {
    return renderCompactHelpSection(buffer, x, y, width, title, rows);
  }

  buffer.writeText(x, y, truncate(title, width), PANEL_ACCENT, PANEL_BG);
  let row = y + 1;

  const keyWidth = Math.min(
    18,
    Math.max(8, rows.reduce((max, item) => Math.max(max, item.key.length), 0)),
  );
  const actionWidth = Math.max(0, width - keyWidth - 3);

  for (const item of rows) {
    const key = truncate(item.key.padEnd(keyWidth, ' '), keyWidth);
    const action = truncate(item.action, actionWidth);
    buffer.writeText(x, row, key, PANEL_SELECTED_TEXT, PANEL_BG);
    if (actionWidth > 0) {
      buffer.writeText(x + keyWidth, row, '  ', PANEL_DIM, PANEL_BG);
      buffer.writeText(x + keyWidth + 2, row, action, PANEL_TEXT, PANEL_BG);
    }
    row += 1;
  }

  return row;
}

function renderCompactHelpSection(
  buffer: CellBuffer,
  x: number,
  y: number,
  width: number,
  title: string,
  rows: HelpRow[],
): number {
  buffer.writeText(x, y, truncate(title, width), PANEL_ACCENT, PANEL_BG);
  let row = y + 1;

  for (const item of rows) {
    buffer.writeText(x, row++, truncate(item.key, width), PANEL_SELECTED_TEXT, PANEL_BG);
    buffer.writeText(x + 2, row++, truncate(item.action, Math.max(0, width - 2)), PANEL_TEXT, PANEL_BG);
  }

  return row;
}

function renderInputField(
  buffer: CellBuffer,
  x: number,
  y: number,
  width: number,
  label: string,
  editor: LineEditorState,
  placeholder: string,
  focused: boolean,
): void {
  const labelWidth = Math.min(8, Math.max(4, label.length));
  const fieldWidth = Math.max(0, width - labelWidth - 2);
  buffer.writeText(x, y, truncate(label.padEnd(labelWidth, ' '), labelWidth), focused ? PANEL_SELECTED_TEXT : PANEL_DIM, PANEL_BG);

  const fieldX = x + labelWidth + 2;
  const projected = projectLineEditor(editor, fieldWidth, placeholder);
  const display = truncate(projected.text.padEnd(fieldWidth, ' '), fieldWidth);
  const fg = focused
    ? (editor.value ? PANEL_SELECTED_TEXT : PANEL_DIM)
    : (editor.value ? PANEL_TEXT : PANEL_DIM);
  const bg = focused ? PANEL_SELECTED_BG : PANEL_BG;
  buffer.writeText(fieldX, y, display, fg, bg);

  if (!focused || fieldWidth <= 0) return;

  const cursorX = Math.max(0, Math.min(fieldWidth - 1, projected.cursorX));
  const cursorChar = display[cursorX] ?? ' ';
  buffer.set(fieldX + cursorX, y, cursorChar, PANEL_CURSOR_TEXT, PANEL_CURSOR_BG);
}

function centerOffset(totalWidth: number, textWidth: number): number {
  return Math.max(0, Math.floor((totalWidth - textWidth) / 2));
}

function writeCentered(
  buffer: CellBuffer,
  y: number,
  text: string,
  fg: [number, number, number],
  bg?: [number, number, number],
  maxWidth = buffer.width,
): void {
  const display = truncate(text, maxWidth);
  buffer.writeText(centerOffset(buffer.width, display.length), y, display, fg, bg);
}

function drawSoftCard(
  buffer: CellBuffer,
  x: number,
  y: number,
  width: number,
  height: number,
  selected: boolean,
): void {
  const bg = selected ? PANEL_SELECTED_BG : PANEL_BG;
  const border = selected ? PANEL_ACCENT : PANEL_BORDER;
  buffer.fillRect(x, y, width, height, ' ', PANEL_TEXT, bg);

  for (let col = x; col < x + width; col++) {
    buffer.set(col, y, '─', border, bg);
    buffer.set(col, y + height - 1, '─', border, bg);
  }
  for (let row = y; row < y + height; row++) {
    buffer.set(x, row, '│', border, bg);
    buffer.set(x + width - 1, row, '│', border, bg);
  }

  buffer.set(x, y, '╭', border, bg);
  buffer.set(x + width - 1, y, '╮', border, bg);
  buffer.set(x, y + height - 1, '╰', border, bg);
  buffer.set(x + width - 1, y + height - 1, '╯', border, bg);
}

function detailLinesForItem(
  item: SourceListItem | undefined,
  folderPickerSupported: boolean,
  activeKind?: SourcesOverlayState['activeKind'],
  activeValue?: string,
): string[] {
  if (!item) {
    return ['No sources match this filter.', 'Type to search, or press a to add a local folder.'];
  }

  if (item.kind === 'action') {
    if (item.action === 'add-local') {
      return [
        'Add a local folder.',
        folderPickerSupported
          ? 'Open the system folder picker and save that folder as a reusable source.'
          : 'Paste the path to a directory of tracks and save it as a reusable source.',
      ];
    }

    return [
      'Add a stream source.',
      'Save a YouTube or HTTP stream URL so you can switch to it without flags.',
    ];
  }

  const kindLabel =
    item.kind === 'folder' ? 'Local folder'
    : item.kind === 'stream' ? 'Saved stream'
    : 'Recent stream';
  const isCurrent =
    item.kind === activeKind
    && item.value === activeValue;

  return [
    kindLabel,
    item.label,
    item.detail,
    isCurrent ? 'Current source' : item.editable ? 'Press enter to play, e to edit, d to delete.' : 'Press enter to play.',
  ];
}

export function renderWelcomeOverlay(buffer: CellBuffer, state: WelcomeOverlayState): void {
  const contentWidth = Math.max(24, Math.min(buffer.width - 6, 108));
  const contentX = centerOffset(buffer.width, contentWidth);
  const heroY = Math.max(1, Math.floor(buffer.height * 0.12));
  const selectedIndex = Math.max(0, Math.min(state.selectedIndex, state.options.length - 1));
  const selected = state.options[selectedIndex];
  const supportsPicker = Boolean(state.folderPickerSupported);

  writeCentered(buffer, heroY, 'Your focus room starts here', PANEL_TITLE, undefined, contentWidth);
  writeCentered(
    buffer,
    heroY + 1,
    'Choose where the session comes from. Nothing plays until you choose a source.',
    PANEL_TEXT,
    undefined,
    contentWidth,
  );
  writeCentered(
    buffer,
    heroY + 2,
    supportsPicker
      ? 'Local Folder opens your system picker first so you do not have to remember a path.'
      : 'Local Folder is the recommended path. Stream URL is there when you want live radio.',
    PANEL_DIM,
    undefined,
    contentWidth,
  );

  if (state.error) {
    writeCentered(buffer, heroY + 4, state.error, [255, 140, 140], undefined, contentWidth);
  }

  const cardsTop = heroY + (state.error ? 6 : 5);
  const wideCards = buffer.width >= 88 && (state.options.length <= 2 || buffer.height >= 28);
  const cardHeight = wideCards ? 9 : 7;
  const gap = 2;
  const compactWelcomeList = !wideCards && (cardsTop + state.options.length * 3 + 2 >= buffer.height - 3);

  if (wideCards) {
    const primaryOptions = state.options.slice(0, 2);
    const primaryCount = Math.max(1, primaryOptions.length);
    const cardWidth = Math.max(26, Math.floor((contentWidth - gap * (primaryCount - 1)) / primaryCount));
    const totalPrimaryWidth = cardWidth * primaryCount + gap * (primaryCount - 1);
    const cardsX = centerOffset(buffer.width, totalPrimaryWidth);

    primaryOptions.forEach((option, index) => {
      const x = cardsX + index * (cardWidth + gap);
      const isSelected = selectedIndex === index;
      drawSoftCard(buffer, x, cardsTop, cardWidth, cardHeight, isSelected);

      const shortcut = `${index + 1}`;
      buffer.writeText(x + 2, cardsTop + 1, shortcut, isSelected ? PANEL_CURSOR_TEXT : PANEL_ACCENT, isSelected ? PANEL_CURSOR_BG : PANEL_BG);
      buffer.writeText(x + 5, cardsTop + 1, truncate(option.label, cardWidth - 7), isSelected ? PANEL_SELECTED_TEXT : PANEL_TITLE, isSelected ? PANEL_SELECTED_BG : PANEL_BG);

      if (option.recommended) {
        buffer.writeText(x + 2, cardsTop + 2, truncate('Recommended', cardWidth - 4), PANEL_ACCENT, isSelected ? PANEL_SELECTED_BG : PANEL_BG);
      }

      buffer.writeText(x + 2, cardsTop + 4, truncate(option.detail, cardWidth - 4), isSelected ? PANEL_SELECTED_TEXT : PANEL_TEXT, isSelected ? PANEL_SELECTED_BG : PANEL_BG);
      buffer.writeText(
        x + 2,
        cardsTop + cardHeight - 2,
        truncate(option.id === 'local' ? 'Enter to browse and start' : 'Enter to open the source form', cardWidth - 4),
        PANEL_DIM,
        isSelected ? PANEL_SELECTED_BG : PANEL_BG,
      );
    });

    if (state.options.length > 2) {
      const tertiary = state.options[2];
      const tertiaryY = cardsTop + cardHeight + 1;
      const tertiaryWidth = Math.min(contentWidth, 68);
      const tertiaryX = centerOffset(buffer.width, tertiaryWidth);
      const isSelected = selectedIndex === 2;
      drawSoftCard(buffer, tertiaryX, tertiaryY, tertiaryWidth, 5, isSelected);
      buffer.writeText(tertiaryX + 2, tertiaryY + 1, '3', isSelected ? PANEL_CURSOR_TEXT : PANEL_ACCENT, isSelected ? PANEL_CURSOR_BG : PANEL_BG);
      buffer.writeText(
        tertiaryX + 5,
        tertiaryY + 1,
        truncate(`${tertiary.label}  ${tertiary.detail}`, tertiaryWidth - 7),
        isSelected ? PANEL_SELECTED_TEXT : PANEL_TEXT,
        isSelected ? PANEL_SELECTED_BG : PANEL_BG,
      );
    }
  } else if (!compactWelcomeList) {
    const cardWidth = Math.max(24, Math.min(contentWidth, 68));
    const cardX = centerOffset(buffer.width, cardWidth);

    state.options.forEach((option, index) => {
      const y = cardsTop + index * (cardHeight + 1);
      const isSelected = selectedIndex === index;
      drawSoftCard(buffer, cardX, y, cardWidth, cardHeight, isSelected);
      buffer.writeText(cardX + 2, y + 1, String(index + 1), isSelected ? PANEL_CURSOR_TEXT : PANEL_ACCENT, isSelected ? PANEL_CURSOR_BG : PANEL_BG);
      buffer.writeText(cardX + 5, y + 1, truncate(option.label, cardWidth - 7), isSelected ? PANEL_SELECTED_TEXT : PANEL_TITLE, isSelected ? PANEL_SELECTED_BG : PANEL_BG);
      if (option.recommended) {
        buffer.writeText(cardX + 2, y + 2, truncate('Recommended', cardWidth - 4), PANEL_ACCENT, isSelected ? PANEL_SELECTED_BG : PANEL_BG);
      }
      buffer.writeText(cardX + 2, y + 4, truncate(option.detail, cardWidth - 4), isSelected ? PANEL_SELECTED_TEXT : PANEL_TEXT, isSelected ? PANEL_SELECTED_BG : PANEL_BG);
    });
  } else {
    state.options.forEach((option, index) => {
      const isSelected = selectedIndex === index;
      const prefix = isSelected ? '› ' : '  ';
      const shortcut = `${index + 1}. `;
      const badge = option.recommended ? ' (recommended)' : '';
      buffer.writeText(
        contentX,
        cardsTop + index,
        truncate(`${prefix}${shortcut}${option.label}${badge}`, contentWidth).padEnd(contentWidth, ' '),
        isSelected ? PANEL_SELECTED_TEXT : PANEL_TEXT,
        isSelected ? PANEL_SELECTED_BG : PANEL_BG,
      );
    });

    if (selected) {
      writeCentered(buffer, cardsTop + state.options.length + 1, selected.detail, PANEL_TEXT, undefined, contentWidth);
    }
  }

  const footerY = buffer.height - 3;
  const shortcutText = state.options.length > 2 ? '1 local  2 stream  3 saved' : '1 local  2 stream';
  writeCentered(
    buffer,
    footerY,
    selected?.id === 'local'
      ? (supportsPicker
        ? `← → / ↑ ↓ move  enter browse  ${shortcutText}  o sources  q quit`
        : `← → / ↑ ↓ move  enter edit path  ${shortcutText}  o sources  q quit`)
      : `← → / ↑ ↓ move  enter continue  ${shortcutText}  o sources  q quit`,
    PANEL_ACCENT,
    PANEL_BG,
    contentWidth,
  );
}

export function renderHelpOverlay(buffer: CellBuffer): void {
  const panel = drawPanel(buffer, buffer.width, buffer.height);
  const contentX = panel.x + 2;
  let row = panel.y + 1;
  const maxWidth = panel.width - 4;

  buffer.writeText(contentX, row++, truncate('Help', maxWidth), PANEL_TITLE, PANEL_BG);
  buffer.writeText(
    contentX,
    row++,
    truncate('One place for playback, one place for sources, one search for songs.', maxWidth),
    PANEL_DIM,
    PANEL_BG,
  );
  row += 1;

  row = renderHelpSection(buffer, contentX, row, maxWidth, 'Playback', [
    { key: 'space', action: 'pause or resume' },
    { key: 'n / b', action: 'next or previous track' },
    { key: 'm', action: 'mute all audio' },
    { key: 's', action: 'reshuffle the queue' },
    { key: 'o', action: 'open the sources manager' },
    { key: 'q', action: 'quit Musicli' },
  ]);
  row += 1;

  const navigationRows: HelpRow[] = [
    { key: 'up / down', action: 'move between track or ambience rows, or list items' },
    { key: 'left / right', action: 'adjust the selected track or ambience level' },
    { key: '+ / -', action: 'fine-tune the selected level' },
    { key: 'tab / shift-tab', action: 'cycle scenes forward or back' },
    { key: '1-7', action: 'jump to track or ambience rows 01-07' },
    { key: 'v', action: 'scene-cycle alias' },
    { key: '?', action: 'open or close this help card' },
  ];
  const fitsNavigation = maxWidth < 40
    ? sectionFitsCompact(panel, row, navigationRows)
    : sectionFits(panel, row, navigationRows);
  if (fitsNavigation) {
    row = renderHelpSection(buffer, contentX, row, maxWidth, 'Navigation', navigationRows);
    row += 1;
  }

  const sourceRows: HelpRow[] = [
    { key: 'o', action: 'open the source manager' },
    { key: 'type', action: 'filter sources live as you type' },
    { key: 'a', action: 'add a local folder (opens the folder picker when available)' },
    { key: 'u', action: 'add a stream URL' },
    { key: 'e / d', action: 'edit or delete the selected source' },
    { key: 'enter', action: 'open the selected source or switch playback' },
    { key: 'esc', action: 'clear filter, then close' },
  ];
  const fitsSources = maxWidth < 40 ? sectionFitsCompact(panel, row, sourceRows) : sectionFits(panel, row, sourceRows);
  if (fitsSources) {
    row = renderHelpSection(buffer, contentX, row, maxWidth, 'Sources', sourceRows);
    row += 1;
  }

  const searchRows: HelpRow[] = [
    { key: '/', action: 'open song search in the current source' },
    { key: 'type', action: 'filter songs live as you type' },
    { key: 'up / down or j / k', action: 'move through results' },
    { key: 'tab / shift-tab', action: 'change category scope' },
    { key: 'enter', action: 'play the selected result' },
    { key: 'esc', action: 'clear query, then close' },
  ];
  const fitsSearch = maxWidth < 40 ? sectionFitsCompact(panel, row, searchRows) : sectionFits(panel, row, searchRows);
  if (fitsSearch) {
    row = renderHelpSection(buffer, contentX, row, maxWidth, 'Search', searchRows);
  }

  row = panel.y + panel.height - 2;
  buffer.writeText(
    contentX,
    row,
    truncate('Press ? or esc to close', maxWidth),
    PANEL_ACCENT,
    PANEL_BG,
  );
}

export function renderSearchOverlay(buffer: CellBuffer, state: SearchOverlayState): void {
  const panel = drawPanel(buffer, buffer.width, buffer.height);
  const contentX = panel.x + 2;
  const maxWidth = panel.width - 4;
  let row = panel.y + 1;

  buffer.writeText(contentX, row++, truncate('Search Songs', maxWidth), PANEL_TITLE, PANEL_BG);
  buffer.writeText(
    contentX,
    row++,
    truncate(`${state.scope.label} • ${state.totalResults} result${state.totalResults === 1 ? '' : 's'}`, maxWidth),
    PANEL_DIM,
    PANEL_BG,
  );

  const inputText = state.query ? `/ ${state.query}` : '/ type a title or category';
  buffer.writeText(contentX, row++, truncate(inputText, maxWidth), state.query ? PANEL_SELECTED_TEXT : PANEL_DIM, PANEL_SELECTED_BG);
  row += 1;

  const availableRows = panel.y + panel.height - row - 2;
  const maxVisible = Math.max(0, availableRows);
  const windowStart = Math.max(
    0,
    Math.min(
      state.selectedIndex - Math.floor(maxVisible / 2),
      Math.max(0, state.results.length - maxVisible),
    ),
  );
  const visibleResults = state.results.slice(windowStart, windowStart + maxVisible);

  if (!visibleResults.length) {
    buffer.writeText(
      contentX,
      row++,
      truncate('No matches. Try a shorter query or change category scope with tab.', maxWidth),
      PANEL_DIM,
      PANEL_BG,
    );
  } else {
    visibleResults.forEach((track, index) => {
      const resultIndex = windowStart + index;
      const selected = resultIndex === state.selectedIndex;
      const bg = selected ? PANEL_SELECTED_BG : PANEL_BG;
      const fg = selected ? PANEL_SELECTED_TEXT : PANEL_TEXT;
      const prefix = selected ? '› ' : '  ';
      const line =
        maxWidth < 34
          ? truncate(`${prefix}${track.title}`, maxWidth)
          : truncate(`${prefix}${track.title} · ${track.categoryLabel}`, maxWidth);
      buffer.writeText(contentX, row + index, line.padEnd(maxWidth, ' '), fg, bg);
    });
    row += visibleResults.length;
  }

  row = panel.y + panel.height - 2;
  buffer.writeText(
    contentX,
    row,
    truncate(
      maxWidth < 34 ? 'enter play  tab scope  esc close' : 'enter play  tab scope  j/k move  esc clear/close',
      maxWidth,
    ),
    PANEL_ACCENT,
    PANEL_BG,
  );
}

export function renderSourcesOverlay(buffer: CellBuffer, state: SourcesOverlayState): void {
  const panel = drawPanel(buffer, buffer.width, buffer.height);
  const contentX = panel.x + 2;
  const maxWidth = panel.width - 4;
  let row = panel.y + 1;

  buffer.writeText(contentX, row++, truncate('Sources', maxWidth), PANEL_TITLE, PANEL_BG);
  buffer.writeText(
    contentX,
    row++,
    truncate(
      state.folderPickerSupported
        ? 'Switch between sources here. Local folders can be picked from the system dialog.'
        : 'Switch between local folders, saved streams, and recent streams from one place.',
      maxWidth,
    ),
    PANEL_DIM,
    PANEL_BG,
  );

  const queryText = state.query ? `/ ${state.query}` : '/ filter sources or use up/down';
  buffer.writeText(contentX, row++, truncate(queryText, maxWidth), state.query ? PANEL_SELECTED_TEXT : PANEL_DIM, PANEL_SELECTED_BG);
  row += 1;

  if (state.error) {
    buffer.writeText(contentX, row++, truncate(state.error, maxWidth), [255, 140, 140], PANEL_BG);
  }

  const selected = state.items[state.selectedIndex];
  const detailLines = detailLinesForItem(
    selected,
    Boolean(state.folderPickerSupported),
    state.activeKind,
    state.activeValue,
  );

  if (maxWidth >= 72) {
    const listWidth = Math.min(42, Math.max(28, Math.floor(maxWidth * 0.54)));
    const detailX = contentX + listWidth + 2;
    const detailWidth = maxWidth - listWidth - 2;
    const availableRows = panel.y + panel.height - row - 2;
    const maxVisible = Math.max(0, availableRows);
    const windowStart = Math.max(
      0,
      Math.min(
        state.selectedIndex - Math.floor(maxVisible / 2),
        Math.max(0, state.items.length - maxVisible),
      ),
    );
    const visibleItems = state.items.slice(windowStart, windowStart + maxVisible);

    visibleItems.forEach((item, index) => {
      const resultIndex = windowStart + index;
      const isSelected = resultIndex === state.selectedIndex;
      const isCurrent =
        item.kind === state.activeKind
        && item.value === state.activeValue;
      const bg = isSelected ? PANEL_SELECTED_BG : PANEL_BG;
      const fg =
        item.kind === 'action' ? PANEL_ACCENT
        : isSelected ? PANEL_SELECTED_TEXT
        : PANEL_TEXT;
      const prefix = isSelected ? '› ' : isCurrent ? '• ' : '  ';
      const kindLabel =
        item.kind === 'action' ? '+'
        : item.kind === 'folder' ? 'dir'
        : item.kind === 'stream' ? 'url'
        : 'rec';
      const line = `${prefix}${kindLabel.padEnd(3, ' ')} ${item.label}`;
      buffer.writeText(contentX, row + index, truncate(line, listWidth).padEnd(listWidth, ' '), fg, bg);
    });

    const dividerX = contentX + listWidth + 1;
    for (let dividerY = row; dividerY < panel.y + panel.height - 2; dividerY++) {
      buffer.set(dividerX, dividerY, '│', PANEL_BORDER, PANEL_BG);
    }

    buffer.writeText(detailX, row, truncate('Details', detailWidth), PANEL_ACCENT, PANEL_BG);
    let detailRow = row + 1;
    for (const line of detailLines) {
      if (detailRow >= panel.y + panel.height - 2) break;
      buffer.writeText(
        detailX,
        detailRow++,
        truncate(line, detailWidth),
        line === detailLines[0] ? PANEL_SELECTED_TEXT : PANEL_TEXT,
        PANEL_BG,
      );
    }
  } else {
    const availableRows = panel.y + panel.height - row - 6;
    const maxVisible = Math.max(0, availableRows);
    const windowStart = Math.max(
      0,
      Math.min(
        state.selectedIndex - Math.floor(maxVisible / 2),
        Math.max(0, state.items.length - maxVisible),
      ),
    );
    const visibleItems = state.items.slice(windowStart, windowStart + maxVisible);

    visibleItems.forEach((item, index) => {
      const resultIndex = windowStart + index;
      const isSelected = resultIndex === state.selectedIndex;
      const isCurrent =
        item.kind === state.activeKind
        && item.value === state.activeValue;
      const bg = isSelected ? PANEL_SELECTED_BG : PANEL_BG;
      const fg = isSelected ? PANEL_SELECTED_TEXT : item.kind === 'action' ? PANEL_ACCENT : PANEL_TEXT;
      const prefix = isSelected ? '› ' : isCurrent ? '• ' : '  ';
      buffer.writeText(contentX, row + index, truncate(`${prefix}${item.label}`, maxWidth).padEnd(maxWidth, ' '), fg, bg);
    });

    const detailRow = panel.y + panel.height - 5;
    buffer.writeText(contentX, detailRow, truncate(detailLines[0] ?? '', maxWidth), PANEL_ACCENT, PANEL_BG);
    buffer.writeText(contentX, detailRow + 1, truncate(detailLines[1] ?? '', maxWidth), PANEL_TEXT, PANEL_BG);
    buffer.writeText(contentX, detailRow + 2, truncate(detailLines[2] ?? '', maxWidth), PANEL_DIM, PANEL_BG);
  }

  row = panel.y + panel.height - 2;
  buffer.writeText(
    contentX,
    row,
    truncate(
      maxWidth < 42
        ? 'enter use  a add  e edit  d delete'
        : 'enter use  type filter  a local  u stream  e edit  d delete  esc close',
      maxWidth,
    ),
    PANEL_ACCENT,
    PANEL_BG,
  );
}

export function renderSourceEditorOverlay(buffer: CellBuffer, state: SourceEditorOverlayState): void {
  const panel = drawPanel(buffer, buffer.width, buffer.height);
  const contentX = panel.x + 2;
  const maxWidth = panel.width - 4;
  let row = panel.y + 1;

  buffer.writeText(
    contentX,
    row++,
    truncate(state.mode === 'add' ? 'Add Source' : 'Edit Source', maxWidth),
    PANEL_TITLE,
    PANEL_BG,
  );
  buffer.writeText(
    contentX,
    row++,
    truncate(
      state.type === 'local' && state.folderPickerSupported
        ? 'Browse for a folder with g, or paste a path manually.'
        : 'One editor for both local folders and stream URLs.',
      maxWidth,
    ),
    PANEL_DIM,
    PANEL_BG,
  );
  row += 1;

  const typeLabel = state.type === 'local' ? 'Local Folder' : 'Stream URL';
  const typeText = state.focusedField === 'type' ? `◀ ${typeLabel} ▶` : typeLabel;
  buffer.writeText(contentX, row, 'Type', state.focusedField === 'type' ? PANEL_SELECTED_TEXT : PANEL_DIM, PANEL_BG);
  buffer.writeText(
    contentX + 7,
    row++,
    truncate(typeText, Math.max(0, maxWidth - 7)).padEnd(Math.max(0, maxWidth - 7), ' '),
    state.focusedField === 'type' ? PANEL_SELECTED_TEXT : PANEL_TEXT,
    state.focusedField === 'type' ? PANEL_SELECTED_BG : PANEL_BG,
  );

  renderInputField(
    buffer,
    contentX,
    row++,
    maxWidth,
    'Name',
    state.label,
    state.type === 'local' ? 'optional name for this folder' : 'optional name for this stream',
    state.focusedField === 'label',
  );

  renderInputField(
    buffer,
    contentX,
    row++,
    maxWidth,
    state.type === 'local' ? 'Path' : 'URL',
    state.target,
    state.type === 'local' ? '/path/to/music' : 'https://...',
    state.focusedField === 'target',
  );

  row += 1;

  if (state.error) {
    buffer.writeText(contentX, row++, truncate(state.error, maxWidth), [255, 140, 140], PANEL_BG);
  } else {
    buffer.writeText(
      contentX,
      row++,
      truncate(
        state.type === 'local'
          ? (state.folderPickerSupported
            ? 'Press g to browse, or paste a path. Enter saves and starts playing.'
            : 'Save this folder as a source and switch playback to it.')
          : 'Save this stream as a source and switch playback to it.',
        maxWidth,
      ),
      PANEL_TEXT,
      PANEL_BG,
    );
  }

  row = panel.y + panel.height - 2;
  buffer.writeText(
    contentX,
    row,
    truncate(
      maxWidth < 46
        ? (state.type === 'local' && state.folderPickerSupported
          ? 'g browse  enter save  esc close'
          : 'enter save  up/down field  esc close')
        : state.type === 'local' && state.folderPickerSupported
          ? 'g browse  enter save  up/down field  left/right edit  backspace/delete  esc close'
          : 'enter save  up/down field  left/right edit  backspace/delete  esc close',
      maxWidth,
    ),
    PANEL_ACCENT,
    PANEL_BG,
  );
}
