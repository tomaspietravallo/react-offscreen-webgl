import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_FS_SHADER, DEFAULT_VS_SHADER } from '../../src/defaults';
import { OffscreenWebGLError } from '../../src/offscreen-webgl/errors';
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
			const error = await proxy.setFragmentShadersAsync(['invalid shader']).catch((error) => error);
			expect(error).toBeInstanceOf(OffscreenWebGLError);
			expect(error).toMatchObject({ kind: 'compile' });
			expect(error.message).toMatch(/^Fragment shader failed to compile:\n\S/);
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

	it('routes errors from fire-and-forget calls and the frame loop to the proxy that caused them', async () => {
		const failing = new WebGLManagerProxy(document.createElement('canvas'));
		const healthy = new WebGLManagerProxy(document.createElement('canvas'));
		failing.onError = vi.fn();
		healthy.onError = vi.fn();
		try {
			failing.setVertexShader('invalid');
			failing.runOnContext('f_once', () => {
				throw new Error('once');
			});
			failing.runOnContext(
				'f_each_frame',
				() => {
					throw new Error('every frame');
				},
				true
			);
			failing.setFrameRate(120);
			await vi.waitFor(() => expect(failing.onError).toHaveBeenCalledTimes(3));
			await new Promise((resolve) => setTimeout(resolve, 100));
			expect(failing.onError).toHaveBeenCalledTimes(3);
			const errors = vi.mocked(failing.onError!).mock.calls.map(([error]) => error);
			for (const error of errors) expect(error).toBeInstanceOf(OffscreenWebGLError);
			expect(errors.map(({ kind, message }) => ({ kind, message: message.split(':')[0] }))).toEqual([
				{ kind: 'compile', message: 'Vertex shader failed to compile' },
				{ kind: 'callback', message: 'f_once threw' },
				{ kind: 'callback', message: 'f_each_frame threw' },
			]);
			await healthy.paintCanvasAsync();
			expect(healthy.onError).not.toHaveBeenCalled();
		} finally {
			await Promise.all([failing.destroyAsync(), healthy.destroyAsync()]);
		}
	});
});
