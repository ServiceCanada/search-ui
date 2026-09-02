import { test, expect } from '@playwright/test';

// TODO: A separate branch switches the app's typing/suggestion handling from keydown/keyup
// listeners to generic `input` events. These tests may need to be revised once those changes 
// are merged in.

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

    // Check that the search box is present and has the expected attributes and ARIA attributes/roles for query suggestions.
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

    // Move the focus to the search box so that typing will trigger query suggestions.
    await searchBox.focus();

    // Type "canada" one character at a time, asserting suggestions only appear at 3+ characters.
    for (const [i, char] of [...'canada'].entries()) {

      // Wait for the suggestions API response before asserting UI state.
      const responsePromise = page.waitForResponse(res => res.url().includes('/querySuggest'), { timeout: 5000 }).catch(() => null);
      await page.keyboard.type(char);
      await responsePromise;
      const typedSoFar = 'canada'.slice(0, i + 1);

      if (typedSoFar.length < 3) {

        // If fewer than 3 characters, suggestions should not be shown.
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

      // Wait for the suggestions API response before asserting UI state.
      const responsePromise = page.waitForResponse(res => res.url().includes('/querySuggest'), { timeout: 5000 }).catch(() => null);
      await page.keyboard.press('Backspace');
      await responsePromise;

      if (remaining >= 3) {

        // If greater than 3 characters, suggestions should be shown.
        await expect(searchBox).toHaveAttribute('aria-expanded', 'true');
        await expect(suggestionsList).not.toHaveAttribute('hidden');
        await expect(suggestionItems.first()).toBeVisible();

      } else {

        // For 0–2 characters, suggestions should be hidden.
        await expect(searchBox).toHaveAttribute('aria-expanded', 'false');
        await expect(suggestionsList).toHaveAttribute('hidden');

      }
    }
  });

  test('clicking a query suggestion submits a search for that suggestion', async ({ page }) => {
    const searchBox = page.locator('#sch-inp-ac');
    const suggestionsList = page.locator('#suggestions');
    const suggestionItems = suggestionsList.locator('li.suggestion-item');

    // Move the focus to the search box so that typing will trigger query suggestions.
    await searchBox.focus();

    // Wait for suggestions to load before clicking.
    const responsePromise = page.waitForResponse(res => res.url().includes('/querySuggest'), { timeout: 5000 });
    await page.keyboard.type('canada');
    await responsePromise;

    // Wait for them all network requests to settle so the list isn't re-rendered out from under the click
    await page.waitForLoadState('networkidle');

    // Check that the suggestions list is visible and has at least one item
    await expect(suggestionItems.first()).toBeVisible();

    // Save the text from the second suggestion in the list (if it exists), then click it
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

  test('query suggestions reappear when focus returns to the search box after a search', async ({ page }) => {
    const searchBox = page.locator('#sch-inp-ac');
    const suggestionsList = page.locator('#suggestions');

    // Perform a search for "canada" and load the results.
    await searchBox.focus();
    await searchBox.fill('canada');
    await searchBox.press('Enter');
    await page.waitForLoadState('networkidle');

    // The suggestions box should not be visible right after navigation/search.
    await expect(suggestionsList).toHaveAttribute('hidden');

    // Return focus to the search box by clicking into it and wait for the querySuggest request to complete.
    const responsePromise = page.waitForResponse(res => res.url().includes('/querySuggest'), { timeout: 5000 }).catch(() => null);
    await searchBox.click();
    await responsePromise;

    // Query suggestions should reappear
    await expect(searchBox).toHaveAttribute('aria-expanded', 'true');
    await expect(suggestionsList).not.toHaveAttribute('hidden');
  });

  test('query suggestions can be navigated and selected by keyboard', async ({ page }) => {
    const searchBox = page.locator('#sch-inp-ac');
    const suggestionsList = page.locator('#suggestions');
    const suggestionItems = suggestionsList.locator('li.suggestion-item');

    // Move the focus to the search box and clear it
    await searchBox.focus();
    await searchBox.fill('');

    // Type "canada" one character at a time; suggestions should appear once 3 characters are typed (default minimum).
    const responsePromise = page.waitForResponse(res => res.url().includes('/querySuggest'), { timeout: 5000 });
    await page.keyboard.type('canada');
    await responsePromise;

    // Let all in-flight /querySuggest requests settle before interacting
    await page.waitForLoadState('networkidle');
    await expect(searchBox).toHaveAttribute('aria-expanded', 'true');
    await expect(suggestionItems.first()).toBeVisible();

    // Tab out to the search icon — suggestions should disappear.
    await page.keyboard.press('Tab');
    await expect(suggestionsList).toHaveAttribute('hidden');

    // Shift+tab back into the search input — suggestions should reappear.
    await page.keyboard.press('Shift+Tab');
    await expect(suggestionsList).not.toHaveAttribute('hidden');
    await expect(suggestionItems.first()).toBeVisible();

    const count = await suggestionItems.count();
    const originalValue = await searchBox.inputValue();

    // Arrow down through the whole list. This lands on the last item.
    for (let i = 0; i < count; i++) {
      await page.keyboard.press('ArrowDown');
    }

    // Check that the last item is selected and has the expected ARIA attributes.
    await expect(suggestionItems.last()).toHaveClass(/selected-suggestion/);
    await expect(suggestionItems.last()).toHaveAttribute('aria-selected', 'true');

    // One more down press should wrap around back to the first item.
    await page.keyboard.press('ArrowDown');

    // Check that the first item is selected and has the expected ARIA attributes.
    await expect(suggestionItems.first()).toHaveClass(/selected-suggestion/);
    await expect(suggestionItems.first()).toHaveAttribute('aria-selected', 'true');

    // The input value should not have changed while navigating.
    await expect(searchBox).toHaveValue(originalValue);

    // The input should retain focus while navigating the list.
    await expect(searchBox).toBeFocused();

    // Arrow up from the first item should wrap backwards to the last item.
    await page.keyboard.press('ArrowUp');

    // Check that the last item is selected, has the expected ARIA attributes, and the search box still has the original value and focus.
    await expect(suggestionItems.last()).toHaveClass(/selected-suggestion/);
    await expect(suggestionItems.last()).toHaveAttribute('aria-selected', 'true');
    await expect(searchBox).toHaveValue(originalValue);
    await expect(searchBox).toBeFocused();

    // Typing while an item is highlighted should update the query.
    const typeResponsePromise = page.waitForResponse(res => res.url().includes('/querySuggest'), { timeout: 5000 });
    await page.keyboard.type('x');
    await expect(searchBox).toHaveValue(originalValue + 'x');
    await typeResponsePromise;

    // Backspacing should update the query and trigger a new /querySuggest request.
    const backspaceResponsePromise = page.waitForResponse(res => res.url().includes('/querySuggest'), { timeout: 5000 });
    await page.keyboard.press('Backspace');
    await expect(searchBox).toHaveValue(originalValue);
    await backspaceResponsePromise;

    // Move to a suggestion to the second item
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');

    // Check that the second item is selected and has the expected ARIA attributes.
    await expect(suggestionsList).not.toHaveAttribute('hidden');
    const activeItem = suggestionItems.nth(1);
    const activeText = await activeItem.innerText();

    // Press Enter to submit a search for the selected suggestion.
    await page.keyboard.press('Enter');

    // The suggestions box should close immediately after submitting the search.
    await expect(suggestionsList).toHaveAttribute('hidden');
    await expect(searchBox).toHaveValue(activeText);

    // Wait for the /querySuggest request to settle
    await page.waitForLoadState('networkidle');

    // The search summary should have the focus and contain the text of the suggestion we clicked on
    const summary = page.locator('#wb-land h2');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText(activeText);
  });
});

test.describe('QS EN page — configuration options', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
  });

  test('up to 10 suggestions are shown when numberOfSuggestions is set to 10', async ({ page }) => {
    await page.goto('http://localhost:4000/tests/qs-en.html');

    const searchBox = page.locator('#sch-inp-ac');
    const suggestionsList = page.locator('#suggestions');
    const suggestionItems = suggestionsList.locator('li.suggestion-item');

    // Move the focus to the search box so that typing will trigger query suggestions.
    await searchBox.focus();
    const responsePromise = page.waitForResponse(res => res.url().includes('/querySuggest'), { timeout: 5000 });

    // Type "canada" and wait for all network requests to settle
    await page.keyboard.type('canada');
    await responsePromise;
    await page.waitForLoadState('networkidle');

    // Check that the suggestions list is visible and has between 1 and 10 items
    await expect(searchBox).toHaveAttribute('aria-expanded', 'true');
    await expect(suggestionItems.first()).toBeVisible();
    const count = await suggestionItems.count();
    expect(count).toBeGreaterThanOrEqual(1);
    expect(count).toBeLessThanOrEqual(10);
  });

});
