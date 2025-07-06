import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
	build: {
		lib: {
			entry: './index.ts',
			name: 'react-offscreen-webgl',
			fileName: (format) => `index.${format}.js`,
			formats: ['cjs', 'es'],
		},
		sourcemap: true,
		emptyOutDir: true,
	},
	plugins: [
		dts({
			insertTypesEntry: true,
		}),
	],
});
