import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { OffscreenWebGL } from '../../src/offscreen-webgl/offscreen-webgl';

const gradient = `precision highp float;
uniform vec2 u_resolution;
uniform float u_blue;
void main() {
	vec2 uv = gl_FragCoord.xy / u_resolution;
	gl_FragColor = vec4(uv.x, uv.y, u_blue, 1.0);
}`;

function expectGradient(canvas: HTMLCanvasElement, blue: number) {
	const copy = document.createElement('canvas');
	copy.width = canvas.width;
	copy.height = canvas.height;
	const context = copy.getContext('2d')!;
	context.drawImage(canvas, 0, 0);
	const points = [
		[0, 0],
		[canvas.width - 1, 0],
		[0, canvas.height - 1],
		[canvas.width - 1, canvas.height - 1],
		[Math.floor(canvas.width / 2), Math.floor(canvas.height / 2)],
	];
	for (const [x, y] of points) {
		const actual = context.getImageData(x, y, 1, 1).data;
		// Canvas 2D starts at the top left; gl_FragCoord starts at the bottom left.
		const expected = [((x + 0.5) / canvas.width) * 255, ((canvas.height - y - 0.5) / canvas.height) * 255, blue * 255, 255];
		for (let channel = 0; channel < 4; channel++) {
			expect(Math.abs(actual[channel] - expected[channel]), `pixel (${x}, ${y}), channel ${channel}`).toBeLessThanOrEqual(2);
		}
	}
}

function expectSize(canvas: HTMLCanvasElement, width: number, height: number) {
	expect(canvas.dataset.ready).toBe('true');
	expect(canvas.width).toBe(Math.round(width * window.devicePixelRatio));
	expect(canvas.height).toBe(Math.round(height * window.devicePixelRatio));
}

describe('OffscreenWebGL rendered pixels', () => {
	it('renders the UV gradient at the expected coordinates', async () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		try {
			root.render(
				createElement(
					'div',
					{ style: { width: '8px', height: '6px' } },
					createElement(OffscreenWebGL, { fragmentShader: gradient, u_blue: 0 })
				)
			);
			await vi.waitFor(() => {
				const canvas = container.querySelector('canvas')!;
				expectSize(canvas, 8, 6);
				expectGradient(canvas, 0);
			});
		} finally {
			root.unmount();
			container.remove();
		}
	});

	it('updates the gradient and resolution when resized', async () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		try {
			root.render(
				createElement(
					'div',
					{ style: { width: '8px', height: '6px' } },
					createElement(OffscreenWebGL, { fragmentShader: gradient, u_blue: 0 })
				)
			);
			await vi.waitFor(() => {
				const canvas = container.querySelector('canvas')!;
				expectSize(canvas, 8, 6);
				expectGradient(canvas, 0);
			});
			const wrapper = container.firstElementChild as HTMLElement;
			wrapper.style.width = '13px';
			wrapper.style.height = '4px';
			await vi.waitFor(() => {
				const canvas = container.querySelector('canvas')!;
				expectSize(canvas, 13, 4);
				expectGradient(canvas, 0);
			});
		} finally {
			root.unmount();
			container.remove();
		}
	});

	it('keeps multiple components independent through updates and unmount', async () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const component = (key: string, width: number, height: number, blue: number) =>
			createElement(
				'div',
				{ key, 'data-instance': key, style: { width: `${width}px`, height: `${height}px` } },
				createElement(OffscreenWebGL, { fragmentShader: gradient, u_blue: blue })
			);
		const render = (blue: number, includeFirst = true) =>
			root.render(
				createElement('div', null, includeFirst && component('a', 8, 6, blue), component('b', 5, 11, 0.5), component('c', 12, 4, 1))
			);
		const check = (key: string, width: number, height: number, blue: number) => {
			const canvas = container.querySelector<HTMLCanvasElement>(`[data-instance="${key}"] canvas`)!;
			expectSize(canvas, width, height);
			expectGradient(canvas, blue);
		};
		try {
			render(0);
			await vi.waitFor(() => {
				check('a', 8, 6, 0);
				check('b', 5, 11, 0.5);
				check('c', 12, 4, 1);
			});
			render(0.25);
			await vi.waitFor(() => {
				check('a', 8, 6, 0.25);
				check('b', 5, 11, 0.5);
				check('c', 12, 4, 1);
			});
			render(0.25, false);
			await vi.waitFor(() => {
				expect(container.querySelector('[data-instance="a"]')).toBeNull();
				check('b', 5, 11, 0.5);
				check('c', 12, 4, 1);
			});
		} finally {
			root.unmount();
			container.remove();
		}
	});
});
