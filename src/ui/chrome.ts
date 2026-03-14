import type { CellBuffer } from '../renderer/buffer.js';
import type { Layout } from '../renderer/layout.js';
import { MIXER_CHANNELS, type MixerState } from '../audio/mixer.js';
import type { RGB } from '../utils/color.js';

const DIM_GREY: RGB = [80, 80, 80];
const BAR_FILLED: RGB = [120, 180, 255];
const BAR_FILLED_SELECTED: RGB = [160, 220, 255];
const BAR_EMPTY: RGB = [40, 40, 50];
const LABEL_COLOR: RGB = [160, 160, 170];
const LABEL_SELECTED: RGB = [255, 255, 255];
const SELECTOR: RGB = [255, 200, 80];
const ACCENT_COLOR: RGB = [180, 140, 255];
const HINT_COLOR: RGB = [100, 100, 110];
const PAUSE_COLOR: RGB = [255, 200, 80];
const SECTION_COLOR: RGB = [118, 126, 142];
const SEPARATOR_CHAR = '\u2500';
const BAR_IDEAL_STEPS = 20;
const BAR_MIN_STEPS = 8;

export interface ChromeState {
  mixer: MixerState;
  track: string;
  category: string;
  sourceLabel: string;
  sourceKind: 'idle' | 'folder' | 'stream';
  queuePosition: number | null;
  queueTotal: number | null;
  queueMode: 'curated' | 'reshuffled' | 'stream' | 'idle';
  paused: boolean;
  muted: boolean;
  selectedChannel: number;
  canSeek: boolean;
  positionSeconds: number | null;
  durationSeconds: number | null;
}

function displayTrackName(track: string): string {
  if (track.includes('://')) return track;
  const normalized = track.replace(/\\/g, '/');
  return normalized.slice(normalized.lastIndexOf('/') + 1).replace(/\.mp3$/, '');
}

function formatClock(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds)) return null;

  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatProgress(state: ChromeState): string | null {
  const position = formatClock(state.positionSeconds);
  const duration = formatClock(state.durationSeconds);

  if (!position && !duration) return null;
  if (position && duration) return `${position}/${duration}`;
  return position ?? duration;
}

function renderSeparator(buffer: CellBuffer, y: number, width: number): void {
  for (let x = 0; x < width; x++) {
    buffer.set(x, y, SEPARATOR_CHAR, DIM_GREY);
  }
}

function computeBarMetrics(termWidth: number) {
  const labelWidth = termWidth >= 88 ? 10 : termWidth >= 68 ? 9 : termWidth >= 56 ? 8 : termWidth >= 48 ? 6 : 5;
  const valueWidth = 4;
  const overhead = 1 + 1 + 2 + 1 + labelWidth + 1 + 1 + 1 + 1 + valueWidth;
  const available = Math.max(0, termWidth - overhead);
  const barWidth = available >= BAR_MIN_STEPS ? Math.min(BAR_IDEAL_STEPS, available) : 0;
  return { labelWidth, valueWidth, barWidth };
}

function renderBar(
  buffer: CellBuffer, x: number, y: number,
  label: string, value: number, termWidth: number,
  selected: boolean, laneNumber: number,
): void {
  const { labelWidth, barWidth } = computeBarMetrics(termWidth);
  const fillColor = selected ? BAR_FILLED_SELECTED : BAR_FILLED;
  const laneStr = String(laneNumber).padStart(2, '0');
  const valueStr = value.toFixed(2);

  buffer.set(x, y, selected ? '\u25B8' : ' ', selected ? SELECTOR : DIM_GREY);
  buffer.writeText(x + 2, y, laneStr, selected ? SELECTOR : DIM_GREY);

  const padLabel = label.padEnd(labelWidth, ' ').slice(0, labelWidth);
  const labelStart = x + 5;
  buffer.writeText(labelStart, y, padLabel, selected ? LABEL_SELECTED : LABEL_COLOR);

  if (barWidth > 0) {
    const barStart = labelStart + labelWidth + 1;
    buffer.set(barStart, y, '\u2595', DIM_GREY);
    const filled = Math.round(value * barWidth);
    for (let i = 0; i < barWidth; i++) {
      const bx = barStart + 1 + i;
      if (bx >= termWidth) return;
      buffer.set(bx, y, i < filled ? '\u2588' : '\u2591', i < filled ? fillColor : BAR_EMPTY);
    }
    const barEnd = barStart + 1 + barWidth;
    if (barEnd < termWidth) buffer.set(barEnd, y, '\u258F', DIM_GREY);

    const valueStart = barEnd + 2;
    if (valueStart + valueStr.length <= termWidth) {
      buffer.writeText(valueStart, y, valueStr, selected ? LABEL_SELECTED : LABEL_COLOR);
    }
    return;
  }

  const compactValueStart = labelStart + labelWidth + 1;
  if (compactValueStart + valueStr.length <= termWidth) {
    buffer.writeText(compactValueStart, y, valueStr, selected ? LABEL_SELECTED : LABEL_COLOR);
  }
}

function renderSectionLabel(buffer: CellBuffer, y: number, width: number, label: string): void {
  const text = `  ${label.toUpperCase()}`;
  buffer.writeText(0, y, text.slice(0, width), SECTION_COLOR);
}

function pickVisibleChannels(
  maxRows: number,
  selectedChannel: number,
  mixer: MixerState,
): number[] {
  if (maxRows >= MIXER_CHANNELS.length) {
    // Enough room — show all
    return MIXER_CHANNELS.map((_, i) => i);
  }

  // Always include the selected channel, then fill with active (non-zero) ones,
  // then pad with remaining channels in order
  const visible = new Set<number>();
  visible.add(selectedChannel);

  // Add active (non-zero) channels
  for (let i = 0; i < MIXER_CHANNELS.length && visible.size < maxRows; i++) {
    if (mixer[MIXER_CHANNELS[i].key] > 0) visible.add(i);
  }

  // Fill remaining slots in order
  for (let i = 0; i < MIXER_CHANNELS.length && visible.size < maxRows; i++) {
    visible.add(i);
  }

  return [...visible].sort((a, b) => a - b);
}

export function renderChrome(buffer: CellBuffer, layout: Layout, state: ChromeState): void {
  const w = buffer.width;

  if (state.sourceKind === 'idle') {
    renderSeparator(buffer, layout.separator3, w);

    let hints: string;
    if (w >= 88) {
      hints = '  [↑↓] choose  [enter] continue  [1/2] quick pick  [o] sources  [q] quit';
    } else if (w >= 60) {
      hints = '  ↑↓ choose  enter continue  1/2 pick  o sources  q quit';
    } else if (w >= 38) {
      hints = '  ↑↓ enter 1/2 o q';
    } else {
      hints = '  enter 1/2 o q';
    }
    buffer.writeText(layout.hints.x, layout.hints.y, hints.slice(0, w), HINT_COLOR);
    return;
  }

  // Separators
  renderSeparator(buffer, layout.separator1, w);
  renderSeparator(buffer, layout.separator2, w);
  renderSeparator(buffer, layout.separator3, w);

  // Now playing — truncate gracefully
  const trackName = displayTrackName(state.track);
  const queueText =
    state.queuePosition !== null && state.queueTotal !== null
      ? `${state.queuePosition}/${state.queueTotal}`
      : state.queueMode;
  const sourceText = `${state.sourceKind}: ${state.sourceLabel}`;
  const progressText = formatProgress(state);
  const metaWide = `${sourceText} · ${state.category} · ${queueText}`;
  const metaWideWithProgress = progressText ? `${metaWide} · ${progressText}` : metaWide;
  const metaMedium = `${sourceText} · ${queueText}`;
  const metaMediumWithProgress = progressText ? `${metaMedium} · ${progressText}` : metaMedium;
  let nowPlaying: string;
  if (w >= 70) {
    nowPlaying = `  \u266B  ${trackName} \u00B7 ${metaWideWithProgress}`;
  } else if (w >= 48) {
    nowPlaying = `  \u266B ${trackName} \u00B7 ${metaMediumWithProgress}`;
  } else if (w >= 30) {
    nowPlaying = progressText
      ? `  \u266B ${trackName} \u00B7 ${progressText}`
      : `  \u266B ${trackName} \u00B7 ${queueText}`;
  } else {
    nowPlaying = `  \u266B ${trackName}`;
  }
  buffer.writeText(layout.nowPlaying.x, layout.nowPlaying.y, nowPlaying.slice(0, w), ACCENT_COLOR);

  // Volume bars — pick which channels to show based on available rows
  const visibleIdxs = pickVisibleChannels(layout.volumeBars.height, state.selectedChannel, state.mixer);
  let barRow = layout.volumeBars.y;
  const trackIdxs = visibleIdxs.filter((index) => index === 0);
  const ambienceIdxs = visibleIdxs.filter((index) => index !== 0);
  const canGroupMixer = trackIdxs.length > 0
    && ambienceIdxs.length > 0
    && layout.volumeBars.height >= visibleIdxs.length + 2;

  if (canGroupMixer) {
    renderSectionLabel(buffer, barRow++, w, 'Track');
    const trackIndex = trackIdxs[0]!;
    const trackChannel = MIXER_CHANNELS[trackIndex];
    renderBar(
      buffer,
      0,
      barRow++,
      trackChannel.label,
      state.mixer[trackChannel.key],
      w,
      trackIndex === state.selectedChannel,
      trackIndex + 1,
    );

    renderSectionLabel(buffer, barRow++, w, 'Ambience');
    for (const index of ambienceIdxs) {
      if (barRow >= layout.volumeBars.y + layout.volumeBars.height) break;
      const channel = MIXER_CHANNELS[index];
      renderBar(
        buffer,
        0,
        barRow++,
        channel.label,
        state.mixer[channel.key],
        w,
        index === state.selectedChannel,
        index + 1,
      );
    }
  } else {
    for (const i of visibleIdxs) {
      if (barRow >= layout.volumeBars.y + layout.volumeBars.height) break;
      const ch = MIXER_CHANNELS[i];
      const selected = i === state.selectedChannel;
      renderBar(buffer, 0, barRow++, ch.label, state.mixer[ch.key], w, selected, i + 1);
    }
  }

  // Hints — tiered by width
  let hints: string;
  if (w >= 110) {
    hints = state.canSeek
      ? '  [/] search  [o] sources  [space] pause  [n/b] skip  [[]] seek  [s] shuffle  [m] mute  [↑↓] lane  [←→] mix  [tab] scene  [q] quit'
      : '  [/] search  [o] sources  [space] pause  [n/b] skip  [s] shuffle  [m] mute  [↑↓] lane  [←→] mix  [tab] scene  [q] quit';
  } else if (w >= 88) {
    hints = state.canSeek
      ? '  [/] search  [o] sources  [space] pause  [n/b] skip  [[]] seek  [s] shuffle  [m] mute  [q] quit'
      : '  [/] search  [o] sources  [space] pause  [n/b] skip  [s] shuffle  [m] mute  [tab] scene  [q] quit';
  } else if (w >= 70) {
    hints = '  /:search o:sources sp:pause n/b:skip s:shuffle m:mute q:quit';
  } else if (w >= 50) {
    hints = '  / search  o sources  sp pause  n/b skip  s shuf';
  } else if (w >= 35) {
    hints = '  / o sp n/b s q';
  } else {
    hints = '  / ? sp n/b q';
  }
  buffer.writeText(layout.hints.x, layout.hints.y, hints.slice(0, w), HINT_COLOR);

  // Paused overlay
  if (state.paused) {
    const pauseText = '\u23F8 PAUSED';
    const px = Math.max(0, Math.floor((layout.scene.width - pauseText.length) / 2));
    const py = layout.scene.y + Math.floor(layout.scene.height / 2);
    buffer.writeText(px, py, pauseText, PAUSE_COLOR);
  }

  // Muted indicator
  if (state.muted) {
    const muteText = '[MUTED]';
    const mx = Math.max(0, w - muteText.length - 2);
    buffer.writeText(mx, layout.nowPlaying.y, muteText, [255, 100, 100]);
  }
}
