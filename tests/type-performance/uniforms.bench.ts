import { bench } from '@ark/attest';
import type { UniformsOfSource } from '../../src';
import type { ShaderUniformProps } from '../../src/offscreen-webgl/uniform-types';

// Prime shared types without caching the benchmarked shader literals.
type Baseline = UniformsOfSource<'uniform float u_baseline;'>;
void (null as unknown as Baseline);

bench('short shader', () => {
	return null as unknown as UniformsOfSource<`
precision mediump float;
uniform vec3 u_color;
uniform float u_opacity;
void main() { gl_FragColor = vec4(u_color, u_opacity); }
`>;
}).types([2548, 'instantiations']);

bench('medium shader with comments', () => {
	return null as unknown as UniformsOfSource<`
precision highp float;
// A comment containing uniform vec4 u_fake;
uniform vec2 u_resolution;
uniform vec3 u_color;
uniform float u_time, u_opacity;
/* uniform float u_fake_again; */
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float wave = sin(uv.x * 10.0 + u_time) * 0.5 + 0.5;
  gl_FragColor = vec4(u_color * wave, u_opacity);
}
`>;
}).types([5538, 'instantiations']);

bench('long shader body', () => {
	return null as unknown as UniformsOfSource<`
precision highp float;
uniform vec3 u_color;
uniform float u_time;
void main() {
  vec2 uv = gl_FragCoord.xy / vec2(640.0, 480.0);
  float value = 0.0;
  value += sin(uv.x * 1.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 3.0 + u_time);
  value += sin(uv.x * 4.0 + u_time);
  value += sin(uv.x * 5.0 + u_time);
  value += sin(uv.x * 6.0 + u_time);
  value += sin(uv.x * 7.0 + u_time);
  value += sin(uv.x * 8.0 + u_time);
  value += sin(uv.x * 9.0 + u_time);
  value += sin(uv.x * 10.0 + u_time);
  value += sin(uv.x * 11.0 + u_time);
  value += sin(uv.x * 12.0 + u_time);
  value += sin(uv.x * 13.0 + u_time);
  value += sin(uv.x * 14.0 + u_time);
  value += sin(uv.x * 15.0 + u_time);
  value += sin(uv.x * 16.0 + u_time);
  gl_FragColor = vec4(u_color * value, 1.0);
}
`>;
}).types([6475, 'instantiations']);

bench('grouped shader inference', () => {
	return null as unknown as ShaderUniformProps<
		`uniform vec2 u_offset; void main() { gl_Position = vec4(u_offset, 0., 1.); }`,
		[
			[
				`uniform vec3 u_a; void main() { gl_FragColor = vec4(u_a, 1.); }`,
				`uniform float u_b; void main() { gl_FragColor = vec4(u_b); }`,
			],
		],
		undefined,
		undefined
	>;
}).types([4320, 'instantiations']);

bench('3 KB shader body', () => {
	return null as unknown as UniformsOfSource<`uniform vec3 u_color;
uniform float u_time;
void main() {
  vec2 uv = vec2(0.); float value = 0.;
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  value += sin(uv.x * 2.0 + u_time);
  gl_FragColor = vec4(u_color * value, 1.);
}`>;
}).types([20485, 'instantiations']);
