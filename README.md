# react-offscreen-webgl

Render WebGL fragment shaders inside React components using `OffscreenCanvas` and a Web Worker, keeping the render loop off the main thread.

> [!WARNING]
> This project is alpha software under active development. The API may change before a stable release.

---

## Overview

`react-offscreen-webgl` exposes a single `<OffscreenWebGL>` component. Under the hood:

1. The component creates an `HTMLCanvasElement` in the DOM.
2. It transfers control of that canvas to an `OffscreenCanvas` running in a dedicated Web Worker.
3. A `WebGLManager` inside the worker compiles your shaders, manages uniforms, and drives the render loop via `setInterval`.
4. Communication between the React component and the worker happens through a structured proxy (`WebGLManagerProxy`) that serialises method calls over `postMessage`.

Because the render loop runs in the worker, expensive shader work does not block the main-thread event loop.

By default, all `<OffscreenWebGL>` instances that **do not** set `isolate={true}` share a single full-page `<canvas>` element. Each component renders into its own sub-region of that canvas via WebGL scissor and viewport clipping. This reduces the number of WebGL contexts in the page to one.

---

## Browser requirements

| Feature           | MDN link                                                                |
| ----------------- | ----------------------------------------------------------------------- |
| `OffscreenCanvas` | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas) |
| Web Workers       | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Worker)          |
| WebGL             | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API)       |

All three features are required. Server-side rendering is not supported — see [Known limitations](#known-limitations).

---

## Installation

```bash
npm install react-offscreen-webgl
```

Peer dependency: **React 17 or later**.

---

## Quick start

```tsx
import { OffscreenWebGL } from 'react-offscreen-webgl';

const FRAGMENT_SHADER = `
  precision highp float;
  uniform vec2 u_resolution;

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    gl_FragColor = vec4(uv.x, uv.y, 0.0, 1.0);
  }
`;

export default function App() {
	return (
		<div style={{ width: 400, height: 400 }}>
			<OffscreenWebGL fragmentShader={FRAGMENT_SHADER} />
		</div>
	);
}
```

Or load a shader from a URL (e.g. from your `public/` directory):

```tsx
<OffscreenWebGL fragmentShaderURL="/shaders/gradient.glsl" />
```

---

## Props reference

| Prop                    | Type                                    | Default              | Description                                                                                                                                                                |
| ----------------------- | --------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fragmentShader`        | `string \| string[][]`                  | built-in UV gradient | Inline GLSL fragment shader source, or a nested array for ping-pong / multi-pass mode (see below).                                                                         |
| `fragmentShaderURL`     | `string \| string[][]`                  | —                    | URL(s) to fetch the fragment shader(s) from at runtime. Same shape as `fragmentShader`.                                                                                    |
| `vertexShader`          | `string`                                | built-in passthrough | Inline GLSL vertex shader source.                                                                                                                                          |
| `vertexShaderURL`       | `string`                                | —                    | URL to fetch the vertex shader from.                                                                                                                                       |
| `refreshRate`           | `number`                                | `30`                 | Render loop frequency in frames per second.                                                                                                                                |
| `disableResizeObserver` | `boolean`                               | `false`              | When `true`, the component will not automatically resize the WebGL viewport when the canvas element resizes.                                                               |
| `isolate`               | `boolean`                               | `false`              | When `true`, the component creates its own dedicated canvas instead of sharing the global one. Use this when you need an independent GL context.                           |
| `u_<name>`              | `number \| number[]`                    | —                    | Pass a float uniform named `u_<name>` to the shader. A plain `number` becomes `uniform float`; an array becomes `uniform vec2/3/4` depending on length.                    |
| `f_<name>`              | `(manager, frame, timeElapsed) => void` | —                    | A function that runs **once** on the worker context after initialization. Receives the `WebGLManager` instance, the current frame count, and the total elapsed time in ms. |
| `f_each_<name>`         | `(manager, frame, timeElapsed) => void` | —                    | A function that runs **on every frame** in the worker's render loop. The key must contain the substring `each` for the hook to be registered as a per-frame callback.      |

---

## Uniforms

Any prop whose name starts with `u_` is forwarded as a float uniform to the fragment shader.

```tsx
// Passes `uniform float u_time;` and `uniform vec2 u_offset;`
<OffscreenWebGL fragmentShader={myShader} u_time={elapsed} u_offset={[0.5, 0.25]} />
```

`u_resolution` is set automatically by the resize observer and reflects the canvas's current pixel dimensions as a `vec2`. You do not need to pass it manually.

All uniforms are diffed per-frame; only changed values are uploaded to the GPU.

---

## Per-frame callbacks

Use the `f_each_<name>` prop to run arbitrary code in the worker on every frame:

```tsx
<OffscreenWebGL
	fragmentShader={myShader}
	f_each_paint={(manager, frame, timeElapsed) => {
		manager.updateUniform('u_time', timeElapsed / 1000);
		manager.paintCanvas();
	}}
/>
```

> [!IMPORTANT]
> The function is serialised with `.toString()` and evaluated in the worker context. It cannot capture variables from the outer closure. Use uniforms to pass data from React into the shader.

The callback signature is:

```ts
type RunOnWorkerContextFn = (manager: WebGLManager, frame: number, timeElapsed: number) => void;
```

---

## Ping-pong / multi-shader mode

Pass a nested array to `fragmentShader` to run multiple passes per frame. Each inner array is a **group**; within a group, shaders ping-pong using framebuffer objects. The final group writes directly to the canvas.

```tsx
// Two-pass render: first pass → second pass → canvas
<OffscreenWebGL fragmentShader={[['/* pass 1 GLSL */'], ['/* pass 2 GLSL */']]} />
```

Within a group, the previous pass's output is bound as a texture named via `gl.bindTexture`. This lets you implement feedback effects, blur chains, or any multi-pass pipeline.

The same nested array shape is accepted by `fragmentShaderURL`:

```tsx
<OffscreenWebGL fragmentShaderURL={[['/shaders/blur-h.glsl'], ['/shaders/blur-v.glsl']]} />
```

---

## Shared canvas mode

By default (`isolate={false}`), all `<OffscreenWebGL>` instances share a single full-page canvas that is positioned absolutely behind page content. Each component registers its own scissor/viewport region so renders don't bleed into each other.

**Benefits:** Only one WebGL context is created regardless of how many components are on the page. Browsers limit the number of concurrent WebGL contexts per document (typically 8–16), so this matters at scale.

**When to use `isolate={true}`:**

- You need a separate GL context with independent GL state.
- You are embedding the canvas inside a CSS transform or stacking context that would make the shared canvas position calculations incorrect.
- You are debugging and want to isolate one component's rendering.

```tsx
<OffscreenWebGL isolate fragmentShader={myShader} />
```

---

## Known limitations

- **No SSR support.** The component calls `document.createElement`, `window`, and Web Worker APIs. Wrap it in a dynamic import with `{ ssr: false }` (Next.js) or similar guard for server-rendered frameworks.
- **OffscreenCanvas required.** Safari support landed in Safari 17.4 (March 2024). Older browsers are not supported.
- **No media / camera input.** Passing video frames or `ImageBitmap` as textures is not yet implemented.
- **Function serialisation.** `f_each_*` callbacks are stringified and `eval`-ed in the worker. Arrow functions with outer-scope references will not work as expected.
- **Single vertex shader.** All passes share the built-in passthrough vertex shader unless `vertexShader` / `vertexShaderURL` is provided.

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request, and check the [issue tracker](https://github.com/tomaspietravallo/react-offscreen-webgl/issues) for open work items.
