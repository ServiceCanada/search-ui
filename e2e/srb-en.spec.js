import { test, expect } from '@playwright/test';

test.describe('SRB EN page', () => {
  test.beforeEach(async ({ page }) => {
    // Mask the automation flag that Playwright sets — Coveo detects it and skips initialization.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    await page.goto('http://localhost:4000/tests/srb-en.html');
  });

  test.describe('Startup and init', () => {

    test('search library initializes successfully', async ({ page, context }) => {
      // A query in the URL hash is required to trigger Coveo's first API call,
      // which is what sets the tracking cookie and localStorage item.
      await page.goto('http://localhost:4000/tests/srb-en.html#q=canada');

      // Give the connector library a chance to set coveo_visitorId cookie
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

    test('search box and config are present', async ({ page }) => {
      await expect(page.locator('#sch-inp-ac')).toBeVisible();

      // connector.js reads the data-gc-search attribute to configure the Coveo search engine.
      // Look for it on the page and assert that it has a non-empty value.
      const configEl = page.locator('[data-gc-search]');
      await expect(configEl).toBeAttached();
      const attrValue = await configEl.getAttribute('data-gc-search');
      expect(attrValue).toBeTruthy();
    });

  })

  test.describe('Search and search box', () => {

    test('basic keyword search via keyboard submit', async ({ page }) => {

      // Focus the search box, type a query, and submit via Enter key.
      await page.locator('#sch-inp-ac').focus();
      await page.keyboard.type('Canada');
      await page.keyboard.press('Enter');

      // The search results summary should be visible, have the focus, and contain the query text.
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

      // Focus the search box, type a query, and submit via mouse click on the submit button.
      await page.locator('#sch-inp-ac').click();
      await page.keyboard.type('Canada');
      await page.locator('form[role="search"] button[type="submit"]').click();

      // Same as above. The search results summary should be visible, have the focus, and contain the query text.
      const summary = page.locator('#wb-land h2');
      await expect(summary).toBeFocused();
      await expect(summary).toBeVisible();
      await expect(summary).toContainText('Canada');

      // After mouse interaction, the browser suppresses the focus ring (:focus-visible is false).
      const hasFocusRing = await summary.evaluate(el => el.matches(':focus-visible'));
      expect(hasFocusRing, 'focus ring should not be visible after mouse submit').toBe(false);

      await expect(page.locator('#sch-inp-ac')).toHaveValue('Canada');
    });

    test('no results message is shown for an unmatched query', async ({ page }) => {

      // Perform a search for a query that is guaranteed to return no results
      await page.locator('#sch-inp-ac').focus();
      await page.keyboard.type('sdfsafasdfsdfsdfsdfsdfsdf');
      await page.keyboard.press('Enter');

      // The search results summary should be visible, have the focus, and contain the "No results" message.
      const summary = page.locator('#wb-land h2');
      await expect(summary).toBeFocused();
      await expect(summary).toBeVisible();
      await expect(summary).toContainText('No results');

      // After keyboard interaction, the browser shows a visible focus ring (:focus-visible is true).
      const hasFocusRing = await summary.evaluate(el => el.matches(':focus-visible'));
      expect(hasFocusRing, 'focus ring should be visible after keyboard submit').toBe(true);
    });

    test('no results message is shown for an empty query', async ({ page }) => {

      // First perform a successful search so the search box has a value to clear.
      await page.locator('#sch-inp-ac').focus();
      await page.keyboard.type('benefits');
      await page.keyboard.press('Enter');
      await expect(page.locator('#wb-land h2')).toBeVisible();
      await expect(page.locator('#wb-land h2')).toContainText('benefits');

      // Return to the search box and clear the query one character at a time.
      await page.locator('#sch-inp-ac').focus();
      await page.keyboard.press('End');
      for (let i = 0; i < 'benefits'.length; i++) {
        await page.keyboard.press('Backspace');
      }
      await page.keyboard.press('Enter');

      // The search results summary should be visible, have the focus, and contain the "No results" message.
      const summary = page.locator('#wb-land h2');
      await expect(summary).toBeFocused();
      await expect(summary).toBeVisible();
      await expect(summary).toContainText('No results');
    });

    test('search from URL / deep-link populates the search box and results automatically', async ({ page }) => {

      // Load a query via the URL to trigger a search on page load. 
      await page.goto('http://localhost:4000/tests/srb-en.html?q=benefits');

      // The search box should be populated with the query and the results summary should contain the query text.
      const summary = page.locator('#wb-land h2');
      await expect(page.locator('#sch-inp-ac')).toHaveValue('benefits');
      await expect(summary).toBeVisible();
      await expect(summary).toContainText('benefits');
    });

  })


  test.describe('Paging', () => {
    
    // Helper: Perform a search that returns enough results to page through, then scroll to the pager.
    async function performSearchAndScrollToPager( page ) {
      await page.locator( '#sch-inp-ac' ).focus();
      await page.keyboard.type( 'Canada' );
      await page.keyboard.press( 'Enter' );
      await page.waitForLoadState( 'networkidle' );

      const pager = page.locator( '#pager' );
      await pager.scrollIntoViewIfNeeded();
      return pager;
    }

    // Helper: Locate the numbered page buttons, excluding the "Previous"/"Next" buttons.
    function pageButton( pager, pageNumber ) {
      return pager.locator( 'button.page-button:not(.paginate-prev):not(.paginate-next)' ).nth( pageNumber - 1 );
    }

    // Helper: Assert that the pager's active page button has the expected page number and is marked as current.
    async function expectActivePage( pager, pageNumber ) {
      const activeButton = pager.locator( 'li.active button' );
      await expect( activeButton ).toHaveAttribute( 'aria-current', 'page' );
      await expect( activeButton ).toContainText( `${pageNumber}:` );
    }

    test( 'next/prev buttons via mouse', async ( { page } ) => {

      // Perform a search, then scroll to the pager.
      const pager = await performSearchAndScrollToPager( page );
      const nextButton = pager.locator( 'button.paginate-next' );
      const prevButton = pager.locator( 'button.paginate-prev' );
      const summary = page.locator( '#wb-land h2' );

      // Previous button is not shown while on page 1.
      await expect( prevButton ).not.toBeVisible();

      // Click the "Next" button to go to page 2. 
      // Check that we now have a "Previous" button, the correct page link is active, 
      // and that the results summary has focus.
      await nextButton.click();
      await expectActivePage( pager, 2 );
      await expect( prevButton ).toBeVisible();
      await expect( summary ).toBeFocused();

      // Click the "Next" button to go to page 3. 
      // Check that the correct page link is active, and that the results summary has focus.
      await nextButton.click();
      await expectActivePage( pager, 3 );
      await expect( summary ).toBeFocused();

      // Click the "Previous" button to go back to page 2. 
      // Check that the correct page link is active, and that the results summary has focus.
      await prevButton.click();
      await expectActivePage( pager, 2 );
      await expect( summary ).toBeFocused();

      // Click the "Previous" button to go back to page 1. 
      // Check that the correct page link is active, the "Previous" has disappeared, 
      // and that the results summary has focus.
      await prevButton.click();
      await expectActivePage( pager, 1 );
      await expect( prevButton ).not.toBeVisible();
      await expect( summary ).toBeFocused();
    } );

    test( 'next/prev buttons via keyboard', async ( { page } ) => {

      // Perform a search, then scroll to the pager.
      const pager = await performSearchAndScrollToPager( page );
      const nextButton = pager.locator( 'button.paginate-next' );
      const prevButton = pager.locator( 'button.paginate-prev' );
      const summary = page.locator( '#wb-land h2' );

      // Previous button is not shown while on page 1.
      await expect( prevButton ).not.toBeVisible();

      // Move the focus to the "Next" button and press Enter to go to page 2. 
      // Check that we now have a "Previous" button and that the results summary has focus.
      await nextButton.focus();
      await page.keyboard.press( 'Enter' );
      await expectActivePage( pager, 2 );
      await expect( prevButton ).toBeVisible();
      await expect( summary ).toBeFocused();

      // Move the focus to the "Next" button and press Enter to go to page 3. 
      // Check that the correct page link is active, and that the results summary has focus.
      await nextButton.focus();
      await page.keyboard.press( 'Enter' );
      await expectActivePage( pager, 3 );
      await expect( summary ).toBeFocused();

      // Move the focus to the "Previous" button and press Enter to return to page 2. 
      // Check that the correct page link is active, and that the results summary has focus.
      await prevButton.focus();
      await page.keyboard.press( 'Enter' );
      await expectActivePage( pager, 2 );
      await expect( summary ).toBeFocused();

      // Move the focus to the "Previous" button and press Enter to return to page 1. 
      // Check that the correct page link is active, the "Previous" has disappeared, 
      // and that the results summary has focus.
      await prevButton.focus();
      await page.keyboard.press( 'Enter' );
      await expectActivePage( pager, 1 );
      await expect( prevButton ).not.toBeVisible();
      await expect( summary ).toBeFocused();
    } );

    test( 'direct selection via mouse', async ( { page } ) => {

      // Perform a search, then scroll to the pager.
      const pager = await performSearchAndScrollToPager( page );
      const prevButton = pager.locator( 'button.paginate-prev' );
      const summary = page.locator( '#wb-land h2' );

      // Click on the page 3 button with the mouse.
      // Check that the correct page link is active, we now have a "Previous" button, and that 
      // the results summary has focus.
      await pageButton( pager, 3 ).click();
      await expectActivePage( pager, 3 );
      await expect( prevButton ).toBeVisible();
      await expect( summary ).toBeFocused();

      // Click on the page 1 button with the mouse.
      // Check that the correct page link is active, the "Previous" button is gone, and that 
      // the results summary has focus.
      await pageButton( pager, 1 ).click();
      await expectActivePage( pager, 1 );
      await expect( prevButton ).not.toBeVisible();
      await expect( summary ).toBeFocused();
    } );

    test( 'direct selection via keyboard', async ( { page } ) => {

      // Perform a search, then scroll to the pager.
      const pager = await performSearchAndScrollToPager( page );
      const prevButton = pager.locator( 'button.paginate-prev' );
      const summary = page.locator( '#wb-land h2' );

      // Move the focus to the "page 3" button and press Enter. 
      // Check that the correct page link is active, we now have a "Previous" button, and that 
      // the results summary has focus.
      await pageButton( pager, 3 ).focus();
      await page.keyboard.press( 'Enter' );
      await expectActivePage( pager, 3 );
      await expect( prevButton ).toBeVisible();
      await expect( summary ).toBeFocused();

      // Move the focus to the "page 1" button and press Enter. 
      // Check that the correct page link is active, the "Previous" button is gone, and that 
      // the results summary has focus.
      await pageButton( pager, 1 ).focus();
      await page.keyboard.press( 'Enter' );
      await expectActivePage( pager, 1 );
      await expect( prevButton ).not.toBeVisible();
      await expect( summary ).toBeFocused();
    } );

    test( 'deep linking selection', async ( { page } ) => {

      // Perform a search, scroll to the pager, and click on the page 3 button to go to page 3.
      const pager = await performSearchAndScrollToPager( page );
      await pageButton( pager, 3 ).click();
      await page.waitForLoadState( 'networkidle' );

      // Check that the URL has the correct paging offset
      expect( page.url() ).toContain( 'firstResult=20' );

      // Navigate to page 2 by modifying the paging offset in the URL.
      const pageTwoUrl = page.url().replace( /firstResult=\d+/, 'firstResult=10' );
      await page.goto( pageTwoUrl );
      await page.waitForLoadState( 'networkidle' );

      // Check that the correct page link is active and that there's a "Previous" button.
      const reloadedPager = page.locator( '#pager' );
      await reloadedPager.scrollIntoViewIfNeeded();
      await expectActivePage( reloadedPager, 2 );
      await expect( reloadedPager.locator( 'button.paginate-prev' ) ).toBeVisible();
    } );
  } );

  test.describe( 'Trigger', () => {

    // NOTE: This assumes there's a trigger configured for the "sign-in" query, which is the case in Non-production 1
    test( 'query pipeline trigger is shown above the results and takes focus', async ( { page } ) => {

      // Perform a search that triggers the query pipeline notification trigger.
      await page.locator( '#sch-inp-ac' ).focus();
      await page.keyboard.type( 'sign-in' );
      await page.keyboard.press( 'Enter' );
      await page.waitForLoadState( 'networkidle' );
      const trigger = page.locator( '#notification-trigger' );
      const triggerHeading = trigger.locator( 'h2' );
      const summary = page.locator( '#query-summary h2' );

      // The trigger box should be visible and contain "You may want to narrow down your search"
      await expect( trigger ).toBeVisible();
      await expect( trigger ).toContainText( 'You may want to narrow down your search' );

      // The trigger box should be above the search summary in the DOM.
      const position = await page.evaluate( () => {
        const notification = document.querySelector( '#notification-trigger' );
        const querySummary = document.querySelector( '#query-summary' );
        return notification.compareDocumentPosition( querySummary ) & Node.DOCUMENT_POSITION_FOLLOWING ? 'before' : 'after';
      } );
      expect( position ).toBe( 'before' );

      // Focus goes to the trigger box, not the search summary.
      await expect( triggerHeading ).toBeFocused();
      await expect( summary ).not.toBeFocused();
    } );

    test( 'ADO 441000 - [TODO] clicking a link inside the trigger sends a queryPipelineNotificationTrigger custom analytics event', async ( { page } ) => {
      // TODO: For this to reliably pass, the connector library needs to add a small delay before the page navigation occurs after 
      // the analytics event is sent. Otherwise, the page unloads before the request is sent and the test fails.

      await page.locator( '#sch-inp-ac' ).focus();
      const trigger = page.locator( '#notification-trigger' );

      // Perform a search that triggers the query pipeline notification trigger and wait for all requests to settle
      await page.keyboard.type( 'sign-in' );
      await page.keyboard.press( 'Enter' );
      await page.waitForLoadState( 'networkidle' );

      // The trigger box should be visible
      await expect( trigger ).toBeVisible();

      // Check that the trigger contains a link and that the link is visible.
      const link = trigger.locator( 'a' ).first();
      await expect( link ).toBeVisible();

      // Save the link's href attribute so we can intercept the navigation request to that URL.
      const linkUrl = await link.getAttribute( 'href' )

      // Set up a listener to intercept the navigation request to the link's URL. When the request
      // is made, delay it by 2 seconds, so we have time to capture the analytics request before the page unloads.
      await page.route(linkUrl, async (route) => {
        const request = route.request();
        
        // Force the browser to wait 2 seconds before proceeding with the navigation
        if (request.resourceType() === 'document') {
          await new Promise(resolve => setTimeout(resolve, 2000));
          await route.continue();
        } else {
          await route.continue();
        }
      });

      // Set up the analytics request listener
      const [ analyticsRequest ] = await Promise.all([
        page.waitForRequest((req) => req.url().includes('/rest/v15/analytics/custom')),
        link.click({ noWaitAfter: true }),
      ]);

      // Extract and parse the URL-encoded payload. Decode the string and transform it into a JavaScript object
      const rawBody = analyticsRequest.postData();
      const params = new URLSearchParams(rawBody);
      const customEventRaw = params.get('customEvent');
      const payload = JSON.parse(decodeURIComponent(customEventRaw));

      // Check that the payload contains the custom event for the queryPipelineNotificationTrigger event.
      expect(payload.eventType).toBe('queryPipelineNotificationTrigger');
      expect(payload.eventValue).toBe('click');

    } );
  } );

});
