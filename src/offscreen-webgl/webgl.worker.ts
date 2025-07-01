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
	| { type: WorkerMessageType.CALL_METHOD; method: keyof WebGLManager; args: any[] }
	| { type: WorkerMessageType.RESPONSE; id: string; result: any; error?: string };

let glManager: WebGLManager | null = null;

addEventListener('message', async (event) => {
	const { data } = event;
	if (!data || !data.type) return;

	switch (data.type) {
		case WorkerMessageType.INIT: {
			const { vertexShader, fragmentShader, uniforms, canvas } = data;
			let m = WebGLManager.fromHTMLCanvasElement(canvas as HTMLCanvasElement);

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
		default:
			console.warn(`[OffscreenWebGLWorker] Unknown message type: ${data.type}`);
	}
});
