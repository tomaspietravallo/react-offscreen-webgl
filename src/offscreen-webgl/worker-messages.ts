import type { WebGLManager } from './gl-manager';

export enum WorkerMessageType {
	INIT = 'INIT',
	ERROR = 'ERROR',
	CALL_METHOD = 'CALL_METHOD',
	RESPONSE = 'RESPONSE',
	EVAL_FN = 'EVAL_FN',
	RELEASE = 'RELEASE',
	BATCH = 'BATCH',
}

export type WorkerMessages =
	| { proxyId: string; type: WorkerMessageType.INIT; canvasId: string; output?: OffscreenCanvas; width: number; height: number }
	| { type: WorkerMessageType.RELEASE; canvasId: string }
	| { type: WorkerMessageType.ERROR; id?: string; error: string }
	| { type: WorkerMessageType.CALL_METHOD; proxyId: string; id?: string; method: keyof WebGLManager; args: any[]; async?: boolean }
	| { type: WorkerMessageType.RESPONSE; id: string; result?: any; error?: string }
	| { type: WorkerMessageType.EVAL_FN; proxyId: string; key: string; id?: string; fn: string; onEachFrame?: boolean; async?: boolean }
	| { type: WorkerMessageType.BATCH; messages: WorkerMessages[] };
