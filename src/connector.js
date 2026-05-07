import {
	buildSearchEngine,
	buildSearchBox,
	buildResultList,
	buildQuerySummary,
	buildPager,
	buildResultsPerPage,
	buildSearchStatus,
	buildUrlManager,
	buildDidYouMean,
	buildContext,
	buildInteractiveResult,
	buildFacet,
	buildDateFacet,
	buildDateFilter,
	buildDateRange,
	loadAdvancedSearchQueryActions,
	loadSortCriteriaActions,
	HighlightUtils,
	getOrganizationEndpoints
} from './headless.esm.js';

// Search UI base
const baseElement = document.querySelector( '[data-gc-search]' );

// Window location variables
const winLoc = window.location;
const winPath = winLoc.pathname;
const winOrigin = winLoc.origin;
const originPath = winOrigin + winPath;

// Parameters
const defaults = {
	"searchHub": "canada-gouv-public-websites",
	"organizationId": "",
	"accessToken":"",
	"searchBoxQuery": "#sch-inp-ac",
	"lang": "en",
	"numberOfSuggestions": 5,
	"minimumCharsForSuggestions": 3,
	"enableHistoryPush": true,
	"isContextSearch": false,
	"isAdvancedSearch": false,
	"originLevel3": originPath,
	"pipeline": "",
	"automaticallyCorrectQuery": false,
	"numberOfPages": 9,
	"facets": []
};
let lang = document.querySelector( "html" )?.lang;
let paramsOverride = baseElement ? JSON.parse( baseElement.dataset.gcSearch ) : {};
let paramsDetect = {};
let params = {};
let urlParams;
let hashParams;
let originLevel3RelativeUrl = "";

// Headless controllers
let headlessEngine;
let contextController;
let searchBoxController;
let resultListController;
let querySummaryController;
let didYouMeanController;
let pagerController;
let statusController;
let urlManager;
let unsubscribeManager;
let unsubscribeSearchBoxController;
let unsubscribeResultListController;
let unsubscribeQuerySummaryController;
let unsubscribeDidYouMeanController;
let unsubscribePagerController;

let dateFilterControllers = [];
let dateFilterStates = [];
let facetControllers = [];
let facetNormalizedConfigs = [];
let facetSearchTimers = [];
let facetStates = [];
let unsubscribeDateFilterControllers = [];
let unsubscribeFacetControllers = [];

// UI states
let updateSearchBoxFromState = false;
let searchBoxState;
let resultListState;
let querySummaryState;
let didYouMeanState;
let pagerState;
let lastCharKeyUp;
let activeSuggestion = 0;
let pagerManuallyCleared = false;

// Firefox patch
let isFirefox = navigator.userAgent.indexOf( "Firefox" ) !== -1;
let waitForkeyUp = false;

// UI Elements placeholders 
const resultSectionID = "wb-land";
let searchBoxElement;
let formElement = document.querySelector( `.page-type-search main [role=search], #gc-searchbox, form[action="#${resultSectionID}"]` );
let resultsSection = document.querySelector( `#${resultSectionID}` );
let resultListElement = document.querySelector( '#result-list' );
let querySummaryElement = document.querySelector( '#query-summary' );
let pagerElement = document.querySelector( '#pager' );
let suggestionsElement = document.querySelector( '#suggestions' );
let didYouMeanElement = document.querySelector( '#did-you-mean' );
let facetSidebarElement = document.querySelector( '#gc-facet-sidebar' );
let facetPanelElement = document.querySelector( '#gc-facet-panel' );

// UI templates
let resultTemplateHTML = document.getElementById( 'sr-single' )?.innerHTML;
let noResultTemplateHTML = document.getElementById( 'sr-nores' )?.innerHTML;
let resultErrorTemplateHTML = document.getElementById( 'sr-error' )?.innerHTML;
let querySummaryTemplateHTML = document.getElementById( 'sr-query-summary' )?.innerHTML;
let didYouMeanTemplateHTML = document.getElementById( 'sr-did-you-mean' )?.innerHTML;
let noQuerySummaryTemplateHTML = document.getElementById( 'sr-noquery-summary' )?.innerHTML;
let previousPageTemplateHTML = document.getElementById( 'sr-pager-previous' )?.innerHTML;
let pageTemplateHTML = document.getElementById( 'sr-pager-page' )?.innerHTML;
let nextPageTemplateHTML = document.getElementById( 'sr-pager-next' )?.innerHTML;
let pagerContainerTemplateHTML = document.getElementById( 'sr-pager-container' )?.innerHTML;
let qsA11yHintHTML = document.getElementById( 'sr-qs-hint' )?.innerHTML;

// Init parameters and UI
function initSearchUI() {
	if( !baseElement || !DOMPurify ) {
		return;
	}

	if ( !lang && winPath.includes( "/fr/" ) ) {
		paramsDetect.lang = "fr";
	}
	if ( lang.startsWith( "fr" ) ) {
		paramsDetect.lang = "fr";
	}

	paramsDetect.isContextSearch = !winPath.endsWith( '/sr/srb.html' ) && !winPath.endsWith( '/sr/sra.html' );
	paramsDetect.isAdvancedSearch = !!document.getElementById( 'advseacon1' ) || winPath.endsWith( '/advanced-search.html' ) || winPath.endsWith( '/recherche-avancee.html' );
	paramsDetect.enableHistoryPush = !paramsDetect.isAdvancedSearch;

	// Final parameters object
	params = Object.assign( defaults, paramsDetect, paramsOverride );

	// Update the URL params and the hash params on navigation
	window.onpopstate = () => {
		var match,
			pl = /\+/g,	// Regex for replacing addition symbol with a space
			search = /([^&=]+)=?([^&]*)/g,
			decode = function ( s ) { return decodeURIComponent( s.replace( pl, " " ) ); },
			query = winLoc.search.substring( 1 );

		urlParams = {};
		hashParams = {};

		// Ignore linting errors in regard to affectation instead of condition in the loops
		// jshint -W084
		while ( match = search.exec( query ) ) {	// eslint-disable-line no-cond-assign
			urlParams[ decode(match[ 1 ] ) ] = stripHtml( decode( match[ 2 ] ) );
		}
		query = winLoc.hash.substring( 1 );

		while ( match = search.exec( query ) ) {	// eslint-disable-line no-cond-assign
			hashParams[ decode( match[ 1 ] ) ] = stripHtml( decode( match[ 2 ] ) );
		}
		// jshint +W084
	};

	window.onpopstate();

	// Initialize templates
	initTpl();

	// override origineLevel3 through query parameters 
	if ( urlParams.originLevel3 ) {
		params.originLevel3 = urlParams.originLevel3;
	}
	// override sort through query parameters 
	if (urlParams.sort) {
		params.sort = urlParams.sort;
	}						 
	// set the custom action cause for the initial search 
	if ( urlParams.actionCause ) {
		params.actionCause = urlParams.actionCause;

		// changing the URL without reloading the page to remove actionCause
		if ( window.history.replaceState ) {
			var newUrl = new URL( winLoc.href );
			newUrl.searchParams.delete( 'actionCause' );
			window.history.replaceState( { path : newUrl.href }, '', newUrl.href );
		}
	}
	
	// Auto detect relative path from originLevel3
	if( !params.originLevel3.startsWith( "/" ) && /http|www/.test( params.originLevel3 ) ) {
		try {
			const absoluteURL = new URL( params.originLevel3 );
			originLevel3RelativeUrl = absoluteURL.pathname;
		}
		catch( exception ) {
			console.warn( "Exception while auto detecting relative path: " + exception.message );
		}
	}
	else {
		originLevel3RelativeUrl = params.originLevel3;
	}

	if ( !params.endpoints ) {
		params.endpoints = getOrganizationEndpoints( params.organizationId, 'prod' );
	}

	// Show error on load if no access token is provided
	if ( !params.accessToken ) {
		showQueryErrorMessage();
		return;
	}

	// Initialize the Headless engine
	initEngine();
}

// Initialize default templates
function initTpl() {

	// Auto-create parts of search pages templates if not already defined
	// Default templates
	if ( !resultTemplateHTML ) {
		if ( lang === "fr" ) {
			resultTemplateHTML = 
				`<h3><a class="result-link" href="%[result.clickUri]" data-dtm-srchlnknm="%[index]">%[result.title]</a></h3> 
				<ul class="context-labels"><li>%[result.raw.author]</li></ul> 
				%[result.breadcrumb] 
				<p><time datetime="%[short-date-fr]" class="text-muted">%[long-date-fr]</time> - %[highlightedExcerpt]</p>`;
		}
		else {
			resultTemplateHTML = 
				`<h3><a class="result-link" href="%[result.clickUri]" data-dtm-srchlnknm="%[index]">%[result.title]</a></h3> 
				<ul class="context-labels"><li>%[result.raw.author]</li></ul> 
				%[result.breadcrumb]
				<p><time datetime="%[short-date-en]" class="text-muted">%[long-date-en]</time> - %[highlightedExcerpt]</p>`;
		}
	}

	if ( !noResultTemplateHTML ) {
		if ( lang === "fr" ) {
			noResultTemplateHTML = 
				`<div class="alert alert-warning">
					<h2>Aucun résultat</h2>
					<p>Aucun résultat ne correspond à vos critères de recherche.</p>
					<p>Suggestions&nbsp;:</p>
					<ul>
						<li>Assurez-vous que tous vos termes de recherches sont bien orthographiés </li>
						<li>Utilisez de différents termes de recherche </li>
						<li>Utilisez des termes de recherche plus généraux </li>
						<li>Consultez les&nbsp;<a href="/fr/sr/tr.html"> trucs de recherche </a></li>
						<li>Essayez la <a href="/fr/sr/srb/sra.html">recherche avancée</a></li>
					</ul>
				</div>`;
		}
		else {
			noResultTemplateHTML = 
				`<div class="alert alert-warning">
					<h2>No results</h2>
					<p>No pages were found that match your search terms.</p>
					<p>Suggestions:</p>
					<ul>
						<li>Make sure all search terms are spelled correctly</li>
						<li>Try different search terms</li>
						<li>Try more general search terms</li>
						<li>Consult the&nbsp;<a href="/en/sr/st.html">search tips</a></li>
						<li>Try the&nbsp;<a href="/en/sr/srb/sra.html">advanced search</a></li>
					</ul>
				</div>`;
		}
	}

	if ( !resultErrorTemplateHTML ) {
		if ( lang === "fr" ) {
			resultErrorTemplateHTML = 
				`<div class="alert alert-warning">
					<h2>Nous éprouvons actuellement des problèmes avec la fonction de recherche sur le site Web Canada.ca</h2>
					<p>L'équipe chargée de rétablir les services touchés travaille de façon à résoudre le problème aussi rapidement que possible. Nous vous prions de nous excuser pour tout inconvénient.</p>
				</div>`;
		}
		else {
			resultErrorTemplateHTML = 
				`<div class="alert alert-warning">
					<h2>The Canada.ca Search is currently experiencing issues</h2>
					<p>A resolution for the restoration is presently being worked.	We apologize for any inconvenience.</p>
				</div>`;
		}
	}

	if ( !querySummaryTemplateHTML ) {
		if ( lang === "fr" ) {
			querySummaryTemplateHTML = 
				`<h2>%[numberOfResults] résultats de recherche pour "%[query]"</h2>`;
		}
		else {
			querySummaryTemplateHTML = 
				`<h2>%[numberOfResults] search results for "%[query]"</h2>`;
		}
	}

	if ( !didYouMeanTemplateHTML ) {
		if ( lang === "fr" ) {
			didYouMeanTemplateHTML = 
				`<p>Rechercher plutôt <button class="btn btn-lg btn-link" type="button">%[correctedQuery]</button> ?</p>`;
		}
		else {
			didYouMeanTemplateHTML = 
				`<p>Did you mean <button class="btn btn-lg btn-link" type="button">%[correctedQuery]</button> ?</p>`;
		}
	}

	if ( !noQuerySummaryTemplateHTML ) {
		if ( lang === "fr" ) {
			noQuerySummaryTemplateHTML = 
				`<h2>%[numberOfResults] résultats de recherche</h2>`;
		}
		else {
			noQuerySummaryTemplateHTML = 
				`<h2>%[numberOfResults] search results</h2>`;
		}
	}

	if ( !previousPageTemplateHTML ) {
		if ( lang === "fr" ) {
			previousPageTemplateHTML = 
				`<button class="page-button paginate-prev">Précédente<span class="wb-inv">: Page précédente des résultats de recherche</span></ button>`;
		}
		else {
			previousPageTemplateHTML = 
				`<button class="page-button paginate-prev">Previous<span class="wb-inv">: Previous page of search results</span></ button>`;
		}
	}

	if ( !pageTemplateHTML ) {
		if ( lang === "fr" ) {
			pageTemplateHTML = 
				`<button class="page-button">%[page]<span class="wb-inv">: Page %[page] des résultats de recherche</span></ button>`;
		}
		else {
			pageTemplateHTML = 
				`<button class="page-button">%[page]<span class="wb-inv">: Page %[page] of search results</span></ button>`;
		}
	}

	if ( !nextPageTemplateHTML ) {
		if ( lang === "fr" ) {
			nextPageTemplateHTML = 
				`<button class="page-button paginate-next">Suivante<span class="wb-inv">: Page suivante des résultats de recherche</span></ button>`;
		}
		else {
			nextPageTemplateHTML = 
				`<button class="page-button paginate-next">Next<span class="wb-inv">: Next page of search results</span></ button>`;
		}
	}

	if ( !pagerContainerTemplateHTML ) {
		if ( lang === "fr" ) {
			pagerContainerTemplateHTML = 
				`<div class="text-center wb-paginate-pager" >
					<p class="wb-inv">Pagination des résultats de recherche</p>
					<ul id="pager" class="pagination mrgn-bttm-0">
					</ul>
				</div>`;
		}
		else {
			pagerContainerTemplateHTML = 
				`<div class="text-center wb-paginate-pager" >
					<p class="wb-inv">Search results pages</p>
					<ul id="pager" class="pagination mrgn-bttm-0">
					</ul>
				</div>`;
		}
	}

	if ( !qsA11yHintHTML ) {
		if ( lang === "fr" ) {
			qsA11yHintHTML = 
				`<p id="sr-qs-hint" class="hidden">Appuyez sur les touches de direction orientées vers le haut et vers le bas pour vous déplacer dans les suggestions de recherche. Appuyez une fois sur la touche Entrée sur une suggestion pour la sélectionner et débuter la recherche.</p>`;
		}
		else {
			qsA11yHintHTML = 
				`<p id="sr-qs-hint" class="hidden">Press the up and down arrow keys to move through the search suggestions. Press Enter on a suggestion once to select it and start the search.</p>`;
		}	
	}

	// Normalize facet configs from the HTML attribute
	const facetConfigMap = new Map();
	if ( Array.isArray( params.facets ) ) {
		params.facets.forEach( ( raw ) => {
			const config = normalizeFacetConfig( raw );
			if ( config ) facetConfigMap.set( config.facetId, config );
		} );
	}
	facetNormalizedConfigs = [ ...facetConfigMap.values() ];

	// Auto-create two-column facet layout when valid facets are configured
	if ( facetNormalizedConfigs.length > 0 && !facetPanelElement ) {
		const isFr = lang === 'fr';
		const facetPlaceholders = facetNormalizedConfigs.map( ( config, index ) =>
			`<details id="gc-facet-${config.facetId}" class="gc-facet${index > 0 ? ' mrgn-tp-md' : ''}" open></details>`
		).join( '' );

		baseElement.insertAdjacentHTML( 'beforeend',
			`<button type="button" id="gc-facet-toggle" class="btn btn-default gc-facet-toggle" aria-expanded="true" aria-controls="gc-facet-panel">
				<span class="glyphicon glyphicon-chevron-left" aria-hidden="true"></span> ${isFr ? 'Filtres' : 'Filters'}
			</button>
			<div class="row" id="gc-search-facet-layout">
				<div id="gc-facet-sidebar" class="col-md-4 gc-facet-sidebar mrgn-tp-lg">
					<section id="gc-facet-panel">
						<h2 class="wb-inv">${isFr ? 'Filtres' : 'Filters'}</h2>
						<p id="gc-facet-live" class="wb-inv" aria-live="polite" aria-atomic="true"></p>
						<div id="gc-facet-clear-all-container" class="text-right" hidden>
							<button type="button" class="btn btn-link">${isFr ? 'Effacer tout' : 'Clear all'}</button>
						</div>
						${facetPlaceholders}
					</section>
				</div>
				<div id="gc-results-col" class="col-md-8 gc-results-col">
					<section id="${resultSectionID}"></section>
				</div>
			</div>`
		);

		// Store references and attach event handlers after insertion
		facetSidebarElement = document.getElementById( 'gc-facet-sidebar' );
		facetPanelElement = document.getElementById( 'gc-facet-panel' );
		resultsSection = document.getElementById( resultSectionID );
		document.getElementById( 'gc-facet-toggle' ).onclick = toggleFacetSidebar;
		document.querySelector( '#gc-facet-clear-all-container .btn-link' ).onclick = () => {
			facetControllers.forEach( ( c ) => c?.deselectAll() );
			dateFilterControllers.forEach( ( c ) => c?.clear() );
		};

		// Apply mobile defaults (sidebar hidden, facets collapsed) and restore any persisted state
		applyFacetUIDefaults();
	}

	// auto-create results
	if ( !resultsSection ) {
		resultsSection = document.createElement( "section" );
		resultsSection.id = resultSectionID;
	}

	// auto-create query summary element
	if ( !querySummaryElement ) {
		querySummaryElement = document.createElement( "div" );
		querySummaryElement.id = "query-summary";

		resultsSection.append( querySummaryElement );
	}

	// auto-create did you mean element
	if ( !didYouMeanElement ) {
		didYouMeanElement = document.createElement( "div" );
		didYouMeanElement.id = "did-you-mean";

		resultsSection.append( didYouMeanElement );
	}

	// auto-create results section if not present
	if ( !resultListElement ) {
		resultListElement = document.createElement( "div" );
		resultListElement.id = "result-list";
		resultListElement.classList.add( "results" );

		resultsSection.append( resultListElement );
	}

	// auto-create pager
	if ( !pagerElement ) {
		let newPagerElement = document.createElement( "div" );
		newPagerElement.innerHTML = pagerContainerTemplateHTML;

		resultsSection.append( newPagerElement );
		pagerElement = newPagerElement;
	}

	// initialize the search box
	searchBoxElement = document.querySelector( params.searchBoxQuery );

	if ( searchBoxElement ) {

		// default searchbox attributes
		searchBoxElement.setAttribute( 'type', 'search' ); // default, when query suggestions are disabled

		// if query suggestions are enabled and not advanced search, auto-create suggestions element and update searchbox attributes
		if ( params.numberOfSuggestions > 0 && !params.isAdvancedSearch && !suggestionsElement ) {
			searchBoxElement.setAttribute( 'type', 'text' );
			searchBoxElement.role = "combobox";
			searchBoxElement.setAttribute( 'aria-expanded', 'false' );
			searchBoxElement.setAttribute( 'aria-autocomplete', 'list' );

			suggestionsElement = document.createElement( "ul" );
			suggestionsElement.id = "suggestions";
			suggestionsElement.role = "listbox";
			suggestionsElement.classList.add( "query-suggestions" );

			searchBoxElement.after( suggestionsElement );
			searchBoxElement.setAttribute( 'aria-controls', 'suggestions' );

			// Add accessibility instructions after query suggestions
			suggestionsElement.insertAdjacentHTML( 'afterEnd', qsA11yHintHTML );
			suggestionsElement.setAttribute( "aria-describedby", "sr-qs-hint" );

			// Document-wide listener to close query suggestion box if click elsewhere
			document.addEventListener( "click", function( evnt ) {
				if ( suggestionsElement && ( evnt.target.className !== "suggestion-item" && evnt.target.id !== searchBoxElement?.id ) ) {
					closeSuggestionsBox();
				}
			} );
		}
	}
}

// Detect if localStorage is available
function hasLocalStorage() {
	try {
		return typeof localStorage !== 'undefined';
	} catch ( error ) {
		return false;
	}
}

// Detect if sessionStorage is available
function hasSessionStorage() {
	try {
		sessionStorage.setItem( '__test', '1' );
		sessionStorage.removeItem( '__test' );
		return true;
	} catch ( error ) {
		return false;
	}
}

// Returns true if the viewport is mobile (below Bootstrap's col-md breakpoint)
function isMobileView() {
	return window.innerWidth < 992;
}

// Session storage key for facet UI state
const FACET_UI_STATE_KEY = 'gc-facet-ui-state';

// Load persisted facet UI state from sessionStorage
function loadFacetUIState() {
	if ( !hasSessionStorage() ) { return null; }
	try {
		const raw = sessionStorage.getItem( FACET_UI_STATE_KEY );
		return raw ? JSON.parse( raw ) : null;
	} catch ( error ) {
		return null;
	}
}

// Apply default facet UI state based on viewport, then overlay any persisted sessionStorage state.
// Desktop defaults: sidebar visible, facets open.
// Mobile defaults: sidebar hidden, facets collapsed.
function applyFacetUIDefaults() {
	const mobile = isMobileView();
	const toggleBtn = document.getElementById( 'gc-facet-toggle' );
	const resultsCol = document.getElementById( 'gc-results-col' );
	const saved = loadFacetUIState();

	// Determine sidebar visibility: prefer saved value, else use viewport default
	const sidebarVisible = saved?.sidebarVisible !== undefined ? saved.sidebarVisible : !mobile;
	if ( toggleBtn ) {
		toggleBtn.setAttribute( 'aria-expanded', String( sidebarVisible ) );
	}
	if ( facetSidebarElement ) {
		facetSidebarElement.hidden = !sidebarVisible;
	}
	if ( resultsCol ) {
		resultsCol.classList.toggle( 'col-md-8', sidebarVisible );
		resultsCol.classList.toggle( 'col-md-12', !sidebarVisible );
	}

	// Determine facet open state: default is open on desktop, closed on mobile
	const defaultFacetsOpen = !mobile;
	document.querySelectorAll( '.gc-facet' ).forEach( ( el ) => {
		const savedOpen = saved?.facetsOpen?.[ el.id ];
		el.open = savedOpen !== undefined ? savedOpen : defaultFacetsOpen;

		// Persist state whenever the user manually toggles a facet
		el.addEventListener( 'toggle', saveFacetUIState );
	} );
}

// Save facet UI state to sessionStorage, only persisting values that differ from the defaults
// Desktop defaults: sidebar visible, all facets open
// Mobile defaults: sidebar hidden, all facets closed
function saveFacetUIState() {
	if ( !hasSessionStorage() ) { return; }

	const mobile = isMobileView();
	const defaultSidebarVisible = !mobile;
	const defaultFacetsOpen = !mobile;

	const toggleBtn = document.getElementById( 'gc-facet-toggle' );
	const currentSidebarVisible = toggleBtn?.getAttribute( 'aria-expanded' ) === 'true';

	const state = {};

	// Only save sidebar visibility if it differs from the default
	if ( currentSidebarVisible !== defaultSidebarVisible ) {
		state.sidebarVisible = currentSidebarVisible;
	}

	// Only save facet open/closed states that differ from the default
	const facetEls = document.querySelectorAll( '.gc-facet' );
	const facetOpenOverrides = {};
	let hasFacetOverrides = false;
	facetEls.forEach( ( el ) => {
		if ( el.open !== defaultFacetsOpen ) {
			facetOpenOverrides[ el.id ] = el.open;
			hasFacetOverrides = true;
		}
	} );
	if ( hasFacetOverrides ) {
		state.facetsOpen = facetOpenOverrides;
	}

	// If everything matches defaults, clear any saved state
	if ( Object.keys( state ).length === 0 ) {
		sessionStorage.removeItem( FACET_UI_STATE_KEY );
	} else {
		sessionStorage.setItem( FACET_UI_STATE_KEY, JSON.stringify( state ) );
	}
}

// Limit actions history array to items newer than 7 days
function limitCoveoAnalyticsHistory( actionsHistory ) {
	const now = new Date();
	const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

	return actionsHistory.filter( ( action ) => {
		const parsedTime = new Date( action.time.replace( /^"|"$/g, "" ) );
		return parsedTime.getTime() >= sevenDaysAgo;
	} );
}

// Saves the actions history array to either localStorage or a cookie, depending on what's available
function saveCoveoAnalyticsHistory( actionsHistory ) {
	const key = '__coveo.analytics.history';
	const serialized = JSON.stringify( actionsHistory );

	// Coveo will use localStorage if available, ignoring cookies
	if ( hasLocalStorage() ) {
		localStorage.setItem( key, serialized );
	} else {
		// No localStorage, try cookies
		try {
			const expiry = 7 * 24 * 60 * 60; // 7-day expiry
			document.cookie = `${key}=${serialized}; path=/; max-age=${expiry}`;
		} catch ( error ) {
			// Do nothing if cookies are disabled
		}
	}
}

// Sanitize query to remove HTML tags
function sanitizeQuery(q) {
	return q.replace(/<[^>]*>?/gm, '');
}

// Normalize a single raw facet config entry from the HTML attribute.
// Accepts { field, label|title, facetId, numberOfValues, sortCriteria }.
// Returns a clean config object, or null if the entry is invalid.
function normalizeFacetConfig( raw ) {
	if ( !raw || typeof raw !== 'object' || Array.isArray( raw ) ) {
		return null;
	}

	const field = typeof raw.field === 'string' ? raw.field.trim() : '';
	if ( !field ) {
		return null;
	}

	const labelRaw = typeof raw.label === 'string' ? raw.label.trim() : '';
	const titleRaw = typeof raw.title === 'string' ? raw.title.trim() : '';
	const label = labelRaw || titleRaw || field;

	const facetId = ( typeof raw.facetId === 'string' && raw.facetId.trim() )	? raw.facetId.trim() : field;

	const numberOfValues = ( Number.isInteger( raw.numberOfValues ) && raw.numberOfValues > 0 ) ? raw.numberOfValues : 8;

	const sortCriteria = raw.sortCriteria !== '' ? raw.sortCriteria : 'occurrences';

	const facetType = raw.facetType === 'dateRange' ? 'dateRange' : 'regular';
	const facetSearch = raw.facetSearch !== false;
	const filterFacetCount = raw.filterFacetCount !== false;
	const withDatePicker = raw.withDatePicker !== false;
	const withDateRanges = raw.withDateRanges !== false;

	return { field, label, facetId, numberOfValues, sortCriteria, facetType, facetSearch, filterFacetCount, withDatePicker, withDateRanges };
}


// Convert YYYY-MM-DD (date input value) to Coveo date string
function inputDateToCoveoDate( dateStr, endOfDay ) {
	if ( !dateStr ) { return ''; }
	return dateStr.replace( /-/g, '/' ) + ( endOfDay ? '@23:59:59' : '@00:00:00' );
}

// Convert a Coveo date string to YYYY-MM-DD for a date input
function coveoDateToInputDate( coveoDate ) {
	if ( !coveoDate ) { return ''; }
	return String( coveoDate ).slice( 0, 10 ).replace( /\//g, '-' );
}

// Resolve a Coveo range endpoint (string or relative object) to a YYYY-MM-DD input date string
function resolveRangeEndpointToInputDate( endpoint ) {
	if ( typeof endpoint === 'string' ) {
		return coveoDateToInputDate( endpoint );
	}
	if ( endpoint && endpoint.period === 'past' ) {
		const d = new Date();
		if ( endpoint.unit === 'day' ) { d.setDate( d.getDate() - endpoint.amount ); }
		else if ( endpoint.unit === 'week' ) { d.setDate( d.getDate() - endpoint.amount * 7 ); }
		else if ( endpoint.unit === 'month' ) { d.setMonth( d.getMonth() - endpoint.amount ); }
		else if ( endpoint.unit === 'year' ) { d.setFullYear( d.getFullYear() - endpoint.amount ); }
		return d.toISOString().slice( 0, 10 );
	}
	return '';
}

// Predefined relative date periods for the date facet (start is relative, end is fixed at page load)
function getDateFacetFields () {
	const end = getCoveoDateFormat(new Date());
	return [
		{
			en: "Past day",
			fr: "Dernière journée",
			range: buildDateRange({
				start: { period: "past", unit: "day", amount: 1 },
				end,
				endInclusive: true,
			}),
		},
		{
			en: "Past week",
			fr: "Dernière semaine",
			range: buildDateRange({
				start: { period: "past", unit: "week", amount: 1 },
				end,
				endInclusive: true,
			}),
		},
		{
			en: "Past month",
			fr: "Dernier mois",
			range: buildDateRange({
				start: { period: "past", unit: "month", amount: 1 },
				end,
				endInclusive: true,
			}),
		},
		{
			en: "Past year",
			fr: "Dernière année",
			range: buildDateRange({
				start: { period: "past", unit: "year", amount: 1 },
				end,
				endInclusive: true,
			}),
		},
		{
			en: "Older",
			fr: "Plus ancien",
			range: buildDateRange({
				start: "1970/01/01@00:00:00",
				end: { period: "past", unit: "year", amount: 1 },
				endInclusive: false,
			}),
		},
	];
}

// rebuild a clean query string out of a JSON object
function buildCleanQueryString( paramsObject ) {
	let urlParam = "";
	for ( var prop in paramsObject ) {
		if ( paramsObject[ prop ] ) {
			if ( urlParam !== "" ) {
				urlParam += "&";
			}

			urlParam += prop + "=" + stripHtml( paramsObject[ prop ].replaceAll( '+', ' ' ) );
		}	
	}
	return urlParam;
}

// Filters out dangerous URIs that can create XSS attacks such as `javascript:`.
function filterProtocol( uri ) {

	const isAbsolute = /^(https?|mailto|tel):/i.test( uri );
	const isRelative = /^(\/|\.\/|\.\.\/)/.test( uri );

	return isAbsolute || isRelative ? uri : '';
}

// Strip HTML tags of a given string
function stripHtml(html) {
	let tmp = document.createElement( "DIV" );
	tmp.innerHTML = html;
	return tmp.textContent || tmp.innerText || "";
}

// Focus to H2 heading in results section
function focusToView() {
	let focusElement = resultsSection.querySelector( "h2" );

	if( focusElement ) {
		focusElement.tabIndex = -1;
		focusElement.focus();
	}
}

// Get date converted from GMT (Coveo) to current timezone
function getDateInCurrentTimeZone( date ) {
	const offset = date.getTimezoneOffset();
	return new Date( date.getTime() + ( offset * 60 * 1000 ) );
}

// get a short date format like YYYY-MM-DD
function getShortDateFormat( date ){
	let currentTZDate = getDateInCurrentTimeZone( date );
	return currentTZDate.toISOString().split( 'T' )[ 0 ];
}

// get a long date format like May 21, 2024
function getLongDateFormat( date, lang ){
	let currentTZDate = getDateInCurrentTimeZone( date );
	let langCA = lang + "-CA";

	return currentTZDate.toLocaleDateString( langCA, { year: 'numeric', month: 'short', day: 'numeric' } );
}

// Format a Date as a Coveo date string: YYYY/MM/DD@HH:mm:ss
function getCoveoDateFormat( date ) {
	const pad = ( n ) => String( n ).padStart( 2, '0' );
	return `${date.getFullYear()}/${pad( date.getMonth() + 1 )}/${pad( date.getDate() )}@${pad( date.getHours() )}:${pad( date.getMinutes() )}:${pad( date.getSeconds() )}`;
}

// checking for default date , Jan 1st, 1970
function isEmptyDate( date ) { 
	return date instanceof Date &&
	date.getFullYear() === 1970 &&
	date.getMonth() === 0 &&     // January is 0
	date.getDate() === 1;
}

// Convert date parameter to GMT format YYYY/MM/DD
function getGMTDate( date ) {
	const paramDate = new Date( date );
	const GMTDateTime = new Date( paramDate.getTime() - paramDate.getTimezoneOffset()*60*1000 );

	const year = GMTDateTime.getFullYear();
	const month = GMTDateTime.getMonth() + 1; // Add 1 for 1-indexed month
	const day = GMTDateTime.getDate();

	const formattedMonth = month < 10 ? '0' + month : month;
	const formattedDay = day < 10 ? '0' + day : day;

	return `${year}/${formattedMonth}/${formattedDay}`;
}

// Initiate proprietary Headless engine
function initEngine() {
	headlessEngine = buildSearchEngine( {
		configuration: {
			organizationEndpoints: params.endpoints,
			organizationId: params.organizationId,
			accessToken: params.accessToken,
			search: {
				locale: params.lang,
				searchHub: params.searchHub,
				pipeline: params.pipeline
			},
			preprocessRequest: ( request, clientOrigin ) => {
				try {
					if( clientOrigin === 'analyticsFetch' || clientOrigin === 'analyticsBeacon' ) {
						let requestContent = JSON.parse( request.body );

						// filter user sensitive content
						requestContent.originLevel3 = params.originLevel3;

						// override actionCause if present
						if ( params.actionCause ) {
							requestContent.actionCause = params.actionCause;
							params.actionCause = ""; // reset the parameter to avoid polluting future searches with the same action cause
						}

						// documentAuthor cannot be longer than 128 chars based on search platform
						if ( requestContent.documentAuthor ) {
							requestContent.documentAuthor = requestContent.documentAuthor.substring( 0, 128 );
						}
						
						request.body = JSON.stringify( requestContent );

						// Event used to expose a data layer when search events occur; useful for analytics
						const searchEvent = new CustomEvent( "searchEvent", { detail: requestContent } );
						document.dispatchEvent( searchEvent );
					}
					if ( clientOrigin === 'searchApiFetch' ) {
						let requestContent = JSON.parse( request.body );

						// filter user sensitive content
						requestContent.enableQuerySyntax = params.isAdvancedSearch;
						requestContent.mlParameters = { 
							"filters": { 
								"c_context_searchpageurl": params.originLevel3, 
								"c_context_searchpagerelativeurl": originLevel3RelativeUrl 
							} 
						};

						if ( requestContent.analytics ) {
							requestContent.analytics.originLevel3 = params.originLevel3;
						}

						// override actionCause if present
						if ( params.actionCause ) {
							requestContent.analytics.actionCause = params.actionCause;
						}

						let q = requestContent.q;
						requestContent.q = sanitizeQuery( q );

						// Filters out actions history items older than 7 days
						const actionsHistory = limitCoveoAnalyticsHistory( requestContent.actionsHistory );
						if ( actionsHistory.length !== requestContent.actionsHistory.length ) {
							requestContent.actionsHistory = actionsHistory;
							saveCoveoAnalyticsHistory( actionsHistory );
						}
						
						request.body = JSON.stringify( requestContent );
					}
				} catch {
					console.warn( "No Headless Engine Loaded." );
				}

				return request;
			}
		}
	} );

	contextController = buildContext( headlessEngine );
	contextController.set( { "searchPageUrl" : params.originLevel3, "searchPageRelativeUrl" : originLevel3RelativeUrl } );
	
	// build controllers
	searchBoxController = buildSearchBox( headlessEngine, {
		options: {
			numberOfSuggestions: params.numberOfSuggestions,
			highlightOptions: {
				notMatchDelimiters: {
					open: '<strong>',
					close: '</strong>',
				},
			},
		}
	} );

	resultListController = buildResultList( headlessEngine, {
		options: {
			fieldsToInclude: [ "author", "date", "language", "urihash", "objecttype", "collection", "source", "permanentid", "displaynavlabel", "hostname", "disp_declared_type", "description" ]
		}
	} );
	querySummaryController = buildQuerySummary( headlessEngine );
	didYouMeanController = buildDidYouMean( headlessEngine, { options: { automaticallyCorrectQuery: params.automaticallyCorrectQuery } } );
	pagerController = buildPager( headlessEngine, { options: { numberOfPages: params.numberOfPages } } );
	statusController = buildSearchStatus( headlessEngine );

	// Build a facet controller for each normalized facet config
	facetNormalizedConfigs.forEach( ( config, index ) => {
		if ( config.facetType === 'dateRange' ) {
			const dateFacetController = buildDateFacet( headlessEngine, {
				options: {
					field: config.field,
					facetId: config.facetId,
					currentValues: getDateFacetFields().map( ( p ) => p.range ),
					generateAutomaticRanges: false,
				}
			} );
			const dateFilterController = buildDateFilter( headlessEngine, {
				options: {
					field: config.field,
					facetId: config.facetId + '__filter',
				}
			} );
			facetControllers[ index ] = dateFacetController;
			dateFilterControllers[ index ] = dateFilterController;
			facetStates[ index ] = dateFacetController.state;
			dateFilterStates[ index ] = dateFilterController.state;
			unsubscribeFacetControllers[ index ] = dateFacetController.subscribe(
				() => updateDateFacetState( index, dateFacetController.state, dateFilterController.state )
			);
			unsubscribeDateFilterControllers[ index ] = dateFilterController.subscribe(
				() => updateDateFacetState( index, dateFacetController.state, dateFilterController.state )
			);
		} else {
			const controller = buildFacet( headlessEngine, {
				options: {
					field: config.field,
					facetId: config.facetId,
					numberOfValues: config.numberOfValues,
					sortCriteria: config.sortCriteria,
				}
			} );
			facetControllers[ index ] = controller;
			facetStates[ index ] = controller.state;
			unsubscribeFacetControllers[ index ] = controller.subscribe(
				() => updateFacetState( index, controller.state )
			);
		}
	} );

	// Refine search based on URL parameters for filters, mostly used in Advanced Search to trigger only one search per page load
	if ( urlParams.allq || urlParams.exctq || urlParams.anyq || urlParams.noneq || urlParams.fqupdate || urlParams.dmn || urlParams.fqocct || urlParams.elctn_cat || urlParams.filetype || urlParams.site || urlParams.year || urlParams.declaredtype || urlParams.startdate || urlParams.enddate || urlParams.dprtmnt ) { 
		let q = [];
		let qString = "";
		let aqString = "";
		let fqupdate, elctn_cat, filetype, site, year, startDate, endDate;

		if ( urlParams.allq ) {
			qString = urlParams.allq.replaceAll( '+', ' ' );
		}
		if ( urlParams.exctq ) {
			q.push( '"' + urlParams.exctq.replaceAll( '+', ' ' ) + '"' );
		}
		if ( urlParams.anyq ) {
			q.push( urlParams.anyq.replaceAll( '+', ' ' ).replaceAll( ' ', ' OR ' ) );
		}
		if ( urlParams.noneq ) {
			q.push( "NOT (" + urlParams.noneq.replaceAll( '+', ' ' ).replaceAll( ' ', ') NOT(' ) + ")" );
		}

		qString += q.length ? ' (' + q.join( ')(' ) + ')' : '';

		if ( urlParams.fqocct ) {
			if ( urlParams.fqocct === "title_t" ) {
				aqString = "@title=" + qString;
				qString = "";
			}
			else if ( urlParams.fqocct === "url_t" ) {
				aqString = "@uri=" + qString;
				qString = "";
			}
		}

		if ( urlParams.fqupdate ) {
			fqupdate = urlParams.fqupdate.toLowerCase();

			if ( fqupdate === "datemodified_dt:[now-1day to now]" ) {
				aqString += ' @date>today-1d';
			}
			else if( fqupdate === "datemodified_dt:[now-7days to now]" ) {
				aqString += ' @date>today-7d';
			}
			else if( fqupdate === "datemodified_dt:[now-1month to now]" ) {
				aqString += ' @date>today-30d';
			}
			else if( fqupdate === "datemodified_dt:[now-1year to now]" ) {
				aqString += ' @date>today-365d';
			}
		}
		if ( urlParams.dmn ) {
			aqString += ' @uri="' + urlParams.dmn + '"';
		}


		// Specifically for Elections Canada, allows to search within scope
		if ( urlParams.elctn_cat ) {
			elctn_cat = urlParams.elctn_cat.toLowerCase();

			if( elctn_cat === "his" ) {
				aqString += ' @uri="dir=his"';
			}
			else if( elctn_cat === "comp" ) {
				aqString += ' @uri="compendium"';
			}
			else if( elctn_cat === "ogi" ) {
				aqString += ' @uri="dir=gui"';
			}
			else if( elctn_cat === "officer_manuals" ) {
				aqString += ' @uri="dir=pub"';
			}
			else if( elctn_cat === "research" ) {
				aqString += ' @uri="dir=rec"';
			}
			else if( elctn_cat === "press_release" ) {
				aqString += ' @uri="dir=pre"';
			}
			else if( elctn_cat === "legislation" ) {
				aqString += ' @uri="dir=loi"';
			}
			else if( elctn_cat === "charg" ) {
				aqString += ' @uri="section=charg"';
			}
			else if( elctn_cat === "ca" ) {
				aqString += ' @uri="dir=ca"';
			}
			else if( elctn_cat === "un" ) {
				aqString += ' @uri="dir=un"';
			}
			else if( elctn_cat === "pre" ) {
				aqString += ' @uri="dir=pre-com"';
			}
			else if( elctn_cat === "spe" ) {
				aqString += ' @uri="dir=spe-com"';
			}
			else if( elctn_cat === "rep" ) {
				aqString += ' @uri="section=rep"';
			}
		}

		if ( urlParams.filetype ) {
			filetype = urlParams.filetype.toLowerCase();

			if ( filetype === "application/pdf" ) {
				aqString += ' @filetype==(pdf)';
			}
			else if ( filetype === "text/html" ) {
				aqString += ' @filetype==(html)';
			}										 	
			else if ( filetype === "ps" ) {
				aqString += ' @filetype==(ps)';
			}
			else if ( filetype === "application/msword" ) {
				aqString += ' @filetype==(doc,docx)';
			}
			else if ( filetype === "application/vnd.ms-excel" ) {
				aqString += ' @filetype==(xls,xlsx)';
			}
			else if ( filetype === "application/vnd.ms-powerpoint" ) {
				aqString += ' @filetype==(ppt,pptx)';
			}
			else if ( filetype === "application/rtf" ) {
				aqString += ' @filetype==(rtf)';
			}
		}

		if ( urlParams.year ) {
			year = Number.parseInt( urlParams.year );

			if ( Number.isInteger( year )  && ( year >= 2000 )  && ( year <= ( new Date().getFullYear() + 1 ) ) ) {
				aqString += ' @uri=".ca/' + urlParams.year + '"';
			}
			else {
				aqString += ' NOT @uri';
			}
		}

		if ( urlParams.site ) {
			site = urlParams.site.toLowerCase().replace( '*', '' );
			aqString += ' @canadagazettesite==' + site;
		}
		
		if ( urlParams.startdate ) {
			startDate = getGMTDate( urlParams.startdate );
			aqString += ' @date >= "' + startDate + '"';
		}
		
		if ( urlParams.enddate ) {
			endDate = getGMTDate( urlParams.enddate );
			aqString += ' @date <= "' + endDate + '"';
		}
		
		if ( urlParams.dprtmnt ) { 
			aqString += ' @author = "' + urlParams.dprtmnt + '"';
				
		}
		
		if ( urlParams.declaredtype ) {
			aqString += ' @declared_type="' + urlParams.declaredtype.replaceAll( /'/g, '&#39;' ) + '"';
			
		}

		if ( aqString ) {
			const action = loadAdvancedSearchQueryActions( headlessEngine ).updateAdvancedSearchQueries( { 
				aq: aqString,
			} );
			headlessEngine.dispatch( action ); 
		}

		searchBoxController.updateText( qString );
		searchBoxController.submit();
	}

	if ( hashParams.q && searchBoxElement ) {
		searchBoxElement.value = stripHtml( hashParams.q );
	}
	else if ( urlParams.q && searchBoxElement ) {
		searchBoxElement.value = stripHtml( urlParams.q );
	}

	// Get the query portion of the URL
	const fragment = () => {
		if ( !statusController.state.firstSearchExecuted && !hashParams.q ) {
			return buildCleanQueryString( urlParams );
		}

		return buildCleanQueryString( hashParams );
	};

	urlManager = buildUrlManager( headlessEngine, {
		initialState: {
			fragment: fragment(),
		},
	} );
	if ( params.sort ) { 
		const sortAction = loadSortCriteriaActions( headlessEngine ).registerSortCriterion( {
			by: "date",
			order: params.sort ,
		} );
		headlessEngine.dispatch( sortAction );
	}																								

	// Unsubscribe to controllers
	unsubscribeManager = urlManager.subscribe( () => {
		if ( !params.enableHistoryPush || winOrigin.startsWith( 'file://' ) ) {
			return;
		}

		let hash = `#${urlManager.state.fragment}`;

		if ( !statusController.state.firstSearchExecuted ) {
			window.history.replaceState( null, document.title, originPath + hash );
		} else {
			window.history.pushState( null, document.title, originPath + hash );
		}
	} );

	// Sync controllers when URL changes
	const onHashChange = () => { 
		updateSearchBoxFromState = true;
		urlManager.synchronize( fragment() );
	};

	// Execute a search if parameters in the URL on page load
	if ( !statusController.state.firstSearchExecuted && fragment() && fragment() !== 'q=' ) {
		headlessEngine.executeFirstSearch();
	}

	// Subscribe to Headless controllers
	unsubscribeSearchBoxController = searchBoxController.subscribe( () => updateSearchBoxState( searchBoxController.state ) );
	unsubscribeResultListController = resultListController.subscribe( () => updateResultListState( resultListController.state ) );
	unsubscribeQuerySummaryController = querySummaryController.subscribe( () => updateQuerySummaryState( querySummaryController.state ) );
	unsubscribeDidYouMeanController = didYouMeanController.subscribe( () => updateDidYouMeanState( didYouMeanController.state ) );
	unsubscribePagerController = pagerController.subscribe( () => updatePagerState( pagerController.state ) );

	// Clear event tracking, for legacy browsers
	const onUnload = () => { 
		window.removeEventListener( 'hashchange', onHashChange );
		unsubscribeManager?.();
		unsubscribeSearchBoxController?.(); 
		unsubscribeResultListController?.();
		unsubscribeQuerySummaryController?.();
		unsubscribeDidYouMeanController?.();
		unsubscribePagerController?.();
		unsubscribeFacetControllers.forEach( ( unsub ) => unsub?.() );
		unsubscribeDateFilterControllers.forEach( ( unsub ) => unsub?.() );
	};

	// Listen to URL change (hash)
	window.addEventListener( 'hashchange', onHashChange );

	// Listen to page unload envent 
	window.addEventListener( 'unload', onUnload );

	// Listen to "Enter" key up event for search suggestions
	if ( searchBoxElement ) {
		searchBoxElement.onkeydown = ( e ) => {
			// Enter
			if ( e.keyCode === 13 && ( activeSuggestion !== 0 && suggestionsElement && !suggestionsElement.hidden ) ) {
				selectSuggestion();
				closeSuggestionsBox();
				e.preventDefault();
			}
			// Escape or Tab
			else if ( e.keyCode === 27 || e.keyCode === 9 ) {
				closeSuggestionsBox();

				if ( e.keyCode === 27 ) {
					e.preventDefault();
				}
			}
			// Arrow key up
			else if ( e.keyCode === 38 ) {
				if ( !( isFirefox && waitForkeyUp ) ) {
					waitForkeyUp = true;
					searchBoxArrowKey( "up" );
					e.preventDefault();
				}
			}
			// Arrow key down
			else if ( e.keyCode === 40 ) {
				if ( !( isFirefox && waitForkeyUp ) ) {
					waitForkeyUp = true;
					searchBoxArrowKey( "down" );
				}
			}
		};
		searchBoxElement.onkeyup = ( e ) => {
			waitForkeyUp = false;
			lastCharKeyUp = e.keyCode;
			// Keys that don't changes the input value
			if ( ( e.key.length !== 1 && e.keyCode !== 46 && e.keyCode !== 8 ) ||                       // Non-printable char except Delete or Backspace
				( e.ctrlKey && e.key !== "x" && e.key !== "X" && e.key !== "v" && e.key !== "V" ) ) {   // Ctrl-key is pressed but not X or V is use 
				return;
			}

			// Any other key
			if ( searchBoxController.state.value !== e.target.value ) {
				searchBoxController.updateText( stripHtml( e.target.value ) );
			}
			if ( e.target.value.length < params.minimumCharsForSuggestions ){
				closeSuggestionsBox();
			}
		};
		searchBoxElement.onfocus = () => {
			lastCharKeyUp = null;
			if ( searchBoxElement.value.length >= params.minimumCharsForSuggestions ) {
				searchBoxController.showSuggestions();
			}
		};
	}

	// Listen to submit event from the search form (advanced searches will instead reload the page with URl parameters to search on load)
	if ( formElement ) {
		formElement.onsubmit = ( e ) => {
			if ( params.isAdvancedSearch ) {
				return; // advanced search forces a post back
			}

			e.preventDefault();

			if ( searchBoxElement && searchBoxElement.value ) {
				// Make sure we have the latest value in the search box state
				if( searchBoxController.state.value !== searchBoxElement.value ) {
					searchBoxController.updateText( stripHtml( searchBoxElement.value ) );
				}
				searchBoxController.submit();
			}
			else {
				resultListElement.textContent = "";
				querySummaryElement.textContent = "";
				didYouMeanElement.textContent = "";
				pagerElement.textContent = "";
				pagerManuallyCleared = true;
				updateFacetLayoutVisibility(true);

				// Show no results message in Query Summary if no query entered
				querySummaryElement.innerHTML = noResultTemplateHTML;
				focusToView();
			}
		};
	}
}

// Show error message in Query Summary
function showQueryErrorMessage() {
	if( !document.getElementById( resultSectionID ) ) {
		baseElement.prepend( resultsSection );
	}
	if ( !querySummaryElement ) {
		return;
	}

	querySummaryElement.textContent = "";
	querySummaryElement.innerHTML = resultErrorTemplateHTML;
	focusToView();
	pagerManuallyCleared = false;
}

function searchBoxArrowKey( direction ) {
	if ( suggestionsElement.hidden ) {
		return;
	}

	if ( direction === "up" ) {
		if ( !activeSuggestion || activeSuggestion <= 1 ) {
			activeSuggestion = searchBoxState.suggestions.length;
		}
		else {
			activeSuggestion -= 1;
		}
	} else {
		if ( !activeSuggestion || activeSuggestion >= searchBoxState.suggestions.length ) {
			activeSuggestion = 1;
		}
		else {
			activeSuggestion += 1;
		}
	}

	updateSuggestionSelection();
}

// Select the active suggestion
function selectSuggestion() {
	let suggestionElement = document.getElementById( 'suggestion-' + activeSuggestion );

	if ( suggestionElement ) {
		const selectedVal = stripHtml( suggestionElement.innerText );

		if ( searchBoxController.state.value !== selectedVal ) {
			searchBoxController.selectSuggestion( selectedVal );
			searchBoxElement.value = selectedVal;
		}
	}
}

// open the suggestions box 
function openSuggestionsBox() {
	suggestionsElement.hidden = false;
	searchBoxElement.setAttribute( 'aria-expanded', 'true' );
}

// close the suggestions box
function closeSuggestionsBox() {
	if( !suggestionsElement ) {
		return;
	}
	suggestionsElement.hidden = true;
	activeSuggestion = 0;
	searchBoxElement.setAttribute( 'aria-expanded', 'false' );
	searchBoxElement.removeAttribute( 'aria-activedescendant' );
}

// Toggle the facet sidebar between expanded and collapsed
function toggleFacetSidebar() {
	if ( !facetSidebarElement || !facetPanelElement ) {
		return;
	}

	const toggleBtn = document.getElementById( 'gc-facet-toggle' );
	const resultsCol = document.getElementById( 'gc-results-col' );
	const isExpanded = toggleBtn?.getAttribute( 'aria-expanded' ) === 'true';

	if ( isExpanded ) {
		facetSidebarElement.hidden = true;
		toggleBtn?.setAttribute( 'aria-expanded', 'false' );
		resultsCol?.classList.remove( 'col-md-8' );
		resultsCol?.classList.add( 'col-md-12' );
	} else {
		facetSidebarElement.hidden = false;
		toggleBtn?.setAttribute( 'aria-expanded', 'true' );
		resultsCol?.classList.remove( 'col-md-12' );
		resultsCol?.classList.add( 'col-md-8' );
	}

	saveFacetUIState();
}

// Update the visual selection of the active suggestion
function updateSuggestionSelection() {
	// clear current suggestion
	let activeSelection = suggestionsElement.getElementsByClassName( 'selected-suggestion' );
	let selectedSuggestionId = 'suggestion-' + activeSuggestion;
	let suggestionElement = document.getElementById( selectedSuggestionId );
	Array.prototype.forEach.call(activeSelection, function( suggestion ) {
		suggestion.classList.remove( 'selected-suggestion' );
		suggestion.setAttribute( 'aria-selected', "false" );
	});

	suggestionElement.classList.add( 'selected-suggestion' );
	suggestionElement.setAttribute( 'aria-selected', "true" );
	searchBoxElement.setAttribute( 'aria-activedescendant', selectedSuggestionId );
}

// Update the search box state after search actions - used for QS
function updateSearchBoxState( newState ) {
	const previousState = searchBoxState;
	searchBoxState = newState;

	// Show query suggestions if a search action was not executed (if enabled)
	if ( updateSearchBoxFromState && searchBoxElement && searchBoxElement.value !== newState.value ) {
		searchBoxElement.value = stripHtml( newState.value );
		updateSearchBoxFromState = false;
		return;
	}

	if ( !suggestionsElement ) {
		return;
	}

	if ( lastCharKeyUp === 13 ) {
		closeSuggestionsBox();
		return;
	}

	// Build suggestions list
	activeSuggestion = 0;
	if ( !searchBoxState.isLoadingSuggestions && previousState?.isLoadingSuggestions ) {
		suggestionsElement.textContent = '';
		searchBoxState.suggestions.forEach( ( suggestion, index ) => {
			const currentIndex = index + 1;
			const suggestionId = "suggestion-" + currentIndex;
			const node = document.createElement( "li" );
			node.setAttribute( "class", "suggestion-item" );
			node.setAttribute( "aria-selected", "false" );
			node.setAttribute( "aria-setsize", searchBoxState.suggestions.length );
			node.setAttribute( "aria-posinset", currentIndex );
			node.role = "option";			
			node.id = suggestionId;
			node.onmouseenter = () => {
				activeSuggestion = index + 1;
				updateSuggestionSelection();
			};
			node.onclick = ( e ) => { 
				searchBoxController.selectSuggestion( e.currentTarget.innerText );
				searchBoxElement.value = stripHtml( e.currentTarget.innerText );
			};
			node.innerHTML = DOMPurify.sanitize( suggestion.highlightedValue );
			suggestionsElement.appendChild( node );
		});

		if ( !searchBoxState.isLoading && searchBoxState.suggestions.length > 0 && searchBoxState.value.length >= params.minimumCharsForSuggestions ) {
			openSuggestionsBox();
		}
		else{
			closeSuggestionsBox();
		}
	}
}

// Update results list
function updateResultListState( newState ) {
	resultListState = newState;

	if ( resultListState.isLoading ) {
		if ( suggestionsElement ) {
			closeSuggestionsBox();
		}
		return;
	}

	// Clear results list
	resultListElement.textContent = "";

	// Rebuild results list
	if( !resultListState.hasError && resultListState.hasResults ) {

		if( !document.getElementById( resultSectionID ) ) {
			baseElement.prepend( resultsSection );
		}

		resultListState.results.forEach( ( result, index ) => {
			const sectionNode = document.createElement( "section" );
			const highlightedExcerpt = HighlightUtils.highlightString( {
				content: result.excerpt,
				highlights: result.excerptHighlights,
				openingDelimiter: '<strong>',
				closingDelimiter: '</strong>',
			} );

			const resultDate = new Date( result.raw.date );
			let author = "";

			if( result.raw.author ) {
				if( Array.isArray( result.raw.author ) ) {
					author = stripHtml( result.raw.author.join( ';' ) );
				}
				else {
					author = stripHtml( result.raw.author );
				}

				author = author.replaceAll( ';' , '</li> <li>' );
			}

			let breadcrumb = "";
			let disp_declared_type = "";
			let description = "";
			let printableUri = encodeURI( result.printableUri );
			let clickUri = encodeURI( result.clickUri );
			let title = stripHtml( result.title );

			printableUri = printableUri.replaceAll( '&' , '&amp;' );
			printableUri = printableUri.replaceAll( '%252F' , '/' ); // handle slash	
			printableUri = printableUri.replaceAll( "%252C" , "," ); // handle comma
			clickUri = clickUri.replaceAll( "%252C" , "%2C" );  // handle comma
			clickUri = clickUri.replaceAll( "%252F" , "%2F" );  // handle slash

			if ( result.raw.hostname && result.raw.displaynavlabel ) {
				const splittedNavLabel = ( Array.isArray( result.raw.displaynavlabel ) ? result.raw.displaynavlabel[0] : result.raw.displaynavlabel).split( '>' );
				const hostname = stripHtml( result.raw.hostname );
				const lastBreadcrumb = stripHtml( splittedNavLabel[splittedNavLabel.length-1] );

				// If the hostname is already part of the breadcrumb, just show the hostname
				breadcrumb = '<ol class="location">';
				if ( lastBreadcrumb.indexOf(hostname) > -1 ){
					breadcrumb += '<li>' + hostname + '</li>';
				} else {
					breadcrumb += '<li>' + hostname + '&nbsp;</li><li>' + lastBreadcrumb + '</li>';
				}
				breadcrumb += '</ol>';
			} else {
				breadcrumb = '<p class="location"><cite><a href="' + clickUri + '">' + printableUri + '</a></cite></p>';
			}

			if ( result.raw.disp_declared_type  ) {
				disp_declared_type = stripHtml( result.raw.disp_declared_type );
			}
			if ( result.raw.description ) {
				description = stripHtml( result.raw.description );
			}

			// Searh result template mappings
			sectionNode.innerHTML = resultTemplateHTML
				.replace( '%[index]', index + 1 )
				.replace( 'https://www.canada.ca', filterProtocol( clickUri ) ) // invalid href are stripped
				.replace( '%[result.clickUri]', filterProtocol( clickUri ) )
				.replace( '%[result.title]', title )
				.replace( '%[result.raw.author]', author )
				.replace( '%[result.breadcrumb]', breadcrumb )
				.replace( '%[result.printableUri]', printableUri )
				.replace( '%[result.raw.disp_declared_type]', disp_declared_type )
				.replace( '%[result.raw.description]', description )
				.replaceAll( '%[short-date-en]', isEmptyDate(resultDate) ? '' : getShortDateFormat( resultDate ) )
				.replaceAll( '%[short-date-fr]', isEmptyDate(resultDate) ? '' : getShortDateFormat( resultDate ) )
				.replace( '%[long-date-en]', isEmptyDate(resultDate) ? '' : getLongDateFormat( resultDate, 'en' ) )
				.replace( '%[long-date-fr]', isEmptyDate(resultDate) ? '' : getLongDateFormat( resultDate, 'fr' ) )
				.replace( '%[highlightedExcerpt]', highlightedExcerpt );

			const interactiveResult = buildInteractiveResult(
				headlessEngine, {
					options: { result },
				}
			);

			let resultLink = sectionNode.querySelector( ".result-link" );

			resultLink.onclick = () => { interactiveResult.select(); };
			resultLink.oncontextmenu = () => { interactiveResult.select(); };
			resultLink.onmousedown = () => { interactiveResult.select(); };
			resultLink.onmouseup = () => { interactiveResult.select(); };
			resultLink.ontouchstart = () => { interactiveResult.beginDelayedSelect(); };
			resultLink.ontouchend = () => { interactiveResult.cancelPendingSelect(); };

			resultListElement.appendChild( sectionNode );
		} );
	}
}

// Update heading that has number of results displayed (Query Summary)
function updateQuerySummaryState( newState ) {
	querySummaryState = newState;

	if ( resultListState.firstSearchExecuted && !querySummaryState.isLoading && !querySummaryState.hasError ) {

		if ( !querySummaryElement ) {
			return;
		}
		if( !document.getElementById( resultSectionID ) ) {
			baseElement.prepend( resultsSection );
		}
		querySummaryElement.textContent = "";
		if ( querySummaryState.total > 0 ) {
			// Manually ask pager to redraw since even is not sent when manually cleared
			if ( pagerManuallyCleared ) {
				updatePagerState( pagerState );
			}

			let numberOfResults = querySummaryState.total.toLocaleString( params.lang );

			// Generate the text content
			const querySummaryHTML = ( ( querySummaryState.query !== "" && !params.isAdvancedSearch ) ? querySummaryTemplateHTML : noQuerySummaryTemplateHTML )
				.replace( '%[numberOfResults]', numberOfResults )
				.replace( '%[query]', '<span class="sr-query"></span>' )
				.replace( '%[queryDurationInSeconds]', querySummaryState.durationInSeconds.toLocaleString( params.lang ) );

			querySummaryElement.innerHTML = querySummaryHTML;

			const queryElement = querySummaryElement.querySelector( '.sr-query' );
			if ( queryElement ){
				queryElement.textContent = querySummaryState.query;
			}
		} else {
			querySummaryElement.innerHTML = noResultTemplateHTML;
		}
		focusToView();
		pagerManuallyCleared = false;
	}
	else if ( querySummaryState.hasError ) {
		showQueryErrorMessage();
	}
}

// update "Did you mean" recommendation
function updateDidYouMeanState( newState ) {
	didYouMeanState = newState;

	if ( !didYouMeanElement )
		return;

	if ( resultListState.firstSearchExecuted ) {
		didYouMeanElement.textContent = "";
		if ( didYouMeanState.hasQueryCorrection ) {
			didYouMeanElement.innerHTML = didYouMeanTemplateHTML.replace( 
				'%[correctedQuery]', 
				stripHtml( didYouMeanState.queryCorrection.correctedQuery ) );
			const buttonNode = didYouMeanElement.querySelector( 'button' );
			buttonNode.onclick = ( e ) => { 
				updateSearchBoxFromState = true;
				didYouMeanController.applyCorrection();
				e.preventDefault();
			};
		}
	}
}

// Update Pagination section
function updatePagerState( newState ) {
	pagerState = newState;
	if ( pagerState.maxPage === 0 ) {
		pagerElement.textContent = "";
		return;
	}
	else if ( pagerElement.textContent === "" ) {
		pagerElement.innerHTML = pagerContainerTemplateHTML;
	}

	let prevLiNode = document.createElement( "li" ),
		nextLiNode = document.createElement( "li" ),
		pagerComponentElement = pagerElement.querySelector( "#pager" );

	pagerComponentElement.textContent = "";
	prevLiNode.innerHTML = previousPageTemplateHTML;
	nextLiNode.innerHTML = nextPageTemplateHTML;

	if ( !pagerState.hasPreviousPage ) {
		prevLiNode.classList.add( "disabled" );
	}

	if ( !pagerState.hasNextPage ) {
		nextLiNode.classList.add( "disabled" );
	}

	prevLiNode.querySelector( "button" ).onclick = () => { 
		pagerController.previousPage();
		
		if ( params.isAdvancedSearch ) {
			updatePagerUrlParam( pagerState.currentPage );
		}
	};

	nextLiNode.querySelector( "button" ).onclick = () => { 
		pagerController.nextPage(); 
		
		if ( params.isAdvancedSearch ) {
			updatePagerUrlParam( pagerState.currentPage );
		}
	};

	pagerComponentElement.appendChild( prevLiNode );

	pagerState.currentPages.forEach( ( page ) => {
		const liNode = document.createElement( "li" );
		const pageNo = page;

		liNode.innerHTML = pageTemplateHTML.replaceAll( '%[page]', stripHtml( pageNo ) );

		if ( pagerState.currentPage - 1 > page || page > pagerState.currentPage + 1 ) {
			liNode.classList.add( 'hidden-xs', 'hidden-sm' );
			if ( pagerState.currentPage - 2 > page || page > pagerState.currentPage + 2 ) {
				liNode.classList.add( 'hidden-md' );
			}
		}

		const buttonNode = liNode.querySelector( 'button' );

		if ( page === pagerState.currentPage ) {
			liNode.classList.add( "active" );
			buttonNode.setAttribute( "aria-current", "page" );
		}

		buttonNode.onclick = () => {
			pagerController.selectPage( pageNo );
			
			if ( params.isAdvancedSearch ) {
				updatePagerUrlParam( pagerState.currentPage );
			}
		};

		pagerComponentElement.appendChild( liNode );
	} );

	pagerComponentElement.appendChild( nextLiNode );
}

// Rebuild a single facet's DOM inside the facet panel
function announceFacetChange( message ) {
	const liveEl = document.getElementById( 'gc-facet-live' );
	if ( !liveEl ) { return; }
	liveEl.textContent = '';
	// Brief timeout ensures screen readers detect the content change
	setTimeout( () => { liveEl.textContent = message; }, 50 );
}

function renderFacetSummary( label, hasActive, onClear ) {
	const summaryEl = document.createElement( 'summary' );
	summaryEl.id = 'gc-facet-label-' + label.toLowerCase().replace( /\s+/g, '-' );
	summaryEl.textContent = label;
	if ( hasActive ) {
		summaryEl.insertAdjacentHTML( 'beforeend', `<button type="button" class="btn btn-link btn-sm pull-right">${ lang === 'fr' ? 'Effacer le filtre' : 'Clear filter' }</button>` );
		summaryEl.querySelector( 'button' ).onclick = ( e ) => { e.stopPropagation(); onClear(); };
	}
	return summaryEl;
}

// Builds a single facet value <li>.
function renderFacetItem( label, count, isSelected, onSelect ) {
	const liEl = document.createElement( 'li' );
	liEl.className = 'checkbox';

	const labelEl = document.createElement( 'label' );

	const checkboxEl = document.createElement( 'input' );
	checkboxEl.type = 'checkbox';
	checkboxEl.checked = isSelected;
	checkboxEl.onchange = () => { onSelect(); };

	const countEl = document.createElement( 'span' );
	countEl.className = 'gc-facet-count';
	countEl.innerHTML = ' (' + count.toLocaleString( lang ) + '<span class="wb-inv"> ' + ( lang === 'fr' ? 'résultats' : 'results' ) + '</span>)';

	labelEl.appendChild( checkboxEl );
	labelEl.appendChild( document.createTextNode( label ) );
	labelEl.appendChild( countEl );
	liEl.appendChild( labelEl );

	return liEl;
}

function updateFacetState( index, newState ) {
	facetStates[ index ] = newState;

	if ( !facetPanelElement || newState.isLoading ) {
		return;
	}

	const config = facetNormalizedConfigs[ index ];
	const facetEl = document.getElementById( 'gc-facet-' + config.facetId );

	if ( !facetEl ) {
		return;
	}

	facetEl.hidden = newState.values.length === 0;
	if ( facetEl.hidden ) {
		updateFacetLayoutVisibility();
		return;
	}

	// Preserve search focus and open/closed state across re-renders
	const searchInputId = 'gc-facet-search-' + index;
	const wasSearchFocused = document.activeElement?.id === searchInputId;
	const preservedSearchValue = document.getElementById( searchInputId )?.value ?? '';
	const wasOpen = facetEl.open;
	facetEl.textContent = '';
	facetEl.open = wasOpen;

	facetEl.appendChild( renderFacetSummary( config.label, newState.hasActiveValues, () => facetControllers[ index ].deselectAll() ) );

	// Facet search input (only if the controller exposes facetSearch)
	// facetSearch methods live on the sub-controller; state is nested in newState.facetSearch
	const facetSearch = facetControllers[ index ].facetSearch;
	const facetSearchState = newState.facetSearch;
	const isSearching = ( facetSearchState?.query?.length ?? 0 ) > 0;

	if ( config.facetSearch && facetSearchState ) {
		const searchInput = document.createElement( 'input' );
		searchInput.type = 'search';
		searchInput.id = searchInputId;
		searchInput.className = 'form-control input-sm mrgn-tp-md mrgn-bttm-md gc-facet-search';
		searchInput.placeholder = lang === 'fr' ? 'Filtrer...' : 'Filter...';
		searchInput.setAttribute( 'aria-label', ( lang === 'fr' ? 'Filtrer ' : 'Filter ' ) + config.label );
		searchInput.value = preservedSearchValue;
		searchInput.oninput = () => {
			clearTimeout( facetSearchTimers[ index ] );
			const query = searchInput.value;
			if ( query.length >= 2 ) {
				facetSearchTimers[ index ] = setTimeout( () => {
					facetSearch.updateText( query );
					facetSearch.search();
				}, 300 );
			} else {
				facetSearch.updateText( '' );
			}
		};
		facetEl.appendChild( searchInput );
		if ( wasSearchFocused ) { searchInput.focus(); }
	}

	// Values list — show facet search results when a query is active, otherwise regular values
	const listId = 'gc-facet-values-' + index;
	const listEl = document.createElement( 'ul' );
	listEl.id = listId;
	listEl.className = 'list-unstyled gc-facet-values';
	listEl.setAttribute( 'role', 'group' );
	listEl.setAttribute( 'aria-labelledby', 'gc-facet-label-' + config.label.toLowerCase().replace( /\s+/g, '-' ) );

	if ( isSearching ) {
		facetSearchState.values.forEach( ( result ) => {
			listEl.appendChild( renderFacetItem( stripHtml( result.displayValue ), result.count, false, () => facetSearch.select( result ) ) );
		} );
	} else {
		newState.values.forEach( ( value ) => {
			listEl.appendChild( renderFacetItem( stripHtml( value.value ), value.numberOfResults, value.state === 'selected', () => facetControllers[ index ].toggleSelect( value ) ) );
		} );
	}

	facetEl.appendChild( listEl );

	// Show more / show less — hidden while searching (search has its own pagination)
	const isFr = lang === 'fr';
	facetEl.insertAdjacentHTML( 'beforeend',
		`<button type="button" class="btn btn-link small gc-facet-show-more pl-0" aria-controls="${ listId }"${ isSearching || !newState.canShowMoreValues ? ' hidden' : '' }>${ isFr ? 'Afficher davantage' : 'Show more' } <span class="glyphicon glyphicon-chevron-down small" aria-hidden="true"></span></button>
		<button type="button" class="btn btn-link small gc-facet-show-less pl-0" aria-controls="${ listId }"${ isSearching || !newState.canShowLessValues ? ' hidden' : '' }>${ isFr ? 'Afficher moins' : 'Show less' } <span class="glyphicon glyphicon-chevron-up small" aria-hidden="true"></span></button>` );
	facetEl.querySelector( '.gc-facet-show-more' ).onclick = () => { facetControllers[ index ].showMoreValues(); };
	facetEl.querySelector( '.gc-facet-show-less' ).onclick = () => { facetControllers[ index ].showLessValues(); };

	if ( newState.hasActiveValues ) {
		const activeLabels = newState.values.filter( ( v ) => v.state === 'selected' ).map( ( v ) => v.value ).join( ', ' );
		announceFacetChange( isFr ? `Filtre actif\u00a0: ${activeLabels}` : `Filter active: ${activeLabels}` );
	}

	updateFacetLayoutVisibility();
	updateClearAllVisibility();
}

function updateFacetLayoutVisibility(forceHidden = false) {
	const toggleBtn = document.getElementById( 'gc-facet-toggle' );
	const resultsCol = document.getElementById( 'gc-results-col' );
	if ( !toggleBtn || !facetSidebarElement || !resultsCol ) { return; }

	const hasFacetContent = facetStates.some( ( s ) => s?.values?.length > 0 );

	if ( !hasFacetContent || forceHidden ) {
		toggleBtn.hidden = true;
		facetSidebarElement.hidden = true;
		resultsCol.classList.remove( 'col-md-8' );
		resultsCol.classList.add( 'col-md-12' );
	} else {
		toggleBtn.hidden = false;
		const isExpanded = toggleBtn.getAttribute( 'aria-expanded' ) === 'true';
		facetSidebarElement.hidden = !isExpanded;
		if ( isExpanded ) {
			resultsCol.classList.remove( 'col-md-12' );
			resultsCol.classList.add( 'col-md-8' );
		}
	}
}

function updateClearAllVisibility() {
	const clearAllContainer = document.getElementById( 'gc-facet-clear-all-container' );
	if ( clearAllContainer ) {
		clearAllContainer.hidden = !facetStates.some( ( s ) => s?.hasActiveValues ) && !dateFilterStates.some( ( s ) => s?.range );
	}
}

// Rebuild the DOM for a date range facet (predefined periods + custom date pickers)
function updateDateFacetState( index, dateFacetState, dateFilterState ) {
	facetStates[ index ] = dateFacetState;
	dateFilterStates[ index ] = dateFilterState;

	if ( !facetPanelElement || dateFacetState.isLoading ) {
		return;
	}

	const config = facetNormalizedConfigs[ index ];
	const facetEl = document.getElementById( 'gc-facet-' + config.facetId );
	if ( !facetEl ) {
		return;
	}

	facetEl.hidden = dateFacetState.values.length === 0 || ( !config.withDatePicker && !config.withDateRanges );
	if ( facetEl.hidden ) {
		updateFacetLayoutVisibility();
		return;
	}

	const isFr = lang === 'fr';
	const todayStr = new Date().toISOString().slice( 0, 10 );
	const wasOpen = facetEl.open;
	facetEl.textContent = '';
	facetEl.open = wasOpen;

	facetEl.appendChild( renderFacetSummary( config.label, dateFacetState.hasActiveValues || dateFilterState.range, () => {
		facetControllers[ index ].deselectAll();
		dateFilterControllers[ index ].clear();
	} ) );

	// --- Custom date pickers (above the list) ---
	if ( config.withDatePicker ) {
		const startId = 'gc-facet-date-start-' + index;
		const endId = 'gc-facet-date-end-' + index;

		const datePickerContainer = document.createElement( 'div' );
		datePickerContainer.className = 'gc-date-pickers';

		datePickerContainer.insertAdjacentHTML( 'beforeend',
			`<div class="form-group mrgn-tp-sm">
				<label for="${startId}">${isFr ? 'Date de début' : 'Start date'}<span class="datepicker-format"> (<abbr title="${isFr ? 'Quatre chiffres pour l\'année, tiret, deux chiffres pour le mois, tiret, deux chiffres pour le jour' : 'Four digits year, dash, two digits month, dash, two digits day'}">YYYY-MM-DD</abbr>)</span></label>
				<input class="form-control" type="date" id="${startId}" name="${startId}" max="${todayStr}" />
			</div>
			<div class="form-group">
				<label for="${endId}">${isFr ? 'Date de fin' : 'End date'}<span class="datepicker-format"> (<abbr title="${isFr ? 'Quatre chiffres pour l\'année, tiret, deux chiffres pour le mois, tiret, deux chiffres pour le jour' : 'Four digits year, dash, two digits month, dash, two digits day'}">YYYY-MM-DD</abbr>)</span></label>
				<input class="form-control" type="date" id="${endId}" name="${endId}" max="${todayStr}" />
			</div>
			<button type="button" class="btn btn-default btn-sm mrgn-rght-sm mrgn-bttm-md gc-date-apply">${isFr ? 'Appliquer' : 'Apply'}</button>
			<button type="button" class="btn btn-link btn-sm mrgn-bttm-md gc-date-clear"${dateFilterState.range ? '' : ' hidden'}>${isFr ? 'Effacer' : 'Clear'}</button>`
		);

		const startInput = datePickerContainer.querySelector( '#' + startId );
		const endInput = datePickerContainer.querySelector( '#' + endId );

		startInput.onchange = () => { if ( startInput.value ) { endInput.min = startInput.value; } };
		endInput.onchange = () => { if ( endInput.value ) { startInput.max = endInput.value; } };

		// Pre-populate inputs if a custom filter is already active, skipping sentinel values
		if ( dateFilterState.range ) {
			const rangeStart = coveoDateToInputDate( dateFilterState.range.start );
			const rangeEnd = coveoDateToInputDate( dateFilterState.range.end );
			if ( rangeStart !== '1970-01-01' ) {
				startInput.value = rangeStart;
			}
			if ( rangeEnd !== todayStr ) {
				endInput.value = rangeEnd;
			}
			if ( startInput.value ) { endInput.min = startInput.value; }
			if ( endInput.value ) { startInput.max = endInput.value; }
		}

		datePickerContainer.querySelector( '.gc-date-apply' ).onclick = () => {
			let startVal = startInput.value;
			let endVal = endInput.value;
			if ( startVal || endVal ) {
				// Swap if end is before start
				if ( startVal && endVal && endVal < startVal ) {
					[ startVal, endVal ] = [ endVal, startVal ];
					startInput.value = startVal;
					endInput.value = endVal;
				}
				// Clear predefined range selection before applying custom filter
				facetControllers[ index ].deselectAll();
				dateFilterControllers[ index ].setRange( {
					start: inputDateToCoveoDate( startVal || '1970-01-01', false ),
					end: inputDateToCoveoDate( endVal || todayStr, true ),
				} );
			}
		};

		datePickerContainer.querySelector( '.gc-date-clear' ).onclick = () => {
			startInput.value = '';
			endInput.value = '';
			startInput.max = todayStr;
			endInput.min = '';
			dateFilterControllers[ index ].clear();
		};

		facetEl.appendChild( datePickerContainer );
	} // end withDatePicker

	// --- Predefined date range list ---
	if ( config.withDateRanges ) {
		const listEl = document.createElement( 'ul' );
		listEl.className = 'list-unstyled gc-facet-values mrgn-tp-sm';

		[ ...dateFacetState.values ].reverse().forEach( ( value, valueIndex ) => {
			const period = getDateFacetFields()[ valueIndex ];
			if ( !period ) { return; }
			const periodLabel = isFr ? period.fr : period.en;
			const isSelected = value.state === 'selected';
			if ( config.withDatePicker && isSelected ) {
				const rangeStart = resolveRangeEndpointToInputDate( period.range.start );
				const rangeEnd = resolveRangeEndpointToInputDate( period.range.end );
				const startEl = document.getElementById( 'gc-facet-date-start-' + index );
				const endEl = document.getElementById( 'gc-facet-date-end-' + index );
				if ( startEl ) { startEl.value = rangeStart !== '1970-01-01' ? rangeStart : ''; }
				if ( endEl ) { endEl.value = rangeEnd !== todayStr ? rangeEnd : ''; }
			}
			listEl.appendChild( renderFacetItem( periodLabel, value.numberOfResults, isSelected, () => {
				// Clear custom date filter and any other selected range before selecting
				dateFilterControllers[ index ].clear();
				facetControllers[ index ].deselectAll();
				facetControllers[ index ].toggleSelect( value );
			} ) );
		} );

		facetEl.appendChild( listEl );
	}

	if ( dateFacetState.hasActiveValues || dateFilterState.range ) {
		const isFrAnnounce = lang === 'fr';
		announceFacetChange( isFrAnnounce ? `Filtre de date actif\u00a0: ${config.label}` : `Date filter active: ${config.label}` );
	}

	updateFacetLayoutVisibility();
	updateClearAllVisibility();
}

// Update the URL parameter for pagination in advanced search mode
function updatePagerUrlParam( currentPage ) {
	const resultsPerPage = buildResultsPerPage(headlessEngine);
	const { numberOfResults } = resultsPerPage.state;
	const urlParams = new URLSearchParams( winLoc.search );
	const paramName = 'firstResult';
	const pageNum = ( currentPage - 1 ) * numberOfResults;

	// Set the value of the parameter. If it doesn't exist, it will be added.
	urlParams.set( paramName, pageNum );

	const newSearch = urlParams.toString();
	window.history.replaceState( {}, '', `${winPath}?${newSearch}${winLoc.hash}` );
}

// Run Search UI
initSearchUI();
