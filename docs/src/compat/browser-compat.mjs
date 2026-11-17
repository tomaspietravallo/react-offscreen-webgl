import browserslist from 'browserslist';
import { fileURLToPath } from 'node:url';

// Browserslist orders known browser releases newest first.
const browserRows = [
	['Safari on iOS', 'ios_saf'],
	['Safari', 'safari'],
	['Firefox', 'firefox'],
	['Edge', 'edge'],
	['Chrome', 'chrome'],
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
	return browserRows.map(([name, id]) => {
		const matches = versions.filter((version) => version.startsWith(`${id} `)).map((version) => version.slice(id.length + 1));
		return { name, version: matches.at(-1) || null };
	});
}
