import { ok } from '../utils/try-catch';
import { uuidv4 } from '../utils/uuid';
import { RunOnWorkerContextFn, WebGLManager } from './gl-manager';

export const WORKER_ID = `OffscreenWebGLWorker-${uuidv4()}`;

export enum WorkerMessageType {
	INIT = 'INIT',
	PAUSE = 'PAUSE',
	RESUME = 'RESUME',
	ERROR = 'ERROR',
	CALL_METHOD = 'CALL_METHOD',
	RESPONSE = 'RESPONSE',
	EVAL_FN = 'EVAL_FN',
}

export type WorkerMessages =
	| {
			proxyId: string;
			type: WorkerMessageType.INIT;
			canvas: OffscreenCanvas;
			async?: boolean;
	  }
	| { type: WorkerMessageType.PAUSE; proxyId: string; async?: boolean }
	| { type: WorkerMessageType.RESUME; proxyId: string; async?: boolean }
	| { type: WorkerMessageType.ERROR; id?: string; error: string; async?: boolean }
	| { type: WorkerMessageType.CALL_METHOD; proxyId: string; id: string; method: keyof WebGLManager; args: any[]; async?: boolean }
	| { type: WorkerMessageType.RESPONSE; id: string; result: any; error?: string }
	| { type: WorkerMessageType.EVAL_FN; proxyId: string; key: string; id: string; fn: string; onEachFrame?: boolean; async?: boolean };

let glManagers: Record<string, WebGLManager> = {};

addEventListener('message', async (event: MessageEvent<WorkerMessages>) => {
	const { data } = event as {
		data: WorkerMessages & { type: WorkerMessageType.INIT | WorkerMessageType.CALL_METHOD | WorkerMessageType.EVAL_FN };
	};

	if (!data || !data.type) return;

	if (!data.proxyId) {
		postMessage({
			type: WorkerMessageType.ERROR,
			error: `[OffscreenWebGLWorker] proxyId is required on inbound messages. ${JSON.stringify(data)}`,
		});
		return;
	}

	if (data.type != WorkerMessageType.INIT && !glManagers[data.proxyId]) {
		postMessage({
			type: WorkerMessageType.ERROR,
			error: `[OffscreenWebGLWorker, ${WORKER_ID}] WebGLManager not initialized for proxyId: ${data.proxyId}`,
		});
		return;
	}

	try {
		switch (data.type) {
			case WorkerMessageType.INIT: {
				const { canvas } = data;
				// 👇 note canvas is an OffscreenCanvas instance
				let m = WebGLManager.fromHTMLCanvasElement(canvas as unknown as HTMLCanvasElement);

				if (m.error) {
					console.error(`[OffscreenWebGLWorker, ${WORKER_ID}] Error creating WebGLManager:`, m.error);
					postMessage({ type: WorkerMessageType.ERROR, error: m.error.message });
					return;
				} else glManagers[data.proxyId] = m.data;
				break;
			}
			case WorkerMessageType.CALL_METHOD: {
				const { method, args, id, async } = data;
				if (!glManagers[data.proxyId] || !(method in glManagers[data.proxyId])) {
					postMessage({
						type: WorkerMessageType.RESPONSE,
						id,
						error: `[OffscreenWebGLWorker] Proxying ${data.proxyId}: Method ${method} not found`,
					});
					return;
				}
				try {
					const result = await (glManagers[data.proxyId] as any)[method](...args);
					if (async) postMessage({ type: WorkerMessageType.RESPONSE, id, result: JSON.stringify(result) });
				} catch (error) {
					postMessage({ type: WorkerMessageType.RESPONSE, id, error: JSON.stringify(error) });
				}
				break;
			}
			case WorkerMessageType.EVAL_FN: {
				const { fn, onEachFrame, id, async, key } = data;
				if (!glManagers[data.proxyId]) {
					postMessage({
						type: WorkerMessageType.RESPONSE,
						id,
						error: `[OffscreenWebGLWorker] Proxying ${data.proxyId}: WebGLManager not initialized`,
					});
					return;
				}
				try {
					const f = new Function('manager', 'frame', 'timeElapsed', `return (${fn})(manager, frame, timeElapsed);`) as (
						manager: WebGLManager,
						frame: number,
						timeElapsed: number
					) => any;
					if (onEachFrame) {
						glManagers[data.proxyId].runOnContext(key, f, true);
						if (async) postMessage({ type: WorkerMessageType.RESPONSE, id, result: ok('Setup RAF') });
					} else {
						const result = glManagers[data.proxyId].runOnContext(key, f, false);
						if (async) postMessage({ type: WorkerMessageType.RESPONSE, id, result: JSON.stringify(result) });
					}
				} catch (error) {
					postMessage({ type: WorkerMessageType.RESPONSE, id, error: JSON.stringify(error) });
				}
				break;
			}
			default: // @ts-ignore-next-line
				console.warn(`[OffscreenWebGLWorker] Unknown message type: ${data.type}`, data);
		}
	} catch (error) {
		const e = new Error(error as any);
		postMessage({
			type: WorkerMessageType.ERROR,
			error: JSON.stringify({ message: e.message, stack: e.stack, name: e.name }),
			id: (data as WorkerMessages & { type: WorkerMessageType.CALL_METHOD }).id, // or undefined
		});
	}
});
