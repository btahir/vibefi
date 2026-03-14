import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const DIST_DIR = join(ROOT, 'dist', 'library-source');
const TRACKS_DIR = join(ROOT, 'tracks');
const CATALOG_PATH = join(TRACKS_DIR, 'catalog.json');
const LIBRARY_DIR = join(ROOT, 'library');
const MANIFESTS_DIR = join(LIBRARY_DIR, 'manifests');
const PACKAGE_JSON_PATH = join(ROOT, 'package.json');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

const catalog = readJson(CATALOG_PATH);
const pkg = readJson(PACKAGE_JSON_PATH);
const starterManifest = readJson(join(MANIFESTS_DIR, 'starter.json'));
const fullManifest = readJson(join(MANIFESTS_DIR, 'full.json'));
const generatedAt = new Date().toISOString();

rmSync(DIST_DIR, { recursive: true, force: true });
mkdirSync(join(DIST_DIR, 'packs'), { recursive: true });
mkdirSync(join(DIST_DIR, 'tracks'), { recursive: true });

for (const category of catalog.categories) {
  cpSync(join(TRACKS_DIR, category.slug), join(DIST_DIR, 'tracks', category.slug), { recursive: true });
}

writeJson(join(DIST_DIR, 'catalog.json'), catalog);
writeJson(join(DIST_DIR, 'packs', 'starter.json'), starterManifest);
writeJson(join(DIST_DIR, 'packs', 'full.json'), fullManifest);
writeJson(join(DIST_DIR, 'repository.json'), {
  schemaVersion: 1,
  id: 'musicli-library',
  title: 'Musicli Library',
  version: pkg.version,
  generatedAt,
  contentBase: '.',
  catalog: 'catalog.json',
  packs: {
    starter: {
      title: starterManifest.title,
      description: starterManifest.description,
      manifest: 'packs/starter.json',
      trackCount: starterManifest.trackCount,
    },
    full: {
      title: fullManifest.title,
      description: fullManifest.description,
      manifest: 'packs/full.json',
      trackCount: fullManifest.trackCount,
    },
  },
});

writeFileSync(
  join(DIST_DIR, 'README.md'),
  `# Musicli Library\n\n` +
    `This staged folder is ready to publish as the standalone Musicli music library source.\n\n` +
    `- \`repository.json\` is the install entrypoint.\n` +
    `- \`catalog.json\` describes the full track catalog.\n` +
    `- \`packs/starter.json\` and \`packs/full.json\` are the installable pack manifests.\n` +
    `- \`tracks/\` contains the audio files grouped by category.\n`,
);

console.log(`Staged library source at ${DIST_DIR}`);
