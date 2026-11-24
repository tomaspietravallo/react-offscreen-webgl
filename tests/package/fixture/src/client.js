import * as React from 'react';
import { createRoot } from 'react-dom/client';
import * as library from 'react-offscreen-webgl';
import { createApp } from './app.js';

createRoot(document.getElementById('root')).render(React.createElement(createApp(React, library)));
