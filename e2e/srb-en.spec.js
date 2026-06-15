import { test, expect } from '@playwright/test';

test.describe('SRB EN page', () => {
  test.beforeEach(async ({ page }) => {
    // Mask the automation flag that Playwright sets — Coveo detects it and skips initialization.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    await page.goto('http://localhost:4000/tests/srb-en.html');
  });

  test('search box and config are present', async ({ page }) => {
    await expect(page.locator('#sch-inp-ac')).toBeVisible();

    // connector.js reads the data-gc-search attribute to configure the Coveo search engine.
    const configEl = page.locator('[data-gc-search]');
    await expect(configEl).toBeAttached();
    const attrValue = await configEl.getAttribute('data-gc-search');
    expect(attrValue).toBeTruthy();
  });

  test('search library initializes successfully', async ({ page, context }) => {
    // A query in the URL hash is required to trigger Coveo's first API call,
    // which is what sets the tracking cookie and localStorage item.
    await page.goto('http://localhost:4000/tests/srb-en.html#q=canada');

    await page.waitForFunction(
      () => document.cookie.includes('coveo_visitorId') || window.__coveoInitialized,
      { timeout: 5000 }
    ).catch(() => {});

    // Fetch cookies via the browser context rather than JS so HttpOnly cookies are included.
    const cookies = await context.cookies('http://localhost:4000');
    const visitorCookie = cookies.find(c => c.name === 'coveo_visitorId');
    expect(visitorCookie, 'coveo_visitorId cookie should exist').toBeTruthy();

    await page.waitForFunction(() => localStorage.getItem('visitorId') !== null, { timeout: 5000 });
    const visitorId = await page.evaluate(() => localStorage.getItem('visitorId'));
    expect(visitorId, 'visitorId localStorage item should exist').toBeTruthy();
  });

  test('basic keyword search via keyboard submit', async ({ page }) => {
    await page.locator('#sch-inp-ac').focus();
    await page.keyboard.type('Canada');
    await page.keyboard.press('Enter');

    const summary = page.locator('#wb-land h2');
    await expect(summary).toBeFocused();
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('Canada');

    // After keyboard interaction, the browser shows a visible focus ring (:focus-visible is true).
    const hasFocusRing = await summary.evaluate(el => el.matches(':focus-visible'));
    expect(hasFocusRing, 'focus ring should be visible after keyboard submit').toBe(true);

    await expect(page.locator('#sch-inp-ac')).toHaveValue('Canada');
  });

  test('basic keyword search via mouse submit', async ({ page }) => {
    await page.locator('#sch-inp-ac').click();
    await page.keyboard.type('Canada');
    await page.locator('form[role="search"] button[type="submit"]').click();

    const summary = page.locator('#wb-land h2');
    await expect(summary).toBeFocused();
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('Canada');

    // After mouse interaction, the browser suppresses the focus ring (:focus-visible is false).
    const hasFocusRing = await summary.evaluate(el => el.matches(':focus-visible'));
    expect(hasFocusRing, 'focus ring should not be visible after mouse submit').toBe(false);

    await expect(page.locator('#sch-inp-ac')).toHaveValue('Canada');
  });
});
