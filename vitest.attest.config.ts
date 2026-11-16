import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['tests/attest/**/*.test.ts'],
		globalSetup: ['tests/attest/setup.ts'],
		environment: 'node',
	},
});
