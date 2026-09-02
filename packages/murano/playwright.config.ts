import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? [['github'], ['html']] : 'list',
	use: { baseURL: 'http://localhost:4173', trace: 'on-first-retry' },
	webServer: {
		command: 'pnpm build && pnpm preview --port 4173',
		port: 4173,
		reuseExistingServer: !process.env.CI
	},
	projects: [
		{ name: 'chromium', use: devices['Desktop Chrome'] },
		{ name: 'webkit', use: devices['Desktop Safari'] },
		{ name: 'firefox', use: devices['Desktop Firefox'] }
	],
	expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } }
});
