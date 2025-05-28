## To do

This list contains outstanding suggestions / non-critical issues identified in previously merged pull requests. The following items do need to be addressed in due time.

- [x] Potentially come up with an easier way to test locally
- [x] Add includes of JS (src) files in a baked in Jekyll variables instead of hardcoded
- [x] Revisit the need to search for postscript and rich text documents (ps and rtf. Are they needed? What's the usecase?
- [x] Revisit the "window.location.origin.startsWith( 'file://' )" condition
- [x] Investigate Pagination styles when testing from GitHub
- [x] Investigate #wb-land focus on Advanced search
- [x] Document customEvent
- [x] Finish proper development of Query Suggestion (QS), outside of GCWeb
- [x] Improve the form code to not rely on an action that points to an anchor for a dynamically added element, which doesn't exist on the page prior to JS
- [ ] Move QS generic integration to GCWeb
- [ ] Remove the need for having a CSS file to be handled by GCWeb instead!
- [ ] Add missing pieces such as "error message", "no result" and "did you mean" into our reference implementation as an example
- [ ] Add Expected output on test pages (HTML) and use Jekyll highlights
- [ ] Align search pages with new GCWeb template and/or define new GCWeb templates
- [ ] Ensure no section or heading or any element with semantic is added alone/empty on the page 
- [ ] Create search template specific styles (.page-type-search), to get rid of overusage of .h3 class for example
- [ ] Leverage wb core features instead of reinving the wheel, such as for language of page and dates. For dates, native JS functions could be leveraged such as: toLocaleDateString
- [ ] Improve caching of variable that are used multiple times in the script, such as: window.location, then window.location.pathname
- [ ] Revisit how dates are handled for output formats (need an array of months?)
- [ ] Make IDs configurable for "suggestion", "result-list", "result-link", "query-summary", "pager"
- [ ] Revisit customEvent to potentially be scoped to the search-ui element instead of document
- [ ] Improve warning message when Headless doesn't load
- [ ] "numberOfPages: 9" and "automaticallyCorrectQuery: false" should be configurable through parameters
