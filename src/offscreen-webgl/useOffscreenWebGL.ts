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

		let cancelled = false;
		const initializeWebGL = async () => {
			try {
				if (!disableResizeObserver) {
					const rect = canvas.getBoundingClientRect();
					if (rect.width > 0 && rect.height > 0) {
						canvas.width = Math.max(1, Math.round(rect.width * window.devicePixelRatio));
						canvas.height = Math.max(1, Math.round(rect.height * window.devicePixelRatio));
					}
				}
				const proxy = new WebGLManagerProxy(canvas) as any as WebGLManagerProxyType;
				proxyRef.current = proxy;

				if (options.vertexShaderURL) {
					await proxy.setRemoteVertexShaderAsync(new URL(options.vertexShaderURL, window.location.origin).toString());
					if (cancelled) return;
				} else {
					await proxy.setVertexShaderAsync(vertexShader);
					if (cancelled) return;
				}

				if (options.fragmentShaderURL) {
					if (Array.isArray(options.fragmentShaderURL)) {
						await proxy.setRemoteFragmentShaderGroupsAsync(options.fragmentShaderURL);
						if (cancelled) return;
					} else {
						await proxy.setRemoteFragmentShadersAsync(new URL(options.fragmentShaderURL, window.location.origin).toString());
						if (cancelled) return;
					}
				} else {
					if (Array.isArray(fragmentShader)) {
						await proxy.setFragmentShaderGroupsAsync(fragmentShader);
						if (cancelled) return;
					} else {
						await proxy.setFragmentShadersAsync([fragmentShader]);
						if (cancelled) return;
					}
				}

				await proxy.setupWholeScreenQuadAsync();
				if (cancelled) return;

				for (const [key, value] of Object.entries(uniforms)) {
					await proxy.updateUniformAsync(key as WebGLUniformName, value);
					if (cancelled) return;
				}

				for (const [key, fn] of Object.entries(functions)) {
					await proxy.runOnContextAsync(key, fn, key.includes('each'));
					if (cancelled) return;
				}

				await proxy.setFrameRateAsync(refreshRate);
				if (cancelled) return;

				await proxy.updateUniformAsync('u_resolution', [canvas.width, canvas.height]);
				if (cancelled) return;
				await proxy.resizeAsync(canvas.width, canvas.height);
				if (cancelled) return;
				setState((prev) => ({
					...prev,
					isLoading: false,
					isReady: true,
					proxy,
				}));
			} catch (error) {
				if (!cancelled) setError(error as Error);
			}
		};

		initializeWebGL();

		return () => {
			cancelled = true;
			if (proxyRef.current) {
				proxyRef.current.destroy();
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
			const observer = new ResizeObserver((entries) => {
				const proxy = proxyRef.current;
				if (!proxy) return;
				const { width, height } = entries[0].contentRect;
				if (!width || !height) return;
				const pixelWidth = Math.max(1, Math.round(width * window.devicePixelRatio));
				const pixelHeight = Math.max(1, Math.round(height * window.devicePixelRatio));
				if (canvas.width === pixelWidth && canvas.height === pixelHeight) return;
				canvas.width = pixelWidth;
				canvas.height = pixelHeight;
				void (async () => {
					await proxy.updateUniformAsync('u_resolution', [pixelWidth, pixelHeight]);
					await proxy.resizeAsync(pixelWidth, pixelHeight);
				})().catch(setError);
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
