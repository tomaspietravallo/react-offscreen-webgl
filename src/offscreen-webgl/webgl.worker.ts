import { WebGLManager } from './gl-manager';
import { WorkerMessageType, type WorkerMessages } from './worker-messages';

type Request = Extract<
	WorkerMessages,
	{ proxyId: string; type: WorkerMessageType.INIT | WorkerMessageType.CALL_METHOD | WorkerMessageType.EVAL_FN }
>;
const managers = new Map<string, WebGLManager>();
const failures = new Map<string, Error>();
const queues = new Map<string, Promise<void>>();
const sharedCanvas = new OffscreenCanvas(1, 1);
sharedCanvas.getContext('webgl');
const outputs = new Map<string, OffscreenCanvasRenderingContext2D>();

function present(canvasId: string, source: OffscreenCanvas, width: number, height: number): void {
	const output = outputs.get(canvasId);
	if (!output) return;
	const canvas = output.canvas;
	if (canvas.width !== width || canvas.height !== height) {
		canvas.width = width;
		canvas.height = height;
		output.globalCompositeOperation = 'copy';
	}
	output.drawImage(source, 0, source.height - height, width, height, 0, 0, width, height);
}

async function handle(data: Request): Promise<void> {
	try {
		if (data.type === WorkerMessageType.INIT) {
			const canvas = sharedCanvas;
			if (data.output) {
				const output = data.output.getContext('2d');
				if (!output) throw new Error('2D canvas rendering is not supported');
				output.globalCompositeOperation = 'copy';
				outputs.set(data.canvasId, output);
			}
			const result = WebGLManager.fromHTMLCanvasElement(
				canvas as unknown as HTMLCanvasElement,
				data.width,
				data.height,
				(width, height) => present(data.canvasId, canvas, width, height)
			);
			if (result.error) throw result.error;
			managers.set(data.proxyId, result.data);
			failures.delete(data.proxyId);
			return;
		}

		const manager = managers.get(data.proxyId);
		if (!manager) throw failures.get(data.proxyId) || new Error(`WebGLManager not initialized for ${data.proxyId}`);
		let result: any;
		if (data.type === WorkerMessageType.CALL_METHOD) {
			const method = manager[data.method];
			if (typeof method !== 'function') throw new Error(`Method ${data.method} not found`);
			result = await (method as (...args: any[]) => any).apply(manager, data.args);
			if (data.method === 'destroy') managers.delete(data.proxyId);
		} else {
			const fn = new Function('manager', 'frame', 'timeElapsed', `return (${data.fn})(manager, frame, timeElapsed);`);
			result = await manager.runOnContext(data.key, fn as any, data.onEachFrame);
		}

		if (data.type === WorkerMessageType.CALL_METHOD && result && typeof result === 'object' && 'error' in result && 'data' in result) {
			if (result.error) throw result.error;
			// Manager and WebGL objects cannot be cloned across the worker boundary.
			result = null;
		}
		if (data.async && data.id) postMessage({ type: WorkerMessageType.RESPONSE, id: data.id, result });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (data.type === WorkerMessageType.INIT) failures.set(data.proxyId, new Error(message));
		postMessage({ type: WorkerMessageType.ERROR, id: 'id' in data ? data.id : undefined, error: message });
	}
}

function dispatch(data: WorkerMessages): void {
	if (data?.type === WorkerMessageType.BATCH) return data.messages.forEach(dispatch);
	if (data?.type === WorkerMessageType.RELEASE) {
		outputs.delete(data.canvasId);
		return;
	}
	if (!data || !('proxyId' in data)) return;
	const queue = (queues.get(data.proxyId) || Promise.resolve()).then(() => handle(data));
	queues.set(data.proxyId, queue);
	void queue.finally(() => {
		if (queues.get(data.proxyId) === queue) queues.delete(data.proxyId);
	});
}

addEventListener('message', (event: MessageEvent<WorkerMessages>) => dispatch(event.data));
