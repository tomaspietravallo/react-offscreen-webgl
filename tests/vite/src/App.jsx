import './App.css';
import { OffscreenWebGL } from '../../../src/index';
import { useEffect, useRef, useState } from 'react';

function OffscreenWebGLContainer(props) {
	return (
		<div style={{ padding: '20px', width: '350px', height: '200px' }}>
			<OffscreenWebGL
				f_each_paint={(manager, frame, time) => {
					manager.updateUniform('u_resolution', [frame, frame]);
					manager.paintCanvas();
				}}
			/>
		</div>
	);
}

function App() {
	return (
		<div className="App">
			<header className="App-header">
				<h1>Testing / Development environment</h1>
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(3, 1fr)', gap: '20px' }}>
					<OffscreenWebGLContainer />
					<OffscreenWebGLContainer />
					<OffscreenWebGLContainer />
				</div>
			</header>
		</div>
	);
}

export default App;
