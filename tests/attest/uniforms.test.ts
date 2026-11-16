import { attest } from '@ark/attest';
import { it } from 'vitest';
import type { UniformsOfSource } from '../../src';

it('infers the exact types of supported uniforms', () => {
	type Uniforms = UniformsOfSource<`uniform vec3 u_color; uniform float u_opacity;`>;
	attest<{ u_color?: readonly [number, number, number]; u_opacity?: number }>({} as Uniforms);
});

it('ignores declarations inside comments', () => {
	type Uniforms = UniformsOfSource<`// uniform float u_fake;\nuniform vec2 u_real;`>;
	attest<{ u_real?: readonly [number, number] }>({} as Uniforms);
});

it('uses broad props for partially dynamic source', () => {
	type Uniforms = UniformsOfSource<`// ${string}`>;
	attest<{ [name: `u_${string}`]: number | readonly number[] | undefined }>({} as Uniforms);
});

it('offers inferred uniform names as completions', () => {
	type Uniforms = UniformsOfSource<`uniform vec3 u_color; uniform float u_opacity;`>;
	// The partial key represents what a user has typed in the editor.
	// @ts-expect-error partial key is intentionally incomplete
	// prettier-ignore
	attest({ 'u_': 1 } as Uniforms).completions({ u_: ['u_color', 'u_opacity'] });
});
