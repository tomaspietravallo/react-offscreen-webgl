import { type FC, useCallback, useMemo, useRef, useState } from 'react';
import { RunOnWorkerContextFn, RunOnWorkerContextFnName, WebGLUniformName } from './gl-manager';
import { uuidv4 } from '../utils/uuid';
import { useOffscreenWebGL } from './useOffscreenWebGL';

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

export const OffscreenWebGL: FC<OffscreenWebGLProps> = (props) => {
	const { vertexShader, vertexShaderURL, fragmentShader, fragmentShaderURL, refreshRate, disableResizeObserver, ...rest } = props;

	const CANVAS_ID = useRef(`OffscreenWebGLCanvas-${uuidv4()}`);
	const [canvas, setCanvas] = useState<HTMLCanvasElement>();

	const canvasRef = useCallback((node: HTMLCanvasElement | null) => {
		setCanvas(node!);
	}, []);

	const uniforms = useMemo(
		() =>
			Object.fromEntries(Object.entries(rest).filter(([key]) => key.startsWith('u_'))) as Record<WebGLUniformName, number | number[]>,
		[rest]
	);

	const functions = useMemo(
		() => Object.fromEntries(Object.entries(rest).filter(([key]) => key.startsWith('f_'))) as Record<string, RunOnWorkerContextFn>,
		[rest]
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
			style={{ width: '100%', height: '100%' }}
			data-loading={isLoading}
			data-ready={isReady}
			data-error={hasError}
		/>
	);
};
