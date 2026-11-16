import { useCallback, useRef, useState } from 'react';
import type { ShaderUniformProps } from './uniform-types';
import { RunOnWorkerContextFn, RunOnWorkerContextFnName, WebGLUniformName } from './gl-manager';
import { uuidv4 } from '../utils/uuid';
import { uniformValuesEqual, useOffscreenWebGL } from './useOffscreenWebGL';

interface OffscreenWebGLProps<V, F, VURL, FURL> {
	vertexShader?: V;
	vertexShaderURL?: VURL;
	fragmentShader?: F;
	fragmentShaderURL?: FURL;
	refreshRate?: number;
	disableResizeObserver?: boolean;

	[key: RunOnWorkerContextFnName]: RunOnWorkerContextFn<any>;
}

function useStableRecord<T>(record: Record<string, T>, isEqual: (a: T | undefined, b: T) => boolean): Record<string, T> {
	const ref = useRef(record);
	const previous = ref.current;
	const keys = Object.keys(record);
	if (keys.length !== Object.keys(previous).length || keys.some((key) => !(key in previous) || !isEqual(previous[key], record[key]))) {
		ref.current = record;
	}
	return ref.current;
}

export function OffscreenWebGL<
	const V extends string = '',
	const F extends string | string[][] = '',
	const VURL extends string | undefined = undefined,
	const FURL extends string | string[][] | undefined = undefined,
>(props: OffscreenWebGLProps<V, F, VURL, FURL> & ShaderUniformProps<NoInfer<V>, NoInfer<F>, NoInfer<VURL>, NoInfer<FURL>>) {
	const { vertexShader, vertexShaderURL, fragmentShader, fragmentShaderURL, refreshRate, disableResizeObserver, ...rest } = props;

	const CANVAS_ID = useRef(`OffscreenWebGLCanvas-${uuidv4()}`);
	const [canvas, setCanvas] = useState<HTMLCanvasElement>();

	const canvasRef = useCallback((node: HTMLCanvasElement | null) => {
		setCanvas(node!);
	}, []);

	const uniforms = useStableRecord(
		Object.fromEntries(
			Object.entries(rest)
				.filter(([key]) => key.startsWith('u_'))
				.map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])
		) as Record<WebGLUniformName, number | number[]>,
		uniformValuesEqual
	);

	const functions = useStableRecord(
		Object.fromEntries(Object.entries(rest).filter(([key]) => key.startsWith('f_'))) as Record<string, RunOnWorkerContextFn>,
		(a, b) => a?.toString() === b?.toString()
	);

	const { isLoading, isReady, hasError, error } = useOffscreenWebGL(canvas!, {
		vertexShader,
		vertexShaderURL,
		fragmentShader,
		fragmentShaderURL,
		refreshRate,
		disableResizeObserver,
		uniforms,
		functions,
	});

	if (hasError) {
		console.error('[OffscreenWebGL] Error:', error);
	}

	return (
		<canvas
			id={CANVAS_ID.current}
			ref={canvasRef}
			style={{ display: 'block', width: '100%', height: '100%' }}
			data-loading={isLoading}
			data-ready={isReady}
			data-error={hasError}
		/>
	);
}
