import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUniformStream, createUniformStreamReader } from '../../src/offscreen-webgl/uniform-stream';

afterEach(() => vi.unstubAllGlobals());

describe('uniform streams', () => {
	it('uses messages without isolation, even when SharedArrayBuffer exists', () => {
		vi.stubGlobal('crossOriginIsolated', false);
		const stream = createUniformStream({ u_mouse: [0, 0], u_scroll: 0 });
		expect(stream.sharedMemory).toBeNull();
		const listener = vi.fn();
		const unsubscribe = stream.subscribe(listener);
		stream.update({ u_mouse: [1, 2], u_scroll: 0.5 });
		expect(listener.mock.calls).toEqual([[{ u_mouse: [0, 0], u_scroll: 0 }], [{ u_mouse: [1, 2], u_scroll: 0.5 }]]);
		unsubscribe();
		stream.set('u_scroll', 1);
		expect(listener).toHaveBeenCalledTimes(2);
	});

	it('falls back when shared memory is unavailable or allocation fails', () => {
		vi.stubGlobal('crossOriginIsolated', true);
		vi.stubGlobal('SharedArrayBuffer', undefined);
		expect(createUniformStream({ u_value: 0 }).sharedMemory).toBeNull();
		vi.stubGlobal('SharedArrayBuffer', function () {
			throw new Error('unavailable');
		});
		const stream = createUniformStream({ u_value: 0 });
		expect(stream.sharedMemory).toBeNull();
		const listener = vi.fn();
		stream.subscribe(listener);
		stream.set('u_value', 42);
		expect(listener).toHaveBeenLastCalledWith({ u_value: 42 });
	});

	it('reads only complete snapshots and preserves number precision', () => {
		vi.stubGlobal('crossOriginIsolated', true);
		const stream = createUniformStream({ u_mouse: [1 / 3, -0], u_scroll: Number.MAX_VALUE });
		const read = createUniformStreamReader(stream.sharedMemory!);
		expect(read()).toEqual({ u_mouse: [1 / 3, -0], u_scroll: Number.MAX_VALUE });
		expect(read()).toBeNull();
		stream.update({ u_mouse: [10, 20], u_scroll: 0.25 });
		const words = new Int32Array(stream.sharedMemory!.buffer);
		Atomics.add(words, 0, 1);
		expect(read()).toBeNull();
		Atomics.add(words, 0, 1);
		expect(read()).toEqual({ u_mouse: [10, 20], u_scroll: 0.25 });
		expect(read()).toBeNull();
	});

	it.each([false, true])('ignores unchanged values with isolation=%s', (isolated) => {
		vi.stubGlobal('crossOriginIsolated', isolated);
		const stream = createUniformStream({ u_value: NaN, u_mouse: [0, -0] });
		const read = stream.sharedMemory ? createUniformStreamReader(stream.sharedMemory) : null;
		read?.();
		const listener = vi.fn();
		stream.subscribe(listener);
		listener.mockClear();
		stream.set('u_value', NaN);
		stream.set('u_mouse', [0, -0]);
		stream.update({});
		expect(listener).not.toHaveBeenCalled();
		if (read) expect(read()).toBeNull();
		stream.set('u_mouse', [0, 0]);
		expect(listener).toHaveBeenCalledTimes(1);
		if (read) expect(read()).toEqual({ u_mouse: [0, 0] });
	});

	it('retries on a later read if the writer changes the snapshot during a read', () => {
		vi.stubGlobal('crossOriginIsolated', true);
		const stream = createUniformStream({ u_mouse: [1, 2], u_scroll: 3 });
		const read = createUniformStreamReader(stream.sharedMemory!);
		const load = Atomics.load;
		let interrupted = false;
		const loadSpy = vi.spyOn(Atomics, 'load').mockImplementation((array, index) => {
			const value = load(array, index);
			if (index === 1 && !interrupted) {
				interrupted = true;
				stream.update({ u_mouse: [4, 5], u_scroll: 6 });
			}
			return value;
		});
		try {
			expect(read()).toBeNull();
		} finally {
			loadSpy.mockRestore();
		}
		expect(read()).toEqual({ u_mouse: [4, 5], u_scroll: 6 });
	});

	it('copies vectors and rejects changes to the layout before publishing any values', () => {
		const mouse = [1, 2];
		const stream = createUniformStream({ u_mouse: mouse, u_scroll: 0 });
		mouse[0] = 999;
		const listener = vi.fn();
		stream.subscribe(listener);
		expect(listener).toHaveBeenLastCalledWith({ u_mouse: [1, 2], u_scroll: 0 });
		expect(() => stream.update({ u_scroll: 1, u_mouse: [1, 2, 3] })).toThrow('shape');
		// @ts-expect-error undeclared uniform
		expect(() => stream.set('u_unknown', 1)).toThrow('not declared');
		// @ts-expect-error scalar uniform
		expect(() => stream.set('u_scroll', [1])).toThrow('shape');
		expect(() => createUniformStream({ u_resolution: [1, 2] })).toThrow('Cannot stream');
		expect(() => createUniformStream({ u_empty: [] })).toThrow('1 to 4');
		expect(() => createUniformStream({ u_mouse: new Array<number>(2) })).toThrow('1 to 4');
		expect(() => stream.set('u_mouse', new Array<number>(2))).toThrow('shape');
		stream.set('u_scroll', 2);
		expect(listener).toHaveBeenLastCalledWith({ u_mouse: [1, 2], u_scroll: 2 });
	});

	it('only reports uniforms whose values changed since the last read', () => {
		vi.stubGlobal('crossOriginIsolated', true);
		const stream = createUniformStream({ u_mouse: [1, 2], u_scroll: 3, u_zero: 0 });
		const read = createUniformStreamReader(stream.sharedMemory!);
		expect(read()).toEqual({ u_mouse: [1, 2], u_scroll: 3, u_zero: 0 });
		stream.set('u_scroll', 4);
		expect(read()).toEqual({ u_scroll: 4 });
		stream.set('u_mouse', [1, 5]);
		stream.set('u_zero', -0);
		expect(read()).toEqual({ u_mouse: [1, 5], u_zero: -0 });
	});

	it('accepts typed arrays and copies them', () => {
		vi.stubGlobal('crossOriginIsolated', false);
		const mouse = new Float32Array([1, 2]);
		const stream = createUniformStream({ u_mouse: mouse });
		mouse[0] = 999;
		const listener = vi.fn();
		stream.subscribe(listener);
		expect(listener).toHaveBeenLastCalledWith({ u_mouse: [1, 2] });
		stream.set('u_mouse', new Float64Array([3, 4]));
		expect(listener).toHaveBeenLastCalledWith({ u_mouse: [3, 4] });
		expect(() => stream.set('u_mouse', new Float32Array(3))).toThrow('shape');
		expect(() => createUniformStream({ u_big: new BigInt64Array(2) as unknown as number[] })).toThrow('1 to 4');
	});
});
