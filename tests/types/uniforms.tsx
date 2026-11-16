import { OffscreenWebGL, type UniformsOfSource } from '../../src';

const fragment = `
precision highp float;
// uniform vec4 u_ignored;
uniform vec3 u_color;
uniform highp float u_opacity, u_other;
void main() { gl_FragColor = vec4(u_color, u_opacity); }
`;
const vertex = `uniform vec2 u_offset; void main() { gl_Position = vec4(u_offset, 0., 1.); }`;
const values = { u_color: [1, 0.4, 0.2], u_opacity: 0.8 } satisfies UniformsOfSource<typeof fragment>;
const ok = <OffscreenWebGL fragmentShader={fragment} vertexShader={vertex} {...values} u_offset={[1, 2]} />;
const inline = <OffscreenWebGL fragmentShader={`uniform vec3 u_color;`} u_color={[1, 2, 3]} />;
// @ts-expect-error wrong vector length
const wrongLength = <OffscreenWebGL fragmentShader={fragment} u_color={[1, 2]} />;
// @ts-expect-error wrong scalar
const wrongScalar = <OffscreenWebGL fragmentShader={fragment} u_opacity={[1]} />;
// @ts-expect-error misspelled uniform
const typo = <OffscreenWebGL fragmentShader={fragment} u_colour={[1, 2, 3]} />;
// @ts-expect-error commented out uniform
const comment = <OffscreenWebGL fragmentShader={fragment} u_ignored={[1, 2, 3, 4]} />;
// @ts-expect-error managed uniform
const managed = <OffscreenWebGL fragmentShader={`uniform vec2 u_resolution;`} u_resolution={[1, 2]} />;
// @ts-expect-error undeclared uniform even when no declarations exist
const empty = <OffscreenWebGL fragmentShader={`void main() {}`} u_missing={1} />;
const dynamic: string = Math.random() ? 'a' : 'b';
const broad = <OffscreenWebGL fragmentShader={dynamic} u_any={[1, 2]} />;
const remote = <OffscreenWebGL fragmentShaderURL="shader.glsl" u_any={1} />;
const unsupported = <OffscreenWebGL fragmentShader={`uniform sampler2D u_tex;`} u_any={1} />;
const directive = <OffscreenWebGL fragmentShader={`#if FOO\nuniform vec3 u_a;\n#endif`} u_any={1} />;
const groups = <OffscreenWebGL fragmentShader={[[`uniform vec3 u_a;`, `uniform float u_b;`]]} u_a={[1, 2, 3]} u_b={1} />;
// @ts-expect-error grouped shader tuple length
const badGroups = <OffscreenWebGL fragmentShader={[[`uniform vec3 u_a;`, `uniform float u_b;`]]} u_a={[1, 2]} />;
const conflict = <OffscreenWebGL vertexShader={`uniform float u_a;`} fragmentShader={`uniform vec3 u_a;`} u_any={1} />;
void [
	ok,
	inline,
	wrongLength,
	wrongScalar,
	typo,
	comment,
	managed,
	empty,
	broad,
	remote,
	unsupported,
	directive,
	groups,
	badGroups,
	conflict,
];
const injected: string = Math.random() ? 'uniform vec2 u_more;' : '';
const interpolated = `uniform float u_known; ${injected}`;
const interpolatedBroad = <OffscreenWebGL fragmentShader={interpolated} u_unknown={1} />;
const withBlockComment = `/* uniform vec4 u_bad; */ uniform /* comment */ vec2 u_good;`;
const blockOk = <OffscreenWebGL fragmentShader={withBlockComment} u_good={[1, 2]} />;
// @ts-expect-error comment is ignored
const blockBad = <OffscreenWebGL fragmentShader={withBlockComment} u_bad={[1, 2, 3, 4]} />;
const array = <OffscreenWebGL fragmentShader={`uniform vec3 u_colors[3];`} u_any={1} />;
const malformed = <OffscreenWebGL fragmentShader={`uniform float u_a; /*`} u_any={1} />;
void [interpolatedBroad, blockOk, blockBad, array, malformed];

const longSource = `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`;
// @ts-expect-error Long shader bodies do not disable strict checking.
const longBroad = <OffscreenWebGL fragmentShader={longSource} u_any={1} />;
void longBroad;

type DynamicPrefix = `${string}uniform float u_fixed;`;
type DynamicSuffix = `uniform float u_fixed;${string}`;
type DynamicMiddle = `uniform float u_fixed;${string}uniform vec3 u_color;`;
declare const dynamicPrefix: DynamicPrefix;
declare const dynamicSuffix: DynamicSuffix;
declare const dynamicMiddle: DynamicMiddle;
const prefixFallback = <OffscreenWebGL fragmentShader={dynamicPrefix} u_other={1} />;
const suffixFallback = <OffscreenWebGL fragmentShader={dynamicSuffix} u_other={1} />;
const middleFallback = <OffscreenWebGL fragmentShader={dynamicMiddle} u_other={1} />;
void [prefixFallback, suffixFallback, middleFallback];
type DynamicComment = `// ${string}`;
type DynamicInside = `void main() { ${string} }`;
declare const dynamicComment: DynamicComment;
declare const dynamicInside: DynamicInside;
const commentFallback = <OffscreenWebGL fragmentShader={dynamicComment} u_other={1} />;
const insideFallback = <OffscreenWebGL fragmentShader={dynamicInside} u_other={1} />;
void [commentFallback, insideFallback];

const deceptiveComments = `// uniform vec4 u_bad; #if FALSE
/* uniform float u_wrong; */ uniform vec3 u_right;`;
const right = <OffscreenWebGL fragmentShader={deceptiveComments} u_right={[1, 2, 3]} />;
// @ts-expect-error commented declarations do not become props
const fake = <OffscreenWebGL fragmentShader={deceptiveComments} u_bad={[1, 2, 3, 4]} />;
const identifierShader = `float notuniform = 1.; uniform float u_real;`;
// @ts-expect-error uniform within an identifier is not a declaration
const identifierBad = <OffscreenWebGL fragmentShader={identifierShader} u_missing={1} />;
const unfinishedUniform = <OffscreenWebGL fragmentShader={`uniform float u_x`} u_other={1} />;
const lateUnsupported = <OffscreenWebGL fragmentShader={`uniform float u_x; uniform vec3 u_array[2];`} u_other={1} />;
void [right, fake, identifierBad, unfinishedUniform, lateUnsupported];

const realisticLong = `uniform vec3 u_color;
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
}`;
const longStrict = <OffscreenWebGL fragmentShader={realisticLong} u_color={[1, 2, 3]} />;
// @ts-expect-error long shader retains inferred vector length
const longWrong = <OffscreenWebGL fragmentShader={realisticLong} u_color={[1, 2]} />;
void [longStrict, longWrong];

type Padding =
	'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
type OverBudget =
	`${Padding}${Padding}${Padding}${Padding}${Padding}${Padding}${Padding}${Padding}${Padding}${Padding}${Padding}${Padding}${Padding}${Padding}${Padding}${Padding}${Padding}${Padding}${Padding}${Padding}${Padding}${Padding}${Padding}${Padding}${Padding}${Padding}${Padding}${Padding}${Padding}${Padding}${Padding}${Padding}${Padding}uniform vec3 u_color;`;
declare const overBudget: OverBudget;
const budgetFallback = <OffscreenWebGL fragmentShader={overBudget} u_other={1} />;
void budgetFallback;
type NumericInterpolation = `void main() { float x = ${number}; }`;
type PrefixWithNumber = `uniform float u_${number};`;
declare const numericInterpolation: NumericInterpolation;
declare const prefixWithNumber: PrefixWithNumber;
const numberFallback = <OffscreenWebGL fragmentShader={numericInterpolation} u_other={1} />;
const prefixNumberFallback = <OffscreenWebGL fragmentShader={prefixWithNumber} u_other={1} />;
void [numberFallback, prefixNumberFallback];
