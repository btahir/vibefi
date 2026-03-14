import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename } from 'node:path';
import { AudioEngine } from './audio/engine.js';
import {
  adjustVolume,
  defaultMixerState,
  MIXER_CHANNELS,
  type AmbientKey,
  type MixerState,
} from './audio/mixer.js';
import { isYouTubeUrl, getYouTubeStreamUrl } from './audio/youtube.js';
import {
  findLocalFolder,
  findSavedChannel,
  loadChannelStore,
  parseSavedChannelInput,
  saveChannelStore,
  upsertLocalFolder,
  upsertRecentStream,
  upsertSavedChannel,
  type LocalFolderSource,
  type SavedChannel,
} from './library/channels.js';
import { loadLocalFolderCatalog } from './library/local-folder.js';
import { SAVED_CHANNELS_PATH } from './library/paths.js';
import { buildTrackSearchScopes, searchTracks } from './library/search.js';
import { loadTrackVolume, saveTrackVolume } from './library/settings.js';
import type { RuntimeLibraryCatalog, RuntimeTrack } from './library/types.js';
import { onAnyKey, onKey, startInput } from './input.js';
import { PRESETS } from './presets.js';
import { CellBuffer } from './renderer/buffer.js';
import { diffBuffers } from './renderer/diff.js';
import { computeLayout } from './renderer/layout.js';
import { cols, enterTerminal, exitTerminal, rows } from './renderer/terminal.js';
import { loadScenes, type SceneRendererMode } from './scenes/catalog.js';
import { pickDirectory, supportsFolderPicker } from './system/folder-picker.js';
import type { Scene } from './scenes/types.js';
import { renderChrome, type ChromeState } from './ui/chrome.js';
import {
  renderHelpOverlay,
  renderSearchOverlay,
  renderSourceEditorOverlay,
  renderWelcomeOverlay,
  renderSourcesOverlay,
  type SourceEditorOverlayState,
  type SourceListItem,
  type WelcomeOverlayState,
} from './ui/overlay.js';
import {
  backspaceLineEditor,
  clearLineEditorToEnd,
  clearLineEditorToStart,
  createLineEditor,
  deleteLineEditorForward,
  insertLineEditorText,
  moveLineEditorEnd,
  moveLineEditorHome,
  moveLineEditorLeft,
  moveLineEditorRight,
  setLineEditorValue,
  type LineEditorState,
} from './ui/line-editor.js';

export interface AppOptions {
  preset?: string;
  rain?: number;
  cafe?: number;
  fire?: number;
  thunder?: number;
  forest?: number;
  city?: number;
  scene?: string;
  sceneRenderer?: SceneRendererMode;
  url?: string;
  folder?: string;
  home?: boolean;
}

const VOLUME_STEP = 0.05;

type SourceEditorField = 'type' | 'label' | 'target';
type SourceEditorKind = 'local' | 'stream';
type Overlay = 'none' | 'help' | 'search' | 'welcome' | 'sources' | 'sourceEditor';

interface ResolvedStreamInput {
  resolvedUrl: string;
  inputValue: string;
  displayLabel: string;
  channelSlug?: string;
  savedChannels?: SavedChannel[];
}

type SourceChoice =
  | {
      kind: 'action';
      label: string;
      detail: string;
      action: 'add-local' | 'add-stream';
      value: string;
      editable?: false;
      deletable?: false;
      active?: false;
    }
  | {
      kind: 'folder';
      label: string;
      detail: string;
      target: string;
      slug: string;
      value: string;
      editable: true;
      deletable: true;
      active?: boolean;
    }
  | {
      kind: 'stream';
      label: string;
      detail: string;
      target: string;
      slug: string;
      value: string;
      editable: true;
      deletable: true;
      active?: boolean;
    }
  | {
      kind: 'recent';
      label: string;
      detail: string;
      target: string;
      input: string;
      value: string;
      editable: true;
      deletable: true;
      active?: boolean;
    };

function createEmptyCatalog(): RuntimeLibraryCatalog {
  return {
    schemaVersion: 1,
    generatedAt: new Date(0).toISOString(),
    sourceDirectory: '',
    trackCount: 0,
    fileCount: 0,
    categories: [],
    tracks: [],
    source: 'local',
    rootDir: '',
  };
}

function isPrintableKey(key: string): boolean {
  return key.length === 1 && key >= ' ' && key !== '\x7f';
}

function formatChoices(label: string, choices: string[]): string {
  return `${label}: ${choices.join(', ')}`;
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function resolveStreamUrl(url: string): string {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error('Use a full http:// or https:// URL.');
  }

  return isYouTubeUrl(trimmed) ? getYouTubeStreamUrl(trimmed) : trimmed;
}

function resolveStreamInput(input: string, savedChannels: SavedChannel[]): ResolvedStreamInput {
  const value = input.trim();
  if (!value) {
    throw new Error('Paste a stream URL first.');
  }

  const savedChannel = findSavedChannel(savedChannels, value);
  if (savedChannel) {
    return {
      resolvedUrl: resolveStreamUrl(savedChannel.url),
      inputValue: savedChannel.slug,
      displayLabel: savedChannel.label,
      channelSlug: savedChannel.slug,
    };
  }

  const savedInput = parseSavedChannelInput(value);
  if (savedInput) {
    const resolvedUrl = resolveStreamUrl(savedInput.url);
    const saved = upsertSavedChannel(savedChannels, savedInput.label, savedInput.url);

    return {
      resolvedUrl,
      inputValue: saved.channel.slug,
      displayLabel: saved.channel.label,
      channelSlug: saved.channel.slug,
      savedChannels: saved.channels,
    };
  }

  return {
    resolvedUrl: resolveStreamUrl(value),
    inputValue: value,
    displayLabel: value,
  };
}

export async function startApp(opts: AppOptions): Promise<void> {
  if (opts.url && opts.folder) {
    throw new Error('Choose either --url or --folder for startup, not both.');
  }

  const presetName = opts.preset || 'study';
  const preset = PRESETS[presetName];
  if (!preset) {
    throw new Error(`Unknown preset "${presetName}". ${formatChoices('Available presets', Object.keys(PRESETS))}`);
  }

  const mixer: MixerState = defaultMixerState();
  const persistedTrackVolume = loadTrackVolume();
  if (persistedTrackVolume !== null) {
    mixer.music = persistedTrackVolume;
  }
  for (const [key, value] of Object.entries(preset.ambience)) {
    mixer[key as AmbientKey] = value;
  }
  if (opts.rain !== undefined) mixer.rain = opts.rain;
  if (opts.cafe !== undefined) mixer.cafe = opts.cafe;
  if (opts.fire !== undefined) mixer.fire = opts.fire;
  if (opts.thunder !== undefined) mixer.thunder = opts.thunder;
  if (opts.forest !== undefined) mixer.forest = opts.forest;
  if (opts.city !== undefined) mixer.city = opts.city;

  const storedSources = loadChannelStore();
  let savedChannels = storedSources.channels;
  let recentStreams = storedSources.recentStreams;
  let localFolders = storedSources.localFolders;

  let activeStreamInput = opts.url?.trim() || undefined;
  let activeStreamLabel = activeStreamInput;
  let activeChannelSlug: string | undefined;
  let activeLocalFolderSlug: string | undefined;
  let activeUrl: string | undefined;
  let activeSourceKind: 'none' | 'local' | 'stream' = 'none';

  if (activeStreamInput) {
    const resolved = resolveStreamInput(activeStreamInput, savedChannels);
    activeUrl = resolved.resolvedUrl;
    activeStreamInput = resolved.inputValue;
    activeStreamLabel = resolved.displayLabel;
    activeChannelSlug = resolved.channelSlug;
    activeSourceKind = 'stream';
    if (resolved.savedChannels) {
      savedChannels = resolved.savedChannels;
    }
    if (!resolved.channelSlug) {
      recentStreams = upsertRecentStream(recentStreams, activeStreamInput, resolved.displayLabel);
    }
    if (resolved.savedChannels || !resolved.channelSlug) {
      saveChannelStore({ channels: savedChannels, recentStreams, localFolders });
    }
  }

  let currentCatalog: RuntimeLibraryCatalog = createEmptyCatalog();

  if (opts.folder) {
    currentCatalog = loadLocalFolderCatalog(opts.folder);
    activeSourceKind = 'local';
    activeLocalFolderSlug = findLocalFolder(localFolders, opts.folder)?.slug;
  }

  let availableTracks = [...currentCatalog.tracks];
  let queue = [...availableTracks];
  let currentTrack: RuntimeTrack | null = queue[0] || null;
  let currentTrackIndex = 0;

  if (opts.folder && !currentTrack) {
    throw new Error('No tracks were found in the active source.');
  }

  const { scenes, sceneNames } = loadScenes(opts.sceneRenderer ?? 'auto');
  if (!sceneNames.length) {
    throw new Error('No scene assets were found in assets/scenes.');
  }

  if (opts.scene && !scenes.has(opts.scene)) {
    throw new Error(`Unknown scene "${opts.scene}". ${formatChoices('Available scenes', sceneNames)}`);
  }

  let currentSceneName = sceneNames[0];
  if (opts.scene) currentSceneName = opts.scene;
  else if (preset.scene && scenes.has(preset.scene)) currentSceneName = preset.scene;

  let activeScene: Scene = scenes.get(currentSceneName) ?? scenes.get(sceneNames[0])!;
  let libraryQueueMode: 'curated' | 'reshuffled' = 'curated';
  let searchScopes = buildTrackSearchScopes(availableTracks);
  let searchScopeIndex = 0;
  let searchQuery = '';
  let searchSelectedIndex = 0;

  let sourceQuery = '';
  let sourceSelectedIndex = 0;
  let sourceError = '';
  let welcomeError = '';
  let sourceEditorMode: 'add' | 'edit' = 'add';
  let sourceEditorKind: SourceEditorKind = 'local';
  let sourceEditorField: SourceEditorField = 'target';
  let sourceLabelInput = createLineEditor('');
  let sourceTargetInput = createLineEditor('');
  let sourceEditorOriginal: SourceChoice | null = null;
  let sourceEditorError = '';
  let overlay: Overlay = 'none';
  let welcomeSelectedIndex = 0;

  let engine: AudioEngine | null = null;
  let renderLoop: ReturnType<typeof setInterval> | null = null;
  let shuttingDown = false;
  let playbackStarted = false;
  const folderPickerAvailable = supportsFolderPicker();

  const getSearchResults = () =>
    searchTracks(availableTracks, searchQuery, searchScopes[searchScopeIndex], currentTrack);

  const clampSearchSelection = () => {
    const results = getSearchResults();
    if (!results.length) {
      searchSelectedIndex = 0;
      return results;
    }
    searchSelectedIndex = Math.max(0, Math.min(searchSelectedIndex, results.length - 1));
    return results;
  };

  const persistSourceStore = () => {
    saveChannelStore({ channels: savedChannels, recentStreams, localFolders });
  };

  const preferredFolderInitialPath = (preferred?: string): string | undefined => {
    const candidates = [
      preferred,
      sourceEditorKind === 'local' ? sourceTargetInput.value : undefined,
      localFolders.find((folder) => folder.slug === activeLocalFolderSlug)?.path,
      localFolders[0]?.path,
      `${homedir()}/Music`,
      process.cwd(),
    ];

    for (const candidate of candidates) {
      const value = candidate?.trim();
      if (value && existsSync(value)) return value;
    }

    return undefined;
  };

  const primeQueue = (tracks: RuntimeTrack[], preferredSlug?: string) => {
    const nextQueue = [...tracks];
    const preferred = preferredSlug
      ? tracks.find((track) => track.slug === preferredSlug)
      : tracks[0];
    const preferredIdx = preferred ? nextQueue.findIndex((track) => track.slug === preferred.slug) : -1;
    if (preferredIdx > 0) {
      const [selected] = nextQueue.splice(preferredIdx, 1);
      nextQueue.unshift(selected);
    }
    return nextQueue;
  };

  const ensurePlaybackStarted = () => {
    if (!engine || playbackStarted || (!activeUrl && !currentTrack)) return;
    engine.start();
    playbackStarted = true;
  };

  const stopPlayback = () => {
    if (!engine || !playbackStarted) return;
    engine.stop();
    playbackStarted = false;
  };

  const clearActiveSource = (nextOverlay: Overlay = 'welcome') => {
    stopPlayback();
    currentCatalog = createEmptyCatalog();
    availableTracks = [];
    queue = [];
    currentTrack = null;
    currentTrackIndex = 0;
    activeSourceKind = 'none';
    activeLocalFolderSlug = undefined;
    activeUrl = undefined;
    activeStreamInput = undefined;
    activeStreamLabel = undefined;
    activeChannelSlug = undefined;
    searchScopes = buildTrackSearchScopes([]);
    searchScopeIndex = 0;
    searchQuery = '';
    searchSelectedIndex = 0;
    overlay = nextOverlay;
  };

  const saveAndActivateLocalFolder = (path: string, explicitLabel?: string) => {
    const normalizedPath = path.trim();
    if (!normalizedPath) {
      throw new Error('Choose a local folder first.');
    }

    const label = explicitLabel?.trim() || basename(normalizedPath);
    const catalog = loadLocalFolderCatalog(normalizedPath, label);
    const saved = upsertLocalFolder(localFolders, label, normalizedPath);
    localFolders = saved.localFolders;
    persistSourceStore();
    activateTrackCatalog(catalog, 'local', saved.folder.slug);
    ensurePlaybackStarted();
    return saved.folder;
  };

  const browseForLocalFolderInEditor = () => {
    if (!folderPickerAvailable) {
      sourceEditorError = 'Native folder picker is unavailable. Paste a path manually.';
      return;
    }

    try {
      const previousTarget = sourceTargetInput.value.trim();
      const selectedPath = pickDirectory({
        prompt: 'Choose a music folder for Musicli',
        initialPath: preferredFolderInitialPath(previousTarget),
      });
      if (!selectedPath) return;

      sourceTargetInput = setLineEditorValue(sourceTargetInput, selectedPath);

      const previousLabel = sourceLabelInput.value.trim();
      const selectedBase = basename(selectedPath);
      if (!previousLabel || (previousTarget && previousLabel === basename(previousTarget))) {
        sourceLabelInput = setLineEditorValue(sourceLabelInput, selectedBase);
      }

      sourceEditorField = 'target';
      sourceEditorError = '';
    } catch (error) {
      sourceEditorError = `${formatErrorMessage(error)} Paste a path manually instead.`;
    }
  };

  const launchLocalFolderFlow = (context: 'welcome' | 'sources' | 'editor') => {
    if (context === 'editor') {
      browseForLocalFolderInEditor();
      return;
    }

    if (!folderPickerAvailable) {
      openSourceEditor('local');
      return;
    }

    try {
      const selectedPath = pickDirectory({
        prompt: 'Choose a music folder for Musicli',
        initialPath: preferredFolderInitialPath(),
      });

      if (!selectedPath) return;

      saveAndActivateLocalFolder(selectedPath);
      welcomeError = '';
      sourceError = '';
      sourceEditorError = '';
      overlay = 'none';
    } catch (error) {
      welcomeError = '';
      openSourceEditor('local');
      sourceEditorError = `${formatErrorMessage(error)} Paste a path manually instead.`;
    }
  };

  const activateTrackCatalog = (
    catalog: RuntimeLibraryCatalog,
    sourceKind: 'local',
    sourceSlug?: string,
  ) => {
    currentCatalog = catalog;
    activeSourceKind = sourceKind;
    activeLocalFolderSlug = sourceSlug;
    availableTracks = [...catalog.tracks];
    searchScopes = buildTrackSearchScopes(availableTracks);
    searchScopeIndex = 0;
    searchQuery = '';
    searchSelectedIndex = 0;
    libraryQueueMode = 'curated';

    const preferredSlug = availableTracks[0]?.slug;
    queue = primeQueue(availableTracks, preferredSlug);
    currentTrack = queue[0] || availableTracks[0] || null;
    currentTrackIndex = 0;

    if (!currentTrack) {
      throw new Error('No tracks were found in the selected source.');
    }

    activeUrl = undefined;
    activeStreamInput = undefined;
    activeStreamLabel = undefined;
    activeChannelSlug = undefined;

    if (engine) {
      engine.setTrack(currentTrack.filePath);
    }
  };

  const selectTrack = (track: RuntimeTrack) => {
    if (!engine) return;
    activeSourceKind = 'local';
    activeUrl = undefined;
    activeStreamInput = undefined;
    activeStreamLabel = undefined;
    activeChannelSlug = undefined;
    currentTrack = track;
    currentTrackIndex = Math.max(0, queue.findIndex((entry) => entry.slug === track.slug));
    if (playbackStarted) {
      engine.setTrack(track.filePath);
    } else {
      ensurePlaybackStarted();
    }
  };

  const selectLocalFolderSource = (folder: LocalFolderSource) => {
    activateTrackCatalog(loadLocalFolderCatalog(folder.path, folder.label), 'local', folder.slug);
    ensurePlaybackStarted();
  };

  const playNextTrack = () => {
    if (activeUrl || !engine || !playbackStarted || !queue.length) return;
    currentTrackIndex = (currentTrackIndex + 1) % queue.length;
    currentTrack = queue[currentTrackIndex];
    engine.setTrack(currentTrack.filePath);
  };

  const playPreviousTrack = () => {
    if (activeUrl || !engine || !playbackStarted || !queue.length) return;
    currentTrackIndex = (currentTrackIndex - 1 + queue.length) % queue.length;
    currentTrack = queue[currentTrackIndex];
    engine.setTrack(currentTrack.filePath);
  };

  const reshuffleQueue = () => {
    if (activeUrl || !engine || !playbackStarted || !queue.length) return;
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    libraryQueueMode = 'reshuffled';
    currentTrackIndex = 0;
    currentTrack = queue[0];
    engine.setTrack(currentTrack.filePath);
  };

  const buildSourceChoices = (): SourceChoice[] => {
    const choices: SourceChoice[] = [
      {
        kind: 'action',
        label: 'Add Local Folder',
        detail: folderPickerAvailable
          ? 'Browse for a music folder and save it'
          : 'Paste the path to a music folder',
        action: 'add-local',
        value: 'action:add-local',
      },
      {
        kind: 'action',
        label: 'Add Stream URL',
        detail: 'Save a YouTube or HTTP stream',
        action: 'add-stream',
        value: 'action:add-stream',
      },
    ];

    for (const folder of localFolders) {
      choices.push({
        kind: 'folder',
        label: folder.label,
        detail: folder.path,
        target: folder.path,
        slug: folder.slug,
        value: folder.slug,
        editable: true,
        deletable: true,
        active: !activeUrl && activeSourceKind === 'local' && activeLocalFolderSlug === folder.slug,
      });
    }

    for (const channel of savedChannels) {
      choices.push({
        kind: 'stream',
        label: channel.label,
        detail: 'saved stream',
        target: channel.url,
        slug: channel.slug,
        value: channel.slug,
        editable: true,
        deletable: true,
        active: Boolean(activeUrl && activeChannelSlug === channel.slug),
      });
    }

    for (const recent of recentStreams) {
      choices.push({
        kind: 'recent',
        label: recent.label,
        detail: 'recent stream',
        target: recent.input,
        input: recent.input,
        value: recent.input,
        editable: true,
        deletable: true,
        active: Boolean(activeUrl && !activeChannelSlug && activeStreamInput === recent.input),
      });
    }

    return choices;
  };

  const buildVisibleSourceChoices = (): SourceChoice[] => {
    const query = sourceQuery.trim().toLowerCase();
    const choices = buildSourceChoices();
    if (!query) return choices;

    return choices.filter((choice) =>
      [choice.label, choice.detail, ('target' in choice ? choice.target : undefined)]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query)),
    );
  };

  const buildWelcomeOptions = (): WelcomeOverlayState['options'] => {
    const options: WelcomeOverlayState['options'] = [
      {
        id: 'local',
        label: 'Local Folder',
        detail: folderPickerAvailable
          ? 'Browse for a folder on your machine and start there.'
          : 'Point Musicli at a folder of tracks on your machine.',
        recommended: true,
      },
      {
        id: 'stream',
        label: 'Stream URL',
        detail: 'Play a YouTube URL or another HTTP audio stream.',
      },
    ];

    if (savedChannels.length || recentStreams.length || localFolders.length) {
      options.push({
        id: 'sources',
        label: 'Saved Sources',
        detail: 'Browse folders, saved streams, and recent streams.',
      });
    }

    return options;
  };

  const activeSourceChoiceIndex = (): number => {
    const choices = buildVisibleSourceChoices();
    const index = choices.findIndex((choice) => choice.active);
    return index >= 0 ? index : 0;
  };

  const clampSourceSelection = () => {
    const choices = buildVisibleSourceChoices();
    if (!choices.length) {
      sourceSelectedIndex = 0;
      return choices;
    }

    sourceSelectedIndex = Math.max(0, Math.min(sourceSelectedIndex, choices.length - 1));
    return choices;
  };

  const cycleScene = () => {
    if (sceneNames.length <= 1) return;
    const idx = sceneNames.indexOf(currentSceneName);
    currentSceneName = sceneNames[(idx + 1) % sceneNames.length];
    activeScene = scenes.get(currentSceneName) ?? activeScene;
    initializeScene();
  };

  const cycleSceneBackward = () => {
    if (sceneNames.length <= 1) return;
    const idx = sceneNames.indexOf(currentSceneName);
    currentSceneName = sceneNames[(idx - 1 + sceneNames.length) % sceneNames.length];
    activeScene = scenes.get(currentSceneName) ?? activeScene;
    initializeScene();
  };

  const shutdown = (code = 0, message?: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    if (renderLoop) {
      clearInterval(renderLoop);
      renderLoop = null;
    }

    engine?.stop();
    exitTerminal();

    if (message) {
      process.stderr.write(`\n  ${message.replace(/\n/g, '\n  ')}\n\n`);
    }

    process.exit(code);
  };

  engine = new AudioEngine({
    track: currentTrack?.filePath || '',
    mixerState: mixer,
    url: activeUrl,
    onTrackEnd: playNextTrack,
    onError: (message) => shutdown(1, message),
  });

  let w = cols();
  let h = rows();
  let layout = computeLayout(w, h);
  let currentBuffer = new CellBuffer(w, h);
  let previousBuffer: CellBuffer | null = null;
  let sceneBuffer = new CellBuffer(w, h);

  const initializeScene = () => {
    activeScene.init(layout.scene.width, layout.scene.height);
    previousBuffer = null;
  };

  const renderSceneFrame = () => {
    sceneBuffer.clear();
    activeScene.render(sceneBuffer, layout.scene);
  };

  initializeScene();

  const handleResize = () => {
    w = cols();
    h = rows();
    layout = computeLayout(w, h);
    currentBuffer = new CellBuffer(w, h);
    sceneBuffer = new CellBuffer(w, h);
    initializeScene();
  };

  enterTerminal(handleResize);

  const openSearch = () => {
    overlay = 'search';
    searchQuery = '';
    searchSelectedIndex = 0;
    clampSearchSelection();
  };

  const setEditorKind = (kind: SourceEditorKind) => {
    sourceEditorKind = kind;
  };

  const openSourceEditor = (kind: SourceEditorKind = 'local', source?: SourceChoice) => {
    overlay = 'sourceEditor';
    welcomeError = '';
    sourceEditorMode = source ? 'edit' : 'add';
    sourceEditorOriginal = source ?? null;
    setEditorKind(kind);
    sourceLabelInput = createLineEditor(
      source?.kind === 'recent' ? '' : (source?.label ?? ''),
    );
    sourceTargetInput = createLineEditor(source && 'target' in source ? source.target : '');
    sourceEditorField = source ? 'label' : 'target';
    sourceEditorError = '';
  };

  const openSourcesOverlay = (focusAddLocal = false) => {
    overlay = 'sources';
    welcomeError = '';
    sourceError = '';
    if (focusAddLocal) {
      const choices = buildVisibleSourceChoices();
      const addLocalIndex = choices.findIndex(
        (choice) => choice.kind === 'action' && choice.action === 'add-local',
      );
      sourceSelectedIndex = addLocalIndex >= 0 ? addLocalIndex : 0;
      return;
    }
    sourceSelectedIndex = activeSourceChoiceIndex();
  };

  const shouldOpenWelcome = Boolean(opts.home) || (!opts.url && !opts.folder);

  if (!existsSync(SAVED_CHANNELS_PATH)) {
    persistSourceStore();
  }

  const applyResolvedStream = (resolved: ResolvedStreamInput) => {
    if (!engine) return;

    if (resolved.savedChannels) {
      savedChannels = resolved.savedChannels;
    }
    if (!resolved.channelSlug) {
      recentStreams = upsertRecentStream(recentStreams, resolved.inputValue, resolved.displayLabel);
    }

    activeUrl = resolved.resolvedUrl;
    activeStreamInput = resolved.inputValue;
    activeStreamLabel = resolved.displayLabel;
    activeChannelSlug = resolved.channelSlug;
    activeSourceKind = 'stream';
    activeLocalFolderSlug = undefined;
    currentCatalog = createEmptyCatalog();
    availableTracks = [];
    queue = [];
    currentTrack = null;
    currentTrackIndex = 0;
    searchScopes = buildTrackSearchScopes([]);
    searchScopeIndex = 0;
    searchQuery = '';
    searchSelectedIndex = 0;
    persistSourceStore();
    engine.setStream(resolved.resolvedUrl);
    ensurePlaybackStarted();
  };

  const removeOriginalSourceIfNeeded = () => {
    const original = sourceEditorOriginal;
    if (sourceEditorMode !== 'edit' || !original) return;

    if (original.kind === 'folder') {
      localFolders = localFolders.filter((folder) => folder.slug !== original.slug);
    } else if (original.kind === 'stream') {
      savedChannels = savedChannels.filter((channel) => channel.slug !== original.slug);
    } else if (original.kind === 'recent') {
      recentStreams = recentStreams.filter((recent) => recent.input !== original.input);
    }
  };

  const submitSourceEditor = () => {
    if (!engine) return;

    try {
      if (sourceEditorKind === 'local') {
        const path = sourceTargetInput.value.trim();
        removeOriginalSourceIfNeeded();
        saveAndActivateLocalFolder(path, sourceLabelInput.value.trim());
        sourceEditorError = '';
        overlay = 'none';
        return;
      }

      const url = sourceTargetInput.value.trim();
      if (!url) throw new Error('Paste a stream URL first.');

      removeOriginalSourceIfNeeded();
      const label = sourceLabelInput.value.trim() || url;
      const saved = upsertSavedChannel(savedChannels, label, url);
      savedChannels = saved.channels;
      persistSourceStore();
      applyResolvedStream(resolveStreamInput(saved.channel.slug, savedChannels));
      sourceEditorError = '';
      overlay = 'none';
    } catch (error) {
      sourceEditorError = formatErrorMessage(error);
    }
  };

  const deleteSelectedSource = () => {
    const choices = clampSourceSelection();
    const selected = choices[sourceSelectedIndex];
    if (!selected?.deletable) return;

    if (selected.kind === 'folder') {
      localFolders = localFolders.filter((folder) => folder.slug !== selected.slug);
      if (activeLocalFolderSlug === selected.slug && !activeUrl) {
        clearActiveSource('welcome');
      }
    } else if (selected.kind === 'stream') {
      savedChannels = savedChannels.filter((channel) => channel.slug !== selected.slug);
      if (activeChannelSlug === selected.slug) {
        clearActiveSource('welcome');
      }
    } else if (selected.kind === 'recent') {
      recentStreams = recentStreams.filter((recent) => recent.input !== selected.input);
      if (activeUrl && !activeChannelSlug && activeStreamInput === selected.input) {
        clearActiveSource('welcome');
      }
    }

    persistSourceStore();
    sourceError = '';
    clampSourceSelection();
  };

  onAnyKey((key) => {
    if (key === 'ctrl-c') return false;

    if (overlay === 'welcome') {
      const options = buildWelcomeOptions();
      if (key === 'q') return false;
      if (key === 'esc') return true;
      if (key === '1') {
        welcomeSelectedIndex = 0;
        launchLocalFolderFlow('welcome');
        return true;
      }
      if (key === '2') {
        const streamIndex = options.findIndex((option) => option.id === 'stream');
        if (streamIndex >= 0) {
          welcomeSelectedIndex = streamIndex;
          openSourceEditor('stream');
        }
        return true;
      }
      if (key === '3') {
        const sourcesIndex = options.findIndex((option) => option.id === 'sources');
        if (sourcesIndex >= 0) {
          welcomeSelectedIndex = sourcesIndex;
          openSourcesOverlay();
        }
        return true;
      }
      if (key === 'up' || key === 'k') {
        welcomeSelectedIndex = Math.max(0, welcomeSelectedIndex - 1);
        return true;
      }
      if (key === 'down' || key === 'j') {
        welcomeSelectedIndex = Math.min(options.length - 1, welcomeSelectedIndex + 1);
        return true;
      }
      if (key === 'enter') {
        const selected = options[Math.max(0, Math.min(welcomeSelectedIndex, options.length - 1))];
        if (!selected) return true;
        if (selected.id === 'local') {
          launchLocalFolderFlow('welcome');
        } else if (selected.id === 'stream') {
          openSourceEditor('stream');
        } else {
          openSourcesOverlay();
        }
        return true;
      }
      if (key === 'o' || key === 'c') {
        openSourcesOverlay();
        return true;
      }
      if (key === 'u') {
        openSourceEditor('stream');
        return true;
      }
      if (key === 'f' || key === 'a') {
        launchLocalFolderFlow('welcome');
        return true;
      }
      return true;
    }

    if (overlay === 'help') {
      if (key === 'q') return false;
      if (key === 'esc' || key === '?') {
        overlay = 'none';
      } else if (key === '/') {
        openSearch();
      } else if (key === 'o' || key === 'c') {
        openSourcesOverlay();
      } else if (key === 'u') {
        openSourceEditor('stream');
      } else if (key === 'f') {
        openSourceEditor('local');
      }
      return true;
    }

    if (overlay === 'sourceEditor') {
      if (key === 'esc') {
        if (activeSourceKind === 'none' && !activeUrl) {
          overlay = 'welcome';
        } else {
          openSourcesOverlay();
        }
        sourceEditorError = '';
        return true;
      }
      if (sourceEditorKind === 'local' && key === 'g') {
        launchLocalFolderFlow('editor');
        return true;
      }
      if (key === 'enter') {
        submitSourceEditor();
        return true;
      }
      if (key === 'up' || key === 'shift-tab') {
        sourceEditorField =
          sourceEditorField === 'target' ? 'label'
          : sourceEditorField === 'label' ? 'type'
          : 'target';
        return true;
      }
      if (key === 'down' || key === '\t') {
        sourceEditorField =
          sourceEditorField === 'type' ? 'label'
          : sourceEditorField === 'label' ? 'target'
          : 'type';
        return true;
      }

      if (sourceEditorField === 'type') {
        if (key === 'left' || key === 'right' || key === ' ') {
          setEditorKind(sourceEditorKind === 'local' ? 'stream' : 'local');
          sourceEditorError = '';
        }
        return true;
      }

      const updateFocusedInput = (updater: (input: LineEditorState) => LineEditorState) => {
        if (sourceEditorField === 'label') {
          sourceLabelInput = updater(sourceLabelInput);
        } else {
          sourceTargetInput = updater(sourceTargetInput);
        }
        sourceEditorError = '';
      };

      if (key === 'left') {
        updateFocusedInput(moveLineEditorLeft);
        return true;
      }
      if (key === 'right') {
        updateFocusedInput(moveLineEditorRight);
        return true;
      }
      if (key === 'home' || key === 'ctrl-a') {
        updateFocusedInput(moveLineEditorHome);
        return true;
      }
      if (key === 'end' || key === 'ctrl-e') {
        updateFocusedInput(moveLineEditorEnd);
        return true;
      }
      if (key === 'backspace') {
        updateFocusedInput(backspaceLineEditor);
        return true;
      }
      if (key === 'delete') {
        updateFocusedInput(deleteLineEditorForward);
        return true;
      }
      if (key === 'ctrl-u') {
        updateFocusedInput(clearLineEditorToStart);
        return true;
      }
      if (key === 'ctrl-k') {
        updateFocusedInput(clearLineEditorToEnd);
        return true;
      }
      if (isPrintableKey(key)) {
        updateFocusedInput((input) => insertLineEditorText(input, key));
        return true;
      }
      return true;
    }

    if (overlay === 'sources') {
      if (key === 'q') return false;
      if (key === 'esc' || key === 'o' || key === 'c') {
        if (sourceQuery) {
          sourceQuery = '';
          sourceSelectedIndex = 0;
          return true;
        }
        overlay = activeSourceKind === 'none' && !activeUrl ? 'welcome' : 'none';
        sourceError = '';
        return true;
      }
      if (key === 'a') {
        launchLocalFolderFlow('sources');
        return true;
      }
      if (key === 'u') {
        openSourceEditor('stream');
        return true;
      }
      if (key === 'f') {
        launchLocalFolderFlow('sources');
        return true;
      }
      if (key === 'up' || key === 'k') {
        const choices = clampSourceSelection();
        if (choices.length) {
          sourceSelectedIndex = Math.max(0, sourceSelectedIndex - 1);
        }
        return true;
      }
      if (key === 'down' || key === 'j') {
        const choices = clampSourceSelection();
        if (choices.length) {
          sourceSelectedIndex = Math.min(choices.length - 1, sourceSelectedIndex + 1);
        }
        return true;
      }
      if (key === 'enter') {
        const choices = clampSourceSelection();
        const selected = choices[sourceSelectedIndex];
        if (!selected) return true;

        try {
          if (selected.kind === 'action') {
            if (selected.action === 'add-local') {
              launchLocalFolderFlow('sources');
            } else {
              openSourceEditor('stream');
            }
            return true;
          } else if (selected.kind === 'folder') {
            const folder = localFolders.find((entry) => entry.slug === selected.slug);
            if (!folder) throw new Error(`Saved folder "${selected.slug}" was not found.`);
            selectLocalFolderSource(folder);
          } else if (selected.kind === 'stream') {
            applyResolvedStream(resolveStreamInput(selected.slug, savedChannels));
          } else {
            applyResolvedStream(resolveStreamInput(selected.input, savedChannels));
          }
          overlay = 'none';
          sourceError = '';
        } catch (error) {
          sourceError = formatErrorMessage(error);
        }
        return true;
      }
      if (key === 'e') {
        const choices = clampSourceSelection();
        const selected = choices[sourceSelectedIndex];
        if (!selected?.editable) return true;
        openSourceEditor(selected.kind === 'folder' ? 'local' : 'stream', selected);
        return true;
      }
      if (key === 'd') {
        deleteSelectedSource();
        return true;
      }
      if (key === 'backspace') {
        if (sourceQuery) {
          sourceQuery = sourceQuery.slice(0, -1);
          sourceSelectedIndex = 0;
          clampSourceSelection();
        }
        return true;
      }
      if (key === 'ctrl-u') {
        sourceQuery = '';
        sourceSelectedIndex = 0;
        return true;
      }
      if (isPrintableKey(key)) {
        sourceQuery += key;
        sourceSelectedIndex = 0;
        clampSourceSelection();
        return true;
      }
      return true;
    }

    if (overlay !== 'search') return false;

    if (key === 'esc') {
      if (searchQuery) {
        searchQuery = '';
        searchSelectedIndex = 0;
        clampSearchSelection();
      } else {
        overlay = 'none';
      }
      return true;
    }
    if (key === 'enter') {
      const results = clampSearchSelection();
      const selected = results[searchSelectedIndex];
      if (selected) {
        selectTrack(selected.track);
        overlay = 'none';
        searchQuery = '';
        searchSelectedIndex = 0;
      }
      return true;
    }
    if (key === 'up' || key === 'k') {
      const results = clampSearchSelection();
      if (results.length) searchSelectedIndex = Math.max(0, searchSelectedIndex - 1);
      return true;
    }
    if (key === 'down' || key === 'j') {
      const results = clampSearchSelection();
      if (results.length) searchSelectedIndex = Math.min(results.length - 1, searchSelectedIndex + 1);
      return true;
    }
    if (key === '\t') {
      searchScopeIndex = (searchScopeIndex + 1) % searchScopes.length;
      searchSelectedIndex = 0;
      clampSearchSelection();
      return true;
    }
    if (key === 'shift-tab') {
      searchScopeIndex = (searchScopeIndex - 1 + searchScopes.length) % searchScopes.length;
      searchSelectedIndex = 0;
      clampSearchSelection();
      return true;
    }
    if (key === 'backspace') {
      if (searchQuery) {
        searchQuery = searchQuery.slice(0, -1);
        searchSelectedIndex = 0;
        clampSearchSelection();
      }
      return true;
    }
    if (key === '/') return true;
    if (isPrintableKey(key)) {
      searchQuery += key;
      searchSelectedIndex = 0;
      clampSearchSelection();
      return true;
    }
    return true;
  });

  process.once('SIGINT', () => shutdown(0));
  process.once('SIGTERM', () => shutdown(0));

  const channels = [...MIXER_CHANNELS];
  let selectedChannel = 0;

  for (let i = 0; i < Math.min(9, channels.length); i++) {
    const idx = i;
    onKey(String(i + 1), () => {
      selectedChannel = idx;
    });
  }

  const selectNextChannel = () => {
    selectedChannel = (selectedChannel + 1) % channels.length;
  };

  const selectPreviousChannel = () => {
    selectedChannel = (selectedChannel - 1 + channels.length) % channels.length;
  };

  const volUp = () => {
    if (!engine) return;
    const channel = channels[selectedChannel];
    const nextMixer = adjustVolume(engine.getMixerState(), channel.key, VOLUME_STEP);
    engine.updateMixer(nextMixer);
    if (channel.key === 'music') {
      saveTrackVolume(nextMixer.music);
    }
  };

  const volDown = () => {
    if (!engine) return;
    const channel = channels[selectedChannel];
    const nextMixer = adjustVolume(engine.getMixerState(), channel.key, -VOLUME_STEP);
    engine.updateMixer(nextMixer);
    if (channel.key === 'music') {
      saveTrackVolume(nextMixer.music);
    }
  };

  onKey('up', selectPreviousChannel);
  onKey('down', selectNextChannel);
  onKey('+', volUp);
  onKey('=', volUp);
  onKey('-', volDown);
  onKey('right', volUp);
  onKey('left', volDown);
  onKey('\t', cycleScene);
  onKey('shift-tab', cycleSceneBackward);

  onKey('/', openSearch);
  onKey('o', openSourcesOverlay);
  onKey('c', openSourcesOverlay);
  onKey('u', () => openSourceEditor('stream'));
  onKey('f', () => openSourceEditor('local'));
  onKey('?', () => {
    overlay = overlay === 'help' ? 'none' : 'help';
  });
  onKey('v', cycleScene);
  onKey('m', () => engine?.toggleMute());
  onKey(' ', () => engine?.togglePause());
  onKey('k', () => engine?.togglePause());
  onKey('n', playNextTrack);
  onKey('b', playPreviousTrack);
  onKey('p', playPreviousTrack);
  onKey('s', reshuffleQueue);
  onKey('r', reshuffleQueue);
  onKey('q', () => shutdown(0));
  onKey('ctrl-c', () => shutdown(0));

  startInput();
  if (!shouldOpenWelcome && (activeUrl || currentTrack)) {
    ensurePlaybackStarted();
  } else {
    overlay = 'welcome';
  }

  renderLoop = setInterval(() => {
    if (!engine) return;

    renderSceneFrame();
    currentBuffer.copyFrom(sceneBuffer);

    const chromeState: ChromeState = {
      mixer: engine.getMixerState(),
      track: activeUrl
        ? (activeStreamLabel || 'external stream')
        : (currentTrack?.title || 'choose a source to start'),
      category: activeUrl ? 'external stream' : (currentTrack?.categoryLabel || 'waiting for source'),
      sourceLabel: activeUrl
        ? (activeChannelSlug
          ? (savedChannels.find((channel) => channel.slug === activeChannelSlug)?.label ?? activeStreamLabel ?? 'stream')
          : (activeStreamLabel ?? 'stream'))
        : (activeSourceKind === 'local'
          ? (localFolders.find((folder) => folder.slug === activeLocalFolderSlug)?.label ?? 'local folder')
          : 'no source selected'),
      sourceKind: activeUrl ? 'stream' : (activeSourceKind === 'local' ? 'folder' : 'idle'),
      queuePosition: activeUrl || !queue.length ? null : currentTrackIndex + 1,
      queueTotal: activeUrl || !queue.length ? null : queue.length,
      queueMode: activeUrl ? 'stream' : (queue.length ? libraryQueueMode : 'idle'),
      paused: engine.isPaused(),
      muted: engine.isMuted(),
      selectedChannel,
    };
    renderChrome(currentBuffer, layout, chromeState);

    if (overlay === 'welcome') {
      renderWelcomeOverlay(currentBuffer, {
        options: buildWelcomeOptions(),
        selectedIndex: Math.min(welcomeSelectedIndex, Math.max(0, buildWelcomeOptions().length - 1)),
        folderPickerSupported: folderPickerAvailable,
        error: welcomeError || undefined,
      });
    } else if (overlay === 'help') {
      renderHelpOverlay(currentBuffer);
    } else if (overlay === 'search') {
      const results = clampSearchSelection().map((result) => result.track);
      renderSearchOverlay(currentBuffer, {
        query: searchQuery,
        scope: searchScopes[searchScopeIndex],
        selectedIndex: searchSelectedIndex,
        results,
        totalResults: results.length,
      });
    } else if (overlay === 'sourceEditor') {
      const editorState: SourceEditorOverlayState = {
        mode: sourceEditorMode,
        type: sourceEditorKind,
        focusedField: sourceEditorField,
        label: sourceLabelInput,
        target: sourceTargetInput,
        folderPickerSupported: folderPickerAvailable,
        error: sourceEditorError || undefined,
      };
      renderSourceEditorOverlay(currentBuffer, editorState);
    } else if (overlay === 'sources') {
      const sourceChoices = clampSourceSelection();
      renderSourcesOverlay(currentBuffer, {
        query: sourceQuery,
        selectedIndex: Math.min(sourceSelectedIndex, Math.max(0, sourceChoices.length - 1)),
        items: sourceChoices as SourceListItem[],
        folderPickerSupported: folderPickerAvailable,
        activeKind: activeUrl ? (activeChannelSlug ? 'stream' : 'recent') : (activeSourceKind === 'local' ? 'folder' : undefined),
        activeValue: activeUrl ? (activeChannelSlug ?? activeStreamInput) : activeLocalFolderSlug,
        error: sourceError || undefined,
      });
    }

    process.stdout.write(diffBuffers(currentBuffer, previousBuffer));

    if (!previousBuffer) {
      previousBuffer = new CellBuffer(w, h);
    }
    previousBuffer.copyFrom(currentBuffer);
  }, 33);

  process.on('exit', () => {
    if (renderLoop) clearInterval(renderLoop);
  });
}
