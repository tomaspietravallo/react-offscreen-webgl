import { uuidv4 } from '../utils/uuid';
import { WebGLManager, WebGLUniformName } from './gl-manager';
import { WorkerMessageType, WorkerMessages } from './webgl.worker';

type MappedManagerFunctions = { [K in keyof WebGLManager]: WebGLManager[K] extends Function ? WebGLManager[K] : never };
type MappedManagerFunctionsAsync = {
	[K in keyof WebGLManager as `${K & string}Async`]: WebGLManager[K] extends Function ? WebGLManager[K] : never;
};

export type WebGLManagerProxyType = WebGLManagerProxyClass & MappedManagerFunctions & MappedManagerFunctionsAsync;

class WebGLManagerProxyClass {
	private worker: Worker;
	private pendingResponses: Record<string, (response: any) => void> = {};
	private static readonly _managerPrototype = Object.getOwnPropertyNames(WebGLManager.prototype);

	constructor(worker: Worker) {
		this.worker = worker;
		this.worker.onmessage = this.handleMessage.bind(this);

		return new Proxy(this, {
			get(target, prop, receiver) {
				if (WebGLManagerProxyClass._managerPrototype.includes(prop as string)) {
					if (!prop.toString().endsWith('Async')) {
						return (...args: any[]) => {
							target.callMethod(prop as keyof WebGLManager, ...args);
						};
					} else {
						return (...args: any[]) => {
							target.callMethodAsync(prop as keyof WebGLManager, ...args);
						};
					}
				}
				return Reflect.get(target, prop, receiver);
			},
		}) as unknown as WebGLManagerProxyType;
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

	public callMethod<ManagerMethod extends keyof WebGLManager>(method: ManagerMethod, ...args: any[]): void {
		const id = uuidv4();
		this.worker.postMessage({ type: WorkerMessageType.CALL_METHOD, method, args, id } as WorkerMessages);
		return;
	}

	public callMethodAsync<ManagerMethod extends keyof WebGLManager>(
		method: ManagerMethod,
		...args: any[]
	): Promise<ReturnType<WebGLManager[ManagerMethod] extends (...args: any) => any ? WebGLManager[ManagerMethod] : never>> {
		const id = uuidv4();
		this.worker.postMessage({ type: WorkerMessageType.CALL_METHOD, method, args, id, async: true } as WorkerMessages);
		return new Promise((resolve) => {
			this.pendingResponses[id] = resolve;
		});
	}

	public runArbitraryOnWorkerContext(
		fn: (manager: WebGLManager, frame: number, timeEllapsed: number) => void,
		onEachFrame: boolean = false
	) {
		const id = uuidv4();
		this.worker.postMessage({
			type: WorkerMessageType.EVAL_FN,
			fn: fn.toString(),
			onEachFrame,
			id,
		} as WorkerMessages);
		return;
	}

	public runArbitraryOnWorkerContextAsync<T>(
		fn: (manager: WebGLManager, frame: number, timeEllapsed: number) => T,
		onEachFrame: boolean = false
	) {
		const id = uuidv4();
		this.worker.postMessage({
			type: WorkerMessageType.EVAL_FN,
			fn: fn.toString(),
			onEachFrame,
			id,
			async: true,
		} as WorkerMessages);

		return new Promise<T>((resolve) => {
			this.pendingResponses[id] = resolve;
		});
	}
}

export const WebGLManagerProxy = WebGLManagerProxyClass as unknown as {
	new (worker: Worker): WebGLManagerProxyType;
};
