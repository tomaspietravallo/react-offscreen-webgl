import { createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { OffscreenWebGL } from '../../src/offscreen-webgl/offscreen-webgl';
import { createUniformStream } from '../../src/offscreen-webgl/uniform-stream';
import { WebGLManagerProxy } from '../../src/offscreen-webgl/proxy';
import type { RunOnWorkerContextFn } from '../../src/offscreen-webgl/gl-manager';

const shader = `precision mediump float;
uniform vec3 u_color;
void main() { gl_FragColor = vec4(u_color, 1.0); }`;

const tick: RunOnWorkerContextFn = (_manager, _frame, time) => {
	const state = ((globalThis as any).pausingTest ??= { ticks: 0, time: 0 });
	state.ticks++;
	state.time = time;
};

const probe = new WebGLManagerProxy(document.createElement('canvas'));
afterAll(() => probe.destroyAsync());

const ticks = () => probe.runOnContextAsync('ticks', () => ({ ...((globalThis as any).pausingTest ?? { ticks: 0, time: 0 }) }));
const liveManagers = () =>
	probe.runOnContextAsync('live', (manager) => (manager.constructor as any).liveManagers.get((manager as any).canvas).size as number);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function expectStopped() {
	await vi.waitFor(async () => {
		const before = (await ticks()).ticks;
		await wait(150);
		expect((await ticks()).ticks).toBe(before);
	});
}

async function expectRunning() {
	const before = (await ticks()).ticks;
	await vi.waitFor(async () => expect((await ticks()).ticks).toBeGreaterThan(before + 2));
}

function pixel(canvas: HTMLCanvasElement): number[] {
	const copy = document.createElement('canvas');
	copy.width = canvas.width;
	copy.height = canvas.height;
	const context = copy.getContext('2d')!;
	context.drawImage(canvas, 0, 0);
	return Array.from(context.getImageData(0, 0, 1, 1).data);
}

function mount(props: Record<string, unknown> = {}) {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = createRoot(container);
	const render = (color: [number, number, number], extra: Record<string, unknown> = {}) =>
		root.render(
			createElement(
				'div',
				{ style: { width: 8, height: 8 } },
				createElement(OffscreenWebGL, { fragmentShader: shader, u_color: color, f_each_tick: tick, ...props, ...extra })
			)
		);
	const ready = () =>
		vi.waitFor(() => {
			const canvas = container.querySelector('canvas')!;
			expect(canvas?.dataset.ready).toBe('true');
			return canvas;
		});
	const cleanup = () => {
		root.unmount();
		container.remove();
	};
	return { container, root, render, ready, cleanup };
}

describe('pausing hidden components', () => {
	it('pauses offscreen components, keeps elapsed time, and repaints current uniforms on resume', async () => {
		const scroller = document.createElement('div');
		scroller.style.cssText = 'height: 40px; overflow: auto;';
		document.body.appendChild(scroller);
		const container = document.createElement('div');
		scroller.append(container, Object.assign(document.createElement('div'), { style: 'height: 2000px' }));
		const root = createRoot(container);
		const render = (color: [number, number, number]) =>
			root.render(
				createElement(
					'div',
					{ style: { width: 8, height: 8 } },
					createElement(OffscreenWebGL, { fragmentShader: shader, u_color: color, f_each_tick: tick })
				)
			);
		try {
			render([1, 0, 0]);
			const canvas = await vi.waitFor(() => {
				const canvas = container.querySelector('canvas')!;
				expect(canvas?.dataset.ready).toBe('true');
				expect(pixel(canvas)).toEqual([255, 0, 0, 255]);
				return canvas;
			});
			await expectRunning();

			scroller.scrollTop = 1000;
			await expectStopped();
			const pausedAt = performance.now();
			const before = await ticks();
			render([0, 1, 0]);
			await wait(400);
			expect(pixel(canvas)).toEqual([255, 0, 0, 255]);
			expect((await ticks()).ticks).toBe(before.ticks);

			scroller.scrollTop = 0;
			await vi.waitFor(() => expect(pixel(canvas)).toEqual([0, 255, 0, 255]));
			const pausedFor = performance.now() - pausedAt;
			await expectRunning();
			expect((await ticks()).time - before.time).toBeLessThan(pausedFor - 200);
		} finally {
			root.unmount();
			scroller.remove();
		}
	});

	it('holds uniform stream paints while offscreen and applies the latest values on resume', async () => {
		const stream = createUniformStream({ u_color: [1, 0, 0] });
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const postMessage = vi.spyOn(Worker.prototype, 'postMessage');
		try {
			root.render(
				createElement(
					'div',
					{ style: { width: 8, height: 8 } },
					createElement(OffscreenWebGL, { fragmentShader: shader, uniformStream: stream })
				)
			);
			const canvas = await vi.waitFor(() => {
				const canvas = container.querySelector('canvas')!;
				expect(canvas?.dataset.ready).toBe('true');
				expect(pixel(canvas)).toEqual([255, 0, 0, 255]);
				return canvas;
			});
			container.style.cssText = 'position: fixed; top: 5000px;';
			await wait(200);
			postMessage.mockClear();
			for (let i = 0; i < 20; i++) stream.set('u_color', [0, i / 19, 0]);
			await wait(200);
			expect(pixel(canvas)).toEqual([255, 0, 0, 255]);
			expect(postMessage).not.toHaveBeenCalled();
			container.style.cssText = '';
			await vi.waitFor(() => expect(pixel(canvas)).toEqual([0, 255, 0, 255]));
		} finally {
			postMessage.mockRestore();
			root.unmount();
			container.remove();
		}
	});

	it('keeps rendering offscreen when pauseWhenHidden is false', async () => {
		const { container, render, ready, cleanup } = mount({ pauseWhenHidden: false });
		try {
			container.style.cssText = 'position: fixed; top: 5000px;';
			render([1, 0, 0]);
			await ready();
			await expectRunning();
		} finally {
			cleanup();
		}
	});

	it('pauses while the document is hidden', async () => {
		const { render, ready, cleanup } = mount();
		const setHidden = (hidden: boolean) => {
			if (hidden) Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
			else delete (document as any).visibilityState;
			document.dispatchEvent(new Event('visibilitychange'));
		};
		try {
			render([1, 0, 0]);
			await ready();
			await expectRunning();
			setHidden(true);
			await expectStopped();
			setHidden(false);
			await expectRunning();
		} finally {
			delete (document as any).visibilityState;
			cleanup();
		}
	});

	it.runIf(typeof ContentVisibilityAutoStateChangeEvent === 'function')(
		'pauses while content-visibility skips the component',
		async () => {
			const { container, render, ready, cleanup } = mount();
			const setSkipped = (skipped: boolean) =>
				container.dispatchEvent(new ContentVisibilityAutoStateChangeEvent('contentvisibilityautostatechange', { skipped }));
			try {
				render([1, 0, 0]);
				await ready();
				await expectRunning();
				setSkipped(true);
				await expectStopped();
				setSkipped(false);
				await expectRunning();
			} finally {
				cleanup();
			}
		}
	);
});

describe('component lifecycle in the worker', () => {
	it('creates one manager per component in StrictMode and releases them on unmount', async () => {
		const initial = await liveManagers();
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const postMessage = vi.spyOn(Worker.prototype, 'postMessage');
		const inits = () => postMessage.mock.calls.filter(([message]) => message.type === 'INIT').length;
		try {
			root.render(
				createElement(
					StrictMode,
					null,
					...[0, 1, 2].map((key) =>
						createElement(
							'div',
							{ key, style: { width: 8, height: 8 } },
							createElement(OffscreenWebGL, { fragmentShader: shader, u_color: [1, 0, 0], f_each_tick: tick })
						)
					)
				)
			);
			await vi.waitFor(() => {
				const canvases = container.querySelectorAll('canvas');
				expect(canvases).toHaveLength(3);
				for (const canvas of canvases) expect(pixel(canvas)).toEqual([255, 0, 0, 255]);
			});
			expect(inits()).toBe(3);
			expect(await liveManagers()).toBe(initial + 3);
			await expectRunning();
			root.unmount();
			await vi.waitFor(async () => expect(await liveManagers()).toBe(initial));
			await expectStopped();
		} finally {
			postMessage.mockRestore();
			container.remove();
		}
	});
});
