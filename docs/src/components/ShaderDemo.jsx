import { useEffect, useState } from 'react';

const shader = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_xScale;
uniform float u_yScale;
uniform float u_aberration;

void main() {
  vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution) / min(u_resolution.x, u_resolution.y);
  float d = length(p) * u_aberration;
  float rx = p.x * (1.0 + d);
  float gx = p.x;
  float bx = p.x * (1.0 - d);

  gl_FragColor = vec4(
    0.05 / abs(p.y + sin((rx + u_time) * u_xScale) * u_yScale),
    0.05 / abs(p.y + sin((gx + u_time) * u_xScale) * u_yScale),
    0.05 / abs(p.y + sin((bx + u_time) * u_xScale) * u_yScale),
    1.0
  );
}`;

export default function ShaderDemo() {
	const [aberration, setAberration] = useState(0.05);
	const [height, setHeight] = useState(0.55);
	const [frequency, setFrequency] = useState(1.2);
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
			<div className="demo-canvas" aria-label="Animated rainbow wave rendered with WebGL">
				{Component && (
					<Component
						fragmentShader={shader}
						u_xScale={frequency}
						u_yScale={height}
						u_aberration={aberration}
						f_each_animate={(manager, frame, time) => {
							manager.updateUniform('u_time', time / 5000);
							manager.paintCanvas();
						}}
					/>
				)}
			</div>
			<div className="demo-controls">
				<div className="sliders">
					<label>
						Frequency{' '}
						<input
							type="range"
							min="0.3"
							max="3"
							step="0.01"
							value={frequency}
							onChange={(event) => setFrequency(Number(event.target.value))}
						/>
					</label>
					<label>
						Aberration{' '}
						<input
							type="range"
							min="0"
							max="0.1"
							step="0.005"
							value={aberration}
							onChange={(event) => setAberration(Number(event.target.value))}
						/>
					</label>
					<label>
						Wave height{' '}
						<input
							type="range"
							min="0.1"
							max="1"
							step="0.01"
							value={height}
							onChange={(event) => setHeight(Number(event.target.value))}
						/>
					</label>
				</div>
			</div>
		</div>
	);
}
