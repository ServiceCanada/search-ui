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
	loadAdvancedSearchQueryActions,
	loadSortCriteriaActions,
	HighlightUtils,
	getOrganizationEndpoints
} from './headless.esm.js';

// Search UI base
const baseElement = document.querySelector( '[data-gc-search]' );

// General
const winPath = window.location.pathname;
const monthsEn = [ "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" ];
const monthsFr = [ "janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc." ];

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
	"originLevel3": window.location.origin + winPath,
	"pipeline": ""
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

// UI states
let updateSearchBoxFromState = false;
let searchBoxState;
let resultListState;
let querySummaryState;
let didYouMeanState;
let pagerState;
let lastCharKeyUp;
let activeSuggestion = 0;
let activeSuggestionWaitMouseMove = true;
let pagerManuallyCleared = false;

// Firefox patch
let isFirefox = navigator.userAgent.indexOf( "Firefox" ) !== -1;
let waitForkeyUp = false;

// UI Elements placeholders 
let searchBoxElement;
let formElement = document.querySelector( '#gc-searchbox, form[action="#wb-land"]' );
let resultsSection = document.querySelector( '#wb-land' );
let resultListElement = document.querySelector( '#result-list' );
let querySummaryElement = document.querySelector( '#query-summary' );
let pagerElement = document.querySelector( '#pager' );
let suggestionsElement = document.querySelector( '#suggestions' );
let didYouMeanElement = document.querySelector( '#did-you-mean' );

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

// Init parameters and UI
function initSearchUI() {
	if( !baseElement || !DOMPurify ) {
		return;
	}

	if ( !lang && window.location.path.includes( "/fr/" ) ) {
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
			query = window.location.search.substring( 1 );

		urlParams = {};
		hashParams = {};

		// Ignore linting errors in regard to affectation instead of condition in the loops
		// jshint -W084
		while ( match = search.exec( query ) ) {	// eslint-disable-line no-cond-assign
			urlParams[ decode(match[ 1 ] ) ] = stripHtml( decode( match[ 2 ] ) );
		}
		query = window.location.hash.substring( 1 );

		while ( match = search.exec( query ) ) {	// eslint-disable-line no-cond-assign
			hashParams[ decode( match[ 1 ] ) ] = stripHtml( decode( match[ 2 ] ) );
		}
		// jshint +W084
	};

	window.onpopstate();

	initTpl();

	// override origineLevel3 through query parameters 
	if ( urlParams.originLevel3 ){
		params.originLevel3 = urlParams.originLevel3;
	}
	// override sort through query parameters 
	if (urlParams.sort){
		params.sort = urlParams.sort;
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

	initEngine();
}

// Auto-create parts of search pages templates if not already defined
function initTpl() {

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
				`<section class="alert alert-warning">
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
				</section>`;
		}
		else {
			noResultTemplateHTML = 
				`<section class="alert alert-warning">
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
				</section>`;
		}
	}

	if ( !resultErrorTemplateHTML ) {
		if ( lang === "fr" ) {
			resultErrorTemplateHTML = 
				`<section class="alert alert-warning">
					<h2>Nous éprouvons actuellement des problèmes avec la fonction de recherche sur le site Web Canada.ca</h2>
					<p>L'équipe chargée de rétablir les services touchés travaille de façon à résoudre le problème aussi rapidement que possible. Nous vous prions de nous excuser pour tout inconvénient.</p>
				</section>`;
		}
		else {
			resultErrorTemplateHTML = 
				`<section class="alert alert-warning">
					<h2>The Canada.ca Search is currently experiencing issues</h2>
					<p>A resolution for the restoration is presently being worked.	We apologize for any inconvenience.</p>
				</section>`;
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
				`<p class="h5">Rechercher plutôt <button class="btn btn-lg btn-link p-0 mrgn-bttm-sm" type="button">%[correctedQuery]</button> ?</p>`;
		}
		else {
			didYouMeanTemplateHTML = 
				`<p class="h5">Did you mean <button class="btn btn-lg btn-link p-0 mrgn-bttm-sm" type="button">%[correctedQuery]</button> ?</p>`;
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
				`<button class="page-button previous-page-button">Précédente<span class="wb-inv">: Page précédente des résultats de recherche</span></ button>`;
		}
		else {
			previousPageTemplateHTML = 
				`<button class="page-button previous-page-button">Previous<span class="wb-inv">: Previous page of search results</span></ button>`;
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
				`<button class="page-button next-page-button">Suivante<span class="wb-inv">: Page suivante des résultats de recherche</span></ button>`;
		}
		else {
			nextPageTemplateHTML = 
				`<button class="page-button next-page-button">Next<span class="wb-inv">: Next page of search results</span></ button>`;
		}
	}

	if ( !pagerContainerTemplateHTML ) {
		if ( lang === "fr" ) {
			pagerContainerTemplateHTML = 
				`<div class="text-center" >
					<p class="wb-inv">Pagination des résultats de recherche</p>
					<ul id="pager" class="pagination mrgn-bttm-0">
					</ul>
				</div>`;
		}
		else {
			pagerContainerTemplateHTML = 
				`<div class="text-center" >
					<p class="wb-inv">Search results pages</p>
					<ul id="pager" class="pagination mrgn-bttm-0">
					</ul>
				</div>`;
		}
	}

	// auto-create results
	if ( !resultsSection ) {
		resultsSection = document.createElement( "section" );
		resultsSection.id = "wb-land";

		baseElement.prepend( resultsSection );
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

	// auto-create suggestions element
	searchBoxElement = document.querySelector( params.searchBoxQuery );
	if ( !suggestionsElement && searchBoxElement && params.numberOfSuggestions > 0 && !params.isAdvancedSearch ) {
		searchBoxElement.role = "combobox";
		searchBoxElement.setAttribute( 'aria-autocomplete', 'list' );

		suggestionsElement = document.createElement( "ul" );
		suggestionsElement.id = "suggestions";
		suggestionsElement.role = "listbox";
		suggestionsElement.classList.add( "query-suggestions" );

		searchBoxElement.after( suggestionsElement );
		searchBoxElement.setAttribute( 'aria-controls', 'suggestions' );
	}

	// Close query suggestion box if click elsewhere
	document.addEventListener( "click", function( evnt ) {
		if ( suggestionsElement && ( evnt.target.className !== "suggestion-item" && evnt.target.id !== searchBoxElement?.id ) ) {
			closeSuggestionsBox();
		}
	} );
}
function sanitizeQuery(q) {
	return q.replace(/<[^>]*>?/gm, '');
}
// Initiate headless engine
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

						let q = requestContent.q;
						requestContent.q = sanitizeQuery( q );
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
	didYouMeanController = buildDidYouMean( headlessEngine, { options: { automaticallyCorrectQuery: false } } );
	pagerController = buildPager( headlessEngine, { options: { numberOfPages: 9 } } );
	statusController = buildSearchStatus( headlessEngine );

	if ( urlParams.allq || urlParams.exctq || urlParams.anyq || urlParams.noneq || urlParams.fqupdate || 
		urlParams.dmn || urlParams.fqocct || urlParams.elctn_cat || urlParams.filetype || urlParams.site || urlParams.year || urlParams.declaredtype || urlParams.startdate || urlParams.enddate || urlParams.dprtmnt ) { 
		let q = [];
		let qString = "";
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
		let aqString = '';

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
			let fqupdate = urlParams.fqupdate.toLowerCase();
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
			let elctn_cat = urlParams.elctn_cat.toLowerCase();
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
			let filetype = urlParams.filetype.toLowerCase();
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
			const year = Number.parseInt( urlParams.year );
			if ( Number.isInteger( year )  && ( year >= 2000 )  && ( year <= ( new Date().getFullYear() + 1 ) ) ) {
				aqString += ' @uri=".ca/' + urlParams.year + '"';
			}
			else {
				aqString += ' NOT @uri';
			}
		}

		if ( urlParams.site ) {
			let site = urlParams.site.toLowerCase().replace( '*', '' );
			aqString += ' @canadagazettesite==' + site;
		}
		
		if ( urlParams.startdate ) {
			const startDate = getcoveoGMTDate( urlParams.startdate );
			aqString += ' @date >= "' + startDate + '"';
		}
		
		if ( urlParams.enddate ) {
			const endDate = getcoveoGMTDate( urlParams.enddate );
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
		if ( !params.enableHistoryPush || window.location.origin.startsWith( 'file://' ) ) {
			return;
		}

		let hash = `#${urlManager.state.fragment}`;

		if ( !statusController.state.firstSearchExecuted ) {
			window.history.replaceState( null, document.title, window.location.origin + winPath + hash );
		} else {
			window.history.pushState( null, document.title, window.location.origin + winPath + hash );
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
					searchBoxArrowKeyUp();
					e.preventDefault();
				}
			}
			// Arrow key down
			else if ( e.keyCode === 40 ) {
				if ( !( isFirefox && waitForkeyUp ) ) {
					waitForkeyUp = true;
					searchBoxArrowKeyDown();
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
			}
		};
	}
}

function searchBoxArrowKeyUp() {
	if ( suggestionsElement.hidden ) {
		return;
	}

	if ( !activeSuggestion || activeSuggestion <= 1 ) {
		activeSuggestion = searchBoxState.suggestions.length;
	}
	else {
		activeSuggestion -= 1;
	}

	updateSuggestionSelection();
}

function searchBoxArrowKeyDown() {
	if ( suggestionsElement.hidden ) {
		return;
	}

	if ( !activeSuggestion || activeSuggestion >= searchBoxState.suggestions.length ) {
		activeSuggestion = 1;
	}
	else {
		activeSuggestion += 1;
	}

	updateSuggestionSelection();
}

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
	searchBoxElement.value = suggestionElement.innerText;
}

// Show query suggestions if a search action was not executed (if enabled)
function updateSearchBoxState( newState ) {
	const previousState = searchBoxState;
	searchBoxState = newState;

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

	activeSuggestion = 0;
	if ( !searchBoxState.isLoadingSuggestions && previousState?.isLoadingSuggestions ) {
		suggestionsElement.textContent = '';
		activeSuggestionWaitMouseMove = true;
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
				if ( !activeSuggestionWaitMouseMove ) {
					activeSuggestion = index + 1;
					updateSuggestionSelection();
				}
			};
			node.onmousemove = () => {
				activeSuggestionWaitMouseMove = false;
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
	searchBoxElement.setAttribute( 'aria-activedescendant', '' );
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

// Get date converted from GMT (Coveo) to current timezone
function getDateInCurrentTimeZone( date ){
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
	if ( lang === 'en' ) {
		return monthsEn[ currentTZDate.getMonth() ] + " " + currentTZDate.getDate() + ", " + currentTZDate.getFullYear();
	}

	return currentTZDate.getDate() + " " + monthsFr[ currentTZDate.getMonth() ] + " " + currentTZDate.getFullYear();
}


function isEmptyDate(date) { // checking for default date , Jan 1st, 1970
	return date instanceof Date &&
	date.getFullYear() === 1970 &&
	date.getMonth() === 0 &&     // January is 0
	date.getDate() === 1;
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
	if( !resultListState.hasError && resultListState.hasResults ) {
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
			printableUri = printableUri.replaceAll( '&' , '&amp;' );
			printableUri = printableUri.replaceAll( '%252F' , '/' );			
			printableUri = printableUri.replaceAll( "%252C" , "," ); // handle coma							   
			let clickUri = encodeURI( result.clickUri );
			clickUri = clickUri.replaceAll( "%252C" , "%2C" );  // handle coma
			clickUri = clickUri.replaceAll( "%252F" , "%2F" );  // handle slash							   
			let title = stripHtml( result.title );
			if ( result.raw.hostname && result.raw.displaynavlabel ) {
				const splittedNavLabel = ( Array.isArray( result.raw.displaynavlabel ) ? result.raw.displaynavlabel[0] : result.raw.displaynavlabel).split( '>' );
				breadcrumb = '<ol class="location"><li>' + stripHtml( result.raw.hostname ) + 
					'&nbsp;</li><li>' + stripHtml( splittedNavLabel[splittedNavLabel.length-1] ) + '</li></ol>';
			}
			else {
				breadcrumb = '<p class="location"><cite><a href="' + clickUri + '">' + printableUri + '</a></cite></p>';
			}
			
			if ( result.raw.disp_declared_type  ) {
				disp_declared_type = stripHtml( result.raw.disp_declared_type );

			}
			
			if ( result.raw.description ) {
				description = stripHtml( result.raw.description );

			}

			sectionNode.innerHTML = resultTemplateHTML
				.replace( '%[index]', index + 1 )
				.replace( 'https://www.canada.ca', filterProtocol( clickUri ) ) // workaround, invalid href are stripped
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

// Update heading that has number of results displayed
function updateQuerySummaryState( newState ) {
	querySummaryState = newState;

	if ( !querySummaryElement ) {
		return;
	}

	if ( resultListState.firstSearchExecuted && !querySummaryState.isLoading && !querySummaryState.hasError ) {
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
		}
		else {
			querySummaryElement.innerHTML = noResultTemplateHTML;
		}
		focusToView();
		pagerManuallyCleared = false;
	}
	else if ( querySummaryState.hasError ) {
		querySummaryElement.textContent = "";
		querySummaryElement.innerHTML = resultErrorTemplateHTML;
		focusToView();
		pagerManuallyCleared = false;
	}
}

// Focus to H2 heading in results section
function focusToView() {
	let focusElement = resultsSection.querySelector( "h2" );

	if( focusElement ) {
		focusElement.tabIndex = -1;
		focusElement.focus();
	}
}

// update did you mean
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

// Update pagination
function updatePagerState( newState ) {
	pagerState = newState;
	if ( pagerState.maxPage === 0 ) {
		pagerElement.textContent = "";
		return;
	}
	else if ( pagerElement.textContent === "" ) {
		pagerElement.innerHTML = pagerContainerTemplateHTML;
	}

	let pagerComponentElement = pagerElement.querySelector( "#pager" );
	pagerComponentElement.textContent = "";

	if ( pagerState.hasPreviousPage ) {
		const liNode = document.createElement( "li" );

		liNode.innerHTML = previousPageTemplateHTML;

		const buttonNode = liNode.querySelector( 'button' );

		buttonNode.onclick = () => { 
			pagerController.previousPage();
			
			if ( params.isAdvancedSearch ) {
				updateUrlParameter( pagerState.currentPage );
			}
		};

		pagerComponentElement.appendChild( liNode );
	}

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
				updateUrlParameter( pagerState.currentPage );
			}
		};

		pagerComponentElement.appendChild( liNode );
	} );

	if ( pagerState.hasNextPage ) {
		const liNode = document.createElement( "li" );

		liNode.innerHTML = nextPageTemplateHTML;

		const buttonNode = liNode.querySelector( 'button' );

		buttonNode.onclick = () => { 
			pagerController.nextPage(); 
			
			if ( params.isAdvancedSearch ) {
				updateUrlParameter( pagerState.currentPage );
			}
		};

		pagerComponentElement.appendChild( liNode );
	}
}

function updateUrlParameter( currentPage ) {
	
	const resultsPerPage = buildResultsPerPage(headlessEngine);
	const { numberOfResults } = resultsPerPage.state;
	const urlParams = new URLSearchParams( window.location.search );
	const paramName = 'firstResult';
	const pageNum = ( currentPage - 1 ) * numberOfResults;

	// Set the value of the parameter. If it doesn't exist, it will be added.
	urlParams.set( paramName, pageNum );

	const newSearch = urlParams.toString();
	window.history.replaceState( {}, '', `${window.location.pathname}?${newSearch}${window.location.hash}` );

}

function getcoveoGMTDate( date ) {
	const paramDate = new Date( date );
	const coveoGMTDateTime = new Date( paramDate.getTime() - paramDate.getTimezoneOffset()*60*1000 );
	
	const year = coveoGMTDateTime.getFullYear();
	const month = coveoGMTDateTime.getMonth() + 1; // Add 1 for 1-indexed month
	const day = coveoGMTDateTime.getDate();

	const formattedMonth = month < 10 ? '0' + month : month;
	const formattedDay = day < 10 ? '0' + day : day;

	return `${year}/${formattedMonth}/${formattedDay}`;
	
}

// Run Search UI
initSearchUI();
