const React = require('react');
const { hydrateRoot } = require('react-dom/client');
const library = require('react-offscreen-webgl');
const { createApp } = require('./app.js');

hydrateRoot(document.getElementById('root'), React.createElement(createApp(React, library)));
