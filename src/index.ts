import { Command, InvalidOptionArgumentError, Option } from 'commander';
import { checkFfmpeg, checkInteractiveTerminal } from './utils/check-deps.js';
import { showSplash } from './ui/splash.js';
import { startApp } from './app.js';
import { PRESETS } from './presets.js';
import { listSceneNames, type SceneRendererMode } from './scenes/catalog.js';
import {
  loadActiveTrackCatalog,
  loadBundledTrackCatalog,
  loadInstalledLibraryState,
  loadInstalledTrackCatalog,
} from './library/catalog.js';
import { installPack, loadLibraryRepositoryManifest } from './library/install.js';
import { DEFAULT_LIBRARY_SOURCE_PATH, LIBRARY_HOME } from './library/paths.js';

function parseVolume(value: string): number {
  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new InvalidOptionArgumentError('must be a number between 0.0 and 1.0');
  }

  return Math.round(parsed * 100) / 100;
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function runCommand(action: () => Promise<void> | void): Promise<void> {
  try {
    await action();
  } catch (error) {
    process.stderr.write(`\n  ${formatErrorMessage(error).replace(/\n/g, '\n  ')}\n\n`);
    process.exit(1);
  }
}

function printLibraryStatus(): void {
  const active = loadActiveTrackCatalog();
  const bundled = loadBundledTrackCatalog();
  const installed = loadInstalledTrackCatalog();
  const installedState = loadInstalledLibraryState();
  const categoryList = active.categories.map((category) => category.slug).join(', ') || 'none';

  const lines = [
    `library path: ${LIBRARY_HOME}`,
    `active library: ${active.source}`,
    `active tracks: ${active.trackCount}`,
    `categories: ${categoryList}`,
  ];

  if (installed && installedState) {
    lines.push(`installed source: ${installedState.repositoryTitle} (${installedState.repositoryVersion})`);
    lines.push(`last installed pack: ${installedState.lastInstalledPack}`);
    lines.push(`installed tracks: ${installed.trackCount}`);
  } else {
    lines.push('installed source: none');
    lines.push(
      bundled.trackCount > 0
        ? `bundled fallback tracks: ${bundled.trackCount}`
        : 'bundled fallback tracks: none in this build',
    );
  }

  process.stdout.write(`${lines.join('\n')}\n`);
}

const presetNames = Object.keys(PRESETS);
const sceneNames = listSceneNames();
const sceneRendererModes: SceneRendererMode[] = ['auto', 'builtin', 'chafa'];
const program = new Command();

function createLibrarySourceOption(): Option {
  const option = new Option(
    '--source <ref>',
    DEFAULT_LIBRARY_SOURCE_PATH
      ? 'repository manifest path or URL'
      : 'repository manifest path or URL (required unless MUSICLI_LIBRARY_SOURCE is set)',
  );

  if (DEFAULT_LIBRARY_SOURCE_PATH) {
    option.default(DEFAULT_LIBRARY_SOURCE_PATH);
  }

  return option;
}

program
  .name('musicli')
  .description('your focus room in the terminal')
  .showHelpAfterError()
  .version('0.1.0');

const libraryCommand = program.command('library').description('manage installable track libraries');

libraryCommand
  .command('path')
  .description('print the local library path')
  .action(() => {
    process.stdout.write(`${LIBRARY_HOME}\n`);
  });

libraryCommand
  .command('status')
  .description('show the active and installed library state')
  .action(() => {
    printLibraryStatus();
  });

libraryCommand
  .command('packs')
  .description('list packs available from a local or remote library source')
  .addOption(createLibrarySourceOption())
  .action((opts) =>
    runCommand(async () => {
      const repository = await loadLibraryRepositoryManifest(opts.source);
      const lines = [
        `${repository.manifest.title} (${repository.manifest.version})`,
        `source: ${repository.source}`,
      ];

      for (const [packName, pack] of Object.entries(repository.manifest.packs)) {
        const count = pack.trackCount ? ` (${pack.trackCount} tracks)` : '';
        const description = pack.description ? ` — ${pack.description}` : '';
        lines.push(`${packName}${count}: ${pack.title}${description}`);
      }

      process.stdout.write(`${lines.join('\n')}\n`);
    }),
  );

libraryCommand
  .command('install')
  .description('install a pack into the local musicli library')
  .argument('[pack]', 'pack to install', 'starter')
  .addOption(createLibrarySourceOption())
  .option('--force', 'overwrite files even when checksums match')
  .action((pack, opts) =>
    runCommand(async () => {
      const result = await installPack({
        pack,
        source: opts.source,
        force: Boolean(opts.force),
      });

      process.stdout.write(
        [
          `installed pack: ${result.pack}`,
          `library path: ${result.libraryRoot}`,
          `source: ${result.repositoryTitle} (${result.repositoryVersion})`,
          `copied: ${result.copied}`,
          `skipped: ${result.skipped}`,
          `active tracks: ${result.trackCount}`,
        ].join('\n') + '\n',
      );
    }),
  );

program
  .addOption(
    new Option('--preset <name>', `preset (${presetNames.join(', ')})`)
      .choices(presetNames)
      .default('study'),
  )
  .option('--rain <vol>', 'rain ambient volume (0.0-1.0)', parseVolume)
  .option('--cafe <vol>', 'cafe ambient volume (0.0-1.0)', parseVolume)
  .option('--fire <vol>', 'fire ambient volume (0.0-1.0)', parseVolume)
  .option('--thunder <vol>', 'thunder ambient volume (0.0-1.0)', parseVolume)
  .option('--forest <vol>', 'forest ambient volume (0.0-1.0)', parseVolume)
  .option('--city <vol>', 'city ambient volume (0.0-1.0)', parseVolume)
  .addOption(
    sceneNames.length
      ? new Option('--scene <name>', `scene (${sceneNames.join(', ')})`).choices(sceneNames)
      : new Option('--scene <name>', 'visual scene name'),
  )
  .addOption(
    new Option('--scene-renderer <mode>', `scene renderer (${sceneRendererModes.join(', ')})`)
      .choices(sceneRendererModes)
      .default('auto'),
  )
  .option('--url <url>', 'stream from URL (HTTP, Icecast, HLS, YouTube)')
  .option('--folder <path>', 'play tracks from a local folder for this session')
  .option('--home', 'open the source chooser on launch')
  .action((opts) =>
    runCommand(async () => {
      checkInteractiveTerminal();
      checkFfmpeg();
      await showSplash();
      await startApp(opts);
    }),
  );

await program.parseAsync();
