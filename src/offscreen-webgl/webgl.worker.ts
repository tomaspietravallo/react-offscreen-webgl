import { DEFAULT_FS_SHADER, DEFAULT_VS_SHADER } from '../defaults';
import { uuidv4 } from '../utils/uuid';
import { WebGLManager } from './gl-manager';

export const WORKER_ID = `OffscreenWebGLWorker-${uuidv4()}`;

export enum WorkerMessageType {
	INIT = 'INIT',
	PAUSE = 'PAUSE',
	RESUME = 'RESUME',
	ERROR = 'ERROR',
}

export type WorkerMessages =
	| {
			type: WorkerMessageType.INIT;
			vertexShader: string;
			fragmentShader: string;
			uniforms: Record<string, number | number[]>;
			canvas: OffscreenCanvas;
	  }
	| { type: WorkerMessageType.PAUSE }
	| { type: WorkerMessageType.RESUME }
	| { type: WorkerMessageType.ERROR; error: string };

let glManager: WebGLManager | null = null;

addEventListener('message', async (event) => {
	const { data } = event;
	if (!data || !data.type) return;

	switch (data.type) {
		case WorkerMessageType.INIT: {
			const { vertexShader, fragmentShader, uniforms, canvas } = data;
			console.log(
				`[${WORKER_ID}] Initializing WebGLManager with vertexShader: ${vertexShader}, fragmentShader: ${fragmentShader}, uniforms:`,
				uniforms
			);
			console.log(`[${WORKER_ID}] Canvas size: ${canvas.width}x${canvas.height}`);
			console.log(`[${WORKER_ID}] Canvas transfer control:`, canvas.transferControlToOffscreen ? 'Yes' : 'No');
			let m = WebGLManager.fromHTMLCanvasElement(canvas as HTMLCanvasElement);

			if (m.error) {
				console.error(`[${WORKER_ID}] Error creating WebGLManager:`, m.error);
				postMessage({ type: 'ERROR', error: m.error.message });
				return;
			} else glManager = m.data;

			glManager.compileProgram(DEFAULT_VS_SHADER, [DEFAULT_FS_SHADER]);
			glManager.useProgram();
			glManager.setupWholeScreenQuad();
			glManager.updateUniform('u_resolution', [canvas.width, canvas.height]);
			glManager.paintCanvas();
			break;
		}
		default:
			console.warn(`[OffscreenWebGLWorker] Unknown message type: ${data.type}`);
	}
});
