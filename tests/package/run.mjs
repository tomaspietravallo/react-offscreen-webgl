import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer as createHttpServer } from 'node:http';
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { build as esbuild } from 'esbuild';
import { chromium } from 'playwright';
import { build, createServer, preview } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = resolve(root, 'tests/package/fixture');
const installed = resolve(fixture, 'node_modules/react-offscreen-webgl');
const cacheDir = resolve(fixture, 'node_modules/.vite');
const expected = [
	[255, 0, 0, 255],
	[0, 0, 255, 255],
];

const cases = {
	'client-esm': async () => {
		const dev = await createServer({ root: fixture, cacheDir, logLevel: 'error', optimizeDeps: { force: true }, server: { port: 0 } });
		await dev.listen();
		try {
			await checkPage('vite dev', dev.resolvedUrls.local[0]);
			const optimized = dev.environments.client.depsOptimizer.metadata.optimized['react-offscreen-webgl'];
			assert.match(
				optimized?.src ?? '',
				/node_modules\/react-offscreen-webgl\/dist\/index\.es\.js$/,
				'Vite must bundle the ES module entry'
			);
		} finally {
			await dev.close();
		}
		const outDir = resolve(fixture, 'node_modules/.dist');
		await build({ root: fixture, cacheDir, logLevel: 'error', build: { outDir, emptyOutDir: true } });
		const server = await preview({ root: fixture, cacheDir, logLevel: 'error', build: { outDir }, preview: { port: 0 } });
		try {
			await checkPage('vite build', server.resolvedUrls.local[0]);
		} finally {
			await server.close();
		}
	},
	'client-cjs': async () => {
		const script = await bundle('src/client.cjs', 'iife', /node_modules\/react-offscreen-webgl\/dist\/index\.cjs$/);
		await serve(
			() => '',
			script,
			'script',
			(url) => checkPage('client bundle', url)
		);
	},
	'ssr-esm': async () => {
		const server = await import(pathToFileURL(resolve(fixture, 'src/server.js')).href);
		assert.match(server.entry, /node_modules\/react-offscreen-webgl\/dist\/index\.es\.js$/, 'Node must import the ES module entry');
		const script = await bundle('src/hydrate.js', 'esm', /node_modules\/react-offscreen-webgl\/dist\/index\.es\.js$/);
		await serve(server.render, script, 'module', (url) => checkPage('server render + hydration', url));
	},
	'ssr-cjs': async () => {
		const server = createRequire(import.meta.url)(resolve(fixture, 'src/server.cjs'));
		assert.match(server.entry, /node_modules\/react-offscreen-webgl\/dist\/index\.cjs$/, 'Node must require the CommonJS entry');
		const script = await bundle('src/hydrate.cjs', 'iife', /node_modules\/react-offscreen-webgl\/dist\/index\.cjs$/);
		await serve(server.render, script, 'script', (url) => checkPage('server render + hydration', url));
	},
};

const selected = process.argv.slice(2);
for (const name of selected) assert.ok(name in cases, `Unknown case ${name}. Expected one of: ${Object.keys(cases).join(', ')}`);

await install();
await checkDist();

const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-webgl', '--use-gl=angle', '--ignore-gpu-blocklist'] });
let current = '';
try {
	for (const name of selected.length ? selected : Object.keys(cases)) {
		current = name;
		await cases[name]();
	}
} finally {
	await browser.close();
}

async function install() {
	const packDir = await mkdtemp(join(tmpdir(), 'react-offscreen-webgl-pack-'));
	try {
		execFileSync('npm', ['pack', '--ignore-scripts', '--pack-destination', packDir], { cwd: root, stdio: 'ignore' });
		const [filename] = (await readdir(packDir)).filter((name) => name.endsWith('.tgz'));
		await rm(installed, { recursive: true, force: true });
		await mkdir(installed, { recursive: true });
		execFileSync('tar', ['-xzf', join(packDir, filename), '-C', installed, '--strip-components=1']);
	} finally {
		await rm(packDir, { recursive: true, force: true });
	}
}

async function checkDist() {
	for (const file of (await readdir(join(installed, 'dist'))).filter((name) => /\.(c|m)?js$/.test(name))) {
		const source = await readFile(join(installed, 'dist', file), 'utf8');
		assert.doesNotMatch(source, /__CLIENT_INTERNALS_DO_NOT_USE|__SECRET_INTERNALS_DO_NOT_USE/, `${file} must not bundle React`);
		assert.doesNotMatch(source, /["'`]\/assets\//, `${file} must not reference root-relative assets`);
	}
}

async function bundle(entry, format, expectedEntry) {
	const result = await esbuild({
		absWorkingDir: fixture,
		entryPoints: [entry],
		bundle: true,
		format,
		platform: 'browser',
		write: false,
		metafile: true,
		logLevel: 'silent',
		define: { 'process.env.NODE_ENV': '"development"' },
	});
	assert.ok(
		Object.keys(result.metafile.inputs).some((input) => expectedEntry.test(input)),
		`${entry} must bundle the entry matching ${expectedEntry}`
	);
	return result.outputFiles[0].text;
}

async function serve(render, script, type, run) {
	const html = render();
	if (html) assert.equal(html.match(/<canvas/g)?.length, 3, 'Server render must include three canvases');
	const page = `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body><div id="root">${html}</div><script ${type === 'module' ? 'type="module" ' : ''}src="/app.js"></script></body></html>`;
	const server = createHttpServer((request, response) => {
		if (request.url === '/app.js') response.writeHead(200, { 'content-type': 'text/javascript' }).end(script);
		else if (request.url === '/') response.writeHead(200, { 'content-type': 'text/html' }).end(page);
		else response.writeHead(404).end();
	});
	await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
	try {
		await run(`http://127.0.0.1:${server.address().port}/`);
	} finally {
		await new Promise((closed) => server.close(closed));
	}
}

async function checkPage(mode, url) {
	const label = `${current} (${mode})`;
	const page = await browser.newPage();
	const problems = [];
	page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
	page.on('console', (message) => message.type() === 'error' && problems.push(`console error: ${message.text()}`));
	page.on('requestfailed', (request) => problems.push(`request failed: ${request.url()}`));
	page.on('response', (response) => response.status() >= 400 && problems.push(`HTTP ${response.status()}: ${response.url()}`));
	try {
		await page.goto(url);
		const readPixels = () =>
			page.evaluate(() =>
				[...document.querySelectorAll('canvas')].map((canvas) => {
					if (canvas.dataset.ready !== 'true') return null;
					const copy = document.createElement('canvas');
					copy.width = canvas.width;
					copy.height = canvas.height;
					const context = copy.getContext('2d');
					context.drawImage(canvas, 0, 0);
					return Array.from(context.getImageData(1, 1, 1, 1).data);
				})
			);
		let pixels = await readPixels();
		for (const deadline = Date.now() + 15000; Date.now() < deadline; pixels = await readPixels()) {
			if (pixels.length === 3 && pixels[2] && JSON.stringify(pixels.slice(0, 2)) === JSON.stringify(expected)) break;
			await new Promise((wait) => setTimeout(wait, 100));
		}
		assert.deepEqual(problems, [], `${label}: ${problems.join('\n')}`);
		assert.equal(pixels.length, 3, `${label}: rendered canvases`);
		assert.ok(pixels[2], `${label}: default shader canvas ready`);
		assert.deepEqual(pixels.slice(0, 2), expected, `${label}: rendered pixels`);
		console.log(`${label}: ok`);
	} finally {
		await page.close();
	}
}
