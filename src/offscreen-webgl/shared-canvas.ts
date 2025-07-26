let sharedCanvas: HTMLCanvasElement | null = null;
let usageCount = 0;
import { useEffect, useRef } from 'react';

function acquireSharedCanvas(): HTMLCanvasElement {
	if (!sharedCanvas) {
		sharedCanvas = document.createElement('canvas');
		sharedCanvas.id = 'offscreen-shared-webgl-canvas';
		sharedCanvas.style.position = 'absolute';
		sharedCanvas.style.top = '0';
		sharedCanvas.style.left = '0';
		sharedCanvas.style.pointerEvents = 'none';
		sharedCanvas.style.zIndex = '9999'; // testing only -- change to aligned with default z-indexes like Tailwind's/shadcn's, might even leave unset
		sharedCanvas.style.overflow = 'hidden';
		sharedCanvas.style.width = '100%';
		sharedCanvas.style.height = '100%';
		sharedCanvas.width = window.innerWidth;
		sharedCanvas.height = window.innerHeight;
		document.body.appendChild(sharedCanvas);
	}

	usageCount++;
	return sharedCanvas;
}

function releaseSharedCanvas() {
	usageCount--;

	if (usageCount <= 0 && sharedCanvas) {
		sharedCanvas.remove();
		sharedCanvas = null;
		usageCount = 0;
	}
}

export function useSharedCanvasLayer(isolate: boolean = false) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);

	useEffect(() => {
		if (!isolate) {
			canvasRef.current = acquireSharedCanvas();

			return () => {
				releaseSharedCanvas();
			};
		}
	}, [isolate]);

	return canvasRef.current;
}
