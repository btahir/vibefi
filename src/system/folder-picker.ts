import { execFileSync, spawnSync } from 'node:child_process';

export interface FolderPickerOptions {
  prompt?: string;
  initialPath?: string;
}

export interface FolderPickerInvocation {
  command: string;
  args: string[];
}

export type FolderPickerCommandChecker = (command: string) => boolean;

function hasCommand(command: string): boolean {
  const result = spawnSync('which', [command], { stdio: 'ignore' });
  return result.status === 0;
}

function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function buildFolderPickerInvocation(
  platform: NodeJS.Platform,
  options: FolderPickerOptions = {},
  commandChecker: FolderPickerCommandChecker = hasCommand,
): FolderPickerInvocation | null {
  const prompt = options.prompt || 'Select a music folder for Musicli:';

  if (platform === 'darwin' && commandChecker('osascript')) {
    const script =
      options.initialPath
        ? `POSIX path of (choose folder with prompt "${escapeAppleScriptString(prompt)}" default location POSIX file "${escapeAppleScriptString(options.initialPath)}")`
        : `POSIX path of (choose folder with prompt "${escapeAppleScriptString(prompt)}")`;

    return {
      command: 'osascript',
      args: ['-e', script],
    };
  }

  if (platform === 'linux' && commandChecker('zenity')) {
    const args = ['--file-selection', '--directory', `--title=${prompt}`];
    if (options.initialPath) {
      args.push(`--filename=${options.initialPath}`);
    }
    return {
      command: 'zenity',
      args,
    };
  }

  if (platform === 'linux' && commandChecker('kdialog')) {
    return {
      command: 'kdialog',
      args: ['--getexistingdirectory', options.initialPath || '.', '--title', prompt],
    };
  }

  return null;
}

export function supportsFolderPicker(
  platform: NodeJS.Platform = process.platform,
  commandChecker: FolderPickerCommandChecker = hasCommand,
): boolean {
  return buildFolderPickerInvocation(platform, {}, commandChecker) !== null;
}

export function pickDirectory(options: FolderPickerOptions = {}): string | null {
  const invocation = buildFolderPickerInvocation(process.platform, options);
  if (!invocation) return null;

  try {
    const output = execFileSync(invocation.command, invocation.args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();

    return output || null;
  } catch (error) {
    const message =
      error && typeof error === 'object' && 'stderr' in error
        ? String((error as { stderr?: Buffer | string }).stderr || '')
        : String(error);

    if (/cancel/i.test(message)) {
      return null;
    }

    throw new Error(`Unable to open the folder picker.\n${message.trim()}`.trim());
  }
}
