import * as React from 'react';
import { renderToString } from 'react-dom/server';
import * as library from 'react-offscreen-webgl';
import { createApp } from './app.js';

export const entry = import.meta.resolve('react-offscreen-webgl');

export function render() {
	return renderToString(React.createElement(createApp(React, library)));
}
