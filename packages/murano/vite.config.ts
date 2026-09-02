import { sveltekit } from '@sveltejs/kit/vite';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Playwright only ships WebKit and Firefox builds for a handful of distributions, so a local
// run defaults to Chromium. CI is Ubuntu and runs all three, which is where the cross-engine
// guarantee is actually verified.
const browsers = (
	process.env.MURANO_BROWSERS ?? (process.env.CI ? 'chromium,webkit,firefox' : 'chromium')
)
	.split(',')
	.map((b) => b.trim())
	.filter(Boolean);

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		browser: {
			enabled: true,
			provider: playwright(),
			headless: true,
			instances: browsers.map((browser) => ({
				browser: browser as 'chromium' | 'webkit' | 'firefox'
			}))
		},
		include: ['src/tests/**/*.{test,spec}.{js,ts}']
	}
});
