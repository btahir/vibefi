import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const COREAUDIO_PATH = join(ROOT, 'node_modules', 'speaker', 'deps', 'mpg123', 'src', 'output', 'coreaudio.c');

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

if (process.platform !== 'darwin') {
  process.exit(0);
}

if (!existsSync(COREAUDIO_PATH)) {
  console.warn(`speaker CoreAudio source not found at ${COREAUDIO_PATH}; skipping patch`);
  process.exit(0);
}

const original = readFileSync(COREAUDIO_PATH, 'utf8');

if (original.includes('musicli: patched CoreAudio underrun handling')) {
  process.exit(0);
}

let next = original;

if (!next.includes('#include <string.h>')) {
  next = next.replace('#include <errno.h>\n', '#include <errno.h>\n#include <string.h>\n');
}

const search = [
  '\t\t/* Only play if we have data left */',
  '\t\tif ( sfifo_used( &ca->fifo ) < (int)wanted ) {',
  '\t\t\tif(!ca->decode_done) {',
  '\t\t\t\twarning("Didn\'t have any audio data in callback (buffer underflow)");',
  '\t\t\t\treturn -1;',
  '\t\t\t}',
  '\t\t\twanted = sfifo_used( &ca->fifo );',
  '\t\t\tca->last_buffer = 1;',
  '\t\t}',
].join('\n');

const replacement = [
  '\t\t/* Only play if we have data left */',
  '\t\tif ( sfifo_used( &ca->fifo ) < (int)wanted ) {',
  '\t\t\tif(!ca->decode_done) {',
  '\t\t\t\t/* musicli: patched CoreAudio underrun handling */',
  '\t\t\t\tmemset(dest, 0, wanted);',
  '\t\t\t\toutOutputData->mBuffers[n].mDataByteSize = wanted;',
  '\t\t\t\toutOutputData->mBuffers[n].mData = dest;',
  '\t\t\t\tcontinue;',
  '\t\t\t}',
  '\t\t\twanted = sfifo_used( &ca->fifo );',
  '\t\t\tca->last_buffer = 1;',
  '\t\t}',
].join('\n');

if (!next.includes(search)) {
  throw new Error('Unable to locate the CoreAudio underflow block in speaker source.');
}

next = next.replace(search, replacement);
writeFileSync(COREAUDIO_PATH, next);

execFileSync(npmCommand(), ['rebuild', 'speaker'], {
  cwd: ROOT,
  stdio: 'inherit',
});
