import * as React from 'react';
import { hydrateRoot } from 'react-dom/client';
import * as library from 'react-offscreen-webgl';
import { createApp } from './app.js';

hydrateRoot(document.getElementById('root'), React.createElement(createApp(React, library)));
