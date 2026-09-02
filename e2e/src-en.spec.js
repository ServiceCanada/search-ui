import { test, expect } from '@playwright/test';

test.describe('SRC EN page — contextual search', () => {
  test.beforeEach(async ({ page }) => {
    // Mask the automation flag that Playwright sets — Coveo detects it and skips initialization.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    await page.goto('http://localhost:4000/tests/src-en.html');
  });

  // src-en.html sets isContextSearch/originLevel3 to "/en/employment-social-development/search.html" —
  // that page URL should be threaded through as context on every outgoing request.
  const expectedContext = {
    searchPageUrl: '/en/employment-social-development/search.html',
    searchPageRelativeUrl: '/en/employment-social-development/search.html',
  };

  test('outgoing request payloads carry the contextual search context', async ({ page }) => {

    // Focus the search box and type a query to trigger querySuggest requests.
    const searchBox = page.locator('#sch-inp-ac');
    await searchBox.focus();
    const [querySuggestRequest] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/rest/search/v2/querySuggest')),
      page.keyboard.type('Canada Pension Plan'),
    ]);

    // Inspect the querySuggest request payload to ensure it contains the expected search context.
    const querySuggestPayload = JSON.parse(querySuggestRequest.request().postData());
    expect(querySuggestPayload.context).toMatchObject(expectedContext);
    expect(querySuggestPayload.mlParameters.filters).toMatchObject({
      c_context_searchpageurl: expectedContext.searchPageUrl,
      c_context_searchpagerelativeurl: expectedContext.searchPageRelativeUrl,
    });

    // Perform a search and wait for the search and analytics requests to be sent.
    const [searchRequest, analyticsRequest] = await Promise.all([
      page.waitForRequest(req => {
        if (!req.url().includes('/rest/search/v2') || req.method() !== 'POST') return false;
        try {
          return JSON.parse(req.postData()).numberOfResults !== undefined;
        } catch {
          return false;
        }
      }),
      page.waitForRequest(req => req.url().includes('/rest/v15/analytics/search') && req.method() === 'POST'),
      page.keyboard.press('Enter'),
    ]);

    // Inspect the search request payload to ensure they contain the expected search context.
    const searchPayload = JSON.parse(searchRequest.postData());
    expect(searchPayload.context).toMatchObject(expectedContext);
    expect(searchPayload.mlParameters.filters).toMatchObject({
      c_context_searchpageurl: expectedContext.searchPageUrl,
      c_context_searchpagerelativeurl: expectedContext.searchPageRelativeUrl,
    });

    // Inspect the analytics request payload to ensure they contain the expected search context.
    const analyticsPayload = JSON.parse(analyticsRequest.postData());
    expect(analyticsPayload.customData).toMatchObject({
      context_searchPageUrl: expectedContext.searchPageUrl,
      context_searchPageRelativeUrl: expectedContext.searchPageRelativeUrl,
    });
  });

  test('search response results are scoped to the contextual search section', async ({ page }) => {

    // Perform a search and wait for the search response to be received.
    const searchBox = page.locator('#sch-inp-ac');
    await searchBox.fill('Canada Pension Plan');
    const [searchResponse] = await Promise.all([
      page.waitForResponse(res => {
        if (!res.url().includes('/rest/search/v2') || res.request().method() !== 'POST') return false;
        try {
          return JSON.parse(res.request().postData()).numberOfResults !== undefined;
        } catch {
          return false;
        }
      }),
      page.keyboard.press('Enter'),
    ]);

    // Contextual search should scope results to the ESDC section of canada.ca that the
    // originLevel3 page URL belongs to.
    const searchResponseBody = await searchResponse.json();
    expect(searchResponseBody.results.length).toBeGreaterThan(0);
    for (const result of searchResponseBody.results) {
      expect(result.clickUri).toContain('canada.ca/en/employment-social-development');
    }
  });
});
