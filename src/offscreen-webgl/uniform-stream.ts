import type { WebGLUniformName } from './gl-manager';

export type UniformStreamValue = number | ArrayLike<number>;
type UniformValues = Record<WebGLUniformName, UniformStreamValue>;
type Snapshot = Record<WebGLUniformName, number | number[]>;
type StreamValue<V> = V extends number
	? number
	: V extends readonly number[]
		? number extends V['length']
			? ArrayLike<number>
			: { readonly [K in keyof V]: number } | (ArrayBufferView & ArrayLike<number>)
		: ArrayLike<number>;
export type UniformStreamValues<T extends UniformValues> = { [K in keyof T]: StreamValue<T[K]> };

function isVector(value: UniformStreamValue): value is ArrayLike<number> {
	return Array.isArray(value) || (ArrayBuffer.isView(value) && !(value instanceof DataView));
}

function matchesShape(value: UniformStreamValue, length: number): boolean {
	if (length === 0) return typeof value === 'number';
	if (!isVector(value) || value.length !== length) return false;
	for (let i = 0; i < length; i++) if (typeof value[i] !== 'number') return false;
	return true;
}

function valuesEqual(a: number | number[] | undefined, b: UniformStreamValue): boolean {
	if (typeof b === 'number') return Object.is(a, b);
	if (!Array.isArray(a) || a.length !== b.length) return false;
	for (let i = 0; i < b.length; i++) if (!Object.is(a[i], b[i])) return false;
	return true;
}

export interface SharedUniformStream {
	buffer: SharedArrayBuffer;
	uniforms: [WebGLUniformName, number][];
}

export class UniformStream<T extends UniformValues = UniformValues> {
	public readonly sharedMemory: SharedUniformStream | null;
	private values: Snapshot = {};
	private listeners = new Set<(values: Snapshot) => void>();
	private data: Float64Array;
	private bits: Int32Array;
	private words: Int32Array | null = null;
	private uniforms: [WebGLUniformName, number][];

	constructor(initial: T) {
		this.uniforms = Object.entries(initial).map(([name, value]) => {
			if (!name.startsWith('u_') || name === 'u_resolution') throw new Error(`Cannot stream uniform ${name}`);
			const length = typeof value === 'number' ? 0 : isVector(value) ? value.length : -1;
			if (length < 0 || length > 4 || !matchesShape(value, length)) {
				throw new Error(`Uniform ${name} must be a number or a vector with 1 to 4 numbers`);
			}
			return [name as WebGLUniformName, length];
		});
		this.data = new Float64Array(this.uniforms.reduce((count, [, length]) => count + (length || 1), 0));
		this.bits = new Int32Array(this.data.buffer);
		let sharedMemory: SharedUniformStream | null = null;
		if (globalThis.crossOriginIsolated === true && typeof SharedArrayBuffer === 'function') {
			try {
				const buffer = new SharedArrayBuffer((this.bits.length + 1) * Int32Array.BYTES_PER_ELEMENT);
				this.words = new Int32Array(buffer);
				sharedMemory = { buffer, uniforms: this.uniforms };
			} catch {}
		}
		this.sharedMemory = sharedMemory;
		this.update(initial as Partial<UniformStreamValues<T>>);
	}

	public set<K extends keyof T & WebGLUniformName>(uniform: K, value: StreamValue<T[K]>): void {
		const values: Partial<UniformStreamValues<T>> = {};
		values[uniform] = value;
		this.update(values);
	}

	public update(values: Partial<UniformStreamValues<T>>): void {
		const entries = Object.entries(values) as [WebGLUniformName, UniformStreamValue][];
		for (const [name, value] of entries) {
			const uniform = this.uniforms.find(([uniform]) => uniform === name);
			if (!uniform) throw new Error(`Uniform ${name} is not declared in this stream`);
			const length = uniform[1];
			if (!matchesShape(value, length)) {
				throw new Error(`Uniform ${name} must keep its initial scalar or vector shape`);
			}
		}
		let changed = false;
		for (const [name, value] of entries) {
			if (valuesEqual(this.values[name], value)) continue;
			this.values[name] = typeof value === 'number' ? value : Array.from(value);
			changed = true;
		}
		if (!changed) return;
		let offset = 0;
		for (const [name] of this.uniforms) {
			const value = this.values[name];
			for (const component of typeof value === 'number' ? [value] : value) this.data[offset++] = component;
		}
		if (this.words) {
			Atomics.add(this.words, 0, 1);
			for (let i = 0; i < this.bits.length; i++) Atomics.store(this.words, i + 1, this.bits[i]);
			Atomics.add(this.words, 0, 1);
		}
		this.listeners.forEach((listener) => listener(this.snapshot()));
	}

	public subscribe(listener: (values: Snapshot) => void): () => void {
		this.listeners.add(listener);
		listener(this.snapshot());
		return () => {
			this.listeners.delete(listener);
		};
	}

	private snapshot(): Snapshot {
		return Object.fromEntries(Object.entries(this.values).map(([name, value]) => [name, Array.isArray(value) ? [...value] : value]));
	}
}

export function createUniformStream<const T extends UniformValues>(initial: T): UniformStream<T> {
	return new UniformStream(initial);
}

export function createUniformStreamReader(stream: SharedUniformStream): () => Snapshot | null {
	const words = new Int32Array(stream.buffer);
	const data = new Float64Array((words.length - 1) / 2);
	const bits = new Int32Array(data.buffer);
	const applied = new Int32Array(bits.length);
	let lastVersion: number | undefined;
	return () => {
		const version = Atomics.load(words, 0);
		if (version === lastVersion || (version & 1) !== 0) return null;
		for (let i = 0; i < bits.length; i++) bits[i] = Atomics.load(words, i + 1);
		if (Atomics.load(words, 0) !== version) return null;
		const initial = lastVersion === undefined;
		lastVersion = version;
		const changed: Snapshot = {};
		let offset = 0;
		for (const [name, length] of stream.uniforms) {
			const size = length || 1;
			for (let i = offset * 2; i < (offset + size) * 2; i++) {
				if (!initial && bits[i] === applied[i]) continue;
				changed[name] = length === 0 ? data[offset] : Array.from(data.subarray(offset, offset + length));
				break;
			}
			offset += size;
		}
		applied.set(bits);
		return Object.keys(changed).length ? changed : null;
	};
}
