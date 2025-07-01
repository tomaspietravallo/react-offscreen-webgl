import { err, ok, Result } from './try-catch';

export const createShaderFromSource = (gl: WebGLRenderingContext, type: number, source: string): Result<WebGLShader> => {
	const shader = gl.createShader(type);
	if (!shader) return err(new Error('Failed to create shader'));

	gl.shaderSource(shader, source);
	gl.compileShader(shader);

	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		console.error('Error compiling shader:', gl.getShaderInfoLog(shader));
		gl.deleteShader(shader);
		return err(new Error('Shader compilation failed'));
	}

	return ok(shader);
};

export const createWholeScreenQuad = (gl: WebGLRenderingContext, program: WebGLProgram) => {
	// Vertex **Attributes**
	var vertexPositionAttribute = gl.getAttribLocation(program, 'v_position');
	var quad_vertex_buffer = gl.createBuffer();
	// prettier-ignore
	var quad_vertex_buffer_data = new Float32Array([
		-1.0, 1.0, 0.0,
		1.0, 1.0, 0.0,
		1.0, -1.0, 0.0,
		-1.0, -1.0, 0.0
	]);

	gl.bindBuffer(gl.ARRAY_BUFFER, quad_vertex_buffer);
	gl.bufferData(gl.ARRAY_BUFFER, quad_vertex_buffer_data, gl.STATIC_DRAW);
	gl.vertexAttribPointer(vertexPositionAttribute, 3, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(vertexPositionAttribute);
	return quad_vertex_buffer as WebGLBuffer;
};

export const setFloatUniforms = (gl: WebGLRenderingContext, location: WebGLUniformLocation, ...data: number[]) => {
	switch (data.length) {
		case 0:
			throw new Error('Invalid call to setFloatUniforms. No data provided');
		case 1:
			// @ts-ignore
			gl.uniform1f(location, ...data);
			break;
		case 2:
			// @ts-ignore
			gl.uniform2f(location, ...data);
			break;
		case 3:
			// @ts-ignore
			gl.uniform3f(location, ...data);
			break;
		case 4:
			// @ts-ignore
			gl.uniform4f(location, ...data);
			break;
	}
};
