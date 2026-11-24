import { useEffect, useRef, useState, useCallback } from 'react';
import { WebGLManager, WebGLUniformName, RunOnWorkerContextFn } from './gl-manager';
import { WebGLManagerProxy, WebGLManagerProxyType } from './proxy';
import { DEFAULT_FS_SHADER, DEFAULT_VS_SHADER } from '../defaults';
import type { UniformStream } from './uniform-stream';
import { FrameTask, scheduleFrames } from './frame-scheduler';

const STREAM_ATTACH_TIMEOUT_MS = 1000;

interface UseOffscreenWebGLOptions {
	vertexShader?: string;
	vertexShaderURL?: string;
	fragmentShader?: string | string[][];
	fragmentShaderURL?: string | string[][];
	refreshRate?: number;
	disableResizeObserver?: boolean;
	uniforms?: Record<WebGLUniformName, number | number[]>;
	uniformStream?: UniformStream;
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
		uniformStream,
		functions = {},
	} = options;

	useState(() => {
		if (typeof Worker === 'undefined') return;
		try {
			WebGLManagerProxy.prewarm();
		} catch {}
	});

	const [state, setState] = useState<UseOffscreenWebGLState>({
		isLoading: false,
		isReady: false,
		hasError: false,
		error: null,
		proxy: null,
	});

	const proxyRef = useRef<WebGLManagerProxyType | null>(null);
	const observerRef = useRef<ResizeObserver | null>(null);
	const sizeRef = useRef<[number, number]>([0, 0]);
	const sentUniformsRef = useRef<Record<WebGLUniformName, number | number[]>>({});
	const sentFunctionsRef = useRef<Record<string, string>>({});
	const sentRefreshRateRef = useRef<number | null>(null);
	const refreshRateRef = useRef(refreshRate);
	refreshRateRef.current = refreshRate;

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
				let size: [number, number] = [canvas.width, canvas.height];
				if (!disableResizeObserver) {
					const rect = canvas.getBoundingClientRect();
					if (rect.width > 0 && rect.height > 0) {
						size = [
							Math.max(1, Math.round(rect.width * window.devicePixelRatio)),
							Math.max(1, Math.round(rect.height * window.devicePixelRatio)),
						];
					}
				}
				sizeRef.current = size;
				const proxy = new WebGLManagerProxy(canvas) as any as WebGLManagerProxyType;
				proxyRef.current = proxy;

				const steps: Promise<unknown>[] = [
					options.vertexShaderURL
						? proxy.setRemoteVertexShaderAsync(new URL(options.vertexShaderURL, window.location.origin).toString())
						: proxy.setVertexShaderAsync(vertexShader),
				];

				if (options.fragmentShaderURL) {
					steps.push(
						Array.isArray(options.fragmentShaderURL)
							? proxy.setRemoteFragmentShaderGroupsAsync(options.fragmentShaderURL)
							: proxy.setRemoteFragmentShadersAsync(new URL(options.fragmentShaderURL, window.location.origin).toString())
					);
				} else {
					steps.push(
						Array.isArray(fragmentShader)
							? proxy.setFragmentShaderGroupsAsync(fragmentShader)
							: proxy.setFragmentShadersAsync([fragmentShader])
					);
				}

				steps.push(proxy.setupWholeScreenQuadAsync(), proxy.updateUniformsAsync(uniforms));
				sentUniformsRef.current = { ...uniforms };

				for (const [key, fn] of Object.entries(functions)) steps.push(proxy.runOnContextAsync(key, fn, key.includes('each')));
				sentFunctionsRef.current = Object.fromEntries(Object.entries(functions).map(([key, fn]) => [key, fn.toString()]));

				steps.push(proxy.setFrameRateAsync(refreshRate));
				sentRefreshRateRef.current = refreshRate;

				steps.push(proxy.updateUniformAsync('u_resolution', size), proxy.resizeAsync(size[0], size[1]));
				await Promise.all(steps);
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
		const proxy = proxyRef.current;
		if (!state.isReady || !proxy || !uniformStream) return;
		let active = true;
		let unsubscribe: (() => void) | undefined;
		let frameTask: FrameTask | null = null;
		let attachTimeout: ReturnType<typeof setTimeout> | undefined;
		let latestValues: Record<WebGLUniformName, number | number[]> = {};
		const useMessages = () => {
			if (!active || unsubscribe) return;
			unsubscribe = uniformStream.subscribe((values) => {
				latestValues = values;
				frameTask ??= scheduleFrames(1000 / refreshRateRef.current, () => {
					frameTask?.cancel();
					frameTask = null;
					if (!active) return;
					proxy.updateUniforms(latestValues);
					proxy.paintCanvas();
				});
			});
		};
		if (uniformStream.sharedMemory) {
			attachTimeout = setTimeout(() => {
				if (!active) return;
				proxy.setUniformStream(null);
				useMessages();
			}, STREAM_ATTACH_TIMEOUT_MS);
			proxy.setUniformStreamAsync(uniformStream.sharedMemory).then(
				() => clearTimeout(attachTimeout),
				(error) => {
					clearTimeout(attachTimeout);
					if (error instanceof DOMException && error.name === 'DataCloneError') useMessages();
					else if (active) setError(error as Error);
				}
			);
		} else useMessages();
		return () => {
			active = false;
			clearTimeout(attachTimeout);
			unsubscribe?.();
			frameTask?.cancel();
			if (uniformStream.sharedMemory && proxyRef.current === proxy) proxy.setUniformStream(null);
		};
	}, [uniformStream, state.isReady]);

	useEffect(() => {
		if (!state.isReady || !proxyRef.current) return;

		const sent = sentUniformsRef.current;
		const changed = Object.fromEntries(
			Object.entries(uniforms).filter(([key, value]) => !uniformValuesEqual(sent[key as WebGLUniformName], value))
		) as Record<WebGLUniformName, number | number[]>;
		if (!Object.keys(changed).length) return;
		Object.assign(sent, changed);
		proxyRef.current.updateUniforms(changed);
		proxyRef.current.paintCanvas();
	}, [uniforms, state.isReady]);

	useEffect(() => {
		if (!state.isReady || !proxyRef.current) return;

		try {
			for (const [key, fn] of Object.entries(functions)) {
				const source = fn.toString();
				if (sentFunctionsRef.current[key] === source) continue;
				sentFunctionsRef.current[key] = source;
				proxyRef.current.runOnContext(key, fn, key.includes('each'));
			}
		} catch (error) {
			setError(error as Error);
		}
	}, [functions, state.isReady]);

	useEffect(() => {
		if (!state.isReady || !proxyRef.current) return;

		if (sentRefreshRateRef.current === refreshRate) return;
		try {
			sentRefreshRateRef.current = refreshRate;
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
				if (sizeRef.current[0] === pixelWidth && sizeRef.current[1] === pixelHeight) return;
				sizeRef.current = [pixelWidth, pixelHeight];
				proxy.updateUniform('u_resolution', [pixelWidth, pixelHeight]);
				proxy.resizeAsync(pixelWidth, pixelHeight).catch(setError);
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

export function uniformValuesEqual(a: number | number[] | undefined, b: number | number[] | undefined): boolean {
	if (a === b) return true;
	if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}
