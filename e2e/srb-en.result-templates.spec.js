import { test, expect } from '@playwright/test';
import searchFixture from './fixtures/result-template-results.json' assert { type: 'json' };

test.describe('Result templates', () => {
  test.beforeEach(async ({ page }) => {
    // Mask the automation flag that Playwright sets — Coveo detects it and skips initialization.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // Intercept the Coveo search API request and return a "mocked" response (fixture) so we can reliably 
    // perform tests over a range of result types, without depending on a a query specific query + set of results. 
    await page.route('**/rest/search**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(searchFixture),
      });
    });

    await page.goto('http://localhost:4000/tests/srb-en.html#q=benefits');
  });

  test('result template renders core fields (title, link, author, breadcrumb, time, and excerpt)', async ({ page }) => {

    // Get first result in the list and the first item in the fixture to compare against.
    const firstResult = page.locator('#wb-land #result-list section').first();
    const firstResultData = searchFixture.results[0];

    // Ensure the result is visible.
    await expect(firstResult).toBeVisible();

    // Title links to the result's clickUri.
    const titleLink = firstResult.locator('a.result-link');
    await expect(titleLink).toHaveText(firstResultData.title);
    await expect(titleLink).toHaveAttribute('href', firstResultData.clickUri);

    // Author label comes from raw.author.
    const author = Array.isArray(firstResultData.raw.author)
      ? firstResultData.raw.author[0]
      : firstResultData.raw.author;
    await expect(firstResult.locator('ul.context-labels li')).toHaveText(author);

    // Excerpt is present and non-empty.
    await expect(firstResult.locator('p')).toContainText(firstResultData.excerpt.slice(0, 30));

    // Breadcrumb container is present.
    await expect(firstResult.locator('.location')).toBeAttached();

    // Date is rendered in a <time> element with a YYYY-MM-DD datetime attribute.
    const timeEl = firstResult.locator('time');
    await expect(timeEl).toBeAttached();
    const datetime = await timeEl.getAttribute('datetime');
    expect(datetime).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await expect(timeEl).not.toBeEmpty();
  });

  test('breadcrumb shows hostname only when displaynavlabel has one segment', async ({ page }) => {
    // Description: result[0] has displaynavlabel "www.canada.ca". The last (and only) segment contains 
    // the hostname, so the connector should collapse it to hostname only.

    // Internal check to ensure the fixture is as expected, so we know the test is valid.
    const firstResultData = searchFixture.results[0];
    await expect(firstResultData.raw.displaynavlabel).toBe('www.canada.ca');
    
    // Get first result in the list and the first item in the fixture to compare against.
    const firstResult = page.locator('#wb-land #result-list section').first();
    await expect(firstResult).toBeVisible();

    // Get first result in the list and ensure its visible.
    const result = page.locator('#wb-land #result-list section').nth(0);
    await expect(result).toBeVisible();

    // Breadcrumb is present, there's only one segment, and that it contains the hostname only.
    const breadcrumb = result.locator('ol.location');
    await expect(breadcrumb).toBeVisible();
    const items = breadcrumb.locator('li');
    await expect(items).toHaveCount(1);
    await expect(items.nth(0)).toHaveText('canada.ca');
  });

  test('breadcrumb shows hostname and last segment when displaynavlabel has two segments', async ({ page }) => {
    // Description: result[1] has displaynavlabel "www.canada.ca > Benefits". The last (and only) segment contains 
    // the hostname, so the connector should collapse it to hostname only.

    // Internal check to ensure the fixture is as expected, so we know the test is valid.
    const secondResultData = searchFixture.results[1];
    await expect(secondResultData.raw.displaynavlabel).toBe('www.canada.ca > Benefits');

    // Get second result in the list and ensure its visible.
    const result = page.locator('#wb-land #result-list section').nth(1);
    await expect(result).toBeVisible();

    // Breadcrumb is present, there's two segment, and that the segments are what we expect.
    const breadcrumb = result.locator('ol.location');
    await expect(breadcrumb).toBeVisible();
    const items = breadcrumb.locator('li');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText('canada.ca');
    await expect(items.nth(1)).toContainText('Benefits');
  });

  test('breadcrumb shows hostname and last segment only when displaynavlabel has more than two segments', async ({ page }) => {
    // Description: result[2] has displaynavlabel "www.canada.ca > Benefits > Disability benefits". The connector should 
    // collapse it to hostname and the last segment only. The middle segment ("Benefits") is not shown.

    // Internal check to ensure the fixture is as expected, so we know the test is valid.
    const thirdResultData = searchFixture.results[2];
    await expect(thirdResultData.raw.displaynavlabel).toBe('www.canada.ca > Benefits > Disability benefits');

    // Get the third result in the list and ensure its visible.
    const result = page.locator('#wb-land #result-list section').nth(2);
    await expect(result).toBeVisible();

    // Breadcrumb is present and there are two segments
    const breadcrumb = result.locator('ol.location');
    await expect(breadcrumb).toBeVisible();
    const items = breadcrumb.locator('li');
    await expect(items).toHaveCount(2);

    // The segments are what we expect (hostname + last seggment), and the middle segment is not shown.
    await expect(items.nth(0)).toContainText('canada.ca');
    await expect(items.nth(1)).toContainText('Disability benefits');
    await expect(items.nth(1)).not.toContainText('Benefits >');
  });

  test('breadcrumb shows printable URI when displaynavlabel is empty', async ({ page }) => {
    // Description: result[4] has displaynavlabel "". If the hostname check fails, the connector should fall back
    // to rendering the printable URI

    // Internal check to ensure the fixture is as expected, so we know the test is valid.
    const fourthResultData = searchFixture.results[4];
    await expect(fourthResultData.raw.displaynavlabel).toBe('');

    // Get the fourth result in the list and ensure its visible.
    const result = page.locator('#wb-land #result-list section').nth(4);
    await expect(result).toBeVisible();

    // The breadcrumb container is not present, but the fallback is present and contains a link to the printable URI.
    const { clickUri, printableUri } = fourthResultData;
    const fallback = result.locator('p.location');
    await expect(fallback).toBeVisible();
    const cite = fallback.locator('cite');
    await expect(cite).toBeAttached();
    const link = cite.locator('a');
    await expect(link).toHaveAttribute('href', clickUri);
    await expect(link).toHaveText(printableUri);

    await expect(result.locator('ol.location')).not.toBeAttached();
  });
});
