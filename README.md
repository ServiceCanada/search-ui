# Project: Search UI

Purpose of this repository is to provide MWS pages with the proper JS and CSS assets to achieve a working search page with the vendor's (Coveo) technology called Headless.

## References

- Coveo Headless: https://docs.coveo.com/en/headless/latest/

## Key details

### Sponsor / Contact

This project is led by Principal Publisher at ESDC. The key contact in case of questions related to the project is Francis Gorman, who can be reached at francis.gorman@hrsdc-rhdcc.gc.ca. If no reply is received from this person, fallback contact is ESDC.SD.DEV-DEV.DS.EDSC@servicecanada.gc.ca.

### Timeline and frequency

The goal is to continue to refine and improve this code base on a regular basis. Every 6 months, if no activity is recorded on this repository, the key contact shall be reached out to in order to ensure it isn't stale.

**Removal date** will coincide with end of contract with vendor.

### Improvement plan

To manage development activities related to this project, a standard internal issue tracking system used at Principal Publisher will be used. Also, regular touchpoints with the search vendor, as well as formal service requests entered through their portal, could also spark some development activities from a vendor perspective.

In the medium to long term, some activities may take place related to:
- stabilization of the query suggestion combobox;
- porting of some parts of the codebase to GCWeb;
- addition of machine learning features.

For more details, please [consult full checklist of to do items](todo.md).

## Releases and API

All changes contributed through Pull requests will be packaged as releases. Releases are completed through the "Releases" tab in this GitHub repository; then, deployment to MWS follows the reguar release management cycle accordingly.

Each new verion of this project is defined based on an evaluaton of the impacts of changes against any formerly up-to-date LIVE Search UI implementation on Canada.ca. The scope constitutes of all files within the "dist" folder (distribution files), which are JavaScript scripts and CSS styles. Additionally, volume of usage for features can also be taken into consideration as part of the evaluation of impact on versioning. For example, an interactive feature from the Javascript which is known by certitude to have never been used in a production environment, wouldn't cause any breaking change if modified and therefore, wouldn't generate a major version.

Search UI follows [Semantic Versioning 2.0.0](https://semver.org/)

---

## Getting started

This rubric is for developers and testers.

### Build files for release or to test code quality before opening a Pull request

1. run: npm install -g grunt-cli
2. run: npm install
3. run: grunt (build script; tasks to lint, test & minify content in "dist")

### Test as end-user

#### Test locally

1. Install Docker
2. Add an API key to your site settings as described below in [Setting an API key](#setting-an-api-key). Otherwise, please see [Alternative to the API key by getting a token](#alternative-to-the-api-key-by-getting-a-token) below.
3. run `docker compose up --build`

##### Setting an API key

1. Create a `_data` folder at the root. Then, add a file named `token.yml` inside the `_data` folder. This file needs to simply have a key-value pair of `API_KEY: "[API KEY HERE]"` on line 1. The key value can be found at https://github.com/ServiceCanada/devops-documentation/blob/master/search/local-testing.md to replace the `[API KEY HERE]`. If you do not have access to the previous link, please see the next section on how to use a token as described below.

##### Alternative to the API key by getting a token

Since you need a token to communicate with the Coveo API, you can do the following to go to get a token valid for 24 hrs:

1. Go to a search page on the Canada.ca Preview server such as: **/en/sr/srb.html**.
2. Open the inspector (developer tool) and look for the `div` tag that has the attribute called `data-gc-search`.
3. Inside this attribute, you'll find a Javascript object that has a field called `accessToken`. Grab the value of that token.
4. a) If you are **testing locally**, create a `_data` folder at the root. Then, add a file named `token.yml` inside the `_data` folder. This file needs to simply have a key-value pair of `API_KEY: "[API KEY HERE]"` on line 1. Add the token value as the key in `[API KEY HERE]`. b) If you are **testing through GitHub pages**, replace instances of `{{ site.data.token.API_KEY }}` with the token, on HTML pages would like to test.
5. If the token doesn't seem valid or if you have passed the 24 hours time-to-live (TTL), go back to step one and take another one from the Canada.ca Preview server.

#### Testing through GitHub Pages 

##### Main website

At all time, you can visit the GitHub website to see the GC Search UI with the latest Pull requests merged at play: https://servicecanada.github.io/search-ui/

##### In your fork

This is to test your changes usually before opening a Pull request.

1. Add the required token on HTML pages would like to test by [following the instructions on Alternative to the API key by getting a token](#alternative-to-the-api-key-by-getting-a-token). Do not use the `token.yml` approach documented for testing locally, since it may generate potential a [security risk](SECURITY.md) in the context of GitHub pages.
2. Push your code to a branch of your choice in your origin remote (fork). It is recommended that you use a dedicated branch for testing, one that you would never open a Pull request from.
3. Make sure your repository has GitHub Pages enabled, on that specific above-mentioned branch.
4. Your site is live on GitHub pages!

### Deployment

1. The content of the "dist" folder is what's needed for a release / deployment. See [Build files](#build-files) section above to generate this folder.

### Configurations, templates and parameters

#### Configurations

Configurations are used to refine certain behavior of the search script, to enable certain features, or to adapt to a unique page's context.

They must be used within the `[data-gc-search]` attribute. See the **/test/src-en.html** file as an example that sets the `originLevel3` configuration.

- `searchHub`
: Defines from which search hub in the organization we are using. Default: `canada-gouv-public-websites`
- `organizationId`
: Defines the environment to point to.
- `accessToken`
: Mechanism to allow communication wih the API
- `searchBoxQuery`
: CSS selector to the search input element. Default: `#sch-inp-ac`
- `lang`
: Langague of the text to output, in short format (`en` or `fr`). Will detect the langauge of the HTML page if not defined. If not determined, default is: `en`
- `numberOfSuggestions`
: Number of suggestions to show in the Query Suggestion (QS) box. This will activate the QS feature on your search page. Default: `0`
- `enableHistoryPush`
: Allows for UI elements that are not hyperlink tags to register their action in the history, such as pagination. Default: `true`
- `isContextSearch`
: Set the search behavior of the page as a contextual search. This is optional since it will detect automatically from the path of your page if it is contextual. If not determined, default is: `false`
- `isAdvancedSearch`
: Set the search behavior of the page as an advanced search. This is optional since it will detect automatically from the path of your page if it is advanced. If not determined, default is: `false`
- `originLevel3`
: Allows for mimicking a specific search page/context, such as the ESDC contextual search if you set it to: `/en/employment-social-development/search.html`. Default is the current page relative location (domain agnostic).

#### Templates

Default templates can be found in the **/src/connector.js** file and will be referred to here by their variable names as default values, so feel free to do a *CTRL+F* in that file to find the HTML code of the default templates.

Each template identified below are the ID value that needs to be used to override the HTML code of the associated template.

For example, to override the search results template, you would do something along the lines of the following:

```
<h3 class="h5"><a class="result-link text-primary" href="https://www.canada.ca">%[result.title]</a></h3> 
<ul class="context-labels"><li>%[result.raw.author]</li></ul>
<p><time datetime="%[short-date-en]" class="text-muted">%[long-date-en]</time> - %[highlightedExcerpt]</p>
```

Template override should technically only be used on a few instances of the search pages. If all pages would benefit from a template override, then the recommended action would be to modify the default template HTML code at the source through a pull request.

- `sr-single`
: Template for all search results individually
- `sr-nores`
: For when there is no results to show
- `sr-error`
: For when an error occurs in the communication between the search page and the search engine
- `sr-query-summary`
: For the summary zone above the search results. Recommended to include an H2 tag for accessibility purposes
- `sr-noquery-summary`
: For the summary zone above the search results on advanced search pages. Recommended to include an H2 tag for accessibility purposes
- `sr-did-you-mean`
: For the "Did you mean" suggestion section
- `sr-pager-previous`
: For the previous page button
- `sr-pager-page-`
: For page buttons that rare not previous or next
- `sr-pager-next`
: For the next page button
- `sr-pager-container`
: For the wrapper of all pagniation button

As demonstrated in the example above, and by looking at the default templates, you'll notice that some variables can be used within the templates to be replaced by dynamic content coming from the search engine's API response.

To be properly mapped within templates, variables have to be wrapped with `%[variable name]`.

Here is the extensive list of what variables can be used in templates:

- `index`
: returns the number of the result in the list. To be used on Single result template
- `result.clickUri`
: returns the link (URL) of the result's page. To be used on Single result template
- `result.title`
: returns the title of the result as it is saved in the search engine. To be used on Single result template
- `result.raw.author`
: returns the hostname/department attached to the result. To be used on Single result template
- `result.breadcrumb`
: returns the breadcrumb to get to the result's page on its respective domain. If not determined, returns the full URL to the page instead. To be used on Single result template
- `result.printableUri`
: returns the full URL of the result's page. To be used on Single result template
- `short-date-en`
: returns the date modified of the result's page in YYYY-MM-DD format (in English). To be used on Single result template
- `short-date-fr`
: returns the date modified of the result's page in YYYY-MM-DD format (in French). To be used on Single result template
- `long-date-en`
: returns the date modified of the result's page in mmm DD, YYYY format (in English). To be used on Single result template
- `long-date-fr`
: returns the date modified of the result's page in DD mmm YYYY format (in French)
- `highlightedExcerpt`
: returns the excerpt of the result as saved in the search engine. To be used on Single result template
- `numberOfResults`
: returns total number of results for a search term. To be used on Query summary template
- `query`
: returns what the user searched for. To be used on Query summary template
- `queryDurationInSeconds`
: returns duration of the search quey in the search engine in seconds with 2 decimal points. To be used on Query summary template
- `correctedQuery`
: returns what the search engine considers a better search query in case a low amount or zero results show (based on criteria handled within the serach engine). To be used on Did you mean template
- `page`
: returns page number. To be used on Pagination template

#### Parameters

Sometimes your search pages contain more than one input relevant to the search's context, such as in advanced search pages (see **/test/sra-en.html**), or even different behavior that should be based on query paremeters. In this case, you have a variety of URL paramters available to you. For inputs, you would pass a value for a certain parameter only if the name attribute is set.

- `q`
: Default parameter; the minimum to conduct a first search on load through a paremeter in the URL
- `allq`
: Search for all of the search terms in input
- `exctq`
: Search for exactly the search terms in input
- `anyq`
: Search for any of the search terms in input
- `noneq`
: Search for anything but the search terms in input
- `fqocct`
: Search for all of the search terms in input, matching on title or URL only
- `fqupdate`
: Search for search terms in input, on pages that have been modified only since a certain amount of time. Options are: `datemodified_dt:[now-1day to now]`, `datemodified_dt:[now-7days to now]`, `datemodified_dt:[now-1month to now]`, `datemodified_dt:[now-1year to now]`
- `dmn`
: Search for search terms in input, only on a specific domain
- `sort`
: Sort search results based on different criteria. Options are: by relevance (default when undefined) or by date when parameter is set
- `elctn_cat`
: Used specifically for Elections Canada, to define a scope of search amongst their collection. See **/src/connector.js** to see all the options available
- `site`
: Used specifically for Canada Gazette, to search within a specific site
- `year`
: Used specifically for budget limit search results to be created or modified on a given year, with minimum being 2000 and max being current year +1
- `filetype`
: Search , within documents of a certain file type. Options are: `application/pdf`, `ps`, `application/msword`, `application/vnd.ms-excel`, `application/vnd.ms-powerpoint`, `application/rtf`
- `originLevel3`
: Allows for mimicking a specific search page/context by setting its path through this URL parameter

### Other

#### Analytics tracking

Custom event named `searchEvent` can used to hook onto from Analytics tools, such as Adobe Analytics. This allows to listen to search actions, more specifically "doing a search", since the Search UI is acting similar to a Single Page App (SPA).
