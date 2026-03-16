import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { WebGLManager } from '../../src/offscreen-webgl/gl-manager';
import { DEFAULT_VS_SHADER } from '../../src/defaults';

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

	// ── Shader compilation failure ──────────────────────────────────────────

	it('setFragmentShaders returns err for invalid GLSL', () => {
		const result = WebGLManager.fromHTMLCanvasElement(canvas);
		expect(result.error).toBeNull();
		manager = result.data!;

		manager.setVertexShader(DEFAULT_VS_SHADER);

		const fragResult = manager.setFragmentShaders([INVALID_FS]);
		expect(fragResult.error).not.toBeNull();
		expect(fragResult.data).toBeNull();
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
});
