import { err, ok, Result } from '../utils/try-catch';
import { createShaderFromSource, createWholeScreenQuad, setFloatUniforms } from '../utils/webgl';
import { OffscreenWebGLError, shaderLabel, ShaderStage } from './errors';
import { FrameTask, scheduleFrames } from './frame-scheduler';
import { createUniformStreamReader, SharedUniformStream } from './uniform-stream';

export type WebGLUniformName = `u_${string}`;

export type RunOnWorkerContextFnName = `f_${string}`;

export type RunOnWorkerContextFn<T = any> = (manager: WebGLManager, frame: number, timeElapsed: number) => T;

type ShaderDetails = { group?: number; pass?: number; url?: string };

const isMultipass = (groups: string[][]) => groups.length > 1 || groups.some((group) => group.length > 1);

async function fetchShaderSource(url: string, stage: ShaderStage, details: ShaderDetails = {}): Promise<string> {
	const label = shaderLabel(stage, { ...details, url });
	let response: Response;
	try {
		response = await fetch(url);
		if (response.ok) return await response.text();
	} catch (error) {
		throw new OffscreenWebGLError('fetch', `Failed to fetch ${label}`, error);
	}
	throw new OffscreenWebGLError('fetch', `Failed to fetch ${label}: HTTP ${response.status} ${response.statusText}`.trim());
}

export class WebGLManager {
	public static readonly DEFAULT_FRAME_RATE = 30;
	private static readonly liveManagers = new WeakMap<HTMLCanvasElement, Set<WebGLManager>>();
	private frame: number = 0;
	private timeElapsed: number = 0;
	private startTime: number | null = null;
	private onEachFrameFunctions: Record<string, RunOnWorkerContextFn> = {};
	private canvas: HTMLCanvasElement;
	private gl: WebGLRenderingContext;
	private width: number;
	private height: number;
	private onPaint?: (width: number, height: number) => void;
	private onError?: (error: OffscreenWebGLError) => void;
	private reportedErrors = new Map<string, string>();
	private quadBuffers = new Map<WebGLProgram, WebGLBuffer>();
	private quadRequested = false;
	private vertexSource: string | null = null;
	private vertexURL: string | undefined;
	private fragmentSources: string[][] | null = null;
	private fragmentURLs: string[][] | undefined;
	private vertexShader: WebGLShader | null = null;
	private fragmentShaders: WebGLShader[] | null = null;
	private frameTask: FrameTask | null = null;
	private readUniformStream: ReturnType<typeof createUniformStreamReader> | null = null;
	private streamNeedsPaint = false;

	private framebuffers: [FrameBufferObject, FrameBufferObject] | null = null;

	private fragmentShaderGroups: WebGLShader[][] | null = null;
	private shaderPrograms: WebGLProgram[][] | null = null;
	private uniformValues: Record<WebGLUniformName, number | number[]> = {};
	private uniformVersions: Record<WebGLUniformName, number> = {};
	private uniformVersion: number = 0;
	private programUniformStates: Map<WebGLProgram, Record<WebGLUniformName, number>> = new Map();
	private uniformLocations: Map<WebGLProgram, Record<WebGLUniformName, WebGLUniformLocation | null>> = new Map();
	private positionLocations: Map<WebGLProgram, number> = new Map();

	private usesPingPongGroups: boolean = false;
	private programLinked: boolean = false;

	public constructor(
		canvas: HTMLCanvasElement,
		width = canvas.width,
		height = canvas.height,
		onPaint?: (width: number, height: number) => void,
		onError?: (error: OffscreenWebGLError) => void
	) {
		this.canvas = canvas;
		this.width = width;
		this.height = height;
		this.onPaint = onPaint;
		this.onError = onError;
		this.gl = this.canvas.getContext('webgl')! as WebGLRenderingContext;

		if (!this.gl) {
			throw new OffscreenWebGLError('unsupported', 'WebGL is not supported');
		}

		const manager = new Proxy(this, {
			get: (target, prop, receiver) => {
				if (prop.toString().endsWith('Async')) {
					const originalMethod = target[prop.toString().slice(0, -5) as keyof WebGLManager] as (...args: any[]) => any;
					return async (...args: any[]) => originalMethod.apply(target, args);
				}
				return Reflect.get(target, prop, receiver);
			},
		});
		let live = WebGLManager.liveManagers.get(canvas);
		if (!live) WebGLManager.liveManagers.set(canvas, (live = new Set()));
		live.add(manager);
		return manager;
	}

	static fromHTMLCanvasElement(
		canvas: HTMLCanvasElement,
		width = canvas.width,
		height = canvas.height,
		onPaint?: (width: number, height: number) => void,
		onError?: (error: OffscreenWebGLError) => void
	): Result<WebGLManager> {
		try {
			return ok(new WebGLManager(canvas, width, height, onPaint, onError));
		} catch (e) {
			return err(OffscreenWebGLError.from(e, 'unsupported'));
		}
	}

	public destroy(): Result<WebGLManager> {
		this.frameTask?.cancel();
		this.frameTask = null;
		WebGLManager.liveManagers.get(this.canvas)?.delete(this);
		WebGLManager.fitCanvas(this.canvas);
		this.readUniformStream = null;
		this.streamNeedsPaint = false;
		try {
			if (this.vertexShader) {
				this.gl.deleteShader(this.vertexShader);
				this.vertexShader = null;
			}
			if (this.fragmentShaders) {
				for (const shader of this.fragmentShaders) {
					this.gl.deleteShader(shader);
				}
				this.fragmentShaders = null;
			}
			if (this.shaderPrograms) {
				for (const programGroup of this.shaderPrograms) {
					for (const program of programGroup) {
						this.gl.deleteProgram(program);
					}
				}
				this.shaderPrograms = null;
			}
			for (const group of this.fragmentShaderGroups || []) {
				for (const shader of group) this.gl.deleteShader(shader);
			}
			this.quadBuffers.forEach((buffer) => this.gl.deleteBuffer(buffer));
			this.quadBuffers.clear();
			for (const fbo of this.framebuffers || []) fbo.destroy();
			this.framebuffers = null;
			this.programUniformStates.clear();
			this.uniformLocations.clear();
			this.positionLocations.clear();
			this.programLinked = false;
		} catch (e) {
			console.error('[OffscreenCanvas @ GLManager] Error during cleanup', e);
			return err(new Error(`[OffscreenCanvas @ GLManager] Cleanup failed: ${e}`));
		}
		this.gl = null as any;
		return ok(this);
	}

	public setVertexShader(vertexShaderSource: string): Result<WebGLManager> {
		return this.applyVertexShader(vertexShaderSource);
	}

	private applyVertexShader(source: string, url?: string): Result<WebGLManager> {
		if (!this.isLost()) {
			const result = createShaderFromSource(this.gl, this.gl.VERTEX_SHADER, source, url ? { url } : {});
			if (result.error) return err(result.error);
			this.vertexShader = result.data;
		}
		this.vertexSource = source;
		this.vertexURL = url;
		return ok(this);
	}

	public setFragmentShaders(fragmentShaderSources: string[]): Result<WebGLManager> {
		return this.setFragmentShaderGroups(fragmentShaderSources.map((source) => [source]));
	}

	public setRemoteVertexShader(url: string): Promise<Result<WebGLManager>> {
		return fetchShaderSource(url, 'vertex').then(
			(source) => this.applyVertexShader(source, url),
			(error) => err(OffscreenWebGLError.from(error, 'fetch'))
		);
	}

	public setRemoteFragmentShaders(urls: string | string[]): Promise<Result<WebGLManager>> {
		return this.setRemoteFragmentShaderGroups((typeof urls === 'string' ? [urls] : urls).map((url) => [url]));
	}

	public setFragmentShaderGroups(fragmentShaderGroupSources: string[][]): Result<WebGLManager> {
		return this.applyFragmentShaderGroups(fragmentShaderGroupSources);
	}

	private applyFragmentShaderGroups(sources: string[][], urls?: string[][]): Result<WebGLManager> {
		if (this.vertexSource === null) return err(new Error('[OffscreenCanvas @ GLManager] Vertex shader is required'));
		if (!sources.length || sources.some((group) => !group.length)) {
			return err(new Error('[OffscreenCanvas @ GLManager] Shader groups cannot be empty'));
		}
		let compiled: { shaders: WebGLShader[][]; programs: WebGLProgram[][] } | null = null;
		if (!this.isLost()) {
			const result = this.compileFragmentShaderGroups(sources, urls);
			if (result.error) return err(result.error);
			compiled = result.data;
		}
		this.releasePrograms();
		this.fragmentShaderGroups = compiled?.shaders ?? null;
		this.shaderPrograms = compiled?.programs ?? null;
		this.fragmentSources = sources;
		this.fragmentURLs = urls;
		this.usesPingPongGroups = isMultipass(sources);
		this.programLinked = !!compiled;
		return ok(this);
	}

	private compileFragmentShaderGroups(
		sources: string[][],
		urls?: string[][]
	): Result<{ shaders: WebGLShader[][]; programs: WebGLProgram[][] }, OffscreenWebGLError> {
		const multipass = isMultipass(sources);
		const groups: WebGLShader[][] = [];
		const programGroups: WebGLProgram[][] = [];
		try {
			for (let group = 0; group < sources.length; group++) {
				const shaders: WebGLShader[] = [];
				const programs: WebGLProgram[] = [];
				groups.push(shaders);
				programGroups.push(programs);
				for (let pass = 0; pass < sources[group].length; pass++) {
					const url = urls?.[group]?.[pass];
					const details: ShaderDetails = { ...(multipass ? { group, pass } : {}), ...(url ? { url } : {}) };
					const result = createShaderFromSource(this.gl, this.gl.FRAGMENT_SHADER, sources[group][pass], details);
					if (result.error) throw result.error;
					shaders.push(result.data);
					const program = this.gl.createProgram();
					if (!program) {
						throw new OffscreenWebGLError(this.gl.isContextLost() ? 'context-lost' : 'link', 'Failed to create WebGL program');
					}
					programs.push(program);
					this.gl.attachShader(program, this.vertexShader!);
					this.gl.attachShader(program, result.data);
					this.gl.linkProgram(program);
					if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
						const log = (this.gl.getProgramInfoLog(program) || '').trim();
						throw new OffscreenWebGLError('link', `${shaderLabel('fragment', details)} failed to link:\n${log}`);
					}
				}
			}
		} catch (error) {
			for (const group of groups) for (const shader of group) this.gl.deleteShader(shader);
			for (const group of programGroups) for (const program of group) this.gl.deleteProgram(program);
			return err(OffscreenWebGLError.from(error));
		}
		return ok({ shaders: groups, programs: programGroups });
	}

	private releasePrograms(): void {
		for (const group of this.fragmentShaderGroups || []) for (const shader of group) this.gl.deleteShader(shader);
		for (const group of this.shaderPrograms || []) for (const program of group) this.gl.deleteProgram(program);
		this.quadBuffers.forEach((buffer) => this.gl.deleteBuffer(buffer));
		this.quadBuffers.clear();
		this.quadRequested = false;
		this.programUniformStates.clear();
		this.uniformLocations.clear();
		this.positionLocations.clear();
	}

	public setRemoteFragmentShaderGroups(urlGroups: string[][]): Promise<Result<WebGLManager>> {
		const multipass = isMultipass(urlGroups);
		return Promise.all(
			urlGroups.map((urls, group) =>
				Promise.all(urls.map((url, pass) => fetchShaderSource(url, 'fragment', multipass ? { group, pass } : {})))
			)
		).then(
			(sources) => this.applyFragmentShaderGroups(sources, urlGroups),
			(error) => err(OffscreenWebGLError.from(error, 'fetch'))
		);
	}

	private isLost(): boolean {
		return !this.gl || this.gl.isContextLost();
	}

	public restoreContext(): Result<WebGLManager> {
		this.vertexShader = null;
		this.fragmentShaderGroups = null;
		this.shaderPrograms = null;
		this.framebuffers = null;
		this.quadBuffers.clear();
		this.programUniformStates.clear();
		this.uniformLocations.clear();
		this.positionLocations.clear();
		this.programLinked = false;
		if (this.vertexSource !== null) {
			const result = this.applyVertexShader(this.vertexSource, this.vertexURL);
			if (result.error) return result;
		}
		if (this.fragmentSources) {
			const quadRequested = this.quadRequested;
			const result = this.applyFragmentShaderGroups(this.fragmentSources, this.fragmentURLs);
			if (result.error) return result;
			if (quadRequested) {
				const quad = this.setupWholeScreenQuad();
				if (quad.error) return err(quad.error);
			}
		}
		if (this.usesPingPongGroups) {
			const result = this.setupPingPongBuffers(this.width, this.height);
			if (result.error) return result;
		}
		this.reportedErrors.clear();
		return this.paintCanvas();
	}

	public paintCanvas(): Result<WebGLManager> {
		this.consumeUniformStream();
		this.streamNeedsPaint = false;
		if (this.isLost()) return ok(this);
		if (this.shaderPrograms && this.fragmentShaderGroups) {
			if (this.canvas.width < this.width || this.canvas.height < this.height) WebGLManager.fitCanvas(this.canvas);
			const result = this.renderWithFragmentShaderGroups();
			if (!result.error) this.onPaint?.(this.width, this.height);
			return result;
		}

		return ok(this);
	}

	private setupPingPongBuffers(width: number, height: number): Result<WebGLManager> {
		try {
			if (this.framebuffers) {
				// Resize existing framebuffers
				for (const fbo of this.framebuffers) {
					fbo.resize(width, height);
				}
			} else {
				// Create new framebuffers
				this.framebuffers = [new FrameBufferObject(this.gl, width, height), new FrameBufferObject(this.gl, width, height)];
			}
			return ok(this);
		} catch (e) {
			return err(new Error(`[OffscreenCanvas @ GLManager] Error setting up ping-pong buffers: ${e}`));
		}
	}

	private drawArrays(): Result<WebGLManager> {
		this.gl?.drawArrays(this.gl?.TRIANGLE_FAN, 0, 4);
		return ok(this);
	}

	public renderWithFragmentShaderGroups(): Result<WebGLManager> {
		if (!this.fragmentShaderGroups || !this.shaderPrograms) {
			return err(new Error('[OffscreenCanvas @ GLManager] Missing framebuffers, fragment shader groups, or programs'));
		}

		// Expect framebuffers to be initialized for subgroups groups >= 2
		let [ping, pong] = this.framebuffers || [];
		const scissorEnabled = this.gl.isEnabled(this.gl.SCISSOR_TEST);
		const scissorBox: Int32Array = this.gl.getParameter(this.gl.SCISSOR_BOX);
		this.gl.enable(this.gl.SCISSOR_TEST);
		this.gl.scissor(0, 0, this.width, this.height);

		try {
			this.renderPasses(ping, pong);
		} finally {
			if (!scissorEnabled) this.gl.disable(this.gl.SCISSOR_TEST);
			this.gl.scissor(scissorBox[0], scissorBox[1], scissorBox[2], scissorBox[3]);
		}

		return ok(this);
	}

	private renderPasses(ping: FrameBufferObject | undefined, pong: FrameBufferObject | undefined): void {
		if (!this.fragmentShaderGroups || !this.shaderPrograms) return;
		for (let groupIndex = 0; groupIndex < this.fragmentShaderGroups.length; groupIndex++) {
			const group = this.fragmentShaderGroups[groupIndex];
			const programGroup = this.shaderPrograms[groupIndex];
			const isLastGroup = groupIndex === this.fragmentShaderGroups.length - 1;

			for (let shaderIndex = 0; shaderIndex < group.length; shaderIndex++) {
				const program = programGroup[shaderIndex];
				const isLastShaderInGroup = shaderIndex === group.length - 1;

				// For the last shader in the last group, render to canvas (null framebuffer)
				// For the last shader in other groups, render to pong buffer for next group
				// For other shaders, ping-pong within the group
				let targetFramebuffer: WebGLFramebuffer | null;
				if (isLastGroup && isLastShaderInGroup) {
					targetFramebuffer = null; // Render to canvas
				} else if (isLastShaderInGroup) {
					targetFramebuffer = pong?.framebuffer || null; // Prepare output for next group
				} else {
					targetFramebuffer = pong?.framebuffer || null; // Ping-pong within group
				}

				this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, targetFramebuffer);
				this.gl.viewport(0, 0, this.width, this.height);
				this.gl.clear(this.gl.COLOR_BUFFER_BIT);

				this.gl.useProgram(program);
				const buffer = this.quadBuffers.get(program);
				if (buffer) {
					let position = this.positionLocations.get(program);
					if (position === undefined) {
						position = this.gl.getAttribLocation(program, 'v_position');
						this.positionLocations.set(program, position);
					}
					this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
					this.gl.vertexAttribPointer(position, 3, this.gl.FLOAT, false, 0, 0);
					this.gl.enableVertexAttribArray(position);
				}
				this.gl.activeTexture(this.gl.TEXTURE0);
				this.setUniformsForProgram(program);
				this.gl.bindTexture(this.gl.TEXTURE_2D, ping?.texture || null);
				this.drawArrays();

				// Swap ping and pong for next iteration
				[ping, pong] = [pong, ping];
			}
		}
	}

	private static fitCanvas(canvas: HTMLCanvasElement): void {
		let width = 1;
		let height = 1;
		WebGLManager.liveManagers.get(canvas)?.forEach((manager) => {
			if (!manager.shaderPrograms) return;
			width = Math.max(width, manager.width);
			height = Math.max(height, manager.height);
		});
		if (canvas.width * canvas.height > 2 * width * height) {
			canvas.width = width;
			canvas.height = height;
		} else if (canvas.width < width || canvas.height < height) {
			canvas.width = Math.max(canvas.width, width);
			canvas.height = Math.max(canvas.height, height);
		}
	}

	public resize(width: number, height: number): Result<WebGLManager> {
		this.width = width;
		this.height = height;
		WebGLManager.fitCanvas(this.canvas);
		if (this.usesPingPongGroups && !this.isLost()) {
			const result = this.setupPingPongBuffers(width, height);
			if (result.error) return result;
		}
		return this.paintCanvas();
	}

	public setupWholeScreenQuad(): Result<WebGLBuffer | null> {
		if (!this.fragmentSources) {
			return err(new Error('[OffscreenCanvas @ GLManager] No program available to setup quad'));
		}
		this.quadRequested = true;
		if (!this.shaderPrograms) return ok(null);

		const buffers = [];
		for (const programGroup of this.shaderPrograms) {
			for (const program of programGroup) {
				const buffer = createWholeScreenQuad(this.gl, program);
				this.quadBuffers.set(program, buffer);
				buffers.push(buffer);
			}
		}

		return ok(buffers[0]);
	}

	private setUniformsForProgram(program: WebGLProgram): void {
		let appliedVersions = this.programUniformStates.get(program);
		if (!appliedVersions) {
			appliedVersions = {};
			this.programUniformStates.set(program, appliedVersions);
		}
		let locations = this.uniformLocations.get(program);
		if (!locations) {
			locations = {};
			this.uniformLocations.set(program, locations);
		}

		for (const key in this.uniformValues) {
			const uniformName = key as WebGLUniformName;
			const version = this.uniformVersions[uniformName];
			if (appliedVersions[uniformName] === version) continue;
			appliedVersions[uniformName] = version;

			let location = locations[uniformName];
			if (location === undefined) {
				location = this.gl.getUniformLocation(program, uniformName);
				locations[uniformName] = location;
			}
			if (!location) continue;

			const value = this.uniformValues[uniformName];
			if (Array.isArray(value)) {
				setFloatUniforms(this.gl, location, ...value);
			} else {
				setFloatUniforms(this.gl, location, value);
			}
		}
	}

	public updateUniform(uniform: WebGLUniformName, value: number | number[]): Result<WebGLManager> {
		this.uniformValues[uniform] = Array.isArray(value) ? [...value] : value;
		this.uniformVersions[uniform] = ++this.uniformVersion;
		return ok(this);
	}

	public updateUniforms(values: Record<WebGLUniformName, number | number[]>): Result<WebGLManager> {
		for (const [uniform, value] of Object.entries(values)) this.updateUniform(uniform as WebGLUniformName, value);
		return ok(this);
	}

	public setUniformStream(stream: SharedUniformStream | null): void {
		this.readUniformStream = stream ? createUniformStreamReader(stream) : null;
		this.streamNeedsPaint = false;
	}

	private consumeUniformStream(): void {
		const values = this.readUniformStream?.();
		if (!values) return;
		this.updateUniforms(values);
		this.streamNeedsPaint = true;
	}

	public checkWebGLVitals(): Result<WebGLManager> {
		if (!this.gl) {
			return err(new Error('[OffscreenCanvas @ GLManager] WebGL context not available'));
		}
		if (!this.programLinked) {
			return err(new Error('[OffscreenCanvas @ GLManager] No shader program linked'));
		}
		const e = this.gl.getError();
		if (e == this.gl.NO_ERROR) {
			return ok(this);
		} else {
			return err(new Error(`[OffscreenCanvas @ GLManager] WebGL error: ${e}`));
		}
	}

	public getGLContext(): WebGLRenderingContext {
		if (!this.gl) {
			throw new Error('[OffscreenCanvas @ GLManager] WebGL context not available');
		}
		return this.gl;
	}

	public getProgram(): WebGLProgram {
		const programs = this.shaderPrograms?.[this.shaderPrograms.length - 1];
		const program = programs?.[programs.length - 1];
		if (!program) {
			throw new Error('[OffscreenCanvas @ GLManager] WebGL program not available');
		}
		return program;
	}

	public runOnContext(key: string, fn: RunOnWorkerContextFn, onEachFrame: boolean = false): any {
		if (onEachFrame) {
			this.onEachFrameFunctions[key] = fn;
			this.reportedErrors.delete(`callback:${key}`);
		} else {
			return fn(this, this.frame, this.timeElapsed);
		}
		return;
	}

	public setFrameRate(frameRate: number): Result<WebGLManager> {
		if (frameRate <= 0) {
			return err(new Error('[OffscreenCanvas @ GLManager] Frame rate must be greater than 0'));
		}
		const interval = 1000 / frameRate;
		if (this.frameTask) {
			this.frameTask.interval = interval;
			return ok(this);
		}
		this.frameTask = scheduleFrames(interval, (now) => {
			this.startTime ??= now;
			if (this.isLost()) return;
			this.frame++;
			this.timeElapsed = now - this.startTime;
			this.consumeUniformStream();
			for (const [key, fn] of Object.entries(this.onEachFrameFunctions)) this.runFrameCallback(key, fn);
			if (!this.streamNeedsPaint) return;
			try {
				const { error } = this.paintCanvas();
				if (error) this.reportOnce('paint', OffscreenWebGLError.from(error));
			} catch (error) {
				this.reportOnce('paint', OffscreenWebGLError.from(error));
			}
		});
		return ok(this);
	}

	private runFrameCallback(key: string, fn: RunOnWorkerContextFn): void {
		const report = (error: unknown) => this.reportOnce(`callback:${key}`, new OffscreenWebGLError('callback', `${key} threw`, error));
		try {
			const result = fn(this, this.frame, this.timeElapsed);
			if (result && typeof result.then === 'function') result.then(undefined, report);
		} catch (error) {
			report(error);
		}
	}

	private reportOnce(key: string, error: OffscreenWebGLError): void {
		const signature = `${error.message}:${error.cause instanceof Error ? error.cause.message : String(error.cause)}`;
		if (this.reportedErrors.get(key) === signature) return;
		this.reportedErrors.set(key, signature);
		this.onError?.(error);
	}
}

class FrameBufferObject {
	public framebuffer: WebGLFramebuffer;
	public texture: WebGLTexture;

	constructor(
		private gl: WebGLRenderingContext,
		public width: number,
		public height: number
	) {
		this.framebuffer = this.gl.createFramebuffer()!;
		this.texture = this.gl.createTexture()!;

		if (!this.framebuffer || !this.texture) {
			throw new Error('[OffscreenCanvas @ FrameBufferObject] Failed to create Framebuffer Object');
		}

		this.setupTexture();
		this.setupFramebuffer();
	}

	private setupTexture(): void {
		this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
		this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.width, this.height, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, null);
		this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
		this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
		this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
		this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
	}

	private setupFramebuffer(): void {
		this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
		this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, this.texture, 0);

		if (this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER) !== this.gl.FRAMEBUFFER_COMPLETE) {
			this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
			this.gl.deleteFramebuffer(this.framebuffer);
			this.gl.deleteTexture(this.texture);
			throw new Error('[OffscreenCanvas @ FrameBufferObject] Framebuffer is not complete');
		}

		this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
	}

	public resize(width: number, height: number): void {
		this.width = width;
		this.height = height;
		this.setupTexture();
		this.setupFramebuffer();
	}

	public destroy(): void {
		this.gl.deleteFramebuffer(this.framebuffer);
		this.gl.deleteTexture(this.texture);
	}

	public bind(): void {
		this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
		this.gl.viewport(0, 0, this.width, this.height);
	}
}
