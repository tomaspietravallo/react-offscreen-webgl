const React = require('react');
const { createRoot } = require('react-dom/client');
const library = require('react-offscreen-webgl');
const { createApp } = require('./app.js');

createRoot(document.getElementById('root')).render(React.createElement(createApp(React, library)));
