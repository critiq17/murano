import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		browser: {
			enabled: true,
			provider: 'playwright',
			instances: [{ browser: 'chromium' }, { browser: 'webkit' }, { browser: 'firefox' }]
		},
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
