import { uuidv4 } from '../utils/uuid';
import { WebGLManager } from './gl-manager';
import { WorkerMessageType, WorkerMessages } from './webgl.worker';

export class WebGLManagerProxy {
	private worker: Worker;
	private pendingResponses: Record<string, (response: any) => void> = {};

	constructor(worker: Worker) {
		this.worker = worker;
		this.worker.onmessage = this.handleMessage.bind(this);
	}

	private handleMessage(event: MessageEvent<WorkerMessages>) {
		const { data } = event;
		if (data.type === WorkerMessageType.RESPONSE) {
			const { id, result, error } = data;
			if (this.pendingResponses[id]) {
				this.pendingResponses[id](error ? Promise.reject(new Error(error)) : Promise.resolve(result));
				delete this.pendingResponses[id];
			}
		}
	}

	public callMethod<ManagerMethod extends keyof WebGLManager>(
		method: ManagerMethod,
		...args: any[]
	): Promise<ReturnType<WebGLManager[ManagerMethod] extends (...args: any) => any ? WebGLManager[ManagerMethod] : never>> {
		const id = uuidv4();
		this.worker.postMessage({ type: WorkerMessageType.CALL_METHOD, method, args, id } as WorkerMessages);
		return new Promise((resolve) => {
			this.pendingResponses[id] = resolve;
		});
	}

	public run(fn: (manager: WebGLManager) => void, onEachFrame: boolean = false) {
		const id = uuidv4();
		this.worker.postMessage({
			type: WorkerMessageType.EVAL_FN,
			fn: fn.toString(),
			onEachFrame,
			id,
		} as WorkerMessages);
		return new Promise((resolve) => {
			this.pendingResponses[id] = resolve;
		});
	}
}
