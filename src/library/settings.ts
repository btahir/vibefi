import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_TRACK_VOLUME } from '../audio/mixer.js';
import { SETTINGS_PATH } from './paths.js';

export type LastSourceSetting =
  | {
      kind: 'local';
      path: string;
      label?: string;
    }
  | {
      kind: 'stream';
      input: string;
      label?: string;
    };

interface MusicliSettings {
  schemaVersion: 2;
  updatedAt: string;
  trackVolume?: number;
  lastSource?: LastSourceSetting;
}

function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = `${path}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tempPath, path);
}

function loadSettings(settingsPath = SETTINGS_PATH): Partial<MusicliSettings> {
  if (!existsSync(settingsPath)) return {};

  try {
    return JSON.parse(readFileSync(settingsPath, 'utf8')) as Partial<MusicliSettings>;
  } catch {
    return {};
  }
}

function normalizeLastSource(value: unknown): LastSourceSetting | null {
  if (!value || typeof value !== 'object') return null;

  const kind = 'kind' in value ? value.kind : undefined;
  const label =
    'label' in value && typeof value.label === 'string' && value.label.trim()
      ? value.label.trim()
      : undefined;

  if (kind === 'local' && 'path' in value && typeof value.path === 'string' && value.path.trim()) {
    return {
      kind: 'local',
      path: value.path.trim(),
      label,
    };
  }

  if (kind === 'stream' && 'input' in value && typeof value.input === 'string' && value.input.trim()) {
    return {
      kind: 'stream',
      input: value.input.trim(),
      label,
    };
  }

  return null;
}

function saveSettings(
  patch: {
    trackVolume?: number;
    lastSource?: LastSourceSetting | null;
  },
  settingsPath = SETTINGS_PATH,
): void {
  const current = loadSettings(settingsPath);
  const next: MusicliSettings = {
    schemaVersion: 2,
    updatedAt: new Date().toISOString(),
  };

  const trackVolume =
    patch.trackVolume !== undefined
      ? normalizeTrackVolume(patch.trackVolume)
      : (current.trackVolume !== undefined ? normalizeTrackVolume(current.trackVolume) : undefined);
  if (trackVolume !== undefined) {
    next.trackVolume = trackVolume;
  }

  const lastSource =
    patch.lastSource !== undefined
      ? patch.lastSource
      : normalizeLastSource(current.lastSource);
  if (lastSource) {
    next.lastSource = lastSource;
  }

  writeJsonAtomic(settingsPath, next);
}

export function normalizeTrackVolume(value: unknown, fallback = DEFAULT_TRACK_VOLUME): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

export function loadTrackVolume(settingsPath = SETTINGS_PATH): number | null {
  const parsed = loadSettings(settingsPath);
  if (parsed.trackVolume === undefined) return null;
  return normalizeTrackVolume(parsed.trackVolume);
}

export function saveTrackVolume(volume: number, settingsPath = SETTINGS_PATH): void {
  saveSettings({ trackVolume: volume }, settingsPath);
}

export function loadLastSource(settingsPath = SETTINGS_PATH): LastSourceSetting | null {
  const parsed = loadSettings(settingsPath);
  return normalizeLastSource(parsed.lastSource);
}

export function saveLastSource(source: LastSourceSetting, settingsPath = SETTINGS_PATH): void {
  saveSettings({ lastSource: source }, settingsPath);
}
