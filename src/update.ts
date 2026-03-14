import { spawnSync, type SpawnSyncReturns } from 'node:child_process';

export interface UpdateInvocation {
  command: string;
  args: string[];
}

export function buildSelfUpdateInvocation(
  packageName: string,
  platform = process.platform,
): UpdateInvocation {
  return {
    command: platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['install', '-g', `${packageName}@latest`],
  };
}

export function runSelfUpdate(
  packageName: string,
  runner: (
    command: string,
    args: string[],
  ) => SpawnSyncReturns<Buffer> = (command, args) =>
    spawnSync(command, args, {
      stdio: 'inherit',
    }),
): void {
  const invocation = buildSelfUpdateInvocation(packageName);
  const result = runner(invocation.command, invocation.args);

  if (result.error) {
    throw new Error(`Failed to run npm update: ${result.error.message}`);
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(`npm update failed with exit code ${result.status}.`);
  }

  process.stdout.write(`\nUpdated ${packageName}. Restart Musicli to use the latest version.\n`);
}
