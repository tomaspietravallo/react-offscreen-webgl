import { useEffect, useRef } from 'react';
import { DEFAULT_FS_SHADER, DEFAULT_VS_SHADER } from '../defaults';
import {
	createShaderFromSource,
	createWholeScreenQuad,
	setFloatUniforms,
} from '../utils/webgl';

export default function OffscreenWebGL() {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const gl = canvas.getContext('webgl');
		if (!gl) {
			console.error('WebGL not supported');
			return;
		}

		const program = gl.createProgram();

		const vsShader = createShaderFromSource(
			gl,
			gl.VERTEX_SHADER,
			DEFAULT_VS_SHADER
		);

		if (vsShader.error) {
			console.error(
				'[OffscreenWebGL] Failed to compile Vertex Shader',
				vsShader.error
			);
			return;
		}

		const fsShader = createShaderFromSource(
			gl,
			gl.FRAGMENT_SHADER,
			DEFAULT_FS_SHADER
		);

		if (fsShader.error) {
			console.error(
				'[OffscreenWebGL] Failed to compile Fragment Shader',
				fsShader.error
			);
			return;
		}

		gl.attachShader(program, fsShader.data);
		gl.attachShader(program, vsShader.data);
		gl.linkProgram(program);

		gl.useProgram(program);
		createWholeScreenQuad(gl, program);

		setFloatUniforms(
			gl,
			gl.getUniformLocation(
				program,
				'u_resolution'
			) as WebGLUniformLocation,
			canvas.width,
			canvas.height
		);

		gl.viewport(0, 0, canvas.width, canvas.height);

		gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
	}, []);

	return (
		<canvas
			ref={canvasRef}
			style={{ width: '100%', height: '100%' }}
		></canvas>
	);
}
