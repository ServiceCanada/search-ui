import {
	buildSearchEngine,
	buildSearchBox,
	buildResultList,
	buildQuerySummary,
	buildPager,
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
	"numberOfSuggestions": 0,
	"unsupportedSuggestions": false,
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
let pageTemplateHTML = document.getElementById( 'sr-pager-page-' )?.innerHTML;
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

	searchBoxElement = document.querySelector( params.searchBoxQuery );

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
			urlParams[ decode(match[ 1 ] ) ] = DOMPurify.sanitize( decode( match[ 2 ] ) );
		}
		query = window.location.hash.substring( 1 );

		while ( match = search.exec( query ) ) {	// eslint-disable-line no-cond-assign
			hashParams[ decode( match[ 1 ] ) ] = DOMPurify.sanitize( decode( match[ 2 ] ) );
		}
		// jshint +W084
	};

	window.onpopstate();

	initTpl();

	// override origineLevel3 through query parameters 
	if ( urlParams.originLevel3 ){
		params.originLevel3 = urlParams.originLevel3;
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
				<ol class="location"><li>%[result.breadcrumb]</li></ol> 
				<p><time datetime="%[short-date-fr]" class="text-muted">%[long-date-fr]</time> - %[highlightedExcerpt]</p>`;
		}
		else {
			resultTemplateHTML = 
				`<h3><a class="result-link" href="%[result.clickUri]" data-dtm-srchlnknm="%[index]">%[result.title]</a></h3> 
				<ul class="context-labels"><li>%[result.raw.author]</li></ul> 
				<ol class="location"><li>%[result.breadcrumb]</li></ol> 
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
		pagerElement = newPagerElement.querySelector( "#pager" );
	}

	// auto-create suggestions element
	if ( !suggestionsElement && searchBoxElement && params.unsupportedSuggestions && params.numberOfSuggestions > 0 ) {
		suggestionsElement = document.createElement( "ul" );
		suggestionsElement.id = "suggestions";
		suggestionsElement.classList.add( "rough-experimental", "query-suggestions" );

		searchBoxElement.after( suggestionsElement );
	}

	// Query suggestions
	if ( suggestionsElement ) {

		// Remove unsupported query suggestion if on production (www.canada.ca)
		if( window.location.hostname === "www.canada.ca" ) {
			suggestionsElement.remove();
		}

		// Add an alert banner to clearly state that the Query suggestion feature is at a rough experimental state
		else {
			const firstH1 = document.querySelector( "main h1:first-child" );
			let roughExperimentAlert = document.createElement( "section" );

			roughExperimentAlert.classList.add( "alert", "alert-danger" );

			if ( lang === "fr" ) {
				roughExperimentAlert.innerHTML = 
					`<h2 class="h3">Avis de fonctionnalité instable</h2>
					<p>Cette page utilise une fonctionnalité expérimentale pouvant contenir des problèmes d'accessibilité et/ou de produire des effets indésirables qui peuvent altérer l'expérience de l'utilisateur.</p>`;
			}
			else {
				roughExperimentAlert.innerHTML = 
					`<h2 class="h3">Unstable feature notice</h2>
					<p>This page leverages an experimental feature subject to contain accessibility issues and/or to produce unwanted behavior which may alter the user experience.</p>`;
			}

			firstH1.after( roughExperimentAlert );

			// Remove Query suggestion if click elsewhere
			document.addEventListener( "click", function( evnt ) {
				if ( suggestionsElement && ( evnt.target.className !== "suggestion-item" && evnt.target.id !== "sch-inp-ac" ) ) {
					suggestionsElement.hidden = true;
				}
			} );
		}
	}
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

						// documentAuthor cannot be longer than 128 chars
						if ( requestContent.documentAuthor ){
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
						requestContent.mlParameters = { "filters": { "c_context_searchpageurl": params.originLevel3 } };

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
	contextController.set( { "searchPageUrl" : params.originLevel3 } );

	// build controllers
	searchBoxController = buildSearchBox( headlessEngine, {
		options: {
			numberOfSuggestions: params.numberOfSuggestions,
			highlightOptions: {
				notMatchDelimiters: {
					open: '<strong>',
					close: '</strong>',
				},
				correctionDelimiters: {
					open: '<em>',
					close: '</em>',
				},
			},
		}
	} );

	resultListController = buildResultList( headlessEngine, {
		options: {
			fieldsToInclude: [ "author", "date", "language", "urihash", "objecttype", "collection", "source", "permanentid", "displaynavlabel" ]
		}
	} );
	querySummaryController = buildQuerySummary( headlessEngine );
	didYouMeanController = buildDidYouMean( headlessEngine, { options: { automaticallyCorrectQuery: false } } );
	pagerController = buildPager( headlessEngine, { options: { numberOfPages: 9 } } );
	statusController = buildSearchStatus( headlessEngine );

	if ( urlParams.allq || urlParams.exctq || urlParams.anyq || urlParams.noneq || urlParams.fqupdate || 
		urlParams.dmn || urlParams.fqocct || urlParams.elctn_cat || urlParams.filetype || urlParams.site || urlParams.year ) { 
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

		if ( urlParams.sort ) {
			const sortAction = loadSortCriteriaActions( headlessEngine ).registerSortCriterion( {
				by: "date",
				order: "descending",
			} );
			headlessEngine.dispatch( sortAction );
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
		searchBoxElement.value = DOMPurify.sanitize( hashParams.q );
	}
	else if ( urlParams.q && searchBoxElement ) {
		searchBoxElement.value = DOMPurify.sanitize( urlParams.q );
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
		searchBoxElement.onkeyup = ( e ) => {
			lastCharKeyUp = e.keyCode;

			if( e.keyCode !== 13 && searchBoxController.state.value !== e.target.value ) {
				searchBoxController.updateText( DOMPurify.sanitize( e.target.value ) );
			}
		};
		searchBoxElement.onfocus = () => {
			lastCharKeyUp = null;
			searchBoxController.showSuggestions();
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
					searchBoxController.updateText( DOMPurify.sanitize( searchBoxElement.value ) );
				}
				searchBoxController.submit();
			}
			else {
				resultListElement.textContent = "";
				querySummaryElement.textContent = "";
				didYouMeanElement.textContent = "";
				pagerElement.textContent = "";
			}
		};
	}
}

// Show query suggestions if a search action was not executed (if enabled)
function updateSearchBoxState( newState ) {
	const previousState = searchBoxState;
	searchBoxState = newState;

	if ( updateSearchBoxFromState && searchBoxElement && searchBoxElement.value !== newState.value ) {
		searchBoxElement.value = DOMPurify.sanitize( newState.value );
		updateSearchBoxFromState = false;
		return;
	}

	if ( !suggestionsElement ) {
		return;
	}

	if ( lastCharKeyUp === 13 ) {
		suggestionsElement.hidden = true;
		return;
	}

	if ( !searchBoxState.isLoadingSuggestions && previousState?.isLoadingSuggestions ) {
		suggestionsElement.textContent = '';
		searchBoxState.suggestions.forEach( ( suggestion ) => {
			const node = document.createElement( "li" );
			node.setAttribute( "class", "suggestion-item" );
			node.onclick = ( e ) => { 
				searchBoxController.selectSuggestion(e.currentTarget.innerText);
				searchBoxElement.value = DOMPurify.sanitize( e.currentTarget.innerText );
			};
			node.innerHTML = suggestion.highlightedValue;
			suggestionsElement.appendChild( node );
		});

		if ( searchBoxState.suggestions.length > 0 ) {
			suggestionsElement.hidden = false;
		}
	}
}

// rebuild a clean query string out of a JSON object
function buildCleanQueryString( paramsObject ) {
	let urlParam = "";
	for ( var prop in paramsObject ) {
		if ( paramsObject[ prop ] ) {
			if ( urlParam !== "" ) {
				urlParam += "&";
			}

			urlParam += prop + "=" + DOMPurify.sanitize( paramsObject[ prop ].replaceAll( '+', ' ' ) );
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

// Update results list
function updateResultListState( newState ) {
	resultListState = newState;

	if ( resultListState.isLoading ) {
		if ( suggestionsElement ) {
			suggestionsElement.hidden = true;
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
					author = result.raw.author.join( ';' );
				}
				else {
					author = result.raw.author;
				}
				if( params.isContextSearch ) {
					author = author.replace( ';', ', ' );
				}
				else {
					author = author.replace( ',', ';' );
					author = author.replace( ';' , '</li> <li>' );
				}
			}

			sectionNode.innerHTML = resultTemplateHTML
				.replace( '%[index]', index + 1 )
				.replace( 'https://www.canada.ca', filterProtocol( result.clickUri ) ) // workaround, invalid href are stripped
				.replace( '%[result.clickUri]', filterProtocol( result.clickUri ) )
				.replace( '%[result.title]', result.title )
				.replace( '%[result.raw.author]', author )
				.replace( '%[result.breadcrumb]', result.raw.displaynavlabel ? result.raw.displaynavlabel : result.printableUri )
				.replace( '%[result.printableUri]', result.printableUri.replaceAll( '&' , '&amp;' ) )
				.replace( '%[short-date-en]', getShortDateFormat( resultDate ) )
				.replace( '%[short-date-fr]', getShortDateFormat( resultDate ) )
				.replace( '%[long-date-en]', getLongDateFormat( resultDate, 'en' ) )
				.replace( '%[long-date-fr]', getLongDateFormat( resultDate, 'fr' ) )
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
	}
	else if ( querySummaryState.hasError ) {
		querySummaryElement.textContent = "";
		querySummaryElement.innerHTML = resultErrorTemplateHTML;
		focusToView();
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
			didYouMeanElement.innerHTML = didYouMeanTemplateHTML.replace( '%[correctedQuery]', didYouMeanState.queryCorrection.correctedQuery );
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
	pagerElement.textContent = "";

	if ( pagerState.hasPreviousPage ) {
		const liNode = document.createElement( "li" );

		liNode.innerHTML = previousPageTemplateHTML;

		const buttonNode = liNode.querySelector( 'button' );

		buttonNode.onclick = () => { 
			pagerController.previousPage();
		};

		pagerElement.appendChild( liNode );
	}

	pagerState.currentPages.forEach( ( page ) => {
		const liNode = document.createElement( "li" );
		const pageNo = page;

		liNode.innerHTML = pageTemplateHTML.replaceAll( '%[page]', pageNo );

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
		};

		pagerElement.appendChild( liNode );
	} );

	if ( pagerState.hasNextPage ) {
		const liNode = document.createElement( "li" );

		liNode.innerHTML = nextPageTemplateHTML;

		const buttonNode = liNode.querySelector( 'button' );

		buttonNode.onclick = () => { 
			pagerController.nextPage(); 
		};

		pagerElement.appendChild( liNode );
	}
}

// Run Search UI
initSearchUI();
