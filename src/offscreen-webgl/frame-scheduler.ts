const FRAME_TOLERANCE_MS = 2;

export interface FrameTask {
	interval: number;
	cancel(): void;
}

interface ScheduledTask extends FrameTask {
	last: number;
	run: (now: number) => void;
}

const tasks = new Set<ScheduledTask>();
let pending = false;

function requestFrame(): void {
	if (pending || !tasks.size) return;
	pending = true;
	if (typeof requestAnimationFrame === 'function') {
		requestAnimationFrame(tick);
		return;
	}
	const now = performance.now();
	let delay = Infinity;
	tasks.forEach((task) => (delay = Math.min(delay, task.last + task.interval - now)));
	setTimeout(() => tick(performance.now()), Math.max(0, delay));
}

function tick(now: number): void {
	pending = false;
	for (const task of Array.from(tasks)) {
		if (!tasks.has(task) || now - task.last < task.interval - FRAME_TOLERANCE_MS) continue;
		task.last += task.interval;
		if (now - task.last > task.interval) task.last = now;
		task.run(now);
	}
	requestFrame();
}

export function scheduleFrames(interval: number, run: (now: number) => void): FrameTask {
	const task: ScheduledTask = {
		interval,
		last: performance.now(),
		run,
		cancel: () => {
			tasks.delete(task);
		},
	};
	tasks.add(task);
	requestFrame();
	return task;
}
