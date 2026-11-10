// Copies the shared phase 1 code into the Kindle extension, which must be a
// self-contained folder for Chrome to load it. Run after changing any of
// these files: npm run sync:extension
// (Git stores identical files once, so the copies don't grow the repo.)
import { cpSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const file of SHARED) {
    const to = join(root, 'kindle-extension/shared', file);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(join(root, file), to);
  }
  console.log(`Copied ${SHARED.length} shared files into kindle-extension/shared/`);
}
