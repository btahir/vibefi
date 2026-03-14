import { execSync } from 'node:child_process';

export function checkInteractiveTerminal(): void {
  if (process.stdin.isTTY && process.stdout.isTTY) return;

  console.error(
    '\n  musicli requires an interactive terminal.\n\n' +
    '  Run it directly in a TTY instead of piping or redirecting stdin/stdout.\n'
  );
  process.exit(1);
}

export function checkFfmpeg(): void {
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
  } catch {
    console.error(
      '\n  ffmpeg is required but not found.\n\n' +
      '  Install it:\n' +
      '    macOS:  brew install ffmpeg\n' +
      '    Linux:  sudo apt install ffmpeg\n' +
      '    Other:  https://ffmpeg.org/download.html\n'
    );
    process.exit(1);
  }
}

export function checkYtDlp(): boolean {
  try {
    execSync('yt-dlp --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}
