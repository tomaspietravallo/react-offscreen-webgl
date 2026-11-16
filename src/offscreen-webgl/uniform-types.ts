/** Types inferred from the supported subset of GLSL ES uniform declarations. */
export type UniformValue = number | readonly number[];
type DynamicUniforms = { [name: `u_${string}`]: UniformValue | undefined };
type UnknownSource = { readonly __unknownShader: unique symbol };
type Space = ' ' | '\n' | '\r' | '\t';
type Punctuation = ';' | ',' | '{' | '}' | '(' | ')' | '[' | ']' | '=';
type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
type Letter =
	| 'a'
	| 'b'
	| 'c'
	| 'd'
	| 'e'
	| 'f'
	| 'g'
	| 'h'
	| 'i'
	| 'j'
	| 'k'
	| 'l'
	| 'm'
	| 'n'
	| 'o'
	| 'p'
	| 'q'
	| 'r'
	| 's'
	| 't'
	| 'u'
	| 'v'
	| 'w'
	| 'x'
	| 'y'
	| 'z';
type IdentifierChar = Letter | Uppercase<Letter> | Digit | '_';
type IdentifierStart = Letter | Uppercase<Letter> | '_';
type ValidIdentifier<S extends string> = S extends `${infer C}${infer R}`
	? C extends IdentifierChar
		? R extends ''
			? true
			: ValidIdentifier<R>
		: false
	: false;
type ValidName<S extends string> = S extends `${infer C}${infer R}`
	? C extends IdentifierStart
		? R extends ''
			? true
			: ValidIdentifier<R>
		: false
	: false;

// Tokenize with a finite budget. An unknown or excessively long source is broad,
// never a partially inferred map. Comments are removed in source order.
type Tokenize<S extends string, Tokens extends string[] = [], Word extends string = '', Budget extends 1[] = []> = string extends S
	? UnknownSource
	: Budget['length'] extends 600
		? UnknownSource
		: S extends ''
			? Word extends ''
				? Tokens
				: [...Tokens, Word]
			: S extends `//${infer Rest}`
				? LineComment<Rest, Word extends '' ? Tokens : [...Tokens, Word], Budget>
				: S extends `/*${infer Rest}`
					? BlockComment<Rest, Word extends '' ? Tokens : [...Tokens, Word], Budget>
					: S extends `${infer C}${infer Rest}`
						? C extends '#'
							? UnknownSource
							: C extends Space
								? Tokenize<Rest, Word extends '' ? Tokens : [...Tokens, Word], '', [...Budget, 1]>
								: C extends Punctuation
									? Tokenize<Rest, Word extends '' ? [...Tokens, C] : [...Tokens, Word, C], '', [...Budget, 1]>
									: Tokenize<Rest, Tokens, `${Word}${C}`, [...Budget, 1]>
						: UnknownSource;
type LineComment<S extends string, T extends string[], B extends 1[]> = string extends S
	? UnknownSource
	: B['length'] extends 600
		? UnknownSource
		: S extends ''
			? T
			: S extends `${infer C}${infer R}`
				? C extends '\n'
					? Tokenize<R, T, '', [...B, 1]>
					: LineComment<R, T, [...B, 1]>
				: UnknownSource;
type BlockComment<S extends string, T extends string[], B extends 1[]> = string extends S
	? UnknownSource
	: B['length'] extends 600
		? UnknownSource
		: S extends `*/${infer R}`
			? Tokenize<R, T, '', [...B, 1]>
			: S extends `${infer _C}${infer R}`
				? BlockComment<R, T, [...B, 1]>
				: UnknownSource;

type GlslValue<T extends string> = T extends 'float'
	? number
	: T extends 'vec2'
		? readonly [number, number]
		: T extends 'vec3'
			? readonly [number, number, number]
			: T extends 'vec4'
				? readonly [number, number, number, number]
				: never;
type Add<M, Name extends string, Type extends string> = Name extends 'u_resolution'
	? Type extends 'vec2'
		? M
		: UnknownSource
	: Name extends `u_${string}`
		? Name extends keyof M
			? M[Name] extends Type
				? Type extends M[Name]
					? M
					: UnknownSource
				: UnknownSource
			: M & Record<Name, Type>
		: M;
type Declarators<T extends string[], Type extends string, M> = T extends [
	infer Name extends string,
	infer Separator extends string,
	...infer Rest extends string[],
]
	? ValidName<Name> extends true
		? Add<M, Name, Type> extends infer Next
			? Next extends UnknownSource
				? Next
				: Separator extends ';'
					? Scan<Rest, Next>
					: Separator extends ','
						? Declarators<Rest, Type, Next>
						: UnknownSource
			: never
		: UnknownSource
	: UnknownSource;
type Declaration<T extends string[], M> = T extends [infer Type extends string, ...infer Rest extends string[]]
	? Type extends 'lowp' | 'mediump' | 'highp'
		? Declaration<Rest, M>
		: [GlslValue<Type>] extends [never]
			? UnknownSource
			: Declarators<Rest, Type, M>
	: UnknownSource;
type Scan<T extends string[], M = {}> = T extends [infer Head extends string, ...infer Rest extends string[]]
	? Head extends 'uniform'
		? Declaration<Rest, M>
		: Scan<Rest, M>
	: M;
// Check for widened interpolations while consuming eight characters per step.
// A bounded check fails open before TypeScript reaches its recursion limit.
type IsWidePart<S extends string> = S extends unknown
	? string extends S
		? true
		: S extends Digit
			? false
			: '0' extends S
				? true
				: false
	: never;
type IsLiteral<S extends string, Steps extends 1[] = [], Blocks extends 1[] = []> = string extends S
	? false
	: S extends ''
		? true
		: Steps['length'] extends 16
			? Blocks['length'] extends 31
				? false
				: IsLiteral<S, [], [...Blocks, 1]>
			: S extends `${infer A}${infer B}${infer C}${infer D}${infer E}${infer F}${infer G}${infer H}${infer Rest}`
				? true extends IsWidePart<A | B | C | D | E | F | G | H>
					? false
					: IsLiteral<Rest, [...Steps, 1], Blocks>
				: S extends `${infer A}${infer Rest}`
					? true extends IsWidePart<A>
						? false
						: IsLiteral<Rest, [...Steps, 1], Blocks>
					: false;

// Skip ordinary source in chunks, examining only slash-delimited comments and
// uniform declarations. Each pass has a bounded number of structural events.
type StripComments<S extends string, Out extends string = '', Budget extends 1[] = []> = string extends S
	? UnknownSource
	: Budget['length'] extends 128
		? UnknownSource
		: S extends `${infer Before}/${infer After}`
			? string extends Before | After
				? UnknownSource
				: After extends `/${infer Line}`
					? Line extends `${infer _Comment}\n${infer Rest}`
						? StripComments<Rest, `${Out}${Before} `, [...Budget, 1]>
						: `${Out}${Before} `
					: After extends `*${infer Block}`
						? Block extends `${infer _Comment}*/${infer Rest}`
							? StripComments<Rest, `${Out}${Before} `, [...Budget, 1]>
							: UnknownSource
						: StripComments<After, `${Out}${Before}/`, [...Budget, 1]>
			: `${Out}${S}`;

type ExtractUniforms<S extends string, M = {}, Budget extends 1[] = []> = string extends S
	? UnknownSource
	: Budget['length'] extends 128
		? UnknownSource
		: S extends `${infer Before}uniform${infer After}`
			? string extends Before | After
				? UnknownSource
				: Before extends `${string}${IdentifierChar}`
					? ExtractUniforms<After, M, [...Budget, 1]>
					: After extends `${Space}${string}` | `;` | `;${string}`
						? After extends `${infer DeclarationText};${infer Rest}`
							? Tokenize<`${DeclarationText};`> extends infer T
								? T extends string[]
									? ExtractUniforms<Rest, Merge<M, Declaration<T, {}>>, [...Budget, 1]>
									: UnknownSource
								: never
							: UnknownSource
						: ExtractUniforms<After, M, [...Budget, 1]>
			: M;
type Parse<S extends string> =
	IsLiteral<S> extends true
		? StripComments<S> extends infer Clean
			? Clean extends string
				? Clean extends `${string}#${string}`
					? UnknownSource
					: ExtractUniforms<Clean>
				: UnknownSource
			: UnknownSource
		: UnknownSource;
type Merge<A, B> = A extends UnknownSource
	? UnknownSource
	: B extends UnknownSource
		? UnknownSource
		: {
					[K in keyof A | keyof B]: K extends keyof A
						? K extends keyof B
							? A[K] extends B[K]
								? B[K] extends A[K]
									? A[K]
									: never
								: never
							: A[K]
						: K extends keyof B
							? B[K]
							: never;
			  } extends infer M
			? [{ [K in keyof M]: [M[K]] extends [never] ? K : never }[keyof M]] extends [never]
				? M
				: UnknownSource
			: never;
type Sources<S> = S extends string
	? Parse<S>
	: S extends readonly unknown[]
		? number extends S['length']
			? UnknownSource
			: SourcesTuple<S>
		: UnknownSource;
type SourcesTuple<S extends readonly unknown[], M = {}> = S extends readonly [infer Head, ...infer Rest]
	? SourcesTuple<Rest, Merge<M, Sources<Head>>>
	: M;
type Values<M> = { [K in keyof M]?: M[K] extends string ? GlslValue<M[K]> : never };
/** Uniform props inferred from a shader literal. Dynamic or unsupported sources use broad types. */
export type UniformsOfSource<S extends string> =
	Sources<S> extends infer M ? (M extends UnknownSource ? DynamicUniforms : Values<M>) : never;
export type ShaderUniformProps<V, F, VURL, FURL> = [VURL | FURL] extends [undefined]
	? Merge<Sources<V>, Sources<F>> extends infer M
		? M extends UnknownSource
			? DynamicUniforms
			: Values<M>
		: never
	: DynamicUniforms;
