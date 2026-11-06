import { uuidv4 } from '../utils/uuid';
import { RunOnWorkerContextFn, WebGLManager } from './gl-manager';
import { WorkerMessageType, WorkerMessages } from './webgl.worker';
import WebWorker from '../offscreen-webgl/webgl.worker?worker';

type MappedManagerFunctions = { [K in keyof WebGLManager]: WebGLManager[K] extends (...args: any) => any ? WebGLManager[K] : never };
type MappedManagerFunctionsAsync = {
	[K in keyof WebGLManager as `${K & string}Async`]: WebGLManager[K] extends (...args: any) => any
		? (...args: Parameters<WebGLManager[K]>) => Promise<ReturnType<WebGLManager[K]>>
		: never;
};

export type WebGLManagerProxyType = WebGLManagerProxyClass & MappedManagerFunctions & MappedManagerFunctionsAsync;

class WebGLManagerProxyClass {
	private static worker: Worker | null = null;
	private static workerFailure: Error | null = null;
	private static pendingResponses: Record<string, { resolve: (value: any) => void; reject: (error: Error) => void }> = {};
	private readonly PROXY_ID = `WebGLManagerProxy-${uuidv4()}`;

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
		if (!WebGLManagerProxyClass.worker) {
			WebGLManagerProxyClass.worker = new WebWorker();
			WebGLManagerProxyClass.worker.onmessage = WebGLManagerProxyClass.handleMessage;
			WebGLManagerProxyClass.worker.onerror = (event) => {
				const error = new Error(event.message || 'WebGL worker failed');
				WebGLManagerProxyClass.workerFailure = error;
				for (const pending of Object.values(WebGLManagerProxyClass.pendingResponses)) pending.reject(error);
				WebGLManagerProxyClass.pendingResponses = {};
			};
		}

		const offscreenCanvas = canvas.transferControlToOffscreen()!;

		WebGLManagerProxyClass.worker.postMessage(
			{
				type: 'INIT',
				canvas: offscreenCanvas,
				proxyId: this.PROXY_ID,
			} as WorkerMessages,
			{
				transfer: [offscreenCanvas],
			}
		);

		return WebGLManagerProxyClass.wrapThisPrototype(this);
	}

	private static wrapThisPrototype(thisObj: WebGLManagerProxyClass): WebGLManagerProxyType {
		return new Proxy(thisObj, {
			get(target, prop, receiver) {
				if (WebGLManagerProxyClass._managerPrototype[prop as string] && !(prop as string).startsWith('runOnContext')) {
					if (prop.toString().endsWith('Async')) {
						return (...args: any[]) => {
							return thisObj.callMethodAsync(
								WebGLManagerProxyClass._managerPrototype[prop as string] as keyof WebGLManager,
								...args
							);
						};
					} else {
						return (...args: any[]) => {
							thisObj.callMethod(prop as keyof WebGLManager, ...args);
						};
					}
				}
				return Reflect.get(target, prop, receiver);
			},
		}) as unknown as WebGLManagerProxyType;
	}

	private static handleMessage(event: MessageEvent<WorkerMessages>) {
		const { data } = event;
		if (data.type === WorkerMessageType.RESPONSE) {
			const { id, result, error } = data;
			if (WebGLManagerProxyClass.pendingResponses[id]) {
				error
					? WebGLManagerProxyClass.pendingResponses[id].reject(new Error(error))
					: WebGLManagerProxyClass.pendingResponses[id].resolve(result);
				delete WebGLManagerProxyClass.pendingResponses[id];
			} else {
				console.warn(`[WebGLManagerProxy] No pending response for ID: ${id}`, data);
			}
		} else if (data.type === WorkerMessageType.ERROR) {
			const { error, id } = data;
			if (id && WebGLManagerProxyClass.pendingResponses[id]) {
				WebGLManagerProxyClass.pendingResponses[id].reject(new Error(error));
				delete WebGLManagerProxyClass.pendingResponses[id];
			} else {
				console.error(`[WebGLManagerProxy] Error received without pending response for ID: ${id}`, error);
			}
		}
	}

	public callMethod<ManagerMethod extends keyof WebGLManager>(method: ManagerMethod, ...args: any[]): void {
		const id = uuidv4();
		WebGLManagerProxyClass.worker?.postMessage({
			type: WorkerMessageType.CALL_METHOD,
			proxyId: this.PROXY_ID,
			method,
			args,
			id,
		} as WorkerMessages);
		return;
	}

	public callMethodAsync<ManagerMethod extends keyof WebGLManager>(
		method: ManagerMethod,
		...args: any[]
	): Promise<ReturnType<WebGLManager[ManagerMethod] extends (...args: any) => any ? WebGLManager[ManagerMethod] : never>> {
		const id = uuidv4();

		return this.request(id, {
			type: WorkerMessageType.CALL_METHOD,
			proxyId: this.PROXY_ID,
			method,
			args,
			id,
			async: true,
		});
	}

	public runOnContext(key: string, fn: RunOnWorkerContextFn, onEachFrame: boolean = false) {
		const id = uuidv4();
		WebGLManagerProxyClass.worker?.postMessage({
			type: WorkerMessageType.EVAL_FN,
			fn: fn.toString(),
			onEachFrame,
			id,
			proxyId: this.PROXY_ID,
			key,
		} as WorkerMessages);
		return;
	}

	public runOnContextAsync<T>(key: string, fn: RunOnWorkerContextFn<T>, onEachFrame: boolean = false) {
		const id = uuidv4();
		return this.request<T>(id, {
			type: WorkerMessageType.EVAL_FN,
			fn: fn.toString(),
			onEachFrame,
			id,
			async: true,
			proxyId: this.PROXY_ID,
			key,
		});
	}

	private request<T>(id: string, message: WorkerMessages): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			WebGLManagerProxyClass.pendingResponses[id] = { resolve, reject };
			try {
				if (WebGLManagerProxyClass.workerFailure) throw WebGLManagerProxyClass.workerFailure;
				if (!WebGLManagerProxyClass.worker) throw new Error('WebGL worker is unavailable');
				WebGLManagerProxyClass.worker.postMessage(message);
			} catch (error) {
				delete WebGLManagerProxyClass.pendingResponses[id];
				reject(error);
			}
		});
	}
}

export const WebGLManagerProxy = WebGLManagerProxyClass as unknown as {
	new (worker: HTMLCanvasElement): WebGLManagerProxyType;
};
