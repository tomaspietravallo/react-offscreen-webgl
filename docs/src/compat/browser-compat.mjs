import browserslist from 'browserslist';
import { fileURLToPath } from 'node:url';

// Browserslist orders each browser's known releases newest first. Android
// Chrome and Firefox have only the latest release in caniuse-lite, so those
// cannot be used to infer a historical minimum.
const browserRows = [
	['Chrome', 'chrome'],
	['Edge', 'edge'],
	['Firefox', 'firefox'],
	['Safari', 'safari'],
	['Chrome for Android', 'and_chr', true],
	['Edge for Android', null],
	['Firefox for Android', 'and_ff', true],
	['Chrome for iOS', null],
	['Edge for iOS', null],
	['Firefox for iOS', null],
	['Safari on iOS', 'ios_saf'],
];

export const query = browserslist.loadConfig({ path: fileURLToPath(new URL('../../', import.meta.url)) });
if (!query) throw new Error('Missing docs Browserslist configuration');
export const features = [
	['OffscreenCanvas', 'https://caniuse.com/offscreencanvas'],
	['WebGL', 'https://caniuse.com/webgl'],
	['Web Workers', 'https://caniuse.com/webworkers'],
	['ResizeObserver', 'https://caniuse.com/resizeobserver'],
];

export function buildCompatibility(versions = browserslist(query)) {
	return browserRows.map(([name, id, currentOnly]) => {
		const matches = id ? versions.filter((version) => version.startsWith(`${id} `)).map((version) => version.slice(id.length + 1)) : [];
		return { name, version: matches.at(-1) || null, currentOnly: Boolean(currentOnly) };
	});
}
