import { defineConfig } from 'vitest/config';

const headed = process.env.HEADED === 'true';
const isolated = process.env.CROSS_ORIGIN_ISOLATED === 'true';

const browser = () => ({
	enabled: true,
	provider: 'playwright' as const,
	headless: !headed,
	instances: [
		{
			browser: 'chromium' as const,
			launch: {
				channel: 'chromium',
				args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-webgl', '--use-gl=angle'],
			},
		},
	],
});

export default defineConfig({
	server: {
		headers: isolated ? { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' } : {},
	},
	optimizeDeps: { include: ['react/jsx-dev-runtime'] },
	test: {
		projects: [
			{
				test: {
					name: 'unit',
					include: ['tests/unit/**/*.test.ts'],
					environment: 'node',
				},
			},
			{
				extends: true,
				test: {
					name: 'browser',
					include: ['tests/browser/**/*.test.ts'],
					provide: { isolated },
					browser: browser(),
				},
			},
		],
	},
});
