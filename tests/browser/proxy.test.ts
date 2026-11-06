import { describe, expect, it } from 'vitest';
import { DEFAULT_FS_SHADER, DEFAULT_VS_SHADER } from '../../src/defaults';
import { WebGLManagerProxy } from '../../src/offscreen-webgl/proxy';

describe('WebGL worker proxy', () => {
	it('orders calls and propagates shader errors', async () => {
		const proxy = new WebGLManagerProxy(document.createElement('canvas'));
		try {
			const vertex = proxy.setVertexShaderAsync(DEFAULT_VS_SHADER);
			const fragment = proxy.setFragmentShadersAsync([DEFAULT_FS_SHADER]);
			await Promise.all([vertex, fragment]);
			await proxy.setupWholeScreenQuadAsync();
			await proxy.paintCanvasAsync();
			await expect(proxy.setFragmentShadersAsync(['invalid shader'])).rejects.toThrow('compile Fragment Shader');
			await expect(proxy.callMethodAsync('nonexistent' as never)).rejects.toThrow('not found');
		} finally {
			await proxy.destroyAsync();
		}
	});

	it('waits for asynchronous callbacks before processing later calls', async () => {
		const proxy = new WebGLManagerProxy(document.createElement('canvas'));
		try {
			const first = proxy.runOnContextAsync('first', async () => {
				await new Promise((resolve) => setTimeout(resolve, 30));
				(globalThis as any).proxyOrder = 42;
			});
			const second = proxy.runOnContextAsync('second', () => (globalThis as any).proxyOrder);
			await first;
			await expect(second).resolves.toBe(42);
		} finally {
			await proxy.destroyAsync();
		}
	});

	it('returns callback results without JSON encoding', async () => {
		const proxy = new WebGLManagerProxy(document.createElement('canvas'));
		try {
			await expect(proxy.runOnContextAsync('value', () => ({ value: 42 }))).resolves.toEqual({ value: 42 });
		} finally {
			await proxy.destroyAsync();
		}
	});
});
