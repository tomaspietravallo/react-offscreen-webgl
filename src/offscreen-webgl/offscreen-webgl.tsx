import { type FC, useEffect, useMemo, useRef } from 'react';
import { DEFAULT_FS_SHADER, DEFAULT_VS_SHADER } from '../defaults';
import { RunOnWorkerContextFn, RunOnWorkerContextFnName, WebGLManager, WebGLUniformName } from './gl-manager';
import { uuidv4 } from '../utils/uuid';
import { WebGLManagerProxy, WebGLManagerProxyType } from './proxy';

interface OffscreenWebGLProps {
	vertexShader?: string;
	vertexShaderURL?: string;
	fragmentShader?: string;
	fragmentShaderURL?: string;
	refreshRate?: number; // in FPS, default is 30
	disableResizeObserver?: boolean;

	[key: WebGLUniformName]: number | number[];
	[key: RunOnWorkerContextFnName]: RunOnWorkerContextFn<any>;
}

export const OffscreenWebGL: FC<OffscreenWebGLProps> = (props: OffscreenWebGLProps) => {
	const { vertexShader = DEFAULT_VS_SHADER, fragmentShader = DEFAULT_FS_SHADER, disableResizeObserver = false } = props;

	const CANVAS_ID = useRef(`OffscreenWebGLCanvas-${uuidv4()}`);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const proxyRef = useRef<WebGLManagerProxyType | null>(null);

	const uDeps = useMemo(
		() =>
			Object.entries(props)
				.filter(([key]) => key.startsWith('u_'))
				.map(([, value]) => value),
		[props]
	);

	const fDeps = useMemo(
		() =>
			Object.entries(props)
				.filter(([key]) => key.startsWith('f_'))
				.map(([, value]) => value),
		[props]
	);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		if (proxyRef.current) {
			console.log('[OffscreenWebGL] Reusing existing WebGLManagerProxy/Worker');
			return;
		}

		proxyRef.current = new WebGLManagerProxy(canvas) as any as WebGLManagerProxyType;

		new Promise(async (resolve) => {
			let vertexShaderText = vertexShader;
			let fragmentShaderText = fragmentShader;

			if (props.vertexShaderURL) {
				const response = await fetch(props.vertexShaderURL);
				if (!response.ok) {
					throw new Error(`[OffscreenWebGL] Failed to fetch vertex shader from ${props.vertexShaderURL}`);
				}
				const shaderText = await response.text();
				vertexShaderText = shaderText;
			}

			if (props.fragmentShaderURL) {
				const response = await fetch(props.fragmentShaderURL);
				if (!response.ok) {
					throw new Error(`[OffscreenWebGL] Failed to fetch fragment shader from ${props.fragmentShaderURL}`);
				}
				const shaderText = await response.text();
				fragmentShaderText = shaderText;
			}

			await proxyRef.current?.compileProgram(vertexShaderText, [fragmentShaderText]);

			await proxyRef.current?.useProgram();

			await proxyRef.current?.setupWholeScreenQuad();

			await proxyRef.current?.paintCanvas();
		}).catch(console.error);

		return () => {};
	}, []);

	useEffect(() => {
		new Promise(async (resolve) => {
			if (!proxyRef.current || (await proxyRef.current.checkWebGLVitalsAsync()).error) {
				console.warn('[OffscreenWebGL] WebGLManager is not ready yet');
				return;
			}

			for (const [key, value] of Object.entries(props).filter(([key]) => key.startsWith('u_'))) {
				await proxyRef.current?.updateUniformAsync(key as WebGLUniformName, value as number | number[]);
			}

			let e: Error | null = null;
			if ((e = (await proxyRef.current.checkWebGLVitalsAsync()).error)) {
				console.error('[OffscreenWebGL] WebGL error:', e);
				return;
			}

			await proxyRef.current.paintCanvasAsync();
		}).catch(console.error);
	}, uDeps);

	useEffect(() => {
		proxyRef.current?.checkWebGLVitalsAsync().then((result) => {
			for (const [key, value] of Object.entries(props).filter(([key]) => key.startsWith('f_'))) {
				proxyRef.current?.runOnContext(key, value, key.includes('each'));
			}
		});
	}, fDeps);

	useEffect(() => {
		if (!proxyRef.current) return;

		if (props.refreshRate && props.refreshRate > 0) {
			console.log(`[OffscreenWebGL] Setting refresh rate to ${props.refreshRate} FPS`);
			proxyRef.current.setFrameRate(props.refreshRate);
		} else {
			if (props.refreshRate) {
				console.warn(`[OffscreenWebGL] Invalid refresh rate, using default (${WebGLManager.DEFAULT_FRAME_RATE} FPS)`);
			}
			proxyRef.current.setFrameRate(30);
		}
	}, [props.refreshRate]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || !proxyRef.current || disableResizeObserver) return;

		const observer = new ResizeObserver(() => {
			if (disableResizeObserver) return observer.disconnect();
			proxyRef.current?.resize(canvasRef.current?.width!, canvasRef.current?.height!);
			proxyRef.current?.updateUniform('u_resolution', [canvasRef.current?.width!, canvasRef.current?.height!]);
		});

		observer.observe(canvas);

		return () => {
			observer.disconnect();
		};
	}, [disableResizeObserver]);

	return <canvas id={CANVAS_ID.current} ref={canvasRef} style={{ width: '100%', height: '100%' }}></canvas>;
};
