// Buffer syntax is https://marketplace.visualstudio.com/items?itemName=circledev.glsl-canvas

precision highp float;

uniform vec2 u_resolution;
uniform float u_time;

uniform sampler2D u_buffer0;
uniform sampler2D u_buffer1;

#if defined(BUFFER_0)

void main() {
	vec2 uv = gl_FragCoord.xy / u_resolution;
	vec3 col = texture2D(u_buffer1, uv).rgb;
	vec2 p = vec2(
		0.5 + 0.2 * cos(u_time * 1.0),
		0.5 + 0.2 * sin(u_time * 1.0)
	);
	gl_FragColor = vec4( col * 0.98 + vec3(1.0 - smoothstep(0.0, 0.05, length(uv - p))), 1.);
}

#elif defined(BUFFER_1)

void main() {
	vec2 uv = gl_FragCoord.xy / u_resolution;
	vec3 col = texture2D(u_buffer0, uv).rgb;
	vec2 p = vec2(
		0.5 + 0.2 * cos(u_time * 1.0),
		0.5 + 0.2 * sin(u_time * 1.0)
	);
	gl_FragColor = vec4( col * 0.98 + vec3(1.0 - smoothstep(0.0, 0.05, length(uv - p))), 1.);
}

#else

void main() {
	vec2 uv = gl_FragCoord.xy / u_resolution;
	vec3 col = texture2D(u_buffer1, uv).rgb;
	gl_FragColor = vec4(col, 1.);
}

#endif
