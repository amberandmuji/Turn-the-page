import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { outOfSync } from '../scripts/sync-extension.mjs';

test('the Kindle extension has the latest shared code (npm run sync:extension)', () => {
  assert.deepEqual(outOfSync(), []);
});

test('the extension manifest is valid JSON and lists its files', () => {
  const manifest = JSON.parse(readFileSync(new URL('../kindle-extension/manifest.json', import.meta.url)));
  assert.equal(manifest.manifest_version, 3);
  for (const file of [manifest.background.service_worker, manifest.action.default_popup, ...manifest.content_scripts[0].js]) {
    assert.ok(readFileSync(new URL(`../kindle-extension/${file}`, import.meta.url)), file);
  }
});
