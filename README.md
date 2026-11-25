# react-offscreen-webgl

[![npm version](https://img.shields.io/npm/v/react-offscreen-webgl?color=blue&label=npm)](https://www.npmjs.com/package/react-offscreen-webgl)
[![npm downloads](https://img.shields.io/npm/dm/react-offscreen-webgl)](https://www.npmjs.com/package/react-offscreen-webgl)
[![React 17+](https://img.shields.io/badge/react-17%2B-61dafb?logo=react)](https://react.dev/)
[![MIT license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

Render WebGL fragment shaders in React with an OffscreenCanvas and a shared Web Worker.

**[Read the documentation →](https://tomaspietravallo.github.io/react-offscreen-webgl/)** for the API, live examples, browser requirements, and usage guides.

> [!WARNING]
> This project is alpha software. The API may change before a stable release.

## Features

- Render off the main thread, with multiple canvases sharing a WebGL context.
- Pass shader uniforms as React props or use a uniform stream for frequent updates.
- Compose multiple shader passes with framebuffer effects.

## Installation

```sh
npm install react-offscreen-webgl
```

React 17 or later is required.

## Quick start

Give the component a sized parent and a GLSL fragment shader. The canvas fills its parent.

```tsx
import { OffscreenWebGL } from 'react-offscreen-webgl';

const shader = `
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
			<OffscreenWebGL fragmentShader={shader} />
		</div>
	);
}
```

The component is browser-only; in an SSR framework, load it on the client. If you use a Content Security Policy, allow `worker-src blob:`. See the [documentation](https://tomaspietravallo.github.io/react-offscreen-webgl/) for browser compatibility and more examples.

## Project links

[Documentation](https://tomaspietravallo.github.io/react-offscreen-webgl/) · [Releases](https://github.com/tomaspietravallo/react-offscreen-webgl/releases) · [Contributing](./CONTRIBUTING.md) · [MIT License](./LICENSE)
