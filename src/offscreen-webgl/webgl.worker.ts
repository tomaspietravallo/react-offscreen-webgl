import { ok } from '../utils/try-catch';
import { uuidv4 } from '../utils/uuid';
import { WebGLManager } from './gl-manager';

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
			vertexShader: string;
			fragmentShader: string[];
			uniforms: Record<string, number | number[]>;
			canvas: OffscreenCanvas;
	  }
	| { type: WorkerMessageType.PAUSE }
	| { type: WorkerMessageType.RESUME }
	| { type: WorkerMessageType.ERROR; error: string }
	| { type: WorkerMessageType.CALL_METHOD; id: string; method: keyof WebGLManager; args: any[] }
	| { type: WorkerMessageType.RESPONSE; id: string; result: any; error?: string }
	| { type: WorkerMessageType.EVAL_FN; id: string; fn: string; onEachFrame?: boolean };

let glManager: WebGLManager | null = null;
let frame: number = 0;
let timeEllapsed: number = 0;

const RAF = (callback: (manager: WebGLManager, frame: number, timeEllapsed: number) => any) => {
	let useRAF = typeof requestAnimationFrame === 'function';

	// @todo: Allow for throttling (also for RAF)
	const _ = () => {
		if (useRAF) {
			requestAnimationFrame((x) => {
				callback(glManager!, frame, timeEllapsed);
				_();
			});
		} else {
			// 30 FPS fallback
			setTimeout(() => {
				callback(glManager!, frame, timeEllapsed);
				_();
			}, 1000 / 30);
		}
	};

	_();
};

addEventListener('message', async (event: MessageEvent<WorkerMessages>) => {
	const { data } = event;
	if (!data || !data.type) return;

	switch (data.type) {
		case WorkerMessageType.INIT: {
			const { canvas } = data;
			// 👇 note canvas is an OffscreenCanvas instance
			let m = WebGLManager.fromHTMLCanvasElement(canvas as unknown as HTMLCanvasElement);

			if (m.error) {
				console.error(`[${WORKER_ID}] Error creating WebGLManager:`, m.error);
				postMessage({ type: 'ERROR', error: m.error.message });
				return;
			} else glManager = m.data;
			break;
		}
		case WorkerMessageType.CALL_METHOD: {
			const { method, args, id } = data;
			if (!glManager || !(method in glManager)) {
				postMessage({ type: WorkerMessageType.RESPONSE, id, error: `Method ${method} not found` });
				return;
			}
			try {
				const result = await (glManager as any)[method](...args);
				postMessage({ type: WorkerMessageType.RESPONSE, id, result: JSON.stringify(result) });
			} catch (error) {
				postMessage({ type: WorkerMessageType.RESPONSE, id, error: JSON.stringify(error) });
			}
			break;
		}
		case WorkerMessageType.EVAL_FN: {
			const { fn, onEachFrame, id } = data;
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
					RAF(f);
					postMessage({ type: WorkerMessageType.RESPONSE, id, result: ok('Setup RAF') });
				} else {
					const result = f(glManager, frame, timeEllapsed);
					postMessage({ type: WorkerMessageType.RESPONSE, id, result: JSON.stringify(result) });
				}
			} catch (error) {
				postMessage({ type: WorkerMessageType.RESPONSE, id, error: JSON.stringify(error) });
			}
			break;
		}
		default:
			console.warn(`[OffscreenWebGLWorker] Unknown message type: ${data.type}`);
	}
});
