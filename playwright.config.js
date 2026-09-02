// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	retries: process.env.CI ? 2 : 0,
	reporter: 'html',
	use: {
		baseURL: 'http://localhost:4000',
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
				launchOptions: {
					args: [
						'--disable-features=ImprovedCookieControls,ImprovedCookieControlsForThirdPartyCookieBlocking,SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure,CookiesWithoutSameSiteMustBeSecure,SameSiteByDefaultCookies',
						'--disable-blink-features=AutomationControlled',
					],
				},
			},
		},
	],
});
