import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_VS_SHADER } from '../../src/defaults';
import { WebGLManagerProxy } from '../../src/offscreen-webgl/proxy';

const gradient = `precision mediump float;
uniform vec2 u_resolution;
void main() { gl_FragColor = vec4(gl_FragCoord.xy / u_resolution, 0.0, 1.0); }`;
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

describe('shared worker context', () => {
	it('renders independent local coordinates and multipass output with one context', async () => {
		const canvases = Array.from({ length: 20 }, () => {
			const canvas = document.createElement('canvas');
			canvas.width = 4;
			canvas.height = 4;
			return canvas;
		});
		const proxies = canvases.map((canvas) => new WebGLManagerProxy(canvas));
		let firstDestroyed = false;
		try {
			await Promise.all(
				proxies.map(async (proxy, index) => {
					await proxy.setVertexShaderAsync(DEFAULT_VS_SHADER);
					if (index === 1) await proxy.setFragmentShaderGroupsAsync([[red], [blueFromRed]]);
					else await proxy.setFragmentShadersAsync([index % 2 ? red : gradient]);
					await proxy.setupWholeScreenQuadAsync();
					await proxy.updateUniformAsync('u_resolution', [4, 4]);
					await proxy.resizeAsync(4, 4);
				})
			);
			await vi.waitFor(() => {
				expect(pixel(canvases[0], 0, 3)).toEqual([32, 32, 0, 255]);
				expect(pixel(canvases[1], 1, 1)).toEqual([0, 0, 255, 255]);
				expect(pixel(canvases[19], 1, 1)).toEqual([255, 0, 0, 255]);
			});
			await proxies[0].runOnContextAsync('save', (manager) => {
				(globalThis as any).sharedTestContext = manager.getGLContext();
			});
			await expect(
				proxies[19].runOnContextAsync('compare', (manager) => manager.getGLContext() === (globalThis as any).sharedTestContext)
			).resolves.toBe(true);
			await expect(proxies[19].setFragmentShadersAsync(['invalid shader'])).rejects.toThrow('compile Fragment Shader');
			await proxies[0].destroyAsync();
			firstDestroyed = true;
			await proxies[19].paintCanvasAsync();
			await vi.waitFor(() => expect(pixel(canvases[19], 1, 1)).toEqual([255, 0, 0, 255]));
		} finally {
			await Promise.all(proxies.slice(firstDestroyed ? 1 : 0).map((proxy) => proxy.destroyAsync()));
		}
	});

	it('presents the right region when canvases of different sizes share the context', async () => {
		const sizes: [number, number][] = [
			[4, 4],
			[16, 2],
			[2, 16],
		];
		const canvases = sizes.map(() => document.createElement('canvas'));
		const proxies = canvases.map((canvas) => new WebGLManagerProxy(canvas));
		try {
			await Promise.all(
				proxies.map(async (proxy, index) => {
					const [width, height] = sizes[index];
					await proxy.setVertexShaderAsync(DEFAULT_VS_SHADER);
					await proxy.setFragmentShadersAsync([gradient]);
					await proxy.setupWholeScreenQuadAsync();
					await proxy.updateUniformAsync('u_resolution', [width, height]);
					await proxy.resizeAsync(width, height);
				})
			);
			await proxies[0].paintCanvasAsync();
			await vi.waitFor(() => {
				expect([canvases[0].width, canvases[0].height]).toEqual([4, 4]);
				expect(pixel(canvases[0], 0, 3)).toEqual([32, 32, 0, 255]);
				expect(pixel(canvases[0], 3, 0)).toEqual([223, 223, 0, 255]);
				expect(pixel(canvases[1], 15, 0)).toEqual([247, 191, 0, 255]);
				expect(pixel(canvases[2], 0, 15)).toEqual([64, 8, 0, 255]);
			});
		} finally {
			await Promise.all(proxies.map((proxy) => proxy.destroyAsync()));
		}
	});
});
