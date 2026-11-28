import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { OffscreenWebGL } from '../../src/offscreen-webgl/offscreen-webgl';
import { WebGLManagerProxy } from '../../src/offscreen-webgl/proxy';

const gradient = `precision highp float;
uniform vec2 u_resolution;
uniform float u_blue;
void main() { gl_FragColor = vec4(gl_FragCoord.xy / u_resolution, u_blue, 1.0); }`;
const solid = `precision mediump float;
uniform vec3 u_color;
void main() { gl_FragColor = vec4(u_color, 1.0); }`;
const red = 'precision mediump float; void main() { gl_FragColor = vec4(1., 0., 0., 1.); }';
const blueFromRed = `precision mediump float;
uniform sampler2D u_buffer0;
void main() { gl_FragColor = vec4(0., 0., texture2D(u_buffer0, vec2(.5)).r, 1.); }`;

function pixel(canvas: HTMLCanvasElement, x: number, y: number): number[] {
	const copy = document.createElement('canvas');
	copy.width = canvas.width;
	copy.height = canvas.height;
	const context = copy.getContext('2d')!;
	context.drawImage(canvas, 0, 0);
	return Array.from(context.getImageData(x, y, 1, 1).data);
}

describe('WebGL context loss', () => {
	it('pauses on loss and rebuilds every component on restore', async () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const callbacks = {
			gradient: { onError: vi.fn(), onReady: vi.fn() },
			solid: { onError: vi.fn(), onReady: vi.fn() },
			multipass: { onError: vi.fn(), onReady: vi.fn() },
		};
		const late = { onError: vi.fn(), onReady: vi.fn() };
		const render = (blue: number, multipassWidth: number, mountLate = false) =>
			root.render(
				createElement(
					'div',
					null,
					createElement(
						'div',
						{ key: 'gradient', 'data-instance': 'gradient', style: { width: '4px', height: '4px' } },
						createElement(OffscreenWebGL, { fragmentShader: gradient, u_blue: blue, ...callbacks.gradient })
					),
					createElement(
						'div',
						{ key: 'solid', 'data-instance': 'solid', style: { width: '4px', height: '4px' } },
						createElement(OffscreenWebGL, { fragmentShader: solid, u_color: [0, 1, 0], ...callbacks.solid })
					),
					createElement(
						'div',
						{ key: 'multipass', 'data-instance': 'multipass', style: { width: `${multipassWidth}px`, height: '4px' } },
						createElement(OffscreenWebGL, { fragmentShader: [[red], [blueFromRed]], ...callbacks.multipass })
					),
					mountLate &&
						createElement(
							'div',
							{ key: 'late', 'data-instance': 'late', style: { width: '4px', height: '4px' } },
							createElement(OffscreenWebGL, { fragmentShader: solid, u_color: [1, 0, 0], ...late })
						)
				)
			);
		const canvas = (key: string) => container.querySelector<HTMLCanvasElement>(`[data-instance="${key}"] canvas`)!;
		const control = new WebGLManagerProxy(document.createElement('canvas'));
		control.onError = () => {};
		try {
			render(0, 4);
			await vi.waitFor(() => {
				expect(pixel(canvas('gradient'), 0, canvas('gradient').height - 1)[2]).toBe(0);
				expect(pixel(canvas('solid'), 1, 1)).toEqual([0, 255, 0, 255]);
				expect(pixel(canvas('multipass'), 1, 1)).toEqual([0, 0, 255, 255]);
			});
			for (const { onReady } of Object.values(callbacks)) expect(onReady).toHaveBeenCalledTimes(1);

			await control.runOnContextAsync('lose', (manager) => {
				const extension = manager.getGLContext().getExtension('WEBGL_lose_context')!;
				(globalThis as any).loseContextExtension = extension;
				extension.loseContext();
			});
			await vi.waitFor(() => {
				for (const [key, { onError }] of Object.entries(callbacks)) {
					expect(onError).toHaveBeenCalledTimes(1);
					expect(onError.mock.calls[0][0]).toMatchObject({ kind: 'context-lost' });
					expect(canvas(key).dataset.error).toBe('true');
				}
			});

			render(1, 6, true);
			await vi.waitFor(() => expect(late.onReady).toHaveBeenCalledTimes(1));
			await new Promise((resolve) => setTimeout(resolve, 100));
			expect(canvas('multipass').width).toBe(Math.round(4 * window.devicePixelRatio));
			await expect(control.runOnContextAsync('lost', (manager) => manager.getGLContext().isContextLost())).resolves.toBe(true);

			await control.runOnContextAsync('restore', () => (globalThis as any).loseContextExtension.restoreContext());
			await vi.waitFor(() => {
				expect(pixel(canvas('gradient'), 0, canvas('gradient').height - 1)[2]).toBe(255);
				expect(pixel(canvas('solid'), 1, 1)).toEqual([0, 255, 0, 255]);
				const multipass = canvas('multipass');
				expect(multipass.width).toBe(Math.round(6 * window.devicePixelRatio));
				expect(pixel(multipass, multipass.width - 1, 1)).toEqual([0, 0, 255, 255]);
				expect(pixel(canvas('late'), 1, 1)).toEqual([255, 0, 0, 255]);
				expect(late.onReady).toHaveBeenCalledTimes(2);
				for (const [key, { onReady }] of Object.entries(callbacks)) {
					expect(onReady).toHaveBeenCalledTimes(2);
					expect(canvas(key).dataset.error).toBe('false');
					expect(canvas(key).dataset.ready).toBe('true');
				}
			});
			for (const { onError } of Object.values(callbacks)) expect(onError).toHaveBeenCalledTimes(1);
			expect(late.onError).not.toHaveBeenCalled();
		} finally {
			await control.destroyAsync();
			root.unmount();
			container.remove();
		}
	});
});
