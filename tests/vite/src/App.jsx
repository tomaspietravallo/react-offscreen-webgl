import './App.css';
import { OffscreenWebGL } from '../../../src/index';
import { useState } from 'react';

function OffscreenWebGLContainer(props) {
	return (
		<div style={{ padding: '20px' }}>
			<OffscreenWebGL />
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
