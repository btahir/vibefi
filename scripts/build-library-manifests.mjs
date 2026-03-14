import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const TRACK_CATALOG_PATH = join(ROOT, 'tracks', 'catalog.json');
const PACKAGE_JSON_PATH = join(ROOT, 'package.json');
const LIBRARY_DIR = join(ROOT, 'library');
const PACKS_DIR = join(LIBRARY_DIR, 'packs');
const MANIFESTS_DIR = join(LIBRARY_DIR, 'manifests');
const REPOSITORY_LOCAL_PATH = join(LIBRARY_DIR, 'repository.local.json');
const STARTER_SELECTION_PATH = join(PACKS_DIR, 'starter.selection.json');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function buildCategories(catalog, tracks) {
  const counts = new Map();

  for (const track of tracks) {
    counts.set(track.category, (counts.get(track.category) || 0) + 1);
  }

  return catalog.categories
    .map((category) => ({
      ...category,
      trackCount: counts.get(category.slug) || 0,
    }))
    .filter((category) => category.trackCount > 0);
}

function buildPackManifest({ name, title, description, version, generatedAt, catalog, tracks }) {
  return {
    schemaVersion: 1,
    pack: name,
    title,
    version,
    generatedAt,
    description,
    trackCount: tracks.length,
    categories: buildCategories(catalog, tracks),
    tracks,
  };
}

const catalog = readJson(TRACK_CATALOG_PATH);
const pkg = readJson(PACKAGE_JSON_PATH);
const starterSelection = readJson(STARTER_SELECTION_PATH);
const generatedAt = new Date().toISOString();
const version = pkg.version;
const trackBySlug = new Map(catalog.tracks.map((track) => [track.slug, track]));

const starterTracks = starterSelection.tracks.map((slug) => {
  const track = trackBySlug.get(slug);

  if (!track) {
    throw new Error(`Starter selection references missing track slug: ${slug}`);
  }

  return track;
});

if (new Set(starterSelection.tracks).size !== starterSelection.tracks.length) {
  throw new Error('Starter selection contains duplicate track slugs.');
}

const starterCategories = new Set(starterTracks.map((track) => track.category));
if (starterCategories.size !== starterTracks.length) {
  throw new Error('Starter selection must contain at most one track per category.');
}

const fullManifest = buildPackManifest({
  name: 'full',
  title: 'Musicli Full Library',
  description: 'The complete curated Musicli library.',
  version,
  generatedAt,
  catalog,
  tracks: catalog.tracks,
});

const starterManifest = buildPackManifest({
  name: starterSelection.name,
  title: starterSelection.title,
  description: starterSelection.description,
  version,
  generatedAt,
  catalog,
  tracks: starterTracks,
});

const repositoryLocal = {
  schemaVersion: 1,
  id: 'musicli-local-library',
  title: 'Musicli Local Library Source',
  version,
  generatedAt,
  contentBase: '..',
  catalog: '../tracks/catalog.json',
  packs: {
    starter: {
      title: starterManifest.title,
      description: starterManifest.description,
      manifest: 'manifests/starter.json',
      trackCount: starterManifest.trackCount,
    },
    full: {
      title: fullManifest.title,
      description: fullManifest.description,
      manifest: 'manifests/full.json',
      trackCount: fullManifest.trackCount,
    },
  },
};

mkdirSync(MANIFESTS_DIR, { recursive: true });

writeJson(join(MANIFESTS_DIR, 'starter.json'), starterManifest);
writeJson(join(MANIFESTS_DIR, 'full.json'), fullManifest);
writeJson(REPOSITORY_LOCAL_PATH, repositoryLocal);

console.log(`Wrote ${join(MANIFESTS_DIR, 'starter.json')}`);
console.log(`Wrote ${join(MANIFESTS_DIR, 'full.json')}`);
console.log(`Wrote ${REPOSITORY_LOCAL_PATH}`);
