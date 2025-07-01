import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { DEFAULT_FS_SHADER, DEFAULT_VS_SHADER } from '../defaults';
import { WebGLManager, WebGLUniformName } from './gl-manager';
import { uuidv4 } from '../utils/uuid';
import { WebGLManagerProxy } from './proxy';

import WebWorker from '../offscreen-webgl/webgl.worker?worker';
import { WorkerMessages } from './webgl.worker';

interface OffscreenWebGLProps {
	vertexShader?: string;
	fragmentShader?: string;

	[key: WebGLUniformName]: number | number[];
}

export default function OffscreenWebGL(props: OffscreenWebGLProps) {
	const { vertexShader = DEFAULT_VS_SHADER, fragmentShader = DEFAULT_FS_SHADER } = props;

	const CANVAS_ID = useRef(`OffscreenWebGLCanvas-${uuidv4()}`);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const proxyRef = useRef<WebGLManagerProxy | null>(null);
	const workerRef = useRef<Worker | null>(null);

	const uDeps = useMemo(
		() =>
			Object.entries(props)
				.filter(([key]) => key.startsWith('u_'))
				.map(([, value]) => value),
		[props]
	);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		if (proxyRef.current || workerRef.current) {
			console.log('[OffscreenWebGL] Reusing existing WebGLManagerProxy/Worker');
			return;
		}

		workerRef.current = new WebWorker();
		proxyRef.current = new WebGLManagerProxy(workerRef.current);
		const offscreenCanvas = canvasRef.current?.transferControlToOffscreen()!;

		workerRef.current.postMessage(
			{
				type: 'INIT',
				vertexShader,
				fragmentShader: [fragmentShader],
				canvas: offscreenCanvas,
			} as WorkerMessages,
			{
				transfer: [offscreenCanvas],
			}
		);

		new Promise(async (resolve) => {
			await proxyRef.current
				?.callMethod('compileProgram', vertexShader, [fragmentShader])
				.then(() => {
					console.log('[OffscreenWebGL] Compiled WebGL program');
				})
				.catch(console.error);

			await proxyRef.current
				?.callMethod('useProgram')
				.then(() => {
					console.log('[OffscreenWebGL] Used WebGL program');
				})
				.catch(console.error);

			await proxyRef.current
				?.callMethod('setupWholeScreenQuad')
				.then(() => {
					console.log('[OffscreenWebGL] Set up whole screen quad');
				})
				.catch(console.error);

			await proxyRef.current
				?.callMethod('updateUniform', 'u_resolution', [canvas.width, canvas.height])
				.then(() => {
					console.log('[OffscreenWebGL] Updated resolution uniform');
				})
				.catch(console.error);

			await proxyRef.current
				?.callMethod('paintCanvas')
				.then(() => {
					console.log('[OffscreenWebGL] Painted canvas');
					resolve(true);
				})
				.catch(console.error);
		}).catch(console.error);

		return () => {};
	}, []);

	useEffect(() => {
		new Promise(async (resolve) => {
			if (!proxyRef.current || (await proxyRef.current.callMethod('checkWebGLVitals')).error) {
				console.warn('[OffscreenWebGL] WebGLManager is not ready yet');
				return;
			}

			for (const [key, value] of Object.entries(props).filter(([key]) => key.startsWith('u_'))) {
				await proxyRef.current?.callMethod('updateUniform', key as WebGLUniformName, value);
			}

			let e: Error | null = null;
			if ((e = (await proxyRef.current.callMethod('checkWebGLVitals')).error)) {
				console.error('[OffscreenWebGL] WebGL error:', e);
				return;
			}

			await proxyRef.current.callMethod('paintCanvas');
		}).catch(console.error);
	}, uDeps);

	return <canvas id={CANVAS_ID.current} ref={canvasRef} style={{ width: '100%', height: '100%' }}></canvas>;
}
