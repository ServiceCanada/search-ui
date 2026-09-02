import { test, expect } from '@playwright/test';

// TODO: A separate branch switches the app's typing/suggestion handling from keydown/keyup
// listeners to generic `input` events. Once that lands here, revisit the `page.keyboard.type()` /
// `page.keyboard.press()` usage throughout this file — some of it may need to change to
// `locator.fill()` / dispatched `input` events (or may still need real key events for
// Tab/Shift+Tab/Arrow/Enter navigation) to keep exercising the actual code path.
//
// Unlike qs-en.spec.js (which uses src/connector.js and renders results in-page via a Coveo
// headless engine), these pages use src/suggestions.js against the WET-BOEW top-right search box
// (#wb-srch-q). Selecting a suggestion or submitting the form navigates the whole page to a real
// https://www.canada.ca/en/sr/srb.html URL, so requests to that host are stubbed below to keep
// tests hermetic and avoid hitting production.

const pages = [
  {
    name: 'default config (5 suggestions, 3 char minimum)',
    url: 'http://localhost:4000/tests/qs-en-topright.html',
    numberOfSuggestions: 5,
    minimumCharsForSuggestions: 3,
  },
  {
    name: 'custom config (15 suggestions, 1 char minimum)',
    url: 'http://localhost:4000/tests/qs-en-topright-custom.html',
    numberOfSuggestions: 15,
    minimumCharsForSuggestions: 1,
  },
];

for (const { name, url, numberOfSuggestions, minimumCharsForSuggestions } of pages) {
  test.describe(`QS EN top-right search box — ${name}`, () => {
    test.beforeEach(async ({ page }) => {
      // Mask the automation flag that Playwright sets — Coveo detects it and skips initialization.
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });

      // Stub navigation to the real canada.ca search results page so selecting/submitting a
      // suggestion doesn't leave localhost or hit production.
      await page.route('https://www.canada.ca/**', route =>
        route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>stubbed</body></html>' })
      );

      await page.goto(url);
    });

    test('query suggestion UI is initialized', async ({ page }) => {
      const searchBox = page.locator('#wb-srch-q');
      await expect(searchBox).toHaveAttribute('type', 'text');
      await expect(searchBox).toHaveAttribute('role', 'combobox');
      await expect(searchBox).toHaveAttribute('aria-expanded', 'false');
      await expect(searchBox).toHaveAttribute('aria-autocomplete', 'list');
      await expect(searchBox).toHaveAttribute('aria-controls', 'suggestions');

      const suggestionsList = page.locator('ul#suggestions');
      await expect(suggestionsList).toHaveAttribute('role', 'listbox');
      await expect(suggestionsList).toHaveClass(/query-suggestions/);
      await expect(suggestionsList).toHaveAttribute('aria-describedby', 'sr-qs-hint');

      const hint = page.locator('p#sr-qs-hint');
      await expect(hint).toHaveClass(/hidden/);
    });

    test(`suggestions appear once the ${minimumCharsForSuggestions}-character minimum is reached and disappear below it`, async ({ page }) => {
      const searchBox = page.locator('#wb-srch-q');
      const suggestionsList = page.locator('#suggestions');
      const suggestionItems = suggestionsList.locator('li.suggestion-item');

      await searchBox.focus();

      // Below the configured minimum, the box closes synchronously on input — no /querySuggest
      // request is fired, so only wait on the network once we're at/above the threshold. Waiting
      // unconditionally on a request that never arrives just burns the full 5s timeout per
      // keystroke and was making this test flake on slower CI runs.
      const word = 'canada';
      for (const [i, char] of [...word].entries()) {
        const typedSoFar = word.slice(0, i + 1);

        if (typedSoFar.length < minimumCharsForSuggestions) {
          await page.keyboard.type(char);
          await expect(searchBox).toHaveAttribute('aria-expanded', 'false');
          await expect(suggestionsList).toHaveAttribute('hidden');
        } else {
          const responsePromise = page.waitForResponse(res => res.url().includes('/querySuggest'), { timeout: 5000 });
          await page.keyboard.type(char);
          await responsePromise;

          await expect(searchBox).toHaveAttribute('aria-expanded', 'true');
          await expect(suggestionsList).not.toHaveAttribute('hidden');
          await expect(suggestionItems.first()).toBeVisible();
          const count = await suggestionItems.count();
          expect(count).toBeGreaterThanOrEqual(1);
          expect(count).toBeLessThanOrEqual(numberOfSuggestions);
        }
      }

      // Backspace back down; suggestions should stay visible until below the configured minimum.
      for (let remaining = word.length - 1; remaining >= 0; remaining--) {
        if (remaining >= minimumCharsForSuggestions) {
          const responsePromise = page.waitForResponse(res => res.url().includes('/querySuggest'), { timeout: 5000 });
          await page.keyboard.press('Backspace');
          await responsePromise;

          await expect(searchBox).toHaveAttribute('aria-expanded', 'true');
          await expect(suggestionsList).not.toHaveAttribute('hidden');
        } else {
          await page.keyboard.press('Backspace');
          await expect(searchBox).toHaveAttribute('aria-expanded', 'false');
          await expect(suggestionsList).toHaveAttribute('hidden');
        }
      }
    });

    test('at most the configured number of suggestions are shown', async ({ page }) => {
      const searchBox = page.locator('#wb-srch-q');
      const suggestionsList = page.locator('#suggestions');
      const suggestionItems = suggestionsList.locator('li.suggestion-item');

      await searchBox.focus();
      const responsePromise = page.waitForResponse(res => res.url().includes('/querySuggest'), { timeout: 5000 });
      await page.keyboard.type('canada');
      await responsePromise;
      // Let all in-flight /querySuggest requests (one per keystroke) settle before counting.
      await page.waitForLoadState('networkidle');

      await expect(searchBox).toHaveAttribute('aria-expanded', 'true');
      await expect(suggestionItems.first()).toBeVisible();
      const count = await suggestionItems.count();
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(numberOfSuggestions);
    });

    test('clicking a query suggestion navigates to the search results page for that suggestion', async ({ page }) => {
      const searchBox = page.locator('#wb-srch-q');
      const suggestionsList = page.locator('#suggestions');
      const suggestionItems = suggestionsList.locator('li.suggestion-item');

      await searchBox.focus();
      const responsePromise = page.waitForResponse(res => res.url().includes('/querySuggest'), { timeout: 5000 });
      await page.keyboard.type('canada');
      await responsePromise;

      // Typing "canada" fires one /querySuggest request per keystroke (more so with a low
      // minimumCharsForSuggestions). Wait for them all to settle so the list isn't re-rendered
      // out from under the click between reading the suggestion text and clicking it.
      await page.waitForLoadState('networkidle');

      await expect(suggestionItems.first()).toBeVisible();
      const secondSuggestion = suggestionItems.nth(1);
      const suggestionText = await secondSuggestion.innerText();

      await Promise.all([
        page.waitForURL(/canada\.ca\/en\/sr\/srb\.html\?/, { timeout: 5000 }),
        secondSuggestion.click(),
      ]);

      const requestUrl = new URL(page.url());
      expect(requestUrl.searchParams.get('q')).toBe(suggestionText);
      expect(requestUrl.searchParams.get('actionCause')).toBe('omniboxFromLink');
    });

    test('query suggestions can be navigated by keyboard and selected with Enter', async ({ page }) => {
      const searchBox = page.locator('#wb-srch-q');
      const suggestionsList = page.locator('#suggestions');
      const suggestionItems = suggestionsList.locator('li.suggestion-item');

      await searchBox.focus();
      const responsePromise = page.waitForResponse(res => res.url().includes('/querySuggest'), { timeout: 5000 });
      await page.keyboard.type('canada');
      await responsePromise;
      await expect(suggestionItems.first()).toBeVisible();

      // Typing "canada" fires one /querySuggest request per keystroke (more so with a low
      // minimumCharsForSuggestions). Wait for them all to settle so a late response can't reopen
      // the suggestions box out from under the assertions below — its render callback has no
      // focus check, so a stale response arriving after Tab would otherwise re-show the list.
      await page.waitForLoadState('networkidle');

      // Tab out closes the suggestions; shift+tab back in reopens them.
      await page.keyboard.press('Tab');
      await expect(suggestionsList).toHaveAttribute('hidden');
      await page.keyboard.press('Shift+Tab');
      await expect(suggestionsList).not.toHaveAttribute('hidden');

      const count = await suggestionItems.count();
      const originalValue = await searchBox.inputValue();

      // Down through the whole list lands on the last item; one more wraps to the first.
      for (let i = 0; i < count; i++) {
        await page.keyboard.press('ArrowDown');
      }
      await expect(suggestionItems.last()).toHaveClass(/selected-suggestion/);
      await page.keyboard.press('ArrowDown');
      await expect(suggestionItems.first()).toHaveClass(/selected-suggestion/);
      await expect(searchBox).toHaveValue(originalValue);
      await expect(searchBox).toBeFocused();

      // Up from the first item wraps to the last.
      await page.keyboard.press('ArrowUp');
      await expect(suggestionItems.last()).toHaveClass(/selected-suggestion/);

      // Select a suggestion other than the current query text (the second item) via Enter.
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      const activeText = await suggestionItems.nth(1).innerText();

      await Promise.all([
        page.waitForURL(/canada\.ca\/en\/sr\/srb\.html\?/, { timeout: 5000 }),
        page.keyboard.press('Enter'),
      ]);

      const requestUrl = new URL(page.url());
      expect(requestUrl.searchParams.get('q')).toBe(activeText);
    });
  });
}

test.describe('Fixes, patches, and improvements', () => {
  test.beforeEach(async ({ page }) => {
    // Mask the automation flag that Playwright sets — Coveo detects it and skips initialization.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // Stub navigation to the real canada.ca search results page so selecting/submitting a
    // suggestion doesn't leave localhost or hit production.
    await page.route('https://www.canada.ca/**', route =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>stubbed</body></html>' })
    );

    await page.goto('http://localhost:4000/tests/qs-en-topright.html');
  });

  // SR-625 Top-Right QS: Small Updates
  test('SR-625 TR-01: suggestions list switches to position: static at the 767px mobile breakpoint', async ({ page }) => {
    const searchBox = page.locator('#wb-srch-q');
    const suggestionsList = page.locator('#suggestions');

    await searchBox.focus();
    const responsePromise = page.waitForResponse(res => res.url().includes('/querySuggest'), { timeout: 5000 });
    await page.keyboard.type('canada');
    await responsePromise;
    await expect(suggestionsList).not.toHaveAttribute('hidden');

    // Just above the breakpoint — still absolutely positioned.
    await page.setViewportSize({ width: 768, height: 800 });
    await expect(suggestionsList).toHaveCSS('position', 'absolute');

    // At/below the 767px breakpoint — static.
    await page.setViewportSize({ width: 767, height: 800 });
    await expect(suggestionsList).toHaveCSS('position', 'static');
  });

  test('SR-625 TR-02: the "list" attribute is removed from the header search box input', async ({ page }) => {
    const searchBox = page.locator('#wb-srch-q');
    await expect(searchBox).not.toHaveAttribute('list');
  });

  // PR 63 - adjust actionCause
  test('PR #63: submitting via Enter (without selecting a suggestion) forwards with actionCause=searchFromLink', async ({ page }) => {
    const searchBox = page.locator('#wb-srch-q');

    await searchBox.focus();
    await page.keyboard.type('canada');

    await Promise.all([
      page.waitForURL(/canada\.ca\/en\/sr\/srb\.html\?/, { timeout: 5000 }),
      page.keyboard.press('Enter'),
    ]);

    const requestUrl = new URL(page.url());
    expect(requestUrl.searchParams.get('actionCause')).toBe('searchFromLink');
  });

  test('PR #63: submitting via the search button forwards with actionCause=searchFromLink', async ({ page }) => {
    const searchBox = page.locator('#wb-srch-q');

    await searchBox.focus();
    await page.keyboard.type('canada');

    await Promise.all([
      page.waitForURL(/canada\.ca\/en\/sr\/srb\.html\?/, { timeout: 5000 }),
      page.locator('#wb-srch-sub').click(),
    ]);

    const requestUrl = new URL(page.url());
    expect(requestUrl.searchParams.get('actionCause')).toBe('searchFromLink');
  });
});
