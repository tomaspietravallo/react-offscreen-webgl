import { createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { OffscreenWebGL } from '../../src/offscreen-webgl/offscreen-webgl';

describe('OffscreenWebGL', () => {
	it('mounts in StrictMode, sizes its output, and survives a sibling unmount', async () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const component = (key: string) =>
			createElement('div', { key, style: { width: '40px', height: '20px' } }, createElement(OffscreenWebGL));
		try {
			root.render(createElement(StrictMode, null, component('a'), component('b')));
			await vi.waitFor(() => {
				const canvases = container.querySelectorAll('canvas');
				expect(canvases.length).toBe(2);
				for (const canvas of canvases) {
					expect(canvas.dataset.ready).toBe('true');
					expect(canvas.width).toBe(Math.round(40 * window.devicePixelRatio));
					expect(canvas.height).toBe(Math.round(20 * window.devicePixelRatio));
				}
			});
			root.render(createElement(StrictMode, null, component('b')));
			await vi.waitFor(() => expect(container.querySelectorAll('canvas').length).toBe(1));
			const canvas = container.querySelector('canvas')!;
			await vi.waitFor(() => expect(canvas.dataset.ready).toBe('true'));
			(canvas.parentElement as HTMLElement).style.width = '60px';
			await vi.waitFor(() => expect(canvas.width).toBe(Math.round(60 * window.devicePixelRatio)));
		} finally {
			root.unmount();
			container.remove();
		}
	});
});
