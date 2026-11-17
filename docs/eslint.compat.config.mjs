import compat from 'eslint-plugin-compat';
import tsParser from '@typescript-eslint/parser';
import { fileURLToPath } from 'node:url';

export default [
	{
		files: ['src/**/*.{ts,tsx}'],
		languageOptions: { parser: tsParser, ecmaVersion: 'latest', sourceType: 'module' },
		plugins: { compat },
		settings: { browserslistOpts: { path: fileURLToPath(new URL('.', import.meta.url)) }, lintAllEsApis: true },
		rules: { 'compat/compat': 'warn' },
	},
];
