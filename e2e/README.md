# Playwright end-to-end tests

This folder contains automated browser tests for the Canada.ca Search UI.

## Recommended file structure

Keep test files organized by user workflow or page type.

Suggested starting point:

```text
e2e/
  README.md
  search.spec.js
  query-suggestions.spec.js
  advanced-search.spec.js
  contextual-search.spec.js
  templates.spec.js
  analytics.spec.js
```

If repeated setup becomes noisy, add small helper files under `e2e/support/`. Good helper candidates:

- `goToTestPage(page, 'qs-en.html')`;
- `searchInput(page)`;
- `submitSearch(page)`;
- mock of Coveo requests/responses (if specific results are needed)

Start simple and add as needed, when it removes meaningful repetition.

## Writing tests

Add `.spec.js` files to this directory. Playwright picks them up automatically.

```js
// @ts-check
const { test, expect } = require('@playwright/test');

test('shows the search form', async ({ page }) => {
	await page.goto('/tests/qs-en.html');

	await expect(page.getByLabel('Search Government of Canada websites')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Search' })).toBeVisible();
});
```

Prefer:

- `getByRole`, `getByLabel`, `getByText`, and `getByPlaceholder`;
- web-first assertions such as `await expect(locator).toBeVisible()`;
- one user behaviour per test;
- test names that describe the expected behaviour;
- small setup repeated in each test when it makes the test clearer;
- `test.beforeEach` to reset the page state between tests.

Avoid:

- brittle CSS selectors when an accessible locator is available;
- testing internal functions from `src/connector.js`;
- use `page.waitForResponse` to wait for network requests to complete before performing tests. i.e.,
  - `await page.waitForResponse(res => res.url().includes('/querySuggest'), { timeout: 5000 }).catch(() => null);`
- for other fixed sleeps such as `waitForTimeout`;
- tests that depend on another test running first;
- broad tests that cover many behaviours at once;

## Getting going

### Install dependencies:

```bash
npm install
npx playwright install chromium
```

### Start environment

The README at the repo root explains how to start the Docker-based local environment, using a valid search token.

The Playwright config expects:

```text
http://localhost:4000
```

## Running tests

Most tests can be run via `npm`:

Run all tests, silently:

```bash
npm test
```

Run the interactive Playwright UI:

```bash
npm run test:ui
```

Open the last HTML report:

```bash
npm run test:report
```

Run one file:

```bash
npx playwright test e2e/search.spec.js
```

Run one test by title:

```bash
npx playwright test -g "renders the search form"
```

## Configuration

The Playwright config lives at `playwright.config.js`.

Current defaults:

- tests are read from `e2e/`
- the base URL is `http://localhost:4000`
- tests are run in Chromium/Playwright UI
- generated artifacts such as `playwright-report/` have been excluded from version control and the Jekyll build process

Optional configuration improvements:

- add Firefox and WebKit projects once the Chromium suite is stable;

## Debugging test failures

Use the Playwright UI while writing, debugging, or to review actual browser results:

```bash
npm run test:ui
```

Use trace mode when a failure needs a step-by-step replay:

```bash
npx playwright test --trace on
npm run test:report
```

The trace viewer is useful for failures because it shows the DOM, console, network requests, actions, and assertions around the failure.

## References

- [Playwright best practices](https://playwright.dev/docs/best-practices)
- [Playwright configuration](https://playwright.dev/docs/test-configuration)
- [Playwright continuous integration](https://playwright.dev/docs/ci)
