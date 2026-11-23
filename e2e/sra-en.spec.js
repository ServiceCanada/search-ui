import { test, expect } from '@playwright/test';

// Description: Rather than asserting on rendered result content (which depends on live index data 
// and can drift), these tests assert on the two things the app directly controls: the URL query 
// string after submit, and the `q`/`aq` fields in the outgoing search request payload.
test.describe('SRA EN page — advanced search', () => {
  test.beforeEach(async ({ page }) => {
    // Mask the automation flag that Playwright sets — Coveo detects it and skips initialization.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    await page.goto('http://localhost:4000/tests/sra-en.html');
  });

  // Helper: Fill the given advanced search fields, submit the form, and returns the relevants of 
  // the search request payload (`q`, `aq`)
  async function submitAdvancedSearch(page, fields) {
    for (const [selector, value] of Object.entries(fields)) {
      const field = page.locator(selector);
      const tagName = await field.evaluate(el => el.tagName);

      if (tagName === 'SELECT') {
        await field.selectOption(value);
      } else {
        await field.fill(value);
      }
    }

    const [searchRequest] = await Promise.all([
      page.waitForRequest(req => {
        if (!req.url().includes('/rest/search') || req.method() !== 'POST') return false;
        try {
          return JSON.parse(req.postData()).numberOfResults !== undefined;
        } catch {
          return false;
        }
      }),
      page.locator('button[type="submit"]').click(),
    ]);

    return JSON.parse(searchRequest.postData());
  }

  test.describe('Find pages with...', () => {
    test('all of these words populates allq in the URL and an unquoted q in the request', async ({ page }) => {

      // Perform a search by populating the "all of these words" field and submitting the form.
      const payload = await submitAdvancedSearch(page, { '#advseacon1': 'mark carney' });

      // Check that the URL query string contains the expected `allq` parameter and that the request payload contains 
      // the expected `q` value.
      const url = new URL(page.url());
      expect(url.searchParams.get('allq')).toBe('mark carney');
      expect(payload.q.trim()).toBe('mark carney');
      expect(payload.aq).toBeUndefined();
    });

    test('this exact word or phrase populates exctq in the URL and a quoted q in the request', async ({ page }) => {

      // Perform a search by populating the "this exact word or phrase" field and submitting the form.
      const payload = await submitAdvancedSearch(page, { '#advseacon2': 'mark carney' });

      // Check that the URL query string contains the expected `exctq` parameter and that the request payload contains 
      // the expected quoted `q` value.
      const url = new URL(page.url());
      expect(url.searchParams.get('exctq')).toBe('mark carney');
      expect(payload.q.trim()).toBe('("mark carney")');
      expect(payload.aq).toBeUndefined();
    });

    test('any of these words populates anyq in the URL and an OR-joined q in the request', async ({ page }) => {

      // Perform a search by populating the "any of these words" field and submitting the form.
      const payload = await submitAdvancedSearch(page, { '#advseacon3': 'mark carney' });

      // Check that the URL query string contains the expected `anyq` parameter and that the request payload contains 
      // the expected OR-joined `q` value.
      const url = new URL(page.url());
      expect(url.searchParams.get('anyq')).toBe('mark carney');
      expect(payload.q.trim()).toBe('(mark OR carney)');
      expect(payload.aq).toBeUndefined();
    });

    test('none of these words populates noneq in the URL and a NOT-joined q in the request', async ({ page }) => {

      // Perform a search by populating the "none of these words" field and submitting the form.
      const payload = await submitAdvancedSearch(page, { '#advseacon4': 'mark carney' });

      // Check that the URL query string contains the expected `noneq` parameter and that the request payload contains 
      // the expected NOT-joined `q` value.
      const url = new URL(page.url());
      expect(url.searchParams.get('noneq')).toBe('mark carney');
      expect(payload.q.trim()).toBe('(NOT (mark) NOT(carney))');
      expect(payload.aq).toBeUndefined();
    });
  });

  test.describe('Find pages with… combinations', () => {
    test('any of these words + none of these words combine into one q expression', async ({ page }) => {
      
      // Perform a search by populating the "any of these words" and "none of these words" fields and submitting the form.
      const payload = await submitAdvancedSearch(page, {
        '#advseacon3': 'mark carney',
        '#advseacon4': 'prime minister',
      });

      // Check that the URL query string contains the expected `anyq` and `noneq` parameters and that the request payload 
      // contains the expected combined `q` value.
      const url = new URL(page.url());
      expect(url.searchParams.get('anyq')).toBe('mark carney');
      expect(url.searchParams.get('noneq')).toBe('prime minister');
      expect(payload.q.trim()).toBe('(mark OR carney)(NOT (prime) NOT(minister))');
    });

    test('exact word or phrase + none of these words combine into one q expression', async ({ page }) => {

      // Perform a search by populating the "exact word or phrase" and "none of these words" fields and submitting the form.
      const payload = await submitAdvancedSearch(page, {
        '#advseacon2': 'mark carney',
        '#advseacon4': 'prime minister',
      });

      // Check that the URL query string contains the expected `exctq` and `noneq` parameters and that the request payload
      const url = new URL(page.url());
      expect(url.searchParams.get('exctq')).toBe('mark carney');
      expect(url.searchParams.get('noneq')).toBe('prime minister');
      expect(payload.q.trim()).toBe('("mark carney")(NOT (prime) NOT(minister))');
    });
  });

  test.describe('Find pages with… + Then narrow your results by...', () => {
    test('exact word or phrase + pages updated adds a relative @date filter to aq', async ({ page }) => {

      // Perform a search by populating the "exact word or phrase" and "pages updated" fields and submitting the form.
      const payload = await submitAdvancedSearch(page, {
        '#advseacon2': 'mark carney',
        '#advseacon5': 'dateModified_dt:[NOW-7DAYS TO NOW]',
      });

      // Check that the URL query string contains the expected `exctq` and `fqupdate` parameters and that the request payload
      const url = new URL(page.url());
      expect(url.searchParams.get('exctq')).toBe('mark carney');
      expect(url.searchParams.get('fqupdate')).toBe('dateModified_dt:[NOW-7DAYS TO NOW]');
      expect(payload.q.trim()).toBe('("mark carney")');
      expect(payload.aq.trim()).toBe('@date>today-7d');
    });

    test('exact word or phrase + site or domain adds an @uri filter to aq', async ({ page }) => {

      // Perform a search by populating the "exact word or phrase" and "site or domain" fields and submitting the form.
      const payload = await submitAdvancedSearch(page, {
        '#advseacon2': 'mark carney',
        '#advseacon7': 'canada.ca',
      });

      // Check that the URL query string contains the expected `exctq` and `dmn` parameters and that the request payload
      const url = new URL(page.url());
      expect(url.searchParams.get('exctq')).toBe('mark carney');
      expect(url.searchParams.get('dmn')).toBe('canada.ca');
      expect(payload.q.trim()).toBe('("mark carney")');
      expect(payload.aq.trim()).toBe('@uri="canada.ca"');
    });

    test('exact word or phrase + terms appearing moves the query into an @title filter on aq', async ({ page }) => {

      // Perform a search by populating the "exact word or phrase" and "terms appearing" fields and submitting the form.
      const payload = await submitAdvancedSearch(page, {
        '#advseacon2': 'esdc',
        '#advseacon8': 'title_t',
      });

      // Check that the URL query string contains the expected `exctq` and `fqocct` parameters and that the request payload
      const url = new URL(page.url());
      expect(url.searchParams.get('exctq')).toBe('esdc');
      expect(url.searchParams.get('fqocct')).toBe('title_t');
      
      // The phrase moves entirely into the aq @title filter — q is left empty.
      expect(payload.q.trim()).toBe('');
      expect(payload.aq.trim()).toBe('@title= ("esdc")');
    });
  });
});
