import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { DEFAULT_FS_SHADER, DEFAULT_VS_SHADER } from '../defaults';
import { WebGLManager, WebGLUniformName } from './gl-manager';
import { uuidv4 } from '../utils/uuid';

interface OffscreenWebGLProps {
	vertexShader?: string;
	fragmentShader?: string;

	[key: WebGLUniformName]: number | number[];
}

export default function OffscreenWebGL(props: OffscreenWebGLProps) {
	const { vertexShader = DEFAULT_VS_SHADER, fragmentShader = DEFAULT_FS_SHADER } = props;

	const CANVAS_ID = useRef(`OffscreenWebGLCanvas-${uuidv4()}`);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const manager = useRef<WebGLManager | null>(null);

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

		if (manager.current) {
			console.log('[OffscreenWebGL] Reusing existing WebGLManager');
			return;
		}

		const m = WebGLManager.fromOffscreenCanvas(canvas.transferControlToOffscreen());

		if (m.error) {
			console.error('[OffscreenWebGL] Error creating GLManager:', m.error);
			return;
		}

		manager.current = m.data;

		manager.current.initWebWorker();

		return () => {
			// manager.current?.destroy();
		};
	}, []);

	useEffect(() => {
		// if (!manager.current || !manager.current.isReady) {
		// 	console.warn('[OffscreenWebGL] WebGLManager is not ready yet');
		// 	return;
		// }
		// for (const [key, value] of Object.entries(props).filter(([key]) => key.startsWith('u_'))) {
		// 	manager.current?.updateUniform(key as WebGLUniformName, value);
		// }
		// if (manager.current?.checkWebGLVitals().error) {
		// 	console.error('[OffscreenWebGL] WebGL error:', manager.current.checkWebGLVitals().error);
		// 	return;
		// }
		// manager.current?.paintCanvas();
	}, uDeps);

	return <canvas id={CANVAS_ID.current} ref={canvasRef} style={{ width: '100%', height: '100%' }}></canvas>;
}
