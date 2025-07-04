declare global {
	interface Worker extends EventTarget, AbstractWorker, MessageEventTarget<Worker> {
		onmessage: (event: MessageEvent<WorkerMessages>) => void;
		postMessage(message: MessageEvent<WorkerMessages>, transfer?: Transferable[]): void;
	}

	declare function onmessage(event: MessageEvent<WorkerMessages>): void;
	declare function postMessage(message: WorkerMessages, transfer?: Transferable[]): void;
}

export {};
