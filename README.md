# React Offscreen WebGL

This repo tracks the development of an easy to use offscreen canvas for WebGL shaders

> [!WARNING]
> This project is under active development.

## Example

Here's how to use the `OffscreenWebGL` component. This example uses a GLSL file hosted on the public folder, and creates an offscreen canvas element with a web worker attached that renders the shader source.

```glsl
// /public/shader.glsl
precision highp float;
uniform vec2 u_resolution;

void main() {
	vec2 uv = gl_FragCoord.xy / u_resolution;
	gl_FragColor = vec4(uv.x, uv.y, 0., 1.);
}
```

```jsx
// /src/App.jsx
import { OffscreenWebGL } from 'react-offscreen-webgl';

function App() {
	return (
		<div>
			<OffscreenWebGL fragmentShaderURL={'shader.glsl'} />
		</div>
	);
}

export default App;
```

## Contributing

If you want to contribute to this project, be sure to check the issues and the [project used to track them](https://github.com/users/tomaspietravallo/projects/4). Be sure to check [CONTRIBUTING.md](./CONTRIBUTING.md) for more information.
