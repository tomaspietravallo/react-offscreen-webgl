precision highp float;
uniform vec2 u_resolution;
uniform float u_frame;

void main() {
	vec2 uv = gl_FragCoord.xy / u_resolution;
	vec2 p = vec2(
		0.5 + 0.2 * cos(u_frame * 0.1),
		0.5 + 0.2 * sin(u_frame * 0.1)
	);
	gl_FragColor = vec4(vec3(1.0 - smoothstep(0.0, 0.1, length(uv - p))), 1.);
}
