const solid = `precision mediump float;
uniform vec3 u_color;
void main() { gl_FragColor = vec4(u_color, 1.0); }`;

export function createApp({ createElement, StrictMode }, { OffscreenWebGL, createUniformStream }) {
	const stream = createUniformStream({ u_color: [0, 0, 1] });
	const box = (key, child) => createElement('div', { key, style: { width: '40px', height: '20px' } }, child);
	return function App() {
		return createElement(
			StrictMode,
			null,
			box('props', createElement(OffscreenWebGL, { fragmentShader: solid, u_color: [1, 0, 0] })),
			box('stream', createElement(OffscreenWebGL, { fragmentShader: solid, uniformStream: stream })),
			box('default', createElement(OffscreenWebGL))
		);
	};
}
