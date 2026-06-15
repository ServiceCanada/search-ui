import { test, expect } from '@playwright/test';

test.describe('QS EN page', () => {
  test.beforeEach(async ({ page }) => {
    // Mask the automation flag that Playwright sets — Coveo detects it and skips initialization.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    await page.goto('http://localhost:4000/tests/srb-en.html');
    // await page.goto('http://localhost:4000/tests/qs-en.html');
  });

  test('query suggestion UI is initialized', async ({ page }) => {
    await page.goto('http://localhost:4000/tests/srb-en.html');

    const searchBox = page.locator('#sch-inp-ac');
    await expect(searchBox).toHaveAttribute('type', 'text');
    await expect(searchBox).toHaveAttribute('role', 'combobox');
    await expect(searchBox).toHaveAttribute('aria-expanded', 'false');
    await expect(searchBox).toHaveAttribute('aria-autocomplete', 'list');
    await expect(searchBox).toHaveAttribute('aria-controls', 'suggestions');

    const suggestionsList = page.locator('form[role="search"] ul#suggestions');
    await expect(suggestionsList).toHaveAttribute('role', 'listbox');
    await expect(suggestionsList).toHaveClass(/query-suggestions/);
    await expect(suggestionsList).toHaveAttribute('aria-describedby', 'sr-qs-hint');

    const hint = page.locator('form[role="search"] p#sr-qs-hint');
    await expect(hint).toHaveClass(/hidden/);
  });

  test('query suggestions appear and update while typing, then disappear when input is too short', async ({ page }) => {
    const searchBox = page.locator('#sch-inp-ac');
    const suggestionsList = page.locator('#suggestions');
    const suggestionItems = suggestionsList.locator('li.suggestion-item');

    await searchBox.focus();

    // Type "canada" one character at a time, asserting suggestions only appear at 3+ characters.
    for (const [i, char] of [...'canada'].entries()) {
      // Wait for the suggestions API response before asserting UI state.
      const responsePromise = page.waitForResponse(res => res.url().includes('/querySuggest'), { timeout: 5000 }).catch(() => null);
      await page.keyboard.type(char);
      await responsePromise;
      const typedSoFar = 'canada'.slice(0, i + 1);

      if (typedSoFar.length < 3) {
        // Fewer than 3 characters — suggestions should not be shown.
        await expect(searchBox).toHaveAttribute('aria-expanded', 'false');
        await expect(suggestionsList).toHaveAttribute('hidden');
        
      } else {
        // 3 or more characters — wait for suggestions to load and verify count.
        await expect(searchBox).toHaveAttribute('aria-expanded', 'true');
        await expect(suggestionsList).not.toHaveAttribute('hidden');
        await expect(suggestionItems.first()).toBeVisible();
        const count = await suggestionItems.count();
        expect(count, `expected 1–10 suggestions for "${typedSoFar}"`).toBeGreaterThanOrEqual(1);
        expect(count, `expected 1–10 suggestions for "${typedSoFar}"`).toBeLessThanOrEqual(10);
      }
    }

    // Backspace one character at a time. Suggestions should stay visible until input drops below 3 characters.
    for (let remaining = 'canada'.length - 1; remaining >= 0; remaining--) {
      const responsePromise = page.waitForResponse(res => res.url().includes('/querySuggest'), { timeout: 5000 }).catch(() => null);
      await page.keyboard.press('Backspace');
      await responsePromise;

      if (remaining >= 3) {
        await expect(searchBox).toHaveAttribute('aria-expanded', 'true');
        await expect(suggestionsList).not.toHaveAttribute('hidden');
        await expect(suggestionItems.first()).toBeVisible();
      } else {
        // Input is now 0–2 characters — suggestions should be hidden.
        await expect(searchBox).toHaveAttribute('aria-expanded', 'false');
        await expect(suggestionsList).toHaveAttribute('hidden');
      }
    }
  });

  test('clicking a query suggestion submits a search for that suggestion', async ({ page }) => {
    const searchBox = page.locator('#sch-inp-ac');
    const suggestionsList = page.locator('#suggestions');
    const suggestionItems = suggestionsList.locator('li.suggestion-item');

    await searchBox.focus();

    // Wait for suggestions to load before clicking.
    const responsePromise = page.waitForResponse(res => res.url().includes('/querySuggest'), { timeout: 5000 });
    await page.keyboard.type('canada');
    await responsePromise;

    await expect(suggestionItems.first()).toBeVisible();
    const secondSuggestion = suggestionItems.nth(1);
    const suggestionText = await secondSuggestion.innerText();
    await secondSuggestion.click();

    // The suggestions box should close after clicking.
    await expect(suggestionsList).toHaveAttribute('hidden');
    await expect(searchBox).toHaveAttribute('aria-expanded', 'false');

    // The search field should show the clicked suggestion's text.
    await expect(searchBox).toHaveValue(suggestionText);

    // Results should be returned for the selected suggestion.
    const summary = page.locator('#wb-land h2');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText(suggestionText);
  });
});
