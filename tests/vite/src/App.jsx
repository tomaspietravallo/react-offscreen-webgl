import React from 'react';
import './App.css';
import { OffscreenWebGL } from '../../../src/index';

function App() {
	return (
		<div className="App">
			<header className="App-header">
				<h1>Testing / Development environment</h1>
				<div style={{ width: '350px', height: '200px' }}>
					<OffscreenWebGL />
				</div>
			</header>
		</div>
	);
}

export default App;
