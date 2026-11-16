import { type FC, useCallback, useRef, useState } from 'react';
import { RunOnWorkerContextFn, RunOnWorkerContextFnName, WebGLUniformName } from './gl-manager';
import { uuidv4 } from '../utils/uuid';
import { uniformValuesEqual, useOffscreenWebGL } from './useOffscreenWebGL';

interface OffscreenWebGLProps {
	vertexShader?: string;
	vertexShaderURL?: string;
	fragmentShader?: string | string[][];
	fragmentShaderURL?: string | string[][];
	refreshRate?: number;
	disableResizeObserver?: boolean;

	[key: WebGLUniformName]: number | number[];
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

export const OffscreenWebGL: FC<OffscreenWebGLProps> = (props) => {
	const { vertexShader, vertexShaderURL, fragmentShader, fragmentShaderURL, refreshRate, disableResizeObserver, ...rest } = props;

	const CANVAS_ID = useRef(`OffscreenWebGLCanvas-${uuidv4()}`);
	const [canvas, setCanvas] = useState<HTMLCanvasElement>();

	const canvasRef = useCallback((node: HTMLCanvasElement | null) => {
		setCanvas(node!);
	}, []);

	const uniforms = useStableRecord(
		Object.fromEntries(Object.entries(rest).filter(([key]) => key.startsWith('u_'))) as Record<WebGLUniformName, number | number[]>,
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
};
