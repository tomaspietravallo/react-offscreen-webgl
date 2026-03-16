import { defineConfig } from 'vitest/config';

const headed = process.env.HEADED === 'true';

export default defineConfig({
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
				test: {
					name: 'browser',
					include: ['tests/browser/**/*.test.ts'],
					browser: {
						enabled: true,
						provider: 'playwright',
						// headless: false → Playwright uses the full Chromium binary (WebGL support)
						// instead of Chrome Headless Shell (no WebGL). The --headless=new arg
						// passed below makes Chrome run without a visible window.
						headless: false,
						instances: [
							{
								browser: 'chromium',
								launch: {
									args: [
										// omit --headless=new when HEADED=true to get a visible window
										...(headed ? [] : ['--headless=new']),
										'--no-sandbox',
										'--disable-setuid-sandbox',
										'--enable-webgl',
										'--use-gl=angle',
									],
								},
							},
						],
					},
				},
			},
		],
	},
});
