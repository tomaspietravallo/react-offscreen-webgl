import { readFile, access } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

const html = await readFile('dist/index.html', 'utf8');
assert.match(html, /<html[\s>]/i, 'Homepage must contain HTML');
assert.match(html, /react-offscreen-webgl/i, 'Homepage must identify the project');
assert.match(html, /Browser compatibility guidance/, 'Homepage must include compatibility guidance');
assert.match(html, /not a guarantee/, 'Compatibility guidance must remain advisory');
assert.match(html, /Suggested minimum browser versions/, 'Homepage must include the browser guidance table');
const assets = [...html.matchAll(/(?:href|src)="\/react-offscreen-webgl\/(_astro\/[^"?#]+\.(?:js|css))/g)];
assert.ok(assets.length, 'Homepage must reference a built CSS or JavaScript asset');
for (const [, asset] of assets) await access(resolve('dist', asset));
console.log(`Documentation smoke test passed (${assets.length} assets).`);
