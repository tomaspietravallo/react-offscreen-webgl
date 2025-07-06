import './App.css';
import { OffscreenWebGL } from '../../../src/index';
import { useEffect, useRef, useState } from 'react';

function OffscreenWebGLContainer(props) {
	return (
		<div style={{ padding: '20px', width: '100%', height: '100%', resize: 'both', overflow: 'hidden', backgroundColor: '#f0f0f0' }}>
			<OffscreenWebGL
				f_each_paint={(manager, frame, time) => {
					manager.paintCanvas();
				}}
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
					justifyContent: 'center',
					height: '100vh',
					gap: '20px',
				}}
			>
				<h1>Testing / Development environment</h1>
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(1, 1fr)', gap: '20px' }}>
					<OffscreenWebGLContainer />
					<OffscreenWebGLContainer />
					<OffscreenWebGLContainer />
				</div>
			</header>
		</div>
	);
}

export default App;
