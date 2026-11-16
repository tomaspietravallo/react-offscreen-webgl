import { createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { OffscreenWebGL } from '../../src/offscreen-webgl/offscreen-webgl';

describe('OffscreenWebGL', () => {
	it('mounts in StrictMode, sizes its output, and survives a sibling unmount', async () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const component = (key: string) =>
			createElement('div', { key, style: { width: '40px', height: '20px' } }, createElement(OffscreenWebGL));
		try {
			root.render(createElement(StrictMode, null, component('a'), component('b')));
			await vi.waitFor(() => {
				const canvases = container.querySelectorAll('canvas');
				expect(canvases.length).toBe(2);
				for (const canvas of canvases) {
					expect(canvas.dataset.ready).toBe('true');
					expect(canvas.width).toBe(Math.round(40 * window.devicePixelRatio));
					expect(canvas.height).toBe(Math.round(20 * window.devicePixelRatio));
				}
			});
			root.render(createElement(StrictMode, null, component('b')));
			await vi.waitFor(() => expect(container.querySelectorAll('canvas').length).toBe(1));
			const canvas = container.querySelector('canvas')!;
			await vi.waitFor(() => expect(canvas.dataset.ready).toBe('true'));
			(canvas.parentElement as HTMLElement).style.width = '60px';
			await vi.waitFor(() => expect(canvas.width).toBe(Math.round(60 * window.devicePixelRatio)));
		} finally {
			root.unmount();
			container.remove();
		}
	});

	it('only messages the worker when uniform values change', async () => {
		const shader = `precision mediump float;
uniform vec3 u_color;
void main() { gl_FragColor = vec4(u_color, 1.0); }`;
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const render = (color: readonly [number, number, number]) =>
			root.render(
				createElement(
					'div',
					{ style: { width: '4px', height: '4px' } },
					createElement(OffscreenWebGL, { fragmentShader: shader, u_color: color })
				)
			);
		const pixel = (canvas: HTMLCanvasElement) => {
			const copy = document.createElement('canvas');
			copy.width = canvas.width;
			copy.height = canvas.height;
			const context = copy.getContext('2d')!;
			context.drawImage(canvas, 0, 0);
			return Array.from(context.getImageData(0, 0, 1, 1).data);
		};
		const postMessage = vi.spyOn(Worker.prototype, 'postMessage');
		try {
			render([1, 0, 0]);
			const canvas = await vi.waitFor(() => {
				const canvas = container.querySelector('canvas')!;
				expect(canvas.dataset.ready).toBe('true');
				return canvas;
			});
			await vi.waitFor(() => expect(pixel(canvas)).toEqual([255, 0, 0, 255]));
			await new Promise((resolve) => setTimeout(resolve, 50));
			postMessage.mockClear();
			for (let i = 0; i < 10; i++) render([1, 0, 0]);
			await new Promise((resolve) => setTimeout(resolve, 50));
			expect(postMessage).not.toHaveBeenCalled();
			render([0, 1, 0]);
			await vi.waitFor(() => expect(pixel(canvas)).toEqual([0, 255, 0, 255]));
			expect(postMessage).toHaveBeenCalledTimes(1);
			const mutable: [number, number, number] = [0, 1, 0];
			render(mutable);
			await new Promise((resolve) => setTimeout(resolve, 50));
			mutable[1] = 0;
			mutable[2] = 1;
			render(mutable);
			await vi.waitFor(() => expect(pixel(canvas)).toEqual([0, 0, 255, 255]));
		} finally {
			postMessage.mockRestore();
			root.unmount();
			container.remove();
		}
	});
});
