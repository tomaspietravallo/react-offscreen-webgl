import './App.css';
import { OffscreenWebGL } from '../../../src/index';
import { useState } from 'react';

function OffscreenWebGLContainer(props) {
	const [frame, setFrame] = useState(0);

	requestAnimationFrame(() => {
		setFrame((prev) => prev + 1);
	});

	return (
		<div style={{ padding: '20px' }}>
			<OffscreenWebGL u_resolution={[frame, frame]} />
		</div>
	);
}

function App() {
	return (
		<div className="App">
			<header className="App-header">
				<h1>Testing / Development environment</h1>
				<div style={{ width: '350px', height: '200px' }}>
					<OffscreenWebGLContainer />
				</div>
			</header>
		</div>
	);
}

export default App;
