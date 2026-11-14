import { describe, expect, it } from 'vitest';
import { scheduleFrames } from '../../src/offscreen-webgl/frame-scheduler';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('frame scheduler', () => {
	it('caps tasks at their interval and stops after cancel', async () => {
		let fast = 0;
		let slow = 0;
		const fastTask = scheduleFrames(1000 / 1000, () => fast++);
		const slowTask = scheduleFrames(1000 / 10, () => slow++);
		await wait(500);
		fastTask.cancel();
		slowTask.cancel();
		expect(slow).toBeGreaterThanOrEqual(3);
		expect(slow).toBeLessThanOrEqual(6);
		expect(fast).toBeGreaterThan(slow);
		const stopped = fast;
		await wait(100);
		expect(fast).toBe(stopped);
	});

	it('applies interval changes to a running task', async () => {
		const times: number[] = [];
		const task = scheduleFrames(1000 / 5, (now) => times.push(now));
		task.interval = 1000 / 30;
		await wait(300);
		task.cancel();
		expect(times.length).toBeGreaterThanOrEqual(5);
	});
});
