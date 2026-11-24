const React = require('react');
const { renderToString } = require('react-dom/server');
const library = require('react-offscreen-webgl');
const { createApp } = require('./app.js');

exports.entry = require.resolve('react-offscreen-webgl');

exports.render = function render() {
	return renderToString(React.createElement(createApp(React, library)));
};
