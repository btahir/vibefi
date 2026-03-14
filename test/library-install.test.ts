import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { installPack } from '../src/library/install.js';

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

test('installPack installs and reuses the starter pack from the local repository source', async () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'musicli-library-source-'));
  const targetRoot = mkdtempSync(join(tmpdir(), 'musicli-library-target-'));

  const trackBytes = Buffer.from('fake mp3 bytes');
  const trackHash = createHash('sha256').update(trackBytes).digest('hex');
  const trackFile = 'tracks/chillhop/demo-track.mp3';
  const repositorySource = join(fixtureRoot, 'repository.json');

  try {
    mkdirSync(join(fixtureRoot, 'tracks', 'chillhop'), { recursive: true });
    mkdirSync(join(fixtureRoot, 'manifests'), { recursive: true });
    writeFileSync(join(fixtureRoot, trackFile), trackBytes);
    writeFileSync(
      join(fixtureRoot, 'catalog.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        generatedAt: '2026-03-14T00:00:00.000Z',
        sourceDirectory: 'tracks',
        trackCount: 1,
        fileCount: 1,
        categories: [
          {
            slug: 'chillhop',
            label: 'Chillhop',
            description: 'Fixture category',
            trackCount: 1,
          },
        ],
        tracks: [
          {
            title: 'Demo Track',
            slug: 'demo-track',
            category: 'chillhop',
            categoryLabel: 'Chillhop',
            file: trackFile,
            sizeBytes: trackBytes.length,
            sha256: trackHash,
          },
        ],
      }, null, 2)}\n`,
    );
    writeFileSync(
      join(fixtureRoot, 'manifests', 'starter.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        pack: 'starter',
        title: 'Fixture Starter',
        version: '0.1.0',
        generatedAt: '2026-03-14T00:00:00.000Z',
        trackCount: 1,
        categories: [
          {
            slug: 'chillhop',
            label: 'Chillhop',
            description: 'Fixture category',
            trackCount: 1,
          },
        ],
        tracks: [
          {
            title: 'Demo Track',
            slug: 'demo-track',
            category: 'chillhop',
            categoryLabel: 'Chillhop',
            file: trackFile,
            sizeBytes: trackBytes.length,
            sha256: trackHash,
          },
        ],
      }, null, 2)}\n`,
    );
    writeFileSync(
      repositorySource,
      `${JSON.stringify({
        schemaVersion: 1,
        id: 'fixture-library',
        title: 'Fixture Library',
        version: '0.1.0',
        generatedAt: '2026-03-14T00:00:00.000Z',
        contentBase: '.',
        catalog: 'catalog.json',
        packs: {
          starter: {
            title: 'Fixture Starter',
            manifest: 'manifests/starter.json',
            trackCount: 1,
          },
        },
      }, null, 2)}\n`,
    );

    const firstInstall = await installPack({ pack: 'starter', source: repositorySource, targetRoot });
    const catalog = readJson(join(targetRoot, 'catalog.json'));
    const installed = readJson(join(targetRoot, 'installed.json'));

    assert.equal(firstInstall.total, 1);
    assert.equal(firstInstall.copied, 1);
    assert.equal(firstInstall.skipped, 0);
    assert.equal(catalog.trackCount, 1);
    assert.equal(installed.lastInstalledPack, 'starter');
    assert.ok(existsSync(join(targetRoot, trackFile)));

    const secondInstall = await installPack({ pack: 'starter', source: repositorySource, targetRoot });

    assert.equal(secondInstall.copied, 0);
    assert.equal(secondInstall.skipped, 1);
    assert.equal(secondInstall.trackCount, 1);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
    rmSync(targetRoot, { recursive: true, force: true });
  }
});
