import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';

export default defineConfig({
	site: 'https://tomaspietravallo.github.io',
	base: '/react-offscreen-webgl',
	integrations: [react(), mdx()],
	vite: { resolve: { dedupe: ['react', 'react-dom'] } },
});
