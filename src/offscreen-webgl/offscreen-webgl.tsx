import { type FC, useEffect, useMemo, useRef } from 'react';
import { DEFAULT_FS_SHADER, DEFAULT_VS_SHADER } from '../defaults';
import { RunOnWorkerContextFn, RunOnWorkerContextFnName, WebGLManager, WebGLUniformName } from './gl-manager';
import { uuidv4 } from '../utils/uuid';
import { WebGLManagerProxy, WebGLManagerProxyType } from './proxy';

interface OffscreenWebGLProps {
	vertexShader?: string;
	fragmentShader?: string;
	refreshRate?: number; // in FPS, default is 30

	[key: WebGLUniformName]: number | number[];
	[key: RunOnWorkerContextFnName]: RunOnWorkerContextFn<any>;
}

export const OffscreenWebGL: FC<OffscreenWebGLProps> = (props: OffscreenWebGLProps) => {
	const { vertexShader = DEFAULT_VS_SHADER, fragmentShader = DEFAULT_FS_SHADER } = props;

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
			await proxyRef.current?.compileProgram(vertexShader, [fragmentShader]);

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

	return <canvas id={CANVAS_ID.current} ref={canvasRef} style={{ width: '100%', height: '100%' }}></canvas>;
};
