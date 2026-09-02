import { expect, test } from '@playwright/test';

test('dev harness loads', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByText('Liquid Glass', { exact: true })).toBeVisible();
});
