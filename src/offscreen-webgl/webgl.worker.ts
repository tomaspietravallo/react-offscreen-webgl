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
			type: WorkerMessageType.INIT;
			canvas: OffscreenCanvas;
			async?: boolean;
	  }
	| { type: WorkerMessageType.PAUSE; async?: boolean }
	| { type: WorkerMessageType.RESUME; async?: boolean }
	| { type: WorkerMessageType.ERROR; id?: string; error: string; async?: boolean }
	| { type: WorkerMessageType.CALL_METHOD; id: string; method: keyof WebGLManager; args: any[]; async?: boolean }
	| { type: WorkerMessageType.RESPONSE; id: string; result: any; error?: string }
	| { type: WorkerMessageType.EVAL_FN; id: string; fn: string; onEachFrame?: boolean; async?: boolean };

let glManager: WebGLManager | null = null;

addEventListener('message', async (event: MessageEvent<WorkerMessages>) => {
	const { data } = event;
	if (!data || !data.type) return;

	if (data.type != WorkerMessageType.INIT && !glManager) {
		postMessage({ type: WorkerMessageType.ERROR, error: 'WebGLManager not initialized' });
		return;
	}

	try {
		switch (data.type) {
			case WorkerMessageType.INIT: {
				const { canvas } = data;
				// 👇 note canvas is an OffscreenCanvas instance
				let m = WebGLManager.fromHTMLCanvasElement(canvas as unknown as HTMLCanvasElement);

				if (m.error) {
					console.error(`[${WORKER_ID}] Error creating WebGLManager:`, m.error);
					postMessage({ type: WorkerMessageType.ERROR, error: m.error.message });
					return;
				} else glManager = m.data;
				break;
			}
			case WorkerMessageType.CALL_METHOD: {
				const { method, args, id, async } = data;
				if (!glManager || !(method in glManager)) {
					postMessage({ type: WorkerMessageType.RESPONSE, id, error: `Method ${method} not found` });
					return;
				}
				try {
					const result = await (glManager as any)[method](...args);
					if (async) postMessage({ type: WorkerMessageType.RESPONSE, id, result: JSON.stringify(result) });
				} catch (error) {
					postMessage({ type: WorkerMessageType.RESPONSE, id, error: JSON.stringify(error) });
				}
				break;
			}
			case WorkerMessageType.EVAL_FN: {
				const { fn, onEachFrame, id, async } = data;
				if (!glManager) {
					postMessage({ type: WorkerMessageType.RESPONSE, id, error: 'WebGLManager not initialized' });
					return;
				}
				try {
					const f = new Function('manager', 'frame', 'timeEllapsed', `return (${fn})(manager, frame, timeEllapsed);`) as (
						manager: WebGLManager,
						frame: number,
						timeEllapsed: number
					) => any;
					if (onEachFrame) {
						glManager.runOnContext(f, true);
						if (async) postMessage({ type: WorkerMessageType.RESPONSE, id, result: ok('Setup RAF') });
					} else {
						const result = glManager.runOnContext(f, false);
						if (async) postMessage({ type: WorkerMessageType.RESPONSE, id, result: JSON.stringify(result) });
					}
				} catch (error) {
					postMessage({ type: WorkerMessageType.RESPONSE, id, error: JSON.stringify(error) });
				}
				break;
			}
			default:
				console.warn(`[OffscreenWebGLWorker] Unknown message type: ${data.type}`);
		}
	} catch (error) {
		postMessage({
			type: WorkerMessageType.ERROR,
			error: new Error(error as any),
			id: (data as WorkerMessages & { type: WorkerMessageType.CALL_METHOD }).id, // or undefined
		});
	}
});
