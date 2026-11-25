import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { WebGLManager } from '../../src/offscreen-webgl/gl-manager';
import { DEFAULT_VS_SHADER } from '../../src/defaults';
import { OffscreenWebGLError } from '../../src/offscreen-webgl/errors';

// ── Shader sources used in tests ──────────────────────────────────────────────

const SOLID_RED_FS = `
  precision highp float;
  void main() {
    gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
  }
`;

const UV_GRADIENT_FS = `
  precision highp float;
  uniform vec2 u_resolution;
  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    gl_FragColor = vec4(uv.x, uv.y, 0.0, 1.0);
  }
`;

const UNIFORM_COLOR_FS = `
  precision highp float;
  uniform vec3 u_color;
  void main() {
    gl_FragColor = vec4(u_color, 1.0);
  }
`;

const INVALID_FS = `this is not valid GLSL!`;

const UNDECLARED_FS = `
  precision highp float;
  void main() {
    gl_FragColor = vec4(missing, 1.0);
  }
`;

const UNDECLARED_VARYING_FS = `
  precision highp float;
  varying vec2 v_uv;
  void main() {
    gl_FragColor = vec4(v_uv, 0.0, 1.0);
  }
`;

// Pass 1: renders solid red into FBO_B
const PINGPONG_PASS1_FS = `
  precision highp float;
  void main() {
    gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
  }
`;

// Pass 2: reads FBO_B via sampler2D (unit 0 = ping texture after swap),
// uses the red channel as the blue output → canvas should be [0, 0, 255, 255]
const PINGPONG_PASS2_FS = `
  precision highp float;
  uniform sampler2D u_buffer0;
  void main() {
    float r = texture2D(u_buffer0, vec2(0.5, 0.5)).r;
    gl_FragColor = vec4(0.0, 0.0, r, 1.0);
  }
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function readPixel(gl: WebGLRenderingContext, x: number, y: number): [number, number, number, number] {
	const buf = new Uint8Array(4);
	gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
	return [buf[0], buf[1], buf[2], buf[3]];
}

/** Assert a pixel is within ±tolerance of the expected RGBA values. */
function expectPixelNear(actual: [number, number, number, number], expected: [number, number, number, number], tolerance = 2) {
	for (let i = 0; i < 4; i++) {
		expect(Math.abs(actual[i] - expected[i])).toBeLessThanOrEqual(
			tolerance,
			`channel ${i}: got ${actual[i]}, expected ${expected[i]} ±${tolerance}`
		);
	}
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('WebGLManager (browser)', () => {
	let canvas: HTMLCanvasElement;
	let manager: WebGLManager | null = null;

	beforeAll(() => {
		// Remove canvases left over from the previous watch-mode run.
		document.querySelectorAll('[data-vitest-canvas]').forEach((el) => el.remove());
	});

	beforeEach((ctx) => {
		canvas = document.createElement('canvas');
		canvas.width = 4;
		canvas.height = 4;

		// Pre-initialise the WebGL context with preserveDrawingBuffer: true so the
		// rendered pixels stay visible after compositing (headed mode inspection).
		// WebGLManager calls getContext('webgl') with no attributes, which reuses this
		// already-created context and inherits the preserveDrawingBuffer setting.
		canvas.getContext('webgl', { preserveDrawingBuffer: true });

		// Scale each 4×4 canvas up 48× so individual pixels are visible.
		canvas.style.cssText = `
			width: 192px; height: 192px;
			image-rendering: pixelated;
			margin: 8px; outline: 1px solid #555;
			vertical-align: top;
		`;

		const wrapper = document.createElement('div');
		wrapper.setAttribute('data-vitest-canvas', ctx.task.name);
		wrapper.style.cssText = 'display: inline-block; margin: 4px; font: 11px monospace; text-align: center;';
		wrapper.appendChild(canvas);
		wrapper.appendChild(Object.assign(document.createElement('div'), { textContent: ctx.task.name }));
		document.body.appendChild(wrapper);
	});

	afterEach(() => {
		if (manager) {
			manager.destroy();
			manager = null;
		}
		// Canvas stays in the DOM — visible for inspection in headed mode.
		// Cleanup happens in the next run's beforeAll.
	});

	// Helper: create a fully-initialised manager with the given fragment shader.
	function buildManager(fs: string): WebGLManager {
		const result = WebGLManager.fromHTMLCanvasElement(canvas);
		expect(result.error).toBeNull();
		const mgr = result.data!;
		expect(mgr.setVertexShader(DEFAULT_VS_SHADER).error).toBeNull();
		expect(mgr.setFragmentShaders([fs]).error).toBeNull();
		expect(mgr.setupWholeScreenQuad().error).toBeNull();
		return mgr;
	}

	// ── Construction ────────────────────────────────────────────────────────

	it('fromHTMLCanvasElement returns ok when WebGL is available', () => {
		const result = WebGLManager.fromHTMLCanvasElement(canvas);
		expect(result.error).toBeNull();
		expect(result.data).toBeTruthy();
		manager = result.data!;
	});

	// ── Solid colour render ─────────────────────────────────────────────────

	it('renders solid red and reads back [255, 0, 0, 255]', () => {
		manager = buildManager(SOLID_RED_FS);

		const paintResult = manager.paintCanvas();
		expect(paintResult.error).toBeNull();

		const gl = manager.getGLContext();
		// Sample two pixels to confirm the whole canvas is red.
		expect(readPixel(gl, 0, 0)).toEqual([255, 0, 0, 255]);
		expect(readPixel(gl, 1, 1)).toEqual([255, 0, 0, 255]);
	});

	// ── UV gradient exact pixel values ─────────────────────────────────────
	//
	// 4×4 canvas, u_resolution=[4,4].
	// gl_FragCoord uses pixel centres, so:
	//   pixel (x, y) → uv = ((x+0.5)/4, (y+0.5)/4)
	//
	//   (0,0) → uv=(0.125, 0.125) → r=g≈32,  b=0, a=255
	//   (3,0) → uv=(0.875, 0.125) → r≈223, g≈32,  b=0, a=255
	//   (0,3) → uv=(0.125, 0.875) → r≈32,  g≈223, b=0, a=255
	//   (3,3) → uv=(0.875, 0.875) → r≈223, g≈223, b=0, a=255

	it('UV gradient: correct pixel values at all four corners (±2 tolerance)', () => {
		manager = buildManager(UV_GRADIENT_FS);

		manager.updateUniform('u_resolution', [4, 4]);
		expect(manager.paintCanvas().error).toBeNull();

		const gl = manager.getGLContext();

		// readPixels y=0 is the bottom row in WebGL clip space.
		expectPixelNear(readPixel(gl, 0, 0), [32, 32, 0, 255]); // bottom-left
		expectPixelNear(readPixel(gl, 3, 0), [223, 32, 0, 255]); // bottom-right
		expectPixelNear(readPixel(gl, 0, 3), [32, 223, 0, 255]); // top-left
		expectPixelNear(readPixel(gl, 3, 3), [223, 223, 0, 255]); // top-right
	});

	// ── Uniform updates ─────────────────────────────────────────────────────

	it('uniform update changes the rendered colour', () => {
		manager = buildManager(UNIFORM_COLOR_FS);

		// Render blue.
		manager.updateUniform('u_color', [0, 0, 1]);
		manager.paintCanvas();

		const gl = manager.getGLContext();
		expect(readPixel(gl, 1, 1)).toEqual([0, 0, 255, 255]);

		// Update to green and repaint.
		manager.updateUniform('u_color', [0, 1, 0]);
		manager.paintCanvas();

		expect(readPixel(gl, 1, 1)).toEqual([0, 255, 0, 255]);
	});

	it('uniform update to red gives [255, 0, 0, 255]', () => {
		manager = buildManager(UNIFORM_COLOR_FS);

		manager.updateUniform('u_color', [1, 0, 0]);
		manager.paintCanvas();

		const gl = manager.getGLContext();
		expect(readPixel(gl, 2, 2)).toEqual([255, 0, 0, 255]);
	});

	it('looks up uniform locations once and uploads only changed uniforms', () => {
		manager = buildManager(UNIFORM_COLOR_FS);
		const gl = manager.getGLContext();
		manager.updateUniform('u_color', [1, 0, 0]);
		manager.updateUniform('u_unused', 1);
		manager.paintCanvas();

		const getUniformLocation = vi.spyOn(gl, 'getUniformLocation');
		const uniform3f = vi.spyOn(gl, 'uniform3f');
		for (let i = 0; i < 10; i++) manager.paintCanvas();
		expect(getUniformLocation).not.toHaveBeenCalled();
		expect(uniform3f).not.toHaveBeenCalled();

		manager.updateUniform('u_color', [0, 1, 0]);
		manager.paintCanvas();
		expect(getUniformLocation).not.toHaveBeenCalled();
		expect(uniform3f).toHaveBeenCalledTimes(1);
		expect(readPixel(gl, 1, 1)).toEqual([0, 255, 0, 255]);
	});

	// ── Shader compilation failure ──────────────────────────────────────────

	it('setFragmentShaders returns a compile error with the compiler log for invalid GLSL', () => {
		const result = WebGLManager.fromHTMLCanvasElement(canvas);
		expect(result.error).toBeNull();
		manager = result.data!;

		manager.setVertexShader(DEFAULT_VS_SHADER);

		const fragResult = manager.setFragmentShaders([INVALID_FS]);
		expect(fragResult.data).toBeNull();
		const error = fragResult.error as OffscreenWebGLError;
		expect(error).toBeInstanceOf(OffscreenWebGLError);
		expect(error.kind).toBe('compile');
		expect(error.message).toMatch(/^Fragment shader failed to compile:\nERROR: 0:1: /);
	});

	it('reports the failing pass of a multipass pipeline', () => {
		manager = WebGLManager.fromHTMLCanvasElement(canvas).data!;
		manager.setVertexShader(DEFAULT_VS_SHADER);
		const error = manager.setFragmentShaderGroups([[SOLID_RED_FS], [SOLID_RED_FS, UNDECLARED_FS]]).error as OffscreenWebGLError;
		expect(error.kind).toBe('compile');
		expect(error.message).toMatch(/^Fragment shader \(group 1, pass 1\) failed to compile:\nERROR: 0:4: .*missing/);
	});

	it('returns a link error with the program log', () => {
		manager = WebGLManager.fromHTMLCanvasElement(canvas).data!;
		manager.setVertexShader(DEFAULT_VS_SHADER);
		const error = manager.setFragmentShaders([UNDECLARED_VARYING_FS]).error as OffscreenWebGLError;
		expect(error.kind).toBe('link');
		expect(error.message).toMatch(/^Fragment shader failed to link:\n.*v_uv/);
	});

	it('reports vertex shader compile errors and keeps the previous shader', () => {
		manager = buildManager(SOLID_RED_FS);
		const error = manager.setVertexShader('void main() { gl_Position = nope; }').error as OffscreenWebGLError;
		expect(error.message).toMatch(/^Vertex shader failed to compile:/);
		expect(manager.setFragmentShaders([SOLID_RED_FS]).error).toBeNull();
	});

	it('reports fetch failures with the shader URL', async () => {
		manager = WebGLManager.fromHTMLCanvasElement(canvas).data!;
		const url = 'http://127.0.0.1:1/missing.glsl';
		const vertex = await manager.setRemoteVertexShader(url);
		expect(vertex.error).toMatchObject({ kind: 'fetch', message: `Failed to fetch Vertex shader (${url})` });
		manager.setVertexShader(DEFAULT_VS_SHADER);
		const fragment = await manager.setRemoteFragmentShaderGroups([[url], [url]]);
		expect(fragment.error).toMatchObject({ kind: 'fetch', message: `Failed to fetch Fragment shader (group 0, pass 0, ${url})` });
	});

	it('runs *Async methods on the manager with their arguments', async () => {
		manager = WebGLManager.fromHTMLCanvasElement(canvas).data!;
		const async = manager as unknown as Record<string, (...args: any[]) => Promise<{ error: Error | null }>>;
		expect((await async.setVertexShaderAsync(DEFAULT_VS_SHADER)).error).toBeNull();
		expect((await async.setFragmentShadersAsync([SOLID_RED_FS])).error).toBeNull();
		expect(manager.getProgram()).toBeTruthy();
	});

	it('reports a failing per-frame callback once and keeps running the others', async () => {
		const onError = vi.fn();
		manager = WebGLManager.fromHTMLCanvasElement(canvas, 4, 4, undefined, onError).data!;
		let frames = 0;
		manager.runOnContext(
			'f_each_bad',
			() => {
				throw new Error('boom');
			},
			true
		);
		manager.runOnContext('f_each_count', () => frames++, true);
		manager.setFrameRate(240);
		await vi.waitFor(() => expect(frames).toBeGreaterThan(5));
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError.mock.calls[0][0]).toMatchObject({
			kind: 'callback',
			message: 'f_each_bad threw',
			cause: expect.objectContaining({ message: 'boom' }),
		});
		manager.runOnContext(
			'f_each_bad',
			() => {
				throw new Error('boom');
			},
			true
		);
		await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(2));
	});

	// ── checkWebGLVitals ────────────────────────────────────────────────────

	it('checkWebGLVitals returns ok after a successful render', () => {
		manager = buildManager(SOLID_RED_FS);
		manager.paintCanvas();

		const vitals = manager.checkWebGLVitals();
		expect(vitals.error).toBeNull();
		expect(vitals.data).toBeTruthy();
	});

	it('checkWebGLVitals returns err after destroy', () => {
		manager = buildManager(SOLID_RED_FS);
		manager.paintCanvas();
		manager.destroy();

		const vitals = manager.checkWebGLVitals();
		expect(vitals.error).not.toBeNull();

		// Prevent afterEach from calling destroy a second time.
		manager = null;
	});

	// ── Ping-pong FBO rendering ─────────────────────────────────────────────

	describe('Ping-pong FBO rendering', () => {
		it('two-pass pipeline: pass1→FBO red, pass2 reads FBO → canvas blue', () => {
			const result = WebGLManager.fromHTMLCanvasElement(canvas);
			expect(result.error).toBeNull();
			manager = result.data!;

			expect(manager.setVertexShader(DEFAULT_VS_SHADER).error).toBeNull();
			expect(manager.setFragmentShaderGroups([[PINGPONG_PASS1_FS], [PINGPONG_PASS2_FS]]).error).toBeNull();
			expect(manager.setupWholeScreenQuad().error).toBeNull();

			// resize creates the FBOs (usesPingPongGroups=true) and calls paintCanvas internally
			expect(manager.resize(4, 4).error).toBeNull();

			const gl = manager.getGLContext();
			expect(readPixel(gl, 1, 1)).toEqual([0, 0, 255, 255]);
			expect(readPixel(gl, 2, 2)).toEqual([0, 0, 255, 255]);
		});
	});

	it('defers setup while the context is lost and rebuilds everything on restore', async () => {
		const offscreen = new OffscreenCanvas(4, 4);
		manager = WebGLManager.fromHTMLCanvasElement(offscreen as unknown as HTMLCanvasElement).data!;
		manager.setVertexShader(DEFAULT_VS_SHADER);
		manager.setFragmentShaders([UNIFORM_COLOR_FS]);
		manager.setupWholeScreenQuad();
		manager.updateUniform('u_color', [1, 0, 0]);
		expect(manager.resize(4, 4).error).toBeNull();
		const gl = manager.getGLContext();
		const extension = gl.getExtension('WEBGL_lose_context')!;
		const lost = new Promise((resolve) =>
			offscreen.addEventListener('webglcontextlost', (event) => resolve(event.preventDefault()), { once: true })
		);
		extension.loseContext();
		await lost;
		await new Promise((resolve) => setTimeout(resolve));

		expect(manager.setFragmentShaderGroups([[PINGPONG_PASS1_FS], [PINGPONG_PASS2_FS]]).error).toBeNull();
		expect(manager.setupWholeScreenQuad().error).toBeNull();
		expect(manager.resize(4, 4).error).toBeNull();
		expect(manager.paintCanvas().error).toBeNull();

		const restored = new Promise((resolve) => offscreen.addEventListener('webglcontextrestored', resolve, { once: true }));
		extension.restoreContext();
		await restored;
		expect(manager.restoreContext().error).toBeNull();
		expect(readPixel(gl, 1, 1)).toEqual([0, 0, 255, 255]);

		expect(manager.setFragmentShaders([UNIFORM_COLOR_FS]).error).toBeNull();
		expect(manager.setupWholeScreenQuad().error).toBeNull();
		expect(manager.paintCanvas().error).toBeNull();
		expect(readPixel(gl, 1, 1)).toEqual([255, 0, 0, 255]);
	});
});
