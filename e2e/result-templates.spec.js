import { test, expect } from '@playwright/test';
import searchFixture from './fixtures/result-template-results.json' assert { type: 'json' };

test.describe('Result templates', () => {
  test.beforeEach(async ({ page }) => {
    // Mask the automation flag that Playwright sets — Coveo detects it and skips initialization.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // Intercept the Coveo search API and return the fixture so template assertions are deterministic.
    await page.route('**/rest/search**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(searchFixture),
      });
    });

    await page.goto('http://localhost:4000/tests/srb-en.html#q=benefits');
  });

  test('result template renders title, link, author, breadcrumb, time, and excerpt', async ({ page }) => {
    const firstResult = page.locator('#wb-land #result-list section').first();
    await expect(firstResult).toBeVisible();

    const firstResultData = searchFixture.results[0];

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
    // result[0] has displaynavlabel "www.canada.ca" — last segment contains the hostname,
    // so the connector collapses it to hostname only.
    const result = page.locator('#wb-land #result-list section').nth(0);
    await expect(result).toBeVisible();

    const breadcrumb = result.locator('ol.location');
    await expect(breadcrumb).toBeVisible();
    const items = breadcrumb.locator('li');
    await expect(items).toHaveCount(1);
    await expect(items.nth(0)).toHaveText('canada.ca');
  });

  test('breadcrumb shows hostname and last segment when displaynavlabel has two segments', async ({ page }) => {
    // result[1] has displaynavlabel "www.canada.ca > Benefits".
    const result = page.locator('#wb-land #result-list section').nth(1);
    await expect(result).toBeVisible();

    const breadcrumb = result.locator('ol.location');
    await expect(breadcrumb).toBeVisible();
    const items = breadcrumb.locator('li');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText('canada.ca');
    await expect(items.nth(1)).toContainText('Benefits');
  });

  test('breadcrumb shows hostname and last segment only when displaynavlabel has more than two segments', async ({ page }) => {
    // result[2] has displaynavlabel "www.canada.ca > Benefits > Disability benefits".
    // The connector picks only the last segment, so the middle segment ("Benefits") is not shown.
    const result = page.locator('#wb-land #result-list section').nth(2);
    await expect(result).toBeVisible();

    const breadcrumb = result.locator('ol.location');
    await expect(breadcrumb).toBeVisible();
    const items = breadcrumb.locator('li');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText('canada.ca');
    await expect(items.nth(1)).toContainText('Disability benefits');
    await expect(items.nth(1)).not.toContainText('Benefits >');
  });

  test('breadcrumb shows printable URI when displaynavlabel is empty', async ({ page }) => {
    // result[4] has displaynavlabel "" — the hostname check fails, so the connector falls back
    // to rendering the printable URI inside a <p class="location"> instead of an <ol>.
    const result = page.locator('#wb-land #result-list section').nth(4);
    await expect(result).toBeVisible();

    const { clickUri, printableUri } = searchFixture.results[4];
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
