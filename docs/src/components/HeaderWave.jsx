import { useEffect, useState } from 'react';

const shader = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;

void main() {
  vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y;
  float fade = smoothstep(0.0, 1.0, gl_FragCoord.x / u_resolution.x);
  float d = length(p) * 0.045 * (1.0 - fade);
  float height = mix(0.35, 0.12, fade);
  vec3 color = vec3(
    0.025 / abs(p.y + sin((p.x * (1.0 + d) + u_time) * 0.8) * height),
    0.025 / abs(p.y + sin((p.x + u_time) * 0.8) * height),
    0.025 / abs(p.y + sin((p.x * (1.0 - d) + u_time) * 0.8) * height)
  );
  gl_FragColor = vec4(min(color * 0.45, vec3(0.45)), 1.0);
}`;

export default function HeaderWave() {
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
		<div className="header-wave" aria-hidden="true">
			<div className="header-wave-render">
				{Component && (
					<Component
						fragmentShader={shader}
						refreshRate={20}
						f_each_animate={(manager, frame, time) => {
							manager.updateUniform('u_time', time / 5000);
							manager.paintCanvas();
						}}
					/>
				)}
			</div>
		</div>
	);
}
