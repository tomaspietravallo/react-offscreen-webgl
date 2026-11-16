import './App.css';
import { OffscreenWebGL } from '../../../src/index';
import { Suspense, useEffect, useRef, useState } from 'react';

function OffscreenWebGLContainer(props) {
	return (
		<div className="shader-container">
			<OffscreenWebGL
				f_each_paint={(manager, frame, time) => {
					manager.paintCanvas();
				}}
				{...props}
			/>
		</div>
	);
}

function splitShaderCodeByBuffer(shaderCode) {
	const globalPartMatch = shaderCode.match(/^[\s\S]*?(?=#if\s+defined\(BUFFER_0\))/);
	const globalParts = globalPartMatch ? globalPartMatch[0].trim() : '';

	const buffer0Match = shaderCode.match(/#if\s+defined\(BUFFER_0\)([\s\S]*?)(?=#elif\s+defined\(BUFFER_1\)|#else|#endif)/);
	const buffer1Match = shaderCode.match(/#elif\s+defined\(BUFFER_1\)([\s\S]*?)(?=#else|#endif)/);
	const elseMatch = shaderCode.match(/#else([\s\S]*?)(?=#endif)/);

	const format = (body) => `${globalParts}\n\n${body.trim()}`;

	return {
		BUFFER_0: buffer0Match ? format(buffer0Match[1]) : null,
		BUFFER_1: buffer1Match ? format(buffer1Match[1]) : null,
		DEFAULT: elseMatch ? format(elseMatch[1]) : null,
	};
}

/**
 *
 * @param {{ url: string }} props
 * @returns
 */
function SplitShaderURL(props = {}) {
	const [shaders, setShaders] = useState({ BUFFER_0: null, BUFFER_1: null, DEFAULT: null });
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	useEffect(() => {
		fetch(props.url)
			.then((response) => response.text())
			.then((shaderCode) => {
				console.log('split: ', splitShaderCodeByBuffer(shaderCode));
				setShaders(splitShaderCodeByBuffer(shaderCode));
			})
			.catch((err) => {
				setError(err);
			})
			.finally(() => {
				setLoading(false);
			});
	}, [props.url]);

	if (loading || !shaders.BUFFER_0 || !shaders.BUFFER_1 || !shaders.DEFAULT) {
		return <div>Loading shader...</div>;
	}

	if (error) {
		return <div>Error loading shader: {error.message}</div>;
	}

	return (
		<div className="shader-container">
			<OffscreenWebGL
				f_each_paint={(manager, frame, time) => {
					manager.updateUniform('u_time', time / 1000);
					manager.paintCanvas();
				}}
				fragmentShader={[[shaders.BUFFER_0, shaders.BUFFER_1], [shaders.DEFAULT]]}
			/>
		</div>
	);
}

function App() {
	return (
		<div className="App">
			<header
				className="App-header"
				style={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					justifyContent: 'flex-start',
					gap: '20px',
				}}
			>
				<h1>Testing / Development environment</h1>
				<div className="shader-grid">
					<OffscreenWebGLContainer fragmentShaderURL={'default.glsl'} isolate={false} />
					<OffscreenWebGLContainer fragmentShaderURL={'default-blue-1.glsl'} isolate={true} />
					<SplitShaderURL url={'moving-circle.glsl'} isolate={true} />
					{/* <OffscreenWebGLContainer fragmentShaderURL={'default.glsl'} isolate={true} /> */}
					{/* <OffscreenWebGLContainer fragmentShaderURL={'default-blue-1.glsl'} /> */}
					{/* <OffscreenWebGLContainer fragmentShaderURL={'default-blue-1.glsl'} isolate={true} /> */}
				</div>
			</header>
		</div>
	);
}

export default App;
