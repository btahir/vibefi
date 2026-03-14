import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_TRACK_VOLUME } from '../audio/mixer.js';
import { SETTINGS_PATH } from './paths.js';

interface MusicliSettings {
  schemaVersion: 1;
  updatedAt: string;
  trackVolume?: number;
}

function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = `${path}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tempPath, path);
}

export function normalizeTrackVolume(value: unknown, fallback = DEFAULT_TRACK_VOLUME): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

export function loadTrackVolume(settingsPath = SETTINGS_PATH): number | null {
  if (!existsSync(settingsPath)) return null;

  try {
    const parsed = JSON.parse(readFileSync(settingsPath, 'utf8')) as Partial<MusicliSettings>;
    if (parsed.trackVolume === undefined) return null;
    return normalizeTrackVolume(parsed.trackVolume);
  } catch {
    return null;
  }
}

export function saveTrackVolume(volume: number, settingsPath = SETTINGS_PATH): void {
  writeJsonAtomic(settingsPath, {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    trackVolume: normalizeTrackVolume(volume),
  } satisfies MusicliSettings);
}
