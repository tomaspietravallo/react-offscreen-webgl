import { uuidv4 } from '../utils/uuid';
import { RunOnWorkerContextFn, WebGLManager, WebGLUniformName } from './gl-manager';
import { WorkerMessageType, WorkerMessages } from './webgl.worker';
import WebWorker from '../offscreen-webgl/webgl.worker?worker';

type MappedManagerFunctions = { [K in keyof WebGLManager]: WebGLManager[K] extends (...args: any) => any ? WebGLManager[K] : never };
type MappedManagerFunctionsAsync = {
	[K in keyof WebGLManager as `${K & string}Async`]: WebGLManager[K] extends (...args: any) => any
		? (args?: any) => Promise<ReturnType<WebGLManager[K]>>
		: never;
};

export type WebGLManagerProxyType = WebGLManagerProxyClass & MappedManagerFunctions & MappedManagerFunctionsAsync;

class WebGLManagerProxyClass {
	private worker: Worker;
	private pendingResponses: Record<string, (response: any) => void> = {};
	private static readonly _managerPrototype = Object.getOwnPropertyNames(WebGLManager.prototype).reduce(
		(acc, prop) => {
			if ((WebGLManager.prototype as Record<string, any>)[prop as string] instanceof Function) {
				acc[prop] = prop + 'Async';
				acc[prop + 'Async'] = prop;
			}
			return acc;
		},
		{} as Record<string, string>
	);

	constructor(canvas: HTMLCanvasElement) {
		this.worker = new WebWorker();
		this.worker.onmessage = this.handleMessage.bind(this);

		const offscreenCanvas = canvas.transferControlToOffscreen()!;

		this.worker.postMessage(
			{
				type: 'INIT',
				canvas: offscreenCanvas,
			} as WorkerMessages,
			{
				transfer: [offscreenCanvas],
			}
		);

		return new Proxy(this, {
			get(target, prop, receiver) {
				if (WebGLManagerProxyClass._managerPrototype[prop as string]) {
					if (prop.toString().endsWith('Async')) {
						return (...args: any[]) => {
							return target.callMethodAsync(
								WebGLManagerProxyClass._managerPrototype[prop as string] as keyof WebGLManager,
								...args
							);
						};
					} else {
						return (...args: any[]) => {
							target.callMethod(prop as keyof WebGLManager, ...args);
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
			} else {
				console.warn(`[WebGLManagerProxy] No pending response for ID: ${id}`, data);
			}
		} else if (data.type === WorkerMessageType.ERROR) {
			const { error, id } = data;
			if (id && this.pendingResponses[id]) {
				this.pendingResponses[id](Promise.reject(new Error(error)));
				delete this.pendingResponses[id];
			} else {
				console.error(`[WebGLManagerProxy] Error received without pending response for ID: ${id}`, error);
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

	public runArbitraryOnWorkerContext(fn: RunOnWorkerContextFn, onEachFrame: boolean = false) {
		const id = uuidv4();
		this.worker.postMessage({
			type: WorkerMessageType.EVAL_FN,
			fn: fn.toString(),
			onEachFrame,
			id,
		} as WorkerMessages);
		return;
	}

	public runArbitraryOnWorkerContextAsync<T>(fn: RunOnWorkerContextFn<T>, onEachFrame: boolean = false) {
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
	new (worker: HTMLCanvasElement): WebGLManagerProxyType;
};
