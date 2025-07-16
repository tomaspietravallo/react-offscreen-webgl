import { useEffect, useRef, useState, useCallback } from 'react';
import { WebGLManager, WebGLUniformName, RunOnWorkerContextFn } from './gl-manager';
import { WebGLManagerProxy, WebGLManagerProxyType } from './proxy';
import { DEFAULT_FS_SHADER, DEFAULT_VS_SHADER } from '../defaults';

interface UseOffscreenWebGLOptions {
	vertexShader?: string;
	vertexShaderURL?: string;
	fragmentShader?: string | string[][];
	fragmentShaderURL?: string | string[][];
	refreshRate?: number;
	disableResizeObserver?: boolean;
	uniforms?: Record<WebGLUniformName, number | number[]>;
	functions?: Record<string, RunOnWorkerContextFn>;
}

interface UseOffscreenWebGLState {
	isLoading: boolean;
	isReady: boolean;
	hasError: boolean;
	error: Error | null;
	proxy: WebGLManagerProxyType | null;
}

export function useOffscreenWebGL(canvas: HTMLCanvasElement | null, options: UseOffscreenWebGLOptions = {}): UseOffscreenWebGLState {
	const {
		vertexShader = DEFAULT_VS_SHADER,
		fragmentShader = DEFAULT_FS_SHADER,
		refreshRate = WebGLManager.DEFAULT_FRAME_RATE,
		disableResizeObserver = false,
		uniforms = {},
		functions = {},
	} = options;

	const [state, setState] = useState<UseOffscreenWebGLState>({
		isLoading: false,
		isReady: false,
		hasError: false,
		error: null,
		proxy: null,
	});

	const proxyRef = useRef<WebGLManagerProxyType | null>(null);
	const observerRef = useRef<ResizeObserver | null>(null);

	const setError = useCallback((error: Error) => {
		setState((prev) => ({
			...prev,
			hasError: true,
			error,
			isLoading: false,
			isReady: false,
		}));
	}, []);

	// Initialize WebGL
	useEffect(() => {
		if (!canvas || proxyRef.current) return;

		setState((prev) => ({ ...prev, isLoading: true, hasError: false, error: null }));

		const initializeWebGL = async () => {
			try {
				const proxy = new WebGLManagerProxy(canvas) as any as WebGLManagerProxyType;
				proxyRef.current = proxy;

				if (options.vertexShaderURL) {
					await proxy.setRemoteVertexShaderAsync(new URL(options.vertexShaderURL, window.location.origin).toString());
				} else {
					await proxy.setVertexShaderAsync(vertexShader);
				}

				if (options.fragmentShaderURL) {
					if (Array.isArray(options.fragmentShaderURL)) {
						await proxy.setRemoteFragmentShaderGroupsAsync(options.fragmentShaderURL);
					} else {
						await proxy.setRemoteFragmentShadersAsync(new URL(options.fragmentShaderURL, window.location.origin).toString());
					}
				} else {
					if (Array.isArray(fragmentShader)) {
						await proxy.setFragmentShaderGroupsAsync(fragmentShader);
					} else {
						await proxy.setFragmentShadersAsync([fragmentShader]);
					}
				}

				await proxy.setupWholeScreenQuad();

				for (const [key, value] of Object.entries(uniforms)) {
					await proxy.updateUniformAsync(key as WebGLUniformName, value);
				}

				for (const [key, fn] of Object.entries(functions)) {
					proxy.runOnContext(key, fn, key.includes('each'));
				}

				proxy.setFrameRate(refreshRate);

				await proxy.paintCanvasAsync();

				setState((prev) => ({
					...prev,
					isLoading: false,
					isReady: true,
					proxy,
				}));
			} catch (error) {
				setError(error as Error);
			}
		};

		initializeWebGL();

		return () => {
			if (proxyRef.current) {
				proxyRef.current = null;
			}
		};
	}, [canvas]);

	useEffect(() => {
		if (!state.isReady || !proxyRef.current) return;

		const updateUniforms = async () => {
			try {
				for (const [key, value] of Object.entries(uniforms)) {
					await proxyRef.current!.updateUniformAsync(key as WebGLUniformName, value);
				}
				await proxyRef.current!.paintCanvasAsync();
			} catch (error) {
				setError(error as Error);
			}
		};

		updateUniforms();
	}, [uniforms, state.isReady]);

	useEffect(() => {
		if (!state.isReady || !proxyRef.current) return;

		try {
			for (const [key, fn] of Object.entries(functions)) {
				proxyRef.current.runOnContext(key, fn, key.includes('each'));
			}
		} catch (error) {
			setError(error as Error);
		}
	}, [functions, state.isReady]);

	useEffect(() => {
		if (!state.isReady || !proxyRef.current) return;

		try {
			proxyRef.current.setFrameRate(refreshRate);
		} catch (error) {
			setError(error as Error);
		}
	}, [refreshRate, state.isReady]);

	useEffect(() => {
		if (!state.isReady || !canvas || !proxyRef.current || disableResizeObserver) return;

		try {
			const observer = new ResizeObserver(() => {
				if (disableResizeObserver || !proxyRef.current) return;

				proxyRef.current.resize(canvas.width, canvas.height);
				proxyRef.current.updateUniform('u_resolution', [canvas.width, canvas.height]);
			});

			observer.observe(canvas);
			observerRef.current = observer;

			return () => {
				observer.disconnect();
				observerRef.current = null;
			};
		} catch (error) {
			setError(error as Error);
		}
	}, [canvas, disableResizeObserver, state.isReady]);

	return state;
}
