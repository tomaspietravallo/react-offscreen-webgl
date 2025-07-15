import { err, ok, Result } from '../utils/try-catch';
import { createShaderFromSource, createWholeScreenQuad, setFloatUniforms } from '../utils/webgl';
import { WorkerMessages } from './webgl.worker';

export type WebGLUniformName = `u_${string}`;

export type RunOnWorkerContextFnName = `f_${string}`;

export type RunOnWorkerContextFn<T = any> = (manager: WebGLManager, frame: number, timeElapsed: number) => T;

export class WebGLManager {
	public static readonly DEFAULT_FRAME_RATE = 30;
	private frame: number = 0;
	private timeElapsed: number = 0;
	private onEachFrameFunctions: Record<string, RunOnWorkerContextFn> = {};
	private canvas: HTMLCanvasElement;
	private gl: WebGLRenderingContext;
	private program: WebGLProgram | null = null;
	private vertexShader: WebGLShader | null = null;
	private fragmentShaders: WebGLShader[] | null = null;
	private uniforms: Record<WebGLUniformName, WebGLUniformLocation | null> = {};
	private interval: number | null = null;

	private framebuffers: [FrameBufferObject, FrameBufferObject] | null = null;

	private fragmentShaderGroups: WebGLShader[][] | null = null;
	private shaderPrograms: WebGLProgram[][] | null = null;
	private uniformValues: Record<WebGLUniformName, number | number[]> = {};
	private programUniformStates: Map<WebGLProgram, Record<WebGLUniformName, number | number[]>> = new Map();

	public constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas;
		this.gl = this.canvas.getContext('webgl')! as WebGLRenderingContext;

		if (!this.gl) {
			throw new Error('[OffscreenCanvas @ GLManager] WebGL not supported');
		}

		this.program = this.gl.createProgram();
		if (!this.program) {
			throw new Error('[OffscreenCanvas @ GLManager] Failed to create WebGL program');
		}

		return new Proxy(this, {
			get: (target, prop, receiver) => {
				if (prop.toString().endsWith('Async')) {
					const originalMethod = target[prop.toString().slice(0, -5) as keyof WebGLManager] as (...args: any[]) => any;
					// @ts-expect-error Target prototype signature
					return async (...args: any[]) => target[prop.toString().slice(0, -5) as keyof WebGLManager](args);
				}
				return Reflect.get(target, prop, receiver);
			},
		});
	}

	static fromHTMLCanvasElement(canvas: HTMLCanvasElement): Result<WebGLManager> {
		try {
			return ok(new WebGLManager(canvas));
		} catch (e) {
			console.error('[OffscreenCanvas @ GLManager] Error creating GLManager from HTMLCanvasElement', e);
			return err(e as Error);
		}
	}

	public destroy(): Result<WebGLManager> {
		try {
			if (this.program) {
				if (this.vertexShader) {
					this.gl.detachShader(this.program, this.vertexShader);
				}
				if (this.fragmentShaders) {
					for (const shader of this.fragmentShaders) {
						this.gl.detachShader(this.program, shader);
					}
				}
				this.gl.deleteProgram(this.program);
				this.program = null;
			}
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
			this.programUniformStates.clear();
		} catch (e) {
			console.error('[OffscreenCanvas @ GLManager] Error during cleanup', e);
			return err(new Error(`[OffscreenCanvas @ GLManager] Cleanup failed: ${e}`));
		}
		this.gl = null as any;
		return ok(this);
	}

	public setVertexShader(vertexShaderSource: string): Result<WebGLManager> {
		const { data: vertexShader, error: vertexShaderErr } = createShaderFromSource(this.gl, this.gl.VERTEX_SHADER, vertexShaderSource);

		if (vertexShaderErr) {
			return err(new Error(`[OffscreenCanvas @ GLManager] Failed to compile Vertex Shader: ${vertexShaderErr}`));
		} else {
			this.vertexShader = vertexShader;
		}

		return ok(this);
	}

	public setFragmentShaders(fragmentShaderSources: string[]): Result<WebGLManager> {
		const fs = [];

		try {
			for (const source of fragmentShaderSources) {
				const { data: fragmentShader, error: fragmentShaderErr } = createShaderFromSource(this.gl, this.gl.FRAGMENT_SHADER, source);
				if (fragmentShaderErr) {
					throw err(new Error(`[OffscreenCanvas @ GLManager] Failed to compile Fragment Shader: ${fragmentShaderErr}`));
				}
				fs.push(fragmentShader);
			}
		} catch (e) {
			for (const shader of fs) {
				this.gl.deleteShader(shader);
			}
			return err(e as Error);
		} finally {
			this.fragmentShaders = fs;
		}

		return ok(this);
	}

	public setRemoteVertexShader(url: string): Promise<Result<WebGLManager>> {
		return fetch(url)
			.then((response) => {
				if (!response.ok) {
					throw new Error(`[OffscreenCanvas @ GLManager] Failed to fetch vertex shader from ${url}`);
				}
				return response.text();
			})
			.then((shaderText) => {
				return this.setVertexShader(shaderText);
			})
			.catch((error) => err(new Error(`[OffscreenCanvas @ GLManager] Error fetching vertex shader: ${error.message}`)));
	}

	public setRemoteFragmentShaders(urls: string | string[]): Promise<Result<WebGLManager>> {
		if (typeof urls === 'string') {
			urls = [urls];
		}

		const fetchPromises = urls.map((url) =>
			fetch(url)
				.then(async (response) => {
					if (!response.ok) {
						throw new Error(`[OffscreenCanvas @ GLManager] Failed to fetch fragment shader from ${url}`);
					}
					return ok(await response.text());
				})
				.catch((error) => err(new Error(`[OffscreenCanvas @ GLManager] Error fetching fragment shader: ${error.message}`)))
		);

		return Promise.all(fetchPromises)
			.then((results) => {
				const errors = results.filter((result) => result.error);
				if (errors.length > 0) {
					return err(
						new Error(
							`[OffscreenCanvas @ GLManager] Errors fetching fragment shaders: ${errors.map((e) => e.error?.message).join(', ')}`
						)
					);
				}
				const fragmentShaderSources = results.map((result) => result.data!);
				return this.setFragmentShaders(fragmentShaderSources);
			})
			.catch((error) => {
				return err(new Error(`[OffscreenCanvas @ GLManager] Error setting remote fragment shaders: ${error.message}`));
			});
	}

	public setFragmentShaderGroups(fragmentShaderGroupSources: string[][]): Result<WebGLManager> {
		const groups = [];
		const programGroups = [];

		try {
			for (const groupSources of fragmentShaderGroupSources) {
				const group = [];
				const programGroup = [];
				for (const source of groupSources) {
					const { data: fragmentShader, error: fragmentShaderErr } = createShaderFromSource(
						this.gl,
						this.gl.FRAGMENT_SHADER,
						source
					);
					if (fragmentShaderErr) {
						throw err(new Error(`[OffscreenCanvas @ GLManager] Failed to compile Fragment Shader: ${fragmentShaderErr}`));
					}

					// Create a program for each shader
					const program = this.gl.createProgram();
					if (!program) {
						throw new Error('[OffscreenCanvas @ GLManager] Failed to create WebGL program');
					}

					this.gl.attachShader(program, this.vertexShader!);
					this.gl.attachShader(program, fragmentShader);
					this.gl.linkProgram(program);

					if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
						const error = this.gl.getProgramInfoLog(program);
						this.gl.deleteProgram(program);
						throw new Error(`[OffscreenCanvas @ GLManager] Program linking failed: ${error}`);
					}

					group.push(fragmentShader);
					programGroup.push(program);
				}
				groups.push(group);
				programGroups.push(programGroup);
			}
		} catch (e) {
			for (const group of groups) {
				for (const shader of group) {
					this.gl.deleteShader(shader);
				}
			}
			for (const programGroup of programGroups) {
				for (const program of programGroup) {
					this.gl.deleteProgram(program);
				}
			}
			return err(e as Error);
		} finally {
			this.fragmentShaderGroups = groups;
			this.shaderPrograms = programGroups;
		}

		return ok(this);
	}

	public setRemoteFragmentShaderGroups(urlGroups: string[][]): Promise<Result<WebGLManager>> {
		const fetchGroupPromises = urlGroups.map((urls) => {
			const fetchPromises = urls.map((url) =>
				fetch(url)
					.then(async (response) => {
						if (!response.ok) {
							throw new Error(`[OffscreenCanvas @ GLManager] Failed to fetch fragment shader from ${url}`);
						}
						return ok(await response.text());
					})
					.catch((error) => err(new Error(`[OffscreenCanvas @ GLManager] Error fetching fragment shader: ${error.message}`)))
			);
			return Promise.all(fetchPromises);
		});

		return Promise.all(fetchGroupPromises)
			.then((groupResults) => {
				const allErrors = groupResults.flat().filter((result) => result.error);
				if (allErrors.length > 0) {
					return err(
						new Error(
							`[OffscreenCanvas @ GLManager] Errors fetching fragment shaders: ${allErrors.map((e) => e.error?.message).join(', ')}`
						)
					);
				}
				const fragmentShaderGroupSources = groupResults.map((groupResults) => groupResults.map((result) => result.data!));
				return this.setFragmentShaderGroups(fragmentShaderGroupSources);
			})
			.catch((error) => {
				return err(new Error(`[OffscreenCanvas @ GLManager] Error setting remote fragment shader groups: ${error.message}`));
			});
	}

	public useProgram(): Result<WebGLManager> {
		if (!this.program) {
			throw new Error('[OffscreenCanvas @ GLManager] No program available to use');
		}

		this.gl.attachShader(this.program, this.vertexShader!);

		if (this.fragmentShaders) {
			for (const shader of this.fragmentShaders) {
				this.gl.attachShader(this.program, shader);
			}
		}

		this.gl.linkProgram(this.program);

		if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
			const error = this.gl.getProgramInfoLog(this.program);
			this.gl.deleteProgram(this.program);
			return err(new Error(`[OffscreenCanvas @ GLManager] Program linking failed: ${error}`));
		}

		this.gl.useProgram(this.program);

		// this.setFrameRate(WebGLManager.DEFAULT_FRAME_RATE);

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

	public renderWithFragmentShaders(): Result<WebGLManager> {
		if (!this.framebuffers || !this.fragmentShaders) {
			return err(new Error('[OffscreenCanvas @ GLManager] Missing framebuffers or fragment shaders'));
		}

		let [ping, pong] = this.framebuffers;

		for (let i = 0; i < this.fragmentShaders.length; i++) {
			const shader = this.fragmentShaders[i];
			const targetFramebuffer = i === this.fragmentShaders.length - 1 ? null : pong.framebuffer;

			this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, targetFramebuffer);
			this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
			this.gl.clear(this.gl.COLOR_BUFFER_BIT);

			this.gl.useProgram(this.program!);
			this.gl.attachShader(this.program!, shader);
			this.gl.linkProgram(this.program!);

			if (!this.gl.getProgramParameter(this.program!, this.gl.LINK_STATUS)) {
				const error = this.gl.getProgramInfoLog(this.program!);
				return err(new Error(`[OffscreenCanvas @ GLManager] Program linking failed: ${error}`));
			}

			this.gl.bindTexture(this.gl.TEXTURE_2D, ping.texture);
			this.paintCanvas();

			// Swap ping and pong
			[ping, pong] = [pong, ping];
		}

		return ok(this);
	}

	public paintCanvas(): Result<WebGLManager> {
		// If using shader groups, render with those instead
		if (this.shaderPrograms && this.fragmentShaderGroups) {
			return this.renderWithFragmentShaderGroups();
		}

		// For single program mode, just draw
		return this.drawArrays();
	}

	private drawArrays(): Result<WebGLManager> {
		this.gl?.drawArrays(this.gl?.TRIANGLE_FAN, 0, 4);
		return ok(this);
	}

	public renderWithFragmentShaderGroups(): Result<WebGLManager> {
		if (!this.framebuffers || !this.fragmentShaderGroups || !this.shaderPrograms) {
			return err(new Error('[OffscreenCanvas @ GLManager] Missing framebuffers, fragment shader groups, or programs'));
		}

		let [ping, pong] = this.framebuffers;

		for (let groupIndex = 0; groupIndex < this.fragmentShaderGroups.length; groupIndex++) {
			const group = this.fragmentShaderGroups[groupIndex];
			const programGroup = this.shaderPrograms[groupIndex];
			const isLastGroup = groupIndex === this.fragmentShaderGroups.length - 1;

			for (let shaderIndex = 0; shaderIndex < group.length; shaderIndex++) {
				const program = programGroup[shaderIndex];
				const isLastShaderInGroup = shaderIndex === group.length - 1;
				const isFirstRender = !this.programUniformStates.has(program);

				// For the last shader in the last group, render to canvas (null framebuffer)
				// For the last shader in other groups, render to pong buffer for next group
				// For other shaders, ping-pong within the group
				let targetFramebuffer: WebGLFramebuffer | null;
				if (isLastGroup && isLastShaderInGroup) {
					targetFramebuffer = null; // Render to canvas
				} else if (isLastShaderInGroup) {
					targetFramebuffer = pong.framebuffer; // Prepare output for next group
				} else {
					targetFramebuffer = pong.framebuffer; // Ping-pong within group
				}

				this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, targetFramebuffer);
				this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
				this.gl.clear(this.gl.COLOR_BUFFER_BIT);

				this.gl.useProgram(program);
				this.setUniformsForProgram(program, isFirstRender);
				this.gl.bindTexture(this.gl.TEXTURE_2D, ping.texture);
				this.drawArrays();

				// Swap ping and pong for next iteration
				[ping, pong] = [pong, ping];
			}
		}

		return ok(this);
	}

	public resize(width: number, height: number): Result<WebGLManager> {
		this.canvas.width = width;
		this.canvas.height = height;
		this.gl.viewport(0, 0, width, height);
		this.setupPingPongBuffers(width, height);
		this.paintCanvas();
		return ok(this);
	}

	public setupWholeScreenQuad(): Result<WebGLBuffer> {
		if (!this.program) {
			return err(new Error('[OffscreenCanvas @ GLManager] No program available to setup quad'));
		}

		// For fragment shader groups, create a quad for each program
		if (this.shaderPrograms) {
			const buffers = [];

			for (const programGroup of this.shaderPrograms) {
				for (const program of programGroup) {
					const buffer = createWholeScreenQuad(this.gl, program);
					buffers.push(buffer);
				}
			}

			return ok(buffers[0]);
		} else return ok(createWholeScreenQuad(this.gl, this.program));
	}

	private setUniformsForProgram(program: WebGLProgram, forceUpdate: boolean = false): void {
		const currentState = this.programUniformStates.get(program) || {};

		for (const [uniformName, value] of Object.entries(this.uniformValues)) {
			const hasChanged = forceUpdate || JSON.stringify(currentState[uniformName as WebGLUniformName]) !== JSON.stringify(value);

			if (hasChanged) {
				const location = this.gl.getUniformLocation(program, uniformName);
				if (location) {
					if (Array.isArray(value)) {
						setFloatUniforms(this.gl, location, ...value);
					} else {
						setFloatUniforms(this.gl, location, value);
					}
					currentState[uniformName as WebGLUniformName] = Array.isArray(value) ? [...value] : value;
				}
			}
		}

		this.programUniformStates.set(program, currentState);
	}

	public updateUniform(uniform: WebGLUniformName, value: number | number[]): Result<WebGLManager> {
		// Store the uniform value for shader groups
		this.uniformValues[uniform] = Array.isArray(value) ? [...value] : value;

		// If using shader groups, don't set uniforms immediately
		if (this.shaderPrograms) {
			return ok(this);
		}

		// For single program mode, set the uniform immediately
		if (!this.program) {
			return err(new Error('[OffscreenCanvas @ GLManager] No program available to update uniform'));
		}

		if (!this.uniforms[uniform]) {
			const location = this.gl.getUniformLocation(this.program, uniform);

			if (!location) {
				return err(new Error(`[OffscreenCanvas @ GLManager] Uniform ${uniform} not found`));
			} else {
				this.uniforms[uniform] = location;
			}
		}

		if (Array.isArray(value)) {
			setFloatUniforms(this.gl, this.uniforms[uniform], ...value);
		} else {
			setFloatUniforms(this.gl, this.uniforms[uniform], value);
		}

		return ok(this);
	}

	public checkWebGLVitals(): Result<WebGLManager> {
		if (!this.gl) {
			return err(new Error('[OffscreenCanvas @ GLManager] WebGL context not available'));
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
		if (!this.program) {
			throw new Error('[OffscreenCanvas @ GLManager] WebGL program not available');
		}
		return this.program;
	}

	public runOnContext(key: string, fn: RunOnWorkerContextFn, onEachFrame: boolean = false): any {
		if (onEachFrame) {
			this.onEachFrameFunctions[key] = fn;
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
		if (this.interval) {
			clearInterval(this.interval);
		}
		this.interval = setInterval(() => {
			this.frame++;
			this.timeElapsed += interval;
			let arr = Object.values(this.onEachFrameFunctions);

			for (let i = 0; i < arr.length; i++) {
				arr[i](this, this.frame, this.timeElapsed);
			}
		}, interval);
		return ok(this);
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

	public bind(): void {
		this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
		this.gl.viewport(0, 0, this.width, this.height);
	}
}
