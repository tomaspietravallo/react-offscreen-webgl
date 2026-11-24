import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
	build: {
		lib: {
			entry: './index.ts',
			name: 'react-offscreen-webgl',
			fileName: (format) => (format === 'cjs' ? 'index.cjs' : `index.${format}.js`),
			formats: ['cjs', 'es'],
		},
		rollupOptions: {
			external: (id) => /^react(-dom)?(\/|$)/.test(id),
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
