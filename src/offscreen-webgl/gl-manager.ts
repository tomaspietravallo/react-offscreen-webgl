import { err, ok, Result } from '../utils/try-catch';
import { createShaderFromSource, createWholeScreenQuad, setFloatUniforms } from '../utils/webgl';

export type WebGLUniformName = `u_${string}`;

export class WebGLManager {
	public isReady: boolean = false;
	private canvas: HTMLCanvasElement;
	private gl: WebGLRenderingContext;
	private program: WebGLProgram | null = null;
	private vertexShader: WebGLShader | null = null;
	private fragmentShaders: WebGLShader[] | null = null;
	private uniforms: Record<WebGLUniformName, WebGLUniformLocation | null> = {};

	private constructor(props: { canvas: HTMLCanvasElement }) {
		this.canvas = props.canvas;
		this.gl = this.canvas.getContext('webgl')!;

		if (!this.gl) {
			throw new Error('[OffscreenCanvas @ GLManager] WebGL not supported');
		}

		this.program = this.gl.createProgram();
		if (!this.program) {
			throw new Error('[OffscreenCanvas @ GLManager] Failed to create WebGL program');
		}
	}

	static fromHTMLCanvasElement(canvas: HTMLCanvasElement): Result<WebGLManager> {
		try {
			return ok(new WebGLManager({ canvas }));
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
		} catch (e) {
			console.error('[OffscreenCanvas @ GLManager] Error during cleanup', e);
			return err(new Error(`[OffscreenCanvas @ GLManager] Cleanup failed: ${e}`));
		}
		this.gl = null as any;
		return ok(this);
	}

	public compileProgram(vertexShaderSource: string, fragmentShaderSources: string[]): Result<WebGLManager> {
		const { data: vertexShader, error: vertexShaderErr } = createShaderFromSource(this.gl, this.gl.VERTEX_SHADER, vertexShaderSource);

		if (vertexShaderErr) {
			return err(new Error(`[OffscreenCanvas @ GLManager] Failed to compile Vertex Shader: ${vertexShaderErr}`));
		} else this.vertexShader = vertexShader;

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

	public useProgram(): Result<WebGLManager> {
		if (!this.program) {
			throw new Error('[OffscreenCanvas @ GLManager] No program available to use');
		}

		this.gl.attachShader(this.program, this.vertexShader!);

		for (const shader of this.fragmentShaders!) {
			this.gl.attachShader(this.program, shader);
		}

		this.gl.linkProgram(this.program);

		if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
			const error = this.gl.getProgramInfoLog(this.program);
			this.gl.deleteProgram(this.program);
			return err(new Error(`[OffscreenCanvas @ GLManager] Program linking failed: ${error}`));
		}

		this.gl.useProgram(this.program);
		this.isReady = true;
		return ok(this);
	}

	public resize(width: number, height: number): Result<WebGLManager> {
		this.canvas.width = width;
		this.canvas.height = height;
		this.gl.viewport(0, 0, width, height);
		return ok(this);
	}

	public paintCanvas(): Result<WebGLManager> {
		this.gl?.drawArrays(this.gl?.TRIANGLE_FAN, 0, 4);
		return ok(this);
	}

	public setupWholeScreenQuad(): Result<WebGLBuffer> {
		if (!this.program) {
			return err(new Error('[OffscreenCanvas @ GLManager] No program available to setup quad'));
		}

		return ok(createWholeScreenQuad(this.gl, this.program));
	}

	public updateUniform(uniform: WebGLUniformName, value: number | number[]): Result<WebGLManager> {
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
}
