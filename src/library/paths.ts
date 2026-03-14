import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { ASSET_ROOT } from '../runtime/paths.js';

export const MUSICLI_HOME = process.env.MUSICLI_HOME || join(homedir(), '.musicli');
export const LIBRARY_HOME = join(MUSICLI_HOME, 'library');
export const SAVED_CHANNELS_PATH = join(MUSICLI_HOME, 'channels.json');
export const SETTINGS_PATH = join(MUSICLI_HOME, 'settings.json');
export const INSTALLED_LIBRARY_CATALOG_PATH = join(LIBRARY_HOME, 'catalog.json');
export const INSTALLED_LIBRARY_STATE_PATH = join(LIBRARY_HOME, 'installed.json');

export const BUNDLED_LIBRARY_DIR = ASSET_ROOT;
export const BUNDLED_LIBRARY_CATALOG_PATH = join(BUNDLED_LIBRARY_DIR, 'tracks', 'catalog.json');

function resolveBundledLibrarySourcePath(): string | undefined {
  if (process.env.MUSICLI_LIBRARY_SOURCE) {
    return process.env.MUSICLI_LIBRARY_SOURCE;
  }

  const repositoryPath = join(BUNDLED_LIBRARY_DIR, 'library', 'repository.local.json');
  if (!existsSync(repositoryPath)) return undefined;

  try {
    const repository = JSON.parse(readFileSync(repositoryPath, 'utf8')) as { catalog?: string };
    if (!repository.catalog) return undefined;
    const catalogPath = isAbsolute(repository.catalog)
      ? repository.catalog
      : join(dirname(repositoryPath), repository.catalog);
    return existsSync(catalogPath) ? repositoryPath : undefined;
  } catch {
    return undefined;
  }
}

export const DEFAULT_LIBRARY_SOURCE_PATH = resolveBundledLibrarySourcePath();
