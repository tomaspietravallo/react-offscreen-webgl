import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OffscreenWebGL, OffscreenWebGLError } from '../../src';

const broken = `precision mediump float;
void main() {
	gl_FragColor = vec4(missing, 1.0);
}`;

const cleanups: (() => void)[] = [];

function mount(props: Record<string, unknown>) {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = createRoot(container);
	root.render(createElement('div', { style: { width: '4px', height: '4px' } }, createElement(OffscreenWebGL, props as any)));
	cleanups.push(() => {
		root.unmount();
		container.remove();
	});
	return () => container.querySelector('canvas')!;
}

afterEach(() => {
	cleanups.splice(0).forEach((cleanup) => cleanup());
	vi.restoreAllMocks();
});

describe('OffscreenWebGL errors', () => {
	it('passes compile errors to onError with the offending line', async () => {
		const onError = vi.fn();
		const onReady = vi.fn();
		const consoleError = vi.spyOn(console, 'error');
		const canvas = mount({ fragmentShader: broken, onError, onReady });
		await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
		const error = onError.mock.calls[0][0] as OffscreenWebGLError;
		expect(error).toBeInstanceOf(OffscreenWebGLError);
		expect(error.kind).toBe('compile');
		expect(error.message).toMatch(/^Fragment shader failed to compile:\n.*missing/);
		await vi.waitFor(() => {
			expect(canvas().dataset.error).toBe('true');
			expect(canvas().dataset.ready).toBe('false');
		});
		expect(onReady).not.toHaveBeenCalled();
		expect(consoleError).not.toHaveBeenCalled();
	});

	it('reports fetch failures with the URL', async () => {
		const onError = vi.fn();
		const url = 'http://127.0.0.1:1/shader.glsl';
		mount({ fragmentShaderURL: url, onError });
		await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
		expect(onError.mock.calls[0][0]).toMatchObject({ kind: 'fetch', message: `Failed to fetch Fragment shader (${url})` });
		expect(onError.mock.calls[0][0].cause).toBeInstanceOf(Error);
	});

	it('calls onReady and logs a failing frame callback once when onError is not set', async () => {
		const onReady = vi.fn();
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const canvas = mount({
			onReady,
			refreshRate: 120,
			f_each_fail: () => {
				throw new Error('nope');
			},
		});
		await vi.waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
		await vi.waitFor(() => expect(consoleError).toHaveBeenCalledTimes(1));
		await new Promise((resolve) => setTimeout(resolve, 150));
		expect(consoleError).toHaveBeenCalledTimes(1);
		const error = consoleError.mock.calls[0][1] as OffscreenWebGLError;
		expect(error).toMatchObject({ kind: 'callback', message: 'f_each_fail threw' });
		expect(error.cause).toBeInstanceOf(Error);
		expect((error.cause as Error).message).toBe('nope');
		expect(canvas().dataset.error).toBe('true');
		expect(canvas().dataset.ready).toBe('true');
	});
});
