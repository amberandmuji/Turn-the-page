// Run after changing anything in the Kindle extension or the code it shares:
//   npm run sync:extension
// It does two things:
//   1. Copies the shared phase 1 code into the extension, which must be a
//      self-contained folder for Chrome to load it. (Git stores identical
//      files once, so the copies don't grow the repo.)
//   2. Writes kindle-extension/files.json, the list of files and their hashes
//      that the extension's Update button compares to find what changed.
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const SHARED = [
  'js/gestures.js',
  'js/camera.js',
  'js/feedback.js',
  'vendor/mediapipe/vision_bundle.mjs',
  'vendor/mediapipe/wasm/vision_wasm_internal.js',
  'vendor/mediapipe/wasm/vision_wasm_internal.wasm',
  'models/gesture_recognizer.task',
];

export function outOfSync() {
  return SHARED.filter((file) => {
    try {
      return !readFileSync(join(root, file)).equals(readFileSync(join(root, 'kindle-extension/shared', file)));
    } catch {
      return true;
    }
  });
}

const EXT = join(root, 'kindle-extension');

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

// { version, files: { path: sha256 } } for every file except files.json itself.
export function fileList() {
  const files = {};
  for (const full of walk(EXT).sort()) {
    const path = relative(EXT, full).split('\\').join('/');
    if (path === 'files.json' || path.endsWith('.DS_Store')) continue;
    files[path] = createHash('sha256').update(readFileSync(full)).digest('hex');
  }
  const version = createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 7);
  return { version, files };
}

export function fileListJson() {
  return `${JSON.stringify(fileList(), null, 2)}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const file of SHARED) {
    const to = join(root, 'kindle-extension/shared', file);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(join(root, file), to);
  }
  console.log(`Copied ${SHARED.length} shared files into kindle-extension/shared/`);
  writeFileSync(join(EXT, 'files.json'), fileListJson());
  console.log(`Wrote kindle-extension/files.json (version ${fileList().version})`);
}
