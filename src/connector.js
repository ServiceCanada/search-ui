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
	buildNotifyTrigger,
	buildFacet,
	buildDateFacet,
	buildDateFilter,
	buildDateRange,
	buildBreadcrumbManager,
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
let notifyTriggerController;
let urlManager;
let unsubscribeManager;
let unsubscribeSearchBoxController;
let unsubscribeResultListController;
let unsubscribeQuerySummaryController;
let unsubscribeDidYouMeanController;
let unsubscribePagerController;
let unsubscribeNotifyTriggerController;
let breadcrumbManagerController;
let unsubscribeBreadcrumbManagerController;

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
let notificationState;
let didYouMeanState;
let pagerState;
let lastCharKeyUp;
let activeSuggestion = 0;
let pagerManuallyCleared = false;

const localizedStrings = {
	en: new Map(),
	fr: new Map()
};
localizedStrings.en.set( "facets.showMore", "Show more" );
localizedStrings.en.set( "breadbox.filters", "Filters:" );
localizedStrings.fr.set( "breadbox.filters", "Filtres\u00a0:" );
localizedStrings.en.set( "breadbox.clear", "Clear" );
localizedStrings.fr.set( "breadbox.clear", "Effacer" );
localizedStrings.en.set( "date-ranges.past-1-day|now", "Past day" );
localizedStrings.fr.set( "date-ranges.past-1-day|now", "Derni\u00e8re journ\u00e9e" );
localizedStrings.en.set( "date-ranges.past-1-week|now", "Past week" );
localizedStrings.fr.set( "date-ranges.past-1-week|now", "Derni\u00e8re semaine" );
localizedStrings.en.set( "date-ranges.past-1-month|now", "Past month" );
localizedStrings.fr.set( "date-ranges.past-1-month|now", "Dernier mois" );
localizedStrings.en.set( "date-ranges.past-1-year|now", "Past year" );
localizedStrings.fr.set( "date-ranges.past-1-year|now", "Derni\u00e8re ann\u00e9e" );
localizedStrings.en.set( "date-ranges.past-100-year|past-1-year", "Older" );
localizedStrings.fr.set( "date-ranges.past-100-year|past-1-year", "Plus ancien" );
localizedStrings.en.set( "date-ranges.before", "Before {{date}}" );
localizedStrings.fr.set( "date-ranges.before", "Avant le {{date}}" );
localizedStrings.en.set( "date-ranges.after", "After {{date}}" );
localizedStrings.fr.set( "date-ranges.after", "Apr\u00e8s le {{date}}" );

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
let notificationTriggerElement = document.querySelector( '#notification-trigger' );
let pagerElement = document.querySelector( '#pager' );
let suggestionsElement = document.querySelector( '#suggestions' );
let didYouMeanElement = document.querySelector( '#did-you-mean' );
let breadcrumbElement = document.querySelector( '#breadcrumb-manager' );
let facetSidebarElement = document.querySelector( '#gc-facet-sidebar' );
let facetPanelElement = document.querySelector( '#gc-facet-panel' );

// UI templates
let resultTemplateHTML = document.getElementById( 'sr-single' )?.innerHTML;
let noResultTemplateHTML = document.getElementById( 'sr-nores' )?.innerHTML;
let resultErrorTemplateHTML = document.getElementById( 'sr-error' )?.innerHTML;
let notificationTriggerTemplateHTML = document.getElementById( 'sr-notification-trigger' )?.innerHTML;
let querySummaryTemplateHTML = document.getElementById( 'sr-query-summary' )?.innerHTML;
let didYouMeanTemplateHTML = document.getElementById( 'sr-did-you-mean' )?.innerHTML;
let noQuerySummaryTemplateHTML = document.getElementById( 'sr-noquery-summary' )?.innerHTML;
let previousPageTemplateHTML = document.getElementById( 'sr-pager-previous' )?.innerHTML;
let pageTemplateHTML = document.getElementById( 'sr-pager-page' )?.innerHTML;
let nextPageTemplateHTML = document.getElementById( 'sr-pager-next' )?.innerHTML;
let pagerContainerTemplateHTML = document.getElementById( 'sr-pager-container' )?.innerHTML;
let qsA11yHintHTML = document.getElementById( 'sr-qs-hint' )?.innerHTML;
let facetSummaryTemplateHTML = document.getElementById( 'sr-facet-summary' )?.innerHTML;
let facetClearFilterTemplateHTML = document.getElementById( 'sr-facet-clear-filter' )?.innerHTML;
let facetItemTemplateHTML = document.getElementById( 'sr-facet-item' )?.innerHTML;
let facetSearchInputTemplateHTML = document.getElementById( 'sr-facet-search-input' )?.innerHTML;
let facetShowMoreTemplateHTML = document.getElementById( 'sr-facet-show-more' )?.innerHTML;
let facetShowLessTemplateHTML = document.getElementById( 'sr-facet-show-less' )?.innerHTML;
let facetDatePickerTemplateHTML = document.getElementById( 'sr-facet-date-picker' )?.innerHTML;
let facetToggleTemplateHTML = document.getElementById( 'sr-facet-toggle' )?.innerHTML;
let facetPanelItemTemplateHTML = document.getElementById( 'sr-facet-panel-item' )?.innerHTML;
let facetLayoutTemplateHTML = document.getElementById( 'sr-facet-layout' )?.innerHTML;
let breadcrumbItemTemplateHTML = document.getElementById( 'sr-breadcrumb-item' )?.innerHTML;
let breadcrumbListTemplateHTML = document.getElementById( 'sr-breadcrumb-list' )?.innerHTML;

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

	if ( !notificationTriggerTemplateHTML ) {
		notificationTriggerTemplateHTML = 
			`<section class="alert alert-info">%[notification]</section>`;
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

	if ( !facetSummaryTemplateHTML ) {
		facetSummaryTemplateHTML =
			`<summary id="gc-facet-label-%[labelId]">%[label]%[clearBtn]</summary>`;
	}

	if ( !facetClearFilterTemplateHTML ) {
		if ( lang === 'fr' ) {
			facetClearFilterTemplateHTML =
				`<button type="button" class="btn btn-link btn-sm pull-right gc-facet-clear">Effacer le filtre</button>`;
		} else {
			facetClearFilterTemplateHTML =
				`<button type="button" class="btn btn-link btn-sm pull-right gc-facet-clear">Clear filter</button>`;
		}
	}

	if ( !facetItemTemplateHTML ) {
		if ( lang === 'fr' ) {
			facetItemTemplateHTML =
				`<li class="checkbox"><label><input type="checkbox" %[checked]>%[label]<span class="gc-facet-count"> (%[count]<span class="wb-inv"> résultats</span>)</span></label></li>`;
		} else {
			facetItemTemplateHTML =
				`<li class="checkbox"><label><input type="checkbox" %[checked]>%[label]<span class="gc-facet-count"> (%[count]<span class="wb-inv"> results</span>)</span></label></li>`;
		}
	}

	if ( !facetSearchInputTemplateHTML ) {
		if ( lang === 'fr' ) {
			facetSearchInputTemplateHTML =
				`<input type="search" id="%[id]" class="form-control input-sm mrgn-tp-md mrgn-bttm-md gc-facet-search" placeholder="Filtrer..." aria-label="Filtrer %[facetLabel]" value="%[value]" />`;
		} else {
			facetSearchInputTemplateHTML =
				`<input type="search" id="%[id]" class="form-control input-sm mrgn-tp-md mrgn-bttm-md gc-facet-search" placeholder="Filter..." aria-label="Filter %[facetLabel]" value="%[value]" />`;
		}
	}

	if ( !facetShowMoreTemplateHTML ) {
		if ( lang === 'fr' ) {
			facetShowMoreTemplateHTML =
				`<button type="button" class="btn btn-link small gc-facet-show-more pl-0" aria-controls="%[listId]">Afficher davantage <span class="glyphicon glyphicon-chevron-down small" aria-hidden="true"></span></button>`;
		} else {
			facetShowMoreTemplateHTML =
				`<button type="button" class="btn btn-link small gc-facet-show-more pl-0" aria-controls="%[listId]">Show more <span class="glyphicon glyphicon-chevron-down small" aria-hidden="true"></span></button>`;
		}
	}

	if ( !facetShowLessTemplateHTML ) {
		if ( lang === 'fr' ) {
			facetShowLessTemplateHTML =
				`<button type="button" class="btn btn-link small gc-facet-show-less pl-0" aria-controls="%[listId]">Afficher moins <span class="glyphicon glyphicon-chevron-up small" aria-hidden="true"></span></button>`;
		} else {
			facetShowLessTemplateHTML =
				`<button type="button" class="btn btn-link small gc-facet-show-less pl-0" aria-controls="%[listId]">Show less <span class="glyphicon glyphicon-chevron-up small" aria-hidden="true"></span></button>`;
		}
	}

	if ( !facetDatePickerTemplateHTML ) {
		if ( lang === 'fr' ) {
			facetDatePickerTemplateHTML =
				`<div class="gc-date-pickers">
					<div class="form-group mrgn-tp-sm">
						<label for="%[startId]">Date de début<span class="datepicker-format"> (<abbr title="Quatre chiffres pour l'année, tiret, deux chiffres pour le mois, tiret, deux chiffres pour le jour">YYYY-MM-DD</abbr>)</span></label>
						<input class="form-control" type="date" id="%[startId]" name="%[startId]" max="%[today]" />
					</div>
					<div class="form-group">
						<label for="%[endId]">Date de fin<span class="datepicker-format"> (<abbr title="Quatre chiffres pour l'année, tiret, deux chiffres pour le mois, tiret, deux chiffres pour le jour">YYYY-MM-DD</abbr>)</span></label>
						<input class="form-control" type="date" id="%[endId]" name="%[endId]" max="%[today]" />
					</div>
					<button type="button" class="btn btn-default btn-sm mrgn-rght-sm mrgn-bttm-md gc-date-apply">Appliquer</button>
					<button type="button" class="btn btn-link btn-sm mrgn-bttm-md gc-date-clear">Effacer</button>
				</div>`;
		} else {
			facetDatePickerTemplateHTML =
				`<div class="gc-date-pickers">
					<div class="form-group mrgn-tp-sm">
						<label for="%[startId]">Start date<span class="datepicker-format"> (<abbr title="Four digits year, dash, two digits month, dash, two digits day">YYYY-MM-DD</abbr>)</span></label>
						<input class="form-control" type="date" id="%[startId]" name="%[startId]" max="%[today]" />
					</div>
					<div class="form-group">
						<label for="%[endId]">End date<span class="datepicker-format"> (<abbr title="Four digits year, dash, two digits month, dash, two digits day">YYYY-MM-DD</abbr>)</span></label>
						<input class="form-control" type="date" id="%[endId]" name="%[endId]" max="%[today]" />
					</div>
					<button type="button" class="btn btn-default btn-sm mrgn-rght-sm mrgn-bttm-md gc-date-apply">Apply</button>
					<button type="button" class="btn btn-link btn-sm mrgn-bttm-md gc-date-clear">Clear</button>
				</div>`;
		}
	}

	if ( !facetToggleTemplateHTML ) {
		if ( lang === 'fr' ) {
			facetToggleTemplateHTML =
				`<button type="button" id="gc-facet-toggle" class="btn btn-default gc-facet-toggle" aria-expanded="true" aria-controls="gc-facet-panel">
					<span class="glyphicon glyphicon-chevron-left" aria-hidden="true"></span> Filtres
				</button>`;
		} else {
			facetToggleTemplateHTML =
				`<button type="button" id="gc-facet-toggle" class="btn btn-default gc-facet-toggle" aria-expanded="true" aria-controls="gc-facet-panel">
					<span class="glyphicon glyphicon-chevron-left" aria-hidden="true"></span> Filters
				</button>`;
		}
	}

	if ( !facetPanelItemTemplateHTML ) {
		facetPanelItemTemplateHTML =
			`<details id="gc-facet-%[facetId]" class="gc-facet" open></details>`;
	}

	if ( !facetLayoutTemplateHTML ) {
		if ( lang === 'fr' ) {
			facetLayoutTemplateHTML =
				`<div class="row" id="gc-search-facet-layout">
					<div id="gc-facet-sidebar" class="col-md-4 gc-facet-sidebar mrgn-tp-lg">
						<section id="gc-facet-panel">
							<h2 class="wb-inv">Filtres</h2>
							<p id="gc-facet-live" class="wb-inv" aria-live="polite" aria-atomic="true"></p>
							<div id="gc-facet-clear-all-container" class="text-right" hidden>
								<button type="button" class="btn btn-link">Effacer tout</button>
							</div>
							%[facetItems]
						</section>
					</div>
					<div id="gc-results-col" class="col-md-8 gc-results-col"></div>
				</div>`;
		} else {
			facetLayoutTemplateHTML =
				`<div class="row" id="gc-search-facet-layout">
					<div id="gc-facet-sidebar" class="col-md-4 gc-facet-sidebar mrgn-tp-lg">
						<section id="gc-facet-panel">
							<h2 class="wb-inv">Filters</h2>
							<p id="gc-facet-live" class="wb-inv" aria-live="polite" aria-atomic="true"></p>
							<div id="gc-facet-clear-all-container" class="text-right" hidden>
								<button type="button" class="btn btn-link">Clear all</button>
							</div>
							%[facetItems]
						</section>
					</div>
					<div id="gc-results-col" class="col-md-8 gc-results-col"></div>
				</div>`;
		}
	}

	if ( !breadcrumbItemTemplateHTML ) {
		breadcrumbItemTemplateHTML =
			`<li class="mb-2"><button type="button" class="btn btn-default" aria-label="%[ariaLabel]"><span aria-hidden="true">%[label] <span class="glyphicon glyphicon-remove" aria-hidden="true"></span></span></button></li>`;
	}

	if ( !breadcrumbListTemplateHTML ) {
		breadcrumbListTemplateHTML =
			`<ul class="list-inline"><li class="bold-content mb-2">%[filtersLabel]</li>%[items]<li class="mb-2"><button type="button" class="btn btn-link">%[clearLabel]</button></li></ul>`;
	}

	// auto-create results section (facet layout provides it when configured; otherwise create standalone)
	if ( !resultsSection ) {
		resultsSection = document.createElement( "section" );
		resultsSection.id = resultSectionID;
		baseElement.append( resultsSection );
	}

	// auto-create notification trigger element
	if ( !notificationTriggerElement ) {
		notificationTriggerElement = document.createElement( "div" );
		notificationTriggerElement.id = "notification-trigger";

		resultsSection.append( notificationTriggerElement );
	}

	// auto-create query summary element
	if ( !querySummaryElement ) {
		querySummaryElement = document.createElement( "div" );
		querySummaryElement.id = "query-summary";

		resultsSection.append( querySummaryElement );
	}

	// auto-create breadcrumb element (after query-summary, before did-you-mean)
	if ( !breadcrumbElement && params.facets?.length ) {
		breadcrumbElement = document.createElement( "div" );
		breadcrumbElement.id = "breadcrumb-manager";
		breadcrumbElement.hidden = true;

		resultsSection.append( breadcrumbElement );
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
		pagerElement = document.createElement( "div" );
		pagerElement.innerHTML = pagerContainerTemplateHTML;
		resultsSection.append( pagerElement );
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

	// initialize facets
	if ( params.facets?.length ) {
		const facetConfigMap = new Map();
		params.facets.forEach( ( raw ) => {
			const config = normalizeFacetConfig( raw );
			if ( config ) facetConfigMap.set( config.facetId, config );
		} );
		facetNormalizedConfigs = [ ...facetConfigMap.values() ];

		if ( facetNormalizedConfigs.length > 0 && !facetPanelElement ) {
			const facetItems = facetNormalizedConfigs.map( ( config, index ) => {
				const item = facetPanelItemTemplateHTML.replace( '%[facetId]', config.facetId );
				return index > 0 ? item.replace( 'class="gc-facet"', 'class="gc-facet mrgn-tp-md"' ) : item;
			} ).join( '' );

			baseElement.insertAdjacentHTML( 'beforeend',
				facetToggleTemplateHTML +
				facetLayoutTemplateHTML.replace( '%[facetItems]', facetItems )
			);

			// Store references and attach event handlers after insertion
			facetSidebarElement = document.getElementById( 'gc-facet-sidebar' );
			facetPanelElement = document.getElementById( 'gc-facet-panel' );
			document.getElementById( 'gc-results-col' ).append( resultsSection );
			document.getElementById( 'gc-facet-toggle' ).onclick = toggleFacetSidebar;
			document.querySelector( '#gc-facet-clear-all-container .btn-link' ).onclick = () => {
				facetControllers.forEach( ( c ) => c?.deselectAll() );
				dateFilterControllers.forEach( ( c ) => c?.clear() );
			};

			// Apply mobile defaults (sidebar hidden, facets collapsed) and restore any persisted state
			applyFacetUIDefaults();
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
// Returns a clean config object, or null if the entry is invalid.
function normalizeFacetConfig(raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return null;
	}

	const field = raw.field?.trim();
	if (!field) {
		return null;
	}

	const facetType = raw.facetType === 'dateRange' ? 'dateRange' : 'regular';

	const defaults = 
		facetType === 'dateRange' ? {
			withDatePicker: true,
			withDateRanges: true,
		} : {
			numberOfValues: 8,
			sortCriteria: 'occurrences',
			facetSearch: true,
		};

	const normalizedFields = {
		field,
		facetType,
		label: raw.label?.trim() || raw.title?.trim() || field,
		facetId: raw.facetId?.trim() || field,
		filterFacetCount: raw.filterFacetCount ?? true,
	};

	return {
		...defaults,
		...raw,
		...normalizedFields,
	};
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
	if ( endpoint && endpoint.period === 'now' ) {
		return '';
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

// Predefined relative date periods for the date facet (start is relative, end is now)
function getDateFacetFields () {
	return [
		{
			labelKey: "date-ranges.past-1-day|now",
			range: buildDateRange({
				start: { period: "past", unit: "day", amount: 1 },
				end: { period: 'now' },
				endInclusive: true,
			}),
		},
		{
			labelKey: "date-ranges.past-1-week|now",
			range: buildDateRange({
				start: { period: "past", unit: "week", amount: 1 },
				end: { period: 'now' },
				endInclusive: true,
			}),
		},
		{
			labelKey: "date-ranges.past-1-month|now",
			range: buildDateRange({
				start: { period: "past", unit: "month", amount: 1 },
				end: { period: 'now' },
				endInclusive: true,
			}),
		},
		{
			labelKey: "date-ranges.past-1-year|now",
			range: buildDateRange({
				start: { period: "past", unit: "year", amount: 1 },
				end: { period: 'now' },
				endInclusive: true,
			}),
		},
		{
			labelKey: "date-ranges.past-100-year|past-1-year",
			range: buildDateRange({
				start: { period: "past", unit: "year", amount: 100 },
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
	notifyTriggerController = buildNotifyTrigger( headlessEngine );

	if( params.facets?.length ) {

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

		breadcrumbManagerController = buildBreadcrumbManager( headlessEngine );

	}

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
	unsubscribeNotifyTriggerController = notifyTriggerController.subscribe( () => updateNotifyTriggerState( notifyTriggerController.state ) );
	if( params.facets?.length ) {
		unsubscribeBreadcrumbManagerController = breadcrumbManagerController.subscribe( () => updateBreadcrumbState( breadcrumbManagerController.state ) );
	}

	// Clear event tracking, for legacy browsers
	const onUnload = () => { 
		window.removeEventListener( 'hashchange', onHashChange );
		unsubscribeManager?.();
		unsubscribeSearchBoxController?.(); 
		unsubscribeResultListController?.();
		unsubscribeQuerySummaryController?.();
		unsubscribeDidYouMeanController?.();
		unsubscribePagerController?.();
		unsubscribeNotifyTriggerController?.();
		if( params.facets?.length ) {
			unsubscribeFacetControllers.forEach( ( unsub ) => unsub?.() );
			unsubscribeDateFilterControllers.forEach( ( unsub ) => unsub?.() );
			unsubscribeBreadcrumbManagerController?.();
		}
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

// Update notification displayed
function updateNotifyTriggerState ( newState ) {
	notificationState = newState;

	if ( notificationState.notifications?.length ) {
		notificationTriggerElement.innerHTML = notificationTriggerTemplateHTML.replace( "%[notification]", DOMPurify.sanitize( notificationState.notifications[0] ) );
		focusToView();
	}
	else {
		notificationTriggerElement.textContent = "";
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

function formatBreadcrumbLabel( breadcrumb ) {
	const { start, end, value } = breadcrumb.value ?? {};
	const formatCoveoDate = ( coveoDate ) => coveoDate ? coveoDate.split( '@' )[ 0 ].replace( /\//g, '-' ) : "";

	if ( start !== undefined && end !== undefined ) {
		const rangeLabel = localizedStrings[ params.lang ].get( `date-ranges.${ start }|${ end }` );
		if ( rangeLabel ) {
			return rangeLabel;
		} else if ( start === 'past-100-year' ) {
			return localizedStrings[ params.lang ].get( "date-ranges.before" ).replace( '{{date}}', formatCoveoDate( end ) );
		} else if ( end === 'now' ) {
			return localizedStrings[ params.lang ].get( "date-ranges.after" ).replace( '{{date}}', formatCoveoDate( start ) );
		} else {
			return `${ formatCoveoDate( start ) } - ${ formatCoveoDate( end ) }`;
		}
	}
	return value ?? "";
}

function renderBreadcrumbItemHTML( facetLabel, breadcrumb ) {
	const displayValue = formatBreadcrumbLabel( breadcrumb );
	const label = `${ facetLabel }: ${ displayValue }`;
	return breadcrumbItemTemplateHTML
		.replace( '%[ariaLabel]', label )
		.replace( '%[label]', label );
}

// Update breadcrumb (active filter) display
function updateBreadcrumbState( newState ) {
	if ( !breadcrumbElement ) return;

	const facetBreadcrumbs = newState.facetBreadcrumbs || [];
	const dateFacetBreadcrumbs = newState.dateFacetBreadcrumbs || [];
	const allBreadcrumbs = [ ...facetBreadcrumbs, ...dateFacetBreadcrumbs ];

	if ( allBreadcrumbs.length === 0 ) {
		breadcrumbElement.hidden = true;
		breadcrumbElement.textContent = "";
		return;
	}

	const itemsHTML = allBreadcrumbs.map( ( facet ) => {
		const configMatch = facetNormalizedConfigs.find( ( c ) => c.facetId === facet.facetId || c.field === facet.field );
		const facetLabel = configMatch?.label || facet.facetDisplayName || facet.field;
		return facet.values.map( ( breadcrumb ) => renderBreadcrumbItemHTML( facetLabel, breadcrumb ) ).join( '' );
	} ).join( '' );

	breadcrumbElement.hidden = false;
	breadcrumbElement.innerHTML = breadcrumbListTemplateHTML
		.replace( '%[filtersLabel]', localizedStrings[ params.lang ].get( 'breadbox.filters' ) )
		.replace( '%[items]', itemsHTML )
		.replace( '%[clearLabel]', localizedStrings[ params.lang ].get( 'breadbox.clear' ) );

	// Attach deselect handlers to each breadcrumb button by index
	const allValues = allBreadcrumbs.flatMap( ( facet ) => facet.values );
	breadcrumbElement.querySelectorAll( '.btn-default' ).forEach( ( btn, i ) => {
		btn.onclick = () => { allValues[ i ].deselect(); };
	} );

	breadcrumbElement.querySelector( '.btn-link' ).onclick = () => { breadcrumbManagerController.deselectAll(); };
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

function renderFacetSummaryHTML( label, hasActive ) {
	return facetSummaryTemplateHTML
		.replace( '%[labelId]', label.toLowerCase().replace( /\s+/g, '-' ) )
		.replace( '%[label]', label )
		.replace( '%[clearBtn]', hasActive ? facetClearFilterTemplateHTML : '' );
}

// Returns HTML string for a single facet value <li>.
function renderFacetItemHTML( label, count, isSelected ) {
	return facetItemTemplateHTML
		.replace( '%[checked]', isSelected ? 'checked' : '' )
		.replace( '%[label]', label )
		.replace( '%[count]', count.toLocaleString( lang ) );
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
	const wasOpen = facetEl.open;

	// Facet search input (only if the controller exposes facetSearch)
	// facetSearch methods live on the sub-controller; state is nested in newState.facetSearch
	const facetSearch = facetControllers[ index ].facetSearch;
	const facetSearchState = newState.facetSearch;
	const isSearching = ( facetSearchState?.query?.length ?? 0 ) > 0;

	const listId = 'gc-facet-values-' + index;
	const labelId = 'gc-facet-label-' + config.label.toLowerCase().replace( /\s+/g, '-' );
	const isFr = lang === 'fr';

	// Values list — show facet search results when a query is active, otherwise regular values
	const itemsHTML = isSearching ? 
		facetSearchState.values.map( ( r ) => renderFacetItemHTML( stripHtml( r.displayValue ), r.count, false ) ).join( '' ) : 
		newState.values.map( ( v ) => renderFacetItemHTML( stripHtml( v.value ), v.numberOfResults, v.state === 'selected' ) ).join( '' );

	// When the user is actively typing in the search box, only patch the values list
	// in-place rather than tearing down and rebuilding the whole facet — otherwise the
	// search results update destroys the focused input and moves focus / resets its value.
	if ( wasSearchFocused && config.facetSearch && facetSearchState ) {
		const listEl = facetEl.querySelector( '#' + listId );
		if ( listEl ) {
			listEl.innerHTML = itemsHTML;
			listEl.querySelectorAll( 'input[type="checkbox"]' ).forEach( ( checkbox, i ) => {
				checkbox.onchange = () => { facetSearch.select( facetSearchState.values[ i ] ); };
			} );
			return;
		}
	}

	const searchHTML = config.facetSearch && facetSearchState ? 
		facetSearchInputTemplateHTML
			.replace( '%[id]', searchInputId )
			.replace( '%[facetLabel]', config.label )
			.replace( '%[value]', '' ) : 
		'';

	facetEl.innerHTML =
		renderFacetSummaryHTML( config.label, newState.hasActiveValues ) +
		searchHTML +
		`<ul id="${ listId }" class="list-unstyled gc-facet-values" role="group" aria-labelledby="${ labelId }">${ itemsHTML }</ul>` +
		facetShowMoreTemplateHTML.replace( '%[listId]', listId ) +
		facetShowLessTemplateHTML.replace( '%[listId]', listId );

	const showMoreBtn = facetEl.querySelector( '.gc-facet-show-more' );
	const showLessBtn = facetEl.querySelector( '.gc-facet-show-less' );
	if ( isSearching || !newState.canShowMoreValues ) { showMoreBtn.hidden = true; }
	if ( isSearching || !newState.canShowLessValues ) { showLessBtn.hidden = true; }

	facetEl.open = wasOpen;

	// Attach event handlers
	if ( newState.hasActiveValues ) {
		facetEl.querySelector( '.gc-facet-clear' ).onclick = ( e ) => { e.stopPropagation(); facetControllers[ index ].deselectAll(); };
	}

	if ( config.facetSearch && facetSearchState ) {
		const searchInput = facetEl.querySelector( '#' + searchInputId );
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
		if ( wasSearchFocused ) { searchInput.focus(); }
	}

	facetEl.querySelectorAll( '.gc-facet-values input[type="checkbox"]' ).forEach( ( checkbox, i ) => {
		if ( isSearching ) {
			checkbox.onchange = () => { facetSearch.select( facetSearchState.values[ i ] ); };
		} else {
			checkbox.onchange = () => { facetControllers[ index ].toggleSelect( newState.values[ i ] ); };
		}
	} );

	showMoreBtn.onclick = () => { facetControllers[ index ].showMoreValues(); };
	showLessBtn.onclick = () => { facetControllers[ index ].showLessValues(); };

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

	const startId = 'gc-facet-date-start-' + index;
	const endId = 'gc-facet-date-end-' + index;
	const hasActive = dateFacetState.hasActiveValues || dateFilterState.range;

	// --- Custom date pickers (above the list) ---
	let datePickerHTML = '';
	if ( config.withDatePicker ) {
		datePickerHTML = facetDatePickerTemplateHTML
			.replaceAll( '%[startId]', startId )
			.replaceAll( '%[endId]', endId )
			.replaceAll( '%[today]', todayStr );
	}

	// --- Predefined date range list ---
	let dateRangesHTML = '';
	const reversedValues = [ ...dateFacetState.values ].reverse();
	if ( config.withDateRanges ) {
		const itemsHTML = reversedValues.map( ( value, i ) => {
			const period = getDateFacetFields()[ i ];
			if ( !period ) { return ''; }
			return renderFacetItemHTML( localizedStrings[ lang ].get( period.labelKey ), value.numberOfResults, value.state === 'selected' );
		} ).join( '' );
		dateRangesHTML = `<ul class="list-unstyled gc-facet-values mrgn-tp-sm">${ itemsHTML }</ul>`;
	}

	facetEl.innerHTML =
		renderFacetSummaryHTML( config.label, hasActive ) +
		datePickerHTML +
		dateRangesHTML;

	facetEl.open = wasOpen;

	if ( config.withDatePicker && !dateFilterState.range ) {
		facetEl.querySelector( '.gc-date-clear' ).hidden = true;
	}

	// Attach event handlers
	if ( hasActive ) {
		facetEl.querySelector( '.gc-facet-clear' ).onclick = ( e ) => {
			e.stopPropagation();
			facetControllers[ index ].deselectAll();
			dateFilterControllers[ index ].clear();
		};
	}

	if ( config.withDatePicker ) {
		const startInput = facetEl.querySelector( '#' + startId );
		const endInput = facetEl.querySelector( '#' + endId );

		startInput.onchange = () => { if ( startInput.value ) { endInput.min = startInput.value; } };
		endInput.onchange = () => { if ( endInput.value ) { startInput.max = endInput.value; } };

		// Pre-populate inputs if a custom filter is already active, skipping sentinel values
		if ( dateFilterState.range ) {
			const rangeStart = coveoDateToInputDate( dateFilterState.range.start );
			const rangeEnd = coveoDateToInputDate( dateFilterState.range.end );
			if ( rangeStart !== '1970-01-01' ) { startInput.value = rangeStart; }
			if ( rangeEnd !== todayStr ) { endInput.value = rangeEnd; }
			if ( startInput.value ) { endInput.min = startInput.value; }
			if ( endInput.value ) { startInput.max = endInput.value; }
		}

		facetEl.querySelector( '.gc-date-apply' ).onclick = () => {
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
					start: startVal ? inputDateToCoveoDate( startVal, false ) : 'past-100-year',
					end: endVal ? inputDateToCoveoDate( endVal, true ) : 'now',
				} );
			}
		};

		facetEl.querySelector( '.gc-date-clear' ).onclick = () => {
			startInput.value = '';
			endInput.value = '';
			startInput.max = todayStr;
			endInput.min = '';
			dateFilterControllers[ index ].clear();
		};
	}

	if ( config.withDateRanges ) {
		facetEl.querySelectorAll( '.gc-facet-values input[type="checkbox"]' ).forEach( ( checkbox, i ) => {
			const value = reversedValues[ i ];
			const period = getDateFacetFields()[ i ];
			const isSelected = value.state === 'selected';

			// Sync date picker inputs when a predefined range is selected
			if ( config.withDatePicker && isSelected && period ) {
				const rangeStart = resolveRangeEndpointToInputDate( period.range.start );
				const rangeEnd = resolveRangeEndpointToInputDate( period.range.end );
				const startEl = facetEl.querySelector( '#' + startId );
				const endEl = facetEl.querySelector( '#' + endId );
				if ( startEl ) { startEl.value = rangeStart !== '1970-01-01' ? rangeStart : ''; }
				if ( endEl ) { endEl.value = rangeEnd !== todayStr ? rangeEnd : ''; }
			}

			checkbox.onchange = () => {
				dateFilterControllers[ index ].clear();
				facetControllers[ index ].deselectAll();
				// Only re-select if it wasn't already selected (deselect = just clear)
				if ( !isSelected ) {
					facetControllers[ index ].toggleSelect( value );
				}
			};
		} );
	}

	if ( hasActive ) {
		announceFacetChange( isFr ? `Filtre de date actif\u00a0: ${ config.label }` : `Date filter active: ${ config.label }` );
	}

	updateFacetLayoutVisibility();
	updateClearAllVisibility();
}

function updateClearAllVisibility() {
	const clearAllContainer = document.getElementById( 'gc-facet-clear-all-container' );
	if ( clearAllContainer ) {
		clearAllContainer.hidden = !facetStates.some( ( s ) => s?.hasActiveValues ) && !dateFilterStates.some( ( s ) => s?.range );
	}
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
