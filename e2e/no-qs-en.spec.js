import { test, expect } from '@playwright/test';

// no-qs-en.html sets numberOfSuggestions to 0 — query suggestions are disabled entirely, so the
// combobox/listbox wiring connector.js otherwise applies to the search box is never added.
test.describe('no-QS EN page', () => {
  test.beforeEach(async ({ page }) => {
    // Mask the automation flag that Playwright sets — Coveo detects it and skips initialization.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    await page.goto('http://localhost:4000/tests/no-qs-en.html');
  });

  test('search box is initialized without any query suggestion UI', async ({ page }) => {
    const searchBox = page.locator('#sch-inp-ac');

    // Check that the search box is present and has the expected attributes for a plain search input, without 
    // any of the ARIA attributes or roles that would be added if query suggestions were enabled.
    await expect(searchBox).toHaveAttribute('type', 'search');
    await expect(searchBox).not.toHaveAttribute('role', 'combobox');
    await expect(searchBox).not.toHaveAttribute('aria-expanded');
    await expect(searchBox).not.toHaveAttribute('aria-autocomplete');
    await expect(searchBox).not.toHaveAttribute('aria-controls');

    await expect(page.locator('form[role="search"] ul#suggestions')).toHaveCount(0);
    await expect(page.locator('form[role="search"] p#sr-qs-hint')).toHaveCount(0);
  });

  test('typing a query does not show suggestions or request the querySuggest endpoint', async ({ page }) => {
    const searchBox = page.locator('#sch-inp-ac');

    // Listen for any requests to the querySuggest endpoint. If any are made, flip `suggestRequestSeen` to true
    let suggestRequestSeen = false;
    page.on('request', req => {
      if (req.url().includes('/querySuggest')) suggestRequestSeen = true;
    });

    // Type a query into the search box. Normally this would trigger query suggestions.
    await searchBox.focus();
    await page.keyboard.type('canada');
    await page.waitForTimeout(1000); // Give any suggestion request a chance to fire/settle; none should be made.

    // Check that no querySuggest request was made, and that there are no signs of query suggestions in the UI
    expect(suggestRequestSeen).toBe(false);
    await expect(searchBox).not.toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#suggestions')).toHaveCount(0);
  });

  test('returning focus to the search box after a search does not show suggestions', async ({ page }) => {
    const searchBox = page.locator('#sch-inp-ac');

    // Set up the initial conditions. Type a query and submit the form to perform a search.
    await searchBox.focus();
    await page.keyboard.type('canada');
    await page.keyboard.press('Enter');
    await page.waitForLoadState('networkidle');

    // Listen for any requests to the querySuggest endpoint. If any are made, flip `suggestRequestSeen` to true
    let suggestRequestSeen = false;
    page.on('request', req => {
      if (req.url().includes('/querySuggest')) suggestRequestSeen = true;
    });

    // Return focus to the search box. 
    await searchBox.focus();
    await page.waitForTimeout(1000);

    // Check that no querySuggest request was made, and that there are no signs of query suggestions in the UI
    expect(suggestRequestSeen).toBe(false);
    await expect(searchBox).not.toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#suggestions')).toHaveCount(0);
  });
});
