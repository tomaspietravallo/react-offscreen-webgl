import { uuidv4 } from '../utils/uuid';
import { WebGLManager } from './gl-manager';

export const WORKER_ID = `OffscreenWebGLWorker-${uuidv4()}`;

export enum WorkerMessageType {
	INIT = 'INIT',
	ERROR = 'ERROR',
	CALL_METHOD = 'CALL_METHOD',
	RESPONSE = 'RESPONSE',
	EVAL_FN = 'EVAL_FN',
	RELEASE = 'RELEASE',
}

export type WorkerMessages =
	| { proxyId: string; type: WorkerMessageType.INIT; canvasId: string; output?: OffscreenCanvas; width: number; height: number }
	| { type: WorkerMessageType.RELEASE; canvasId: string }
	| { type: WorkerMessageType.ERROR; id?: string; error: string }
	| { type: WorkerMessageType.CALL_METHOD; proxyId: string; id: string; method: keyof WebGLManager; args: any[]; async?: boolean }
	| { type: WorkerMessageType.RESPONSE; id: string; result?: any; error?: string }
	| { type: WorkerMessageType.EVAL_FN; proxyId: string; key: string; id: string; fn: string; onEachFrame?: boolean; async?: boolean };

type Request = Extract<
	WorkerMessages,
	{ proxyId: string; type: WorkerMessageType.INIT | WorkerMessageType.CALL_METHOD | WorkerMessageType.EVAL_FN }
>;
const managers = new Map<string, WebGLManager>();
const failures = new Map<string, Error>();
const queues = new Map<string, Promise<void>>();
let sharedCanvas: OffscreenCanvas | undefined;
const outputs = new Map<string, ImageBitmapRenderingContext>();

function present(canvasId: string, bitmap: ImageBitmap): void {
	const output = outputs.get(canvasId);
	if (!output) return bitmap.close();
	const canvas = output.canvas as OffscreenCanvas;
	if (canvas.width !== bitmap.width) canvas.width = bitmap.width;
	if (canvas.height !== bitmap.height) canvas.height = bitmap.height;
	output.transferFromImageBitmap(bitmap);
}

async function handle(data: Request): Promise<void> {
	try {
		if (data.type === WorkerMessageType.INIT) {
			sharedCanvas ||= new OffscreenCanvas(data.width, data.height);
			const canvas = sharedCanvas;
			if (data.output) {
				const output = data.output.getContext('bitmaprenderer');
				if (!output) throw new Error('ImageBitmap rendering is not supported');
				outputs.set(data.canvasId, output);
			}
			const result = WebGLManager.fromHTMLCanvasElement(canvas as unknown as HTMLCanvasElement, data.width, data.height, () => {
				present(data.canvasId, canvas.transferToImageBitmap());
			});
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
		if (data.async) postMessage({ type: WorkerMessageType.RESPONSE, id: data.id, result });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (data.type === WorkerMessageType.INIT) failures.set(data.proxyId, new Error(message));
		postMessage({ type: WorkerMessageType.ERROR, id: 'id' in data ? data.id : undefined, error: message });
	}
}

addEventListener('message', (event: MessageEvent<Request | Extract<WorkerMessages, { type: WorkerMessageType.RELEASE }>>) => {
	const data = event.data;
	if (data?.type === WorkerMessageType.RELEASE) {
		outputs.delete(data.canvasId);
		return;
	}
	if (!data?.proxyId) return;
	const queue = (queues.get(data.proxyId) || Promise.resolve()).then(() => handle(data));
	queues.set(data.proxyId, queue);
	void queue.finally(() => {
		if (queues.get(data.proxyId) === queue) queues.delete(data.proxyId);
	});
});
