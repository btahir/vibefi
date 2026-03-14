import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSelfUpdateInvocation, runSelfUpdate } from '../src/update.js';

test('buildSelfUpdateInvocation uses npm and the latest package tag', () => {
  assert.deepEqual(buildSelfUpdateInvocation('@bilalpm/musicli', 'darwin'), {
    command: 'npm',
    args: ['install', '-g', '@bilalpm/musicli@latest'],
  });

  assert.deepEqual(buildSelfUpdateInvocation('@bilalpm/musicli', 'win32'), {
    command: 'npm.cmd',
    args: ['install', '-g', '@bilalpm/musicli@latest'],
  });
});

test('runSelfUpdate invokes the runner with the expected command', () => {
  const calls: Array<{ command: string; args: string[] }> = [];

  runSelfUpdate('@bilalpm/musicli', (command, args) => {
    calls.push({ command, args });
    return { pid: 1, output: null, stdout: null, stderr: null, status: 0, signal: null };
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['install', '-g', '@bilalpm/musicli@latest'],
  });
});
