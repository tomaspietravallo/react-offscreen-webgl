import { useEffect, useRef, useState, useCallback } from 'react';
import { WebGLManager, WebGLUniformName, RunOnWorkerContextFn } from './gl-manager';
import { WebGLManagerProxy, WebGLManagerProxyType } from './proxy';
import { DEFAULT_FS_SHADER, DEFAULT_VS_SHADER } from '../defaults';
import type { UniformStream } from './uniform-stream';
import { FrameTask, scheduleFrames } from './frame-scheduler';
import { OffscreenWebGLError, ShaderStage } from './errors';

declare const process: { env: Record<string, string | undefined> };

const STREAM_ATTACH_TIMEOUT_MS = 1000;
const VISIBILITY_MARGIN = '100px';

interface PauseState {
	offscreen: boolean;
	hidden: boolean;
	skipped: boolean;
	sent: boolean;
	scheduled: boolean;
}

function isProduction(): boolean {
	try {
		return process.env.NODE_ENV === 'production';
	} catch {
		return false;
	}
}

function resolveShaderURL(url: string, stage: ShaderStage): string {
	try {
		return new URL(url, window.location.origin).toString();
	} catch (error) {
		throw new OffscreenWebGLError('fetch', `Invalid ${stage} shader URL ${url}`, error);
	}
}

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
	onError?: (error: OffscreenWebGLError) => void;
	onReady?: () => void;
	pauseWhenHidden?: boolean;
}

interface UseOffscreenWebGLState {
	isLoading: boolean;
	isReady: boolean;
	hasError: boolean;
	error: OffscreenWebGLError | null;
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
		pauseWhenHidden = true,
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
	const sessionRef = useRef<{ canvas: HTMLCanvasElement; cancelled: boolean; release?: ReturnType<typeof setTimeout> } | null>(null);
	const pauseRef = useRef<PauseState>({ offscreen: false, hidden: false, skipped: false, sent: false, scheduled: false });
	const resumeListenersRef = useRef(new Set<() => void>());
	const observerRef = useRef<ResizeObserver | null>(null);
	const sizeRef = useRef<[number, number]>([0, 0]);
	const sentUniformsRef = useRef<Record<WebGLUniformName, number | number[]>>({});
	const sentFunctionsRef = useRef<Record<string, string>>({});
	const sentRefreshRateRef = useRef<number | null>(null);
	const refreshRateRef = useRef(refreshRate);
	refreshRateRef.current = refreshRate;
	const onErrorRef = useRef(options.onError);
	onErrorRef.current = options.onError;
	const onReadyRef = useRef(options.onReady);
	onReadyRef.current = options.onReady;
	const readyRef = useRef(false);
	const loggedErrorsRef = useRef(new Set<string>());

	const reportError = useCallback((cause: unknown, fatal: boolean) => {
		const error = OffscreenWebGLError.from(cause);
		setState((prev) => ({
			...prev,
			hasError: true,
			error,
			isLoading: false,
			isReady: fatal ? false : prev.isReady,
		}));
		if (onErrorRef.current) {
			onErrorRef.current(error);
			return;
		}
		const key = `${error.kind}:${error.message}`;
		if (isProduction() || loggedErrorsRef.current.has(key)) return;
		loggedErrorsRef.current.add(key);
		console.error('[OffscreenWebGL]', error);
	}, []);

	const setError = useCallback((error: unknown) => reportError(error, true), [reportError]);

	const handleContextRestored = useCallback(() => {
		setState((prev) => (prev.error?.kind === 'context-lost' ? { ...prev, hasError: false, error: null } : prev));
		if (readyRef.current) onReadyRef.current?.();
	}, []);

	const syncPause = useCallback(() => {
		const pause = pauseRef.current;
		if (pause.scheduled) return;
		pause.scheduled = true;
		queueMicrotask(() => {
			pause.scheduled = false;
			const proxy = proxyRef.current;
			const paused = pause.offscreen || pause.hidden || pause.skipped;
			if (!proxy || paused === pause.sent) return;
			pause.sent = paused;
			if (!paused) resumeListenersRef.current.forEach((listener) => listener());
			proxy.setPaused(paused);
		});
	}, []);

	const destroySession = useCallback(() => {
		const session = sessionRef.current;
		if (session) {
			session.cancelled = true;
			clearTimeout(session.release);
		}
		sessionRef.current = null;
		readyRef.current = false;
		proxyRef.current?.destroy();
		proxyRef.current = null;
	}, []);

	// Initialize WebGL
	useEffect(() => {
		if (!canvas) return;
		const release = () => {
			const session = sessionRef.current;
			if (!session || !canvas.isConnected) return destroySession();
			session.release = setTimeout(destroySession);
		};
		const previous = sessionRef.current;
		if (previous?.canvas === canvas) {
			clearTimeout(previous.release);
			return release;
		}
		if (previous) destroySession();

		setState((prev) => ({ ...prev, isLoading: true, isReady: false, hasError: false, error: null, proxy: null }));

		const session = { canvas, cancelled: false };
		sessionRef.current = session;
		pauseRef.current.sent = false;
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
				proxy.onError = (error) => {
					if (!session.cancelled) reportError(error, false);
				};
				proxy.onContextRestored = () => {
					if (!session.cancelled) handleContextRestored();
				};

				const steps: Promise<unknown>[] = [
					options.vertexShaderURL
						? proxy.setRemoteVertexShaderAsync(resolveShaderURL(options.vertexShaderURL, 'vertex'))
						: proxy.setVertexShaderAsync(vertexShader),
				];

				if (options.fragmentShaderURL) {
					steps.push(
						Array.isArray(options.fragmentShaderURL)
							? proxy.setRemoteFragmentShaderGroupsAsync(options.fragmentShaderURL)
							: proxy.setRemoteFragmentShadersAsync(resolveShaderURL(options.fragmentShaderURL, 'fragment'))
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
				if (session.cancelled) return;
				setState((prev) => ({
					...prev,
					isLoading: false,
					isReady: true,
					proxy,
				}));
				readyRef.current = true;
				onReadyRef.current?.();
			} catch (error) {
				if (!session.cancelled) setError(error);
			}
		};

		initializeWebGL();

		return release;
	}, [canvas]);

	useEffect(() => {
		const proxy = proxyRef.current;
		if (!state.isReady || !proxy || !uniformStream) return;
		let active = true;
		let unsubscribe: (() => void) | undefined;
		let frameTask: FrameTask | null = null;
		let attachTimeout: ReturnType<typeof setTimeout> | undefined;
		let latestValues: Record<WebGLUniformName, number | number[]> = {};
		let heldWhilePaused = false;
		const onResume = () => {
			if (!heldWhilePaused) return;
			heldWhilePaused = false;
			proxy.updateUniforms(latestValues);
		};
		resumeListenersRef.current.add(onResume);
		const useMessages = () => {
			if (!active || unsubscribe) return;
			unsubscribe = uniformStream.subscribe((values) => {
				latestValues = values;
				if (pauseRef.current.sent) {
					heldWhilePaused = true;
					return;
				}
				frameTask ??= scheduleFrames(1000 / refreshRateRef.current, () => {
					frameTask?.cancel();
					frameTask = null;
					if (!active) return;
					if (pauseRef.current.sent) {
						heldWhilePaused = true;
						return;
					}
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
					else if (active) setError(error);
				}
			);
		} else useMessages();
		return () => {
			active = false;
			resumeListenersRef.current.delete(onResume);
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
			setError(error);
		}
	}, [functions, state.isReady]);

	useEffect(() => {
		if (!state.isReady || !proxyRef.current) return;

		if (sentRefreshRateRef.current === refreshRate) return;
		try {
			sentRefreshRateRef.current = refreshRate;
			proxyRef.current.setFrameRate(refreshRate);
		} catch (error) {
			setError(error);
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
			setError(error);
		}
	}, [canvas, disableResizeObserver, state.isReady]);

	useEffect(() => {
		if (!state.isReady || !canvas || !proxyRef.current) return;
		const pause = pauseRef.current;
		if (!pauseWhenHidden) pause.offscreen = pause.hidden = pause.skipped = false;
		const cleanups: (() => void)[] = [];
		if (pauseWhenHidden) {
			const onVisibilityChange = () => {
				pause.hidden = document.visibilityState === 'hidden';
				syncPause();
			};
			onVisibilityChange();
			document.addEventListener('visibilitychange', onVisibilityChange);
			cleanups.push(() => document.removeEventListener('visibilitychange', onVisibilityChange));

			if (typeof IntersectionObserver === 'function') {
				const observer = new IntersectionObserver(
					(entries) => {
						pause.offscreen = !entries[entries.length - 1].isIntersecting;
						syncPause();
					},
					{ rootMargin: VISIBILITY_MARGIN, scrollMargin: VISIBILITY_MARGIN } as IntersectionObserverInit
				);
				observer.observe(canvas);
				cleanups.push(() => observer.disconnect());
			}

			if ('oncontentvisibilityautostatechange' in canvas) {
				const skipped = new Set<EventTarget>();
				const onContentVisibilityChange = (event: Event) => {
					const target = event.target as Node;
					if (!target.contains(canvas)) return;
					if ((event as ContentVisibilityAutoStateChangeEvent).skipped) skipped.add(target);
					else skipped.delete(target);
					pause.skipped = skipped.size > 0;
					syncPause();
				};
				document.addEventListener('contentvisibilityautostatechange', onContentVisibilityChange, true);
				cleanups.push(() => document.removeEventListener('contentvisibilityautostatechange', onContentVisibilityChange, true));
			}
		}
		syncPause();

		return () => {
			cleanups.forEach((cleanup) => cleanup());
		};
	}, [canvas, pauseWhenHidden, state.isReady]);

	return state;
}

export function uniformValuesEqual(a: number | number[] | undefined, b: number | number[] | undefined): boolean {
	if (a === b) return true;
	if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}
