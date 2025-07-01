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

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const canvasID = useRef(`OffscreenWebGL-${uuidv4()}`);
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

		const m = WebGLManager.fromHTMLCanvasElement(canvas);

		if (m.error) {
			console.error('[OffscreenWebGL] Error creating GLManager:', m.error);
			return;
		}

		manager.current = m.data;

		if (manager.current.compileProgram(vertexShader, [fragmentShader]).error) {
			console.error(
				'[OffscreenWebGL] Error compiling shaders:',
				manager.current.compileProgram(vertexShader, [fragmentShader]).error
			);
			return;
		}

		if (manager.current?.useProgram().error) {
			console.error('[OffscreenWebGL] Error using program:', manager.current.useProgram().error);
			return;
		}

		if (manager.current?.setupWholeScreenQuad().error) {
			console.error('[OffscreenWebGL] Error setting up whole screen quad:', manager.current.setupWholeScreenQuad().error);
			return;
		}

		manager?.current?.updateUniform('u_resolution', [canvas.width, canvas.height]);

		return () => {
			// manager.current?.destroy();
		};
	}, []);

	useEffect(() => {
		if (!manager.current || !manager.current.isReady) {
			console.warn('[OffscreenWebGL] WebGLManager is not ready yet');
			return;
		}

		for (const [key, value] of Object.entries(props).filter(([key]) => key.startsWith('u_'))) {
			manager.current?.updateUniform(key as WebGLUniformName, value);
		}
		if (manager.current?.checkWebGLVitals().error) {
			console.error('[OffscreenWebGL] WebGL error:', manager.current.checkWebGLVitals().error);
			return;
		}
		manager.current?.paintCanvas();
	}, uDeps);

	return <canvas id={canvasID.current} ref={canvasRef} style={{ width: '100%', height: '100%' }}></canvas>;
}
