import { useEffect, useState } from 'react';

const shader = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_scale;

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float wave = sin(length(p) * u_scale - u_time * 1.5);
  vec3 ink = vec3(0.08, 0.13, 0.36);
  vec3 glow = vec3(0.44, 0.89, 0.79);
  vec3 color = mix(ink, glow, smoothstep(-0.8, 1.0, wave));
  gl_FragColor = vec4(color, 1.0);
}`;

export default function ShaderDemo() {
	const [scale, setScale] = useState(14);
	const [Component, setComponent] = useState(null);
	useEffect(() => {
		let active = true;
		import('../../../src/index').then(({ OffscreenWebGL }) => {
			if (active) setComponent(() => OffscreenWebGL);
		});
		return () => {
			active = false;
		};
	}, []);
	return (
		<div className="demo">
			<div className="demo-canvas" aria-label="Animated concentric waves rendered with WebGL">
				{Component && (
					<Component
						fragmentShader={shader}
						u_scale={scale}
						f_each_animate={(manager, frame, time) => {
							manager.updateUniform('u_time', time / 1000);
							manager.paintCanvas();
						}}
					/>
				)}
			</div>
			<div className="demo-controls">
				<span>
					<span className="live-dot" /> LIVE EXAMPLE <span className="demo-separator">/</span> WORKER RENDERED
				</span>
				<label>
					Wave density{' '}
					<input type="range" min="6" max="28" value={scale} onChange={(event) => setScale(Number(event.target.value))} />
				</label>
			</div>
		</div>
	);
}
