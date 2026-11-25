import { describe, expect, it } from 'vitest';
import { OffscreenWebGLError, shaderLabel } from '../../src/offscreen-webgl/errors';

describe('OffscreenWebGLError', () => {
	it('keeps the original error as its cause', () => {
		const cause = new TypeError('Failed to fetch');
		const error = new OffscreenWebGLError('fetch', 'Failed to fetch Fragment shader (/a.glsl)', cause);
		expect(error).toBeInstanceOf(Error);
		expect(error).toMatchObject({ name: 'OffscreenWebGLError', kind: 'fetch', cause });
	});

	it('survives structured cloning with its cause', () => {
		const original = new OffscreenWebGLError('callback', 'f_each_x threw', new Error('bad'));
		const rebuilt = OffscreenWebGLError.from(structuredClone(original.toJSON()));
		expect(rebuilt).toBeInstanceOf(OffscreenWebGLError);
		expect(rebuilt).toMatchObject({ kind: 'callback', message: 'f_each_x threw' });
		expect((rebuilt.cause as Error).message).toBe('bad');
	});

	it('wraps unknown errors and returns existing ones', () => {
		const native = new Error('boom');
		expect(OffscreenWebGLError.from(native)).toMatchObject({ kind: 'worker', message: 'boom', cause: native });
		expect(OffscreenWebGLError.from('nope', 'unsupported')).toMatchObject({ kind: 'unsupported', message: 'nope' });
		const existing = new OffscreenWebGLError('worker', 'x');
		expect(OffscreenWebGLError.from(existing)).toBe(existing);
	});

	it('labels shaders by stage and location', () => {
		expect(shaderLabel('vertex')).toBe('Vertex shader');
		expect(shaderLabel('fragment', { group: 1, pass: 0, url: '/b.glsl' })).toBe('Fragment shader (group 1, pass 0, /b.glsl)');
	});
});
