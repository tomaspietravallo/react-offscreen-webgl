import { createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, inject, it, vi } from 'vitest';
import { createUniformStream, OffscreenWebGL, type UniformStream } from '../../src';

declare module 'vitest' {
	export interface ProvidedContext {
		isolated: boolean;
	}
}

const shader = `precision highp float;
uniform vec3 u_color;
uniform float u_opacity;
void main() { gl_FragColor = vec4(u_color * u_opacity, 1.0); }`;

function pixel(canvas: HTMLCanvasElement): number[] {
	const copy = document.createElement('canvas');
	copy.width = canvas.width;
	copy.height = canvas.height;
	const context = copy.getContext('2d')!;
	context.drawImage(canvas, 0, 0);
	return Array.from(context.getImageData(0, 0, 1, 1).data);
}

describe('streaming uniforms through a real worker', () => {
	it.runIf(crossOriginIsolated)('falls back when the worker cannot receive shared memory', async () => {
		const stream = createUniformStream({ u_color: [1, 0, 0], u_opacity: 1 });
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const send = Worker.prototype.postMessage;
		let rejected = false;
		const postMessage = vi.spyOn(Worker.prototype, 'postMessage').mockImplementation(function (message, options) {
			if (message.method === 'setUniformStream' && message.args[0]) {
				rejected = true;
				throw new DOMException('Cannot clone shared memory', 'DataCloneError');
			}
			return send.call(this, message, options as StructuredSerializeOptions);
		});
		try {
			root.render(
				createElement(
					'div',
					{ style: { width: 4, height: 4 } },
					createElement(OffscreenWebGL, { fragmentShader: shader, uniformStream: stream })
				)
			);
			const canvas = await vi.waitFor(() => {
				const canvas = container.querySelector('canvas')!;
				expect(canvas?.dataset.ready).toBe('true');
				expect(pixel(canvas)).toEqual([255, 0, 0, 255]);
				return canvas;
			});
			expect(rejected).toBe(true);
			postMessage.mockClear();
			stream.set('u_color', [0, 1, 0]);
			await vi.waitFor(() => expect(pixel(canvas)).toEqual([0, 255, 0, 255]));
			expect(postMessage).toHaveBeenCalled();
		} finally {
			root.unmount();
			await new Promise((resolve) => setTimeout(resolve, 50));
			postMessage.mockRestore();
			container.remove();
		}
	});

	it.runIf(crossOriginIsolated)('falls back when the worker never acknowledges shared memory', async () => {
		const stream = createUniformStream({ u_color: [1, 0, 0], u_opacity: 1 });
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const send = Worker.prototype.postMessage;
		let dropped = false;
		const postMessage = vi.spyOn(Worker.prototype, 'postMessage').mockImplementation(function (message, options) {
			if (message.method === 'setUniformStream' && message.args[0]) {
				dropped = true;
				return;
			}
			return send.call(this, message, options as StructuredSerializeOptions);
		});
		try {
			root.render(
				createElement(
					'div',
					{ style: { width: 4, height: 4 } },
					createElement(OffscreenWebGL, { fragmentShader: shader, uniformStream: stream })
				)
			);
			const canvas = await vi.waitFor(
				() => {
					const canvas = container.querySelector('canvas')!;
					expect(canvas?.dataset.ready).toBe('true');
					expect(pixel(canvas)).toEqual([255, 0, 0, 255]);
					return canvas;
				},
				{ timeout: 3000 }
			);
			expect(dropped).toBe(true);
			expect(canvas.dataset.error).toBe('false');
			stream.set('u_color', [0, 1, 0]);
			await vi.waitFor(() => expect(pixel(canvas)).toEqual([0, 255, 0, 255]));
		} finally {
			root.unmount();
			await new Promise((resolve) => setTimeout(resolve, 50));
			postMessage.mockRestore();
			container.remove();
		}
	});

	it('keeps the stream attached when refreshRate changes', async () => {
		const stream = createUniformStream({ u_color: [1, 0, 0], u_opacity: 1 });
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const render = (refreshRate: number) =>
			root.render(
				createElement(
					'div',
					{ style: { width: 4, height: 4 } },
					createElement(OffscreenWebGL, { fragmentShader: shader, uniformStream: stream, refreshRate })
				)
			);
		const postMessage = vi.spyOn(Worker.prototype, 'postMessage');
		try {
			render(30);
			const canvas = await vi.waitFor(() => {
				const canvas = container.querySelector('canvas')!;
				expect(canvas?.dataset.ready).toBe('true');
				expect(pixel(canvas)).toEqual([255, 0, 0, 255]);
				return canvas;
			});
			await new Promise((resolve) => setTimeout(resolve, 100));
			postMessage.mockClear();
			render(60);
			await new Promise((resolve) => setTimeout(resolve, 100));
			const messages = postMessage.mock.calls.flatMap(([message]) => message.messages ?? [message]);
			expect(messages.filter((message) => message.method === 'setUniformStream' || message.method === 'updateUniforms')).toHaveLength(
				0
			);
			stream.set('u_color', [0, 1, 0]);
			await vi.waitFor(() => expect(pixel(canvas)).toEqual([0, 255, 0, 255]));
		} finally {
			root.unmount();
			await new Promise((resolve) => setTimeout(resolve, 50));
			postMessage.mockRestore();
			container.remove();
		}
	});

	it('repaints without React renders and uses no update messages when isolated', async () => {
		expect(crossOriginIsolated).toBe(inject('isolated'));
		const stream = createUniformStream({ u_color: [1, 0, 0], u_opacity: 1 });
		expect(stream.sharedMemory !== null).toBe(crossOriginIsolated);
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const postMessage = vi.spyOn(Worker.prototype, 'postMessage');
		try {
			root.render(
				createElement(
					StrictMode,
					null,
					createElement(
						'div',
						{ style: { width: 4, height: 4 } },
						createElement(OffscreenWebGL, { fragmentShader: shader, uniformStream: stream })
					)
				)
			);
			const canvas = await vi.waitFor(() => {
				const canvas = container.querySelector('canvas')!;
				expect(canvas?.dataset.ready).toBe('true');
				expect(pixel(canvas)).toEqual([255, 0, 0, 255]);
				return canvas;
			});
			await new Promise((resolve) => setTimeout(resolve, 100));
			postMessage.mockClear();
			for (let i = 0; i < 100; i++) stream.update({ u_color: [0, 0, 1], u_opacity: i / 99 });
			await vi.waitFor(() => expect(pixel(canvas)).toEqual([0, 0, 255, 255]));
			if (crossOriginIsolated) expect(postMessage).not.toHaveBeenCalled();
			else {
				expect(postMessage).toHaveBeenCalledTimes(1);
				expect(postMessage.mock.calls[0][0].messages).toEqual([
					expect.objectContaining({ method: 'updateUniforms', args: [{ u_color: [0, 0, 1], u_opacity: 1 }] }),
					expect.objectContaining({ method: 'paintCanvas', args: [] }),
				]);
			}
			postMessage.mockClear();
			stream.set('u_color', [0, 1, 0]);
			await vi.waitFor(() => expect(pixel(canvas)).toEqual([0, 255, 0, 255]));
			if (crossOriginIsolated) expect(postMessage).not.toHaveBeenCalled();
			else expect(postMessage).toHaveBeenCalledTimes(1);
			postMessage.mockClear();
			stream.set('u_color', [0, 1, 0]);
			await new Promise((resolve) => setTimeout(resolve, 100));
			expect(postMessage).not.toHaveBeenCalled();
		} finally {
			root.unmount();
			await new Promise((resolve) => setTimeout(resolve, 50));
			postMessage.mockRestore();
			container.remove();
		}
	});

	it('cancels pending writes when the component unmounts', async () => {
		const stream = createUniformStream({ u_color: [1, 0, 0], u_opacity: 1 });
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const postMessage = vi.spyOn(Worker.prototype, 'postMessage');
		let unmounted = false;
		try {
			root.render(
				createElement(
					'div',
					{ style: { width: 4, height: 4 } },
					createElement(OffscreenWebGL, { fragmentShader: shader, uniformStream: stream })
				)
			);
			await vi.waitFor(() => {
				const canvas = container.querySelector('canvas')!;
				expect(canvas?.dataset.ready).toBe('true');
				expect(pixel(canvas)).toEqual([255, 0, 0, 255]);
			});
			postMessage.mockClear();
			stream.set('u_color', [0, 1, 0]);
			root.unmount();
			unmounted = true;
			await new Promise((resolve) => setTimeout(resolve, 100));
			const messages = postMessage.mock.calls.flatMap(([message]) => message.messages ?? [message]);
			expect(messages.filter((message) => message.method === 'updateUniforms' || message.method === 'paintCanvas')).toHaveLength(0);
		} finally {
			if (!unmounted) root.unmount();
			postMessage.mockRestore();
			container.remove();
		}
	});

	it('replaces and detaches streams, supports multiple consumers, and cleans up on unmount', async () => {
		const first = createUniformStream({ u_color: [1, 0, 0], u_opacity: 1 });
		const second = createUniformStream({ u_color: [0, 1, 0], u_opacity: 1 });
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const render = (stream?: UniformStream, sibling = true) =>
			root.render(
				createElement(
					StrictMode,
					null,
					...[stream, ...(sibling ? [first] : [])].map((uniformStream, key) =>
						createElement(
							'div',
							{ key, style: { width: 4, height: 4 } },
							createElement(OffscreenWebGL, { fragmentShader: shader, uniformStream })
						)
					)
				)
			);
		try {
			render(first);
			await vi.waitFor(() => {
				expect(container.querySelectorAll('canvas')).toHaveLength(2);
				for (const canvas of container.querySelectorAll('canvas')) expect(pixel(canvas)).toEqual([255, 0, 0, 255]);
			});
			render(second);
			await vi.waitFor(() => expect(pixel(container.querySelector('canvas')!)).toEqual([0, 255, 0, 255]));
			first.set('u_color', [0, 0, 1]);
			await vi.waitFor(() => {
				const [a, b] = container.querySelectorAll('canvas');
				expect(pixel(a)).toEqual([0, 255, 0, 255]);
				expect(pixel(b)).toEqual([0, 0, 255, 255]);
			});
			render(undefined, false);
			await vi.waitFor(() => expect(container.querySelectorAll('canvas')).toHaveLength(1));
			await new Promise((resolve) => setTimeout(resolve, 100));
			second.set('u_color', [1, 0, 0]);
			await new Promise((resolve) => setTimeout(resolve, 100));
			expect(pixel(container.querySelector('canvas')!)).toEqual([0, 255, 0, 255]);
		} finally {
			root.unmount();
			container.remove();
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
		const postMessage = vi.spyOn(Worker.prototype, 'postMessage');
		try {
			first.set('u_color', [1, 1, 1]);
			second.set('u_color', [1, 1, 1]);
			await new Promise((resolve) => setTimeout(resolve, 50));
			expect(postMessage).not.toHaveBeenCalled();
		} finally {
			postMessage.mockRestore();
		}
	});
});
