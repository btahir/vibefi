import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { PNG } from 'pngjs';
import type { CellBuffer } from '../renderer/buffer.js';
import type { Region } from '../renderer/layout.js';
import type { RGB } from '../utils/color.js';
import type { Scene } from './types.js';

const DEFAULT_FG: RGB = [200, 200, 200];
const DEFAULT_BG: RGB = [0, 0, 0];
const ESC = '\x1b';
const LOFI_BRIGHTNESS = 0.9;
const LOFI_VIGNETTE = 0.1;
const LOFI_GRAIN = 8;
const LOFI_WARMTH: RGB = [1.03, 1.0, 0.94];

interface SceneCell {
  char: string;
  fg: RGB;
  bg: RGB;
}

interface SceneFrame {
  width: number;
  height: number;
  cells: SceneCell[];
}

let tempRoot: string | null = null;
let cleanupRegistered = false;

function cloneRgb(rgb: RGB): RGB {
  return [rgb[0], rgb[1], rgb[2]];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function ensureTempRoot(): string {
  if (!tempRoot) {
    tempRoot = mkdtempSync(join(tmpdir(), 'musicli-chafa-'));
  }

  if (!cleanupRegistered) {
    cleanupRegistered = true;
    process.once('exit', () => {
      if (tempRoot && existsSync(tempRoot)) {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });
  }

  return tempRoot;
}

function pseudoNoise(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123;
  return (n - Math.floor(n)) * 2 - 1;
}

function styleScenePng(sourcePath: string): string {
  const png = PNG.sync.read(readFileSync(sourcePath));
  const widthDenominator = Math.max(1, png.width - 1);
  const heightDenominator = Math.max(1, png.height - 1);

  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const idx = (y * png.width + x) * 4;
      const alpha = png.data[idx + 3] / 255;
      if (alpha <= 0) continue;

      const centeredX = (x / widthDenominator) * 2 - 1;
      const centeredY = (y / heightDenominator) * 2 - 1;
      const radius = clamp(Math.sqrt(centeredX * centeredX + centeredY * centeredY), 0, 1.4143);
      const vignette = 1 - LOFI_VIGNETTE * Math.pow(clamp((radius - 0.18) / 1.05, 0, 1), 1.8);

      let r = png.data[idx] * LOFI_BRIGHTNESS * LOFI_WARMTH[0] * vignette;
      let g = png.data[idx + 1] * LOFI_BRIGHTNESS * LOFI_WARMTH[1] * vignette;
      let b = png.data[idx + 2] * LOFI_BRIGHTNESS * LOFI_WARMTH[2] * vignette;

      const luminance = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
      const shadowWeight = Math.pow(1 - clamp(luminance, 0, 1), 1.35);
      const grain = pseudoNoise(x, y) * LOFI_GRAIN * shadowWeight;

      png.data[idx] = clamp(Math.round(r + grain), 0, 255);
      png.data[idx + 1] = clamp(Math.round(g + grain), 0, 255);
      png.data[idx + 2] = clamp(Math.round(b + grain), 0, 255);
    }
  }

  const outPath = join(ensureTempRoot(), `${basename(sourcePath, '.png')}-lofi.png`);
  writeFileSync(outPath, PNG.sync.write(png));
  return outPath;
}

function ansi256ToRgb(index: number): RGB {
  if (index < 16) {
    const table: RGB[] = [
      [0, 0, 0],
      [128, 0, 0],
      [0, 128, 0],
      [128, 128, 0],
      [0, 0, 128],
      [128, 0, 128],
      [0, 128, 128],
      [192, 192, 192],
      [128, 128, 128],
      [255, 0, 0],
      [0, 255, 0],
      [255, 255, 0],
      [0, 0, 255],
      [255, 0, 255],
      [0, 255, 255],
      [255, 255, 255],
    ];
    return table[index];
  }

  if (index >= 232) {
    const c = 8 + (index - 232) * 10;
    return [c, c, c];
  }

  const cube = index - 16;
  const r = Math.floor(cube / 36);
  const g = Math.floor((cube % 36) / 6);
  const b = cube % 6;
  const levels = [0, 95, 135, 175, 215, 255];
  return [levels[r], levels[g], levels[b]];
}

function applySgr(params: number[], state: { fg: RGB; bg: RGB }): void {
  if (!params.length) {
    state.fg = cloneRgb(DEFAULT_FG);
    state.bg = cloneRgb(DEFAULT_BG);
    return;
  }

  for (let i = 0; i < params.length; i++) {
    const code = params[i];

    if (code === 0) {
      state.fg = cloneRgb(DEFAULT_FG);
      state.bg = cloneRgb(DEFAULT_BG);
      continue;
    }

    if (code === 39) {
      state.fg = cloneRgb(DEFAULT_FG);
      continue;
    }

    if (code === 49) {
      state.bg = cloneRgb(DEFAULT_BG);
      continue;
    }

    if (code === 38 && params[i + 1] === 2 && i + 4 < params.length) {
      state.fg = [
        clamp(params[i + 2], 0, 255),
        clamp(params[i + 3], 0, 255),
        clamp(params[i + 4], 0, 255),
      ];
      i += 4;
      continue;
    }

    if (code === 48 && params[i + 1] === 2 && i + 4 < params.length) {
      state.bg = [
        clamp(params[i + 2], 0, 255),
        clamp(params[i + 3], 0, 255),
        clamp(params[i + 4], 0, 255),
      ];
      i += 4;
      continue;
    }

    if (code === 38 && params[i + 1] === 5 && i + 2 < params.length) {
      state.fg = ansi256ToRgb(clamp(params[i + 2], 0, 255));
      i += 2;
      continue;
    }

    if (code === 48 && params[i + 1] === 5 && i + 2 < params.length) {
      state.bg = ansi256ToRgb(clamp(params[i + 2], 0, 255));
      i += 2;
    }
  }
}

export function parseChafaAnsi(ansi: string, width: number, height: number): SceneFrame {
  const cells = new Array<SceneCell>(width * height);
  for (let i = 0; i < cells.length; i++) {
    cells[i] = { char: ' ', fg: cloneRgb(DEFAULT_FG), bg: cloneRgb(DEFAULT_BG) };
  }

  const state = { fg: cloneRgb(DEFAULT_FG), bg: cloneRgb(DEFAULT_BG) };
  let x = 0;
  let y = 0;

  for (let i = 0; i < ansi.length && y < height; i++) {
    const ch = ansi[i];

    if (ch === '\r') continue;

    if (ch === '\n') {
      x = 0;
      y += 1;
      continue;
    }

    if (ch === ESC && ansi[i + 1] === '[') {
      let j = i + 2;
      while (j < ansi.length && !/[A-Za-z]/.test(ansi[j])) {
        j += 1;
      }

      if (j >= ansi.length) break;
      const command = ansi[j];
      const rawParams = ansi.slice(i + 2, j);
      const params = rawParams.length
        ? rawParams.split(';').map((value) => Number.parseInt(value || '0', 10))
        : [];

      if (command === 'm') {
        applySgr(params, state);
      }

      i = j;
      continue;
    }

    if (x >= width) continue;
    const cell = cells[y * width + x];
    cell.char = ch;
    cell.fg = cloneRgb(state.fg);
    cell.bg = cloneRgb(state.bg);
    x += 1;
  }

  return { width, height, cells };
}

export function resolveChafaCommand(): string | null {
  const override = process.env.MUSICLI_CHAFA_BIN?.trim();
  if (override) return override;

  try {
    execFileSync('chafa', ['--version'], { stdio: 'ignore' });
    return 'chafa';
  } catch {
    return null;
  }
}

function renderWithChafa(command: string, imagePath: string, width: number, height: number): SceneFrame {
  const output = execFileSync(
    command,
    [
      '--probe',
      'off',
      '--format',
      'symbols',
      '--relative',
      'off',
      '--stretch',
      '--optimize',
      '0',
      '--animate',
      'off',
      '--font-ratio',
      '1/2',
      '--size',
      `${width}x${height}`,
      '--view-size',
      `${width}x${height}`,
      '--preprocess',
      'on',
      '--color-space',
      'rgb',
      '--color-extractor',
      'median',
      '--colors',
      'full',
      '--symbols',
      'space+block+border+diagonal+dot+quad+half',
      '--fill',
      'space+block+dot+quad+half',
      '--dither',
      'none',
      '--work',
      '9',
      imagePath,
    ],
    {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    },
  );

  return parseChafaAnsi(output, width, height);
}

export class ChafaImageScene implements Scene {
  private readonly sourcePath: string;
  private readonly command: string;
  private readonly cache = new Map<string, SceneFrame>();

  constructor(sourcePath: string, command: string) {
    this.command = command;
    this.sourcePath = styleScenePng(sourcePath);
  }

  init(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    const key = `${width}x${height}`;
    if (!this.cache.has(key)) {
      this.cache.set(key, renderWithChafa(this.command, this.sourcePath, width, height));
    }
  }

  render(buffer: CellBuffer, region: Region): void {
    const width = Math.max(1, region.width);
    const height = Math.max(1, region.height);
    const key = `${width}x${height}`;
    if (!this.cache.has(key)) {
      this.init(width, height);
    }

    const frame = this.cache.get(key);
    if (!frame) return;

    for (let y = 0; y < frame.height; y++) {
      for (let x = 0; x < frame.width; x++) {
        const cell = frame.cells[y * frame.width + x];
        buffer.set(region.x + x, region.y + y, cell.char, cell.fg, cell.bg);
      }
    }
  }
}
