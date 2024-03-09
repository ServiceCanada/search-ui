import {
	buildSearchEngine,
	buildSearchBox,
	buildResultList,
	buildQuerySummary,
	buildPager,
	buildSearchStatus,
	buildUrlManager,
	buildInteractiveResult,
	HighlightUtils,
	getOrganizationEndpoints
} from './headless.esm.js';

let params = {
	"searchHub": "canada-gouv-public-websites",
	"organizationId": "",
	"accessToken":"",
	"searchBoxQuery": "#sch-inp-ac",
	"searchButtonQuery": ".btn-primary",
	"lang": "en",
	"enableHistoryPush": true,
	"isContextSearch": false,
	"isAdvancedSearch": false,
	"originLevel3": window.location.origin + window.location.pathname
};

let lang = document.querySelector( "html" )?.lang;
if ( !lang && window.location.path.includes( "/fr/" ) ) {
	params.lang = "fr";
}
if ( lang.startsWith( "fr" ) ) {
	params.lang = "fr";
}

params.isContextSearch = !window.location.pathname.endsWith( '/sr/srb.html' ) && !window.location.pathname.endsWith( '/sr/sra.html' );
params.isAdvancedSearch = !!document.getElementById( 'advseacon1' ) || window.location.pathname.endsWith( '/advanced-search.html' ) || window.location.pathname.endsWith( '/recherche-avancee.html' );
params.enableHistoryPush = !params.isAdvancedSearch;

const paramsOverrideElement = document.querySelector( '[data-srchprms]' );
if ( paramsOverrideElement ) {
	const paramsOverride = JSON.parse( paramsOverrideElement.dataset.srchprms );
	Object.keys( paramsOverride ).forEach( key => params[ key ] = paramsOverride[ key ] );
}
			
const monthsEn = [ "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" ];
const monthsFr = [ "janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc." ];

var urlParams;
var hashParams;

// Check on URL params
( window.onpopstate = function () {
	var match,
		pl		 = /\+/g,	// Regex for replacing addition symbol with a space
		search = /([^&=]+)=?([^&]*)/g,
		decode = function ( s ) { return decodeURIComponent( s.replace( pl, " " ) ); },
		query	= window.location.search.substring( 1 );

	urlParams = {};
	hashParams = {};

	while ( match === search.exec( query ) ) {
		urlParams[ decode(match[ 1 ] ) ] = decode( match[ 2 ] );
	}
	query = window.location.hash.substring( 1 );

	while ( match === search.exec( query ) ) {
		hashParams[ decode( match[ 1 ] ) ] = decode( match[ 2 ] );
	}
} )();

// Initiate headless engine
export const headlessEngine = buildSearchEngine( {
	configuration: {
		organizationEndpoints: getOrganizationEndpoints(
			params.organizationId,
			'prod'
		),
		organizationId: params.organizationId,
		accessToken: params.accessToken,
		search: {
			locale: params.lang,
			searchHub: params.searchHub,
		},
		preprocessRequest: ( request, clientOrigin ) => {
			try {
				if( clientOrigin === 'analyticsFetch' ) {
					let requestContent = JSON.parse( request.body );
					// filter user sensitive content
					requestContent.originLevel3 = params.originLevel3;
					request.body = JSON.stringify( requestContent );
				}
				if( clientOrigin === 'searchApiFetch' && params.isAdvancedSearch ) {
					let requestContent = JSON.parse( request.body );
					// filter user sensitive content
					requestContent.enableQuerySyntax = true;
					request.body = JSON.stringify( requestContent );
				}
			} catch {
				console.warn("No Headless Engine Loaded.");
			}

			return request;
		}
	},
} );

// Get UI Elements placeholders 
let searchBoxElement = document.querySelector( params.searchBoxQuery );
const searchBoxButtons = document.querySelectorAll( params.searchButtonQuery );
const searchBoxButtonElement = searchBoxButtons[ searchBoxButtons.length - 1 ];
const suggestionsElement = document.getElementById( 'suggestions' );
const resultListElement = document.getElementById( 'result-list' );
const querySummaryElement = document.getElementById( 'query-summary' );
const pagerElement = document.getElementById( 'pager' );

// Get UI templates, otherwise define default ones
let resultTemplateHTML = document.getElementById( 'sr-single-' + ( params.isContextSearch ? 'context-' : '' ) + lang ) ?.innerHTML;
let noResultTemplateHTML = document.getElementById( 'sr-nores-' + lang ) ?.innerHTML;
let resultErrorTemplateHTML = document.getElementById( 'sr-error-' + lang ) ?.innerHTML;
let querySummaryTemplateHTML = document.getElementById( 'sr-query-summary-' + lang ) ?.innerHTML;
let noQuerySummaryTemplateHTML = document.getElementById( 'sr-noquery-summary-' + lang ) ?.innerHTML;
let previousPageTemplateHTML = document.getElementById( 'sr-pager-previous-' + lang ) ?.innerHTML;
let pageTemplateHTML = document.getElementById( 'sr-pager-page-' + lang ) ?.innerHTML;
let nextPageTemplateHTML = document.getElementById( 'sr-pager-next-' + lang ) ?.innerHTML;

// Default templates
if ( !resultTemplateHTML ) {
	if ( lang === "fr" ) {
		resultTemplateHTML = 
			`<section> 
				<h3><a id="%[itemId]" class="result-link" href="%[result.clickUri]" >%[result.title]</a></h3> 
				<ul class="context-labels"><li>%[result.raw.author]</li></ul> 
				<ol class="location"><li>%[result.printableUri]</li></ol> 
				<p><time datetime="%[short-date-en]" class="text-muted">%[long-date-en]</time> - %[highlightedExcerpt]</p> 
			</section>`;
	}
	else {
		resultTemplateHTML = 
			`<section> 
				<h3><a id="%[itemId]" class="result-link" href="%[result.clickUri]" >%[result.title]</a></h3> 
				<ul class="context-labels"><li>%[result.raw.author]</li></ul> 
				<ol class="location"><li>%[result.printableUri]</li></ol> 
				<p><time datetime="%[short-date-fr]" class="text-muted">%[long-date-fr]</time> - %[highlightedExcerpt]</p> 
			</section>`;
	}
}

if ( !noResultTemplateHTML ) {
	if ( lang === "fr" ) {
		noResultTemplateHTML = 
			`<section class="mrgn-tp-lg alert alert-warning">
				<h2 tabindex="-1" id="wb-land" class="h4">Aucun résultat</h2>
				<p>Aucun résultat ne correspond à vos critères de recherche.</p>
				<p>Suggestions:</p>
				<ul>
					<li>Assurez-vous que tous vos termes de recherches sont bien orthographiés </li>
					<li>Utilisez de différents termes de recherche </li>
					<li>Utilisez des termes de recherche plus généraux </li>
					<li>Consultez les&nbsp;<a href="/fr/sr/tr.html"> trucs de recherche </a></li>
					<li>Essayez la <a href="/fr/chaires-recherche/rechercher/recherche-avancee.html">recherche avancée</a></li>
				</ul>
			</section>`;
	}
	else {
		noResultTemplateHTML = 
			`<section class="mrgn-tp-lg alert alert-warning">
				 <h2 tabindex="-1" id="wb-land" class="h4">No results</h2>
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
			`<section class="mrgn-tp-lg alert alert-warning">
				 <h2 tabindex="-1" id="wb-land" class="h4">The Canada.ca Search is currently experiencing issues</h2>
				 <p>A resolution for the restoration is presently being worked.	We apologize for any inconvenience.</p>
			</section>`;
	}
	else {
		resultErrorTemplateHTML = 
			`<section class="mrgn-tp-lg alert alert-warning">
				 <h2 tabindex="-1" id="wb-land" class="h4">The Canada.ca Search is currently experiencing issues</h2>
				 <p>A resolution for the restoration is presently being worked.	We apologize for any inconvenience.</p>
			</section>`;
	}
}

if ( !querySummaryTemplateHTML ) {
	if ( lang === "fr" ) {
		querySummaryTemplateHTML = 
			`<section>
				 <h2 tabindex="-1" id="wb-land" class="h4">%[numberOfResults] résultats de recherche pour "%[query]"</h2>
			</section>`;
	}
	else {
		querySummaryTemplateHTML = 
			`<section>
				 <h2 tabindex="-1" id="wb-land" class="h4">%[numberOfResults] search results for "%[query]"</h2>
			</section>`;
	}
}
if ( !noQuerySummaryTemplateHTML ) {
	if ( lang === "fr" ) {
		noQuerySummaryTemplateHTML = 
			`<section>
				 <h2 tabindex="-1" id="wb-land" class="h4">%[numberOfResults] résultats de recherche</h2>
			</section>`;
	}
	else {
		noQuerySummaryTemplateHTML = 
			`<section>
				 <h2 tabindex="-1" id="wb-land" class="h4">%[numberOfResults] search results</h2>
			</section>`;
	}
}

if ( !previousPageTemplateHTML ) {
	if (lang === "fr") {
		previousPageTemplateHTML = 
			`<a href="" rel="prev">Page précédente<span class="wb-inv">: Page précédente des résultats de recherche</span></a>`;
	}
	else {
		previousPageTemplateHTML = 
			`<a href="" rel="prev">Previous<span class="wb-inv">: Previous page	of search results</span></a>`;
	}
}
if ( !pageTemplateHTML ) {
	if ( lang === "fr" ) {
		pageTemplateHTML = 
			`<a href="" rel="prev">Page précédente<span class="wb-inv">: Page précédente des résultats de recherche</span></a>`;
	}
	else {
		pageTemplateHTML = 
			`<a href="" rel="prev">Previous<span class="wb-inv">: Previous page	of search results</span></a>`;
	}
}

if ( !nextPageTemplateHTML ) {
	if ( lang === "fr" ) {
		nextPageTemplateHTML = 
			`<a rel="next">Page suivante<span class="wb-inv">: Page suivante des résultats de recherche</span></a>`;
	}
	else {
		nextPageTemplateHTML = 
			`<a rel="next">Next<span class="wb-inv">: Next page	of search results</span></a>`;
	}
}

// build controllers
const searchBoxController = buildSearchBox( headlessEngine, {
	options: {
		numberOfSuggestions: 0,
		highlightOptions: {
			notMatchDelimiters: {
				open: '<strong>',
				close: '</strong>',
			},
			correctionDelimiters: {
				open: '<i>',
				close: '</i>',
			},
		},
	}
} );
const resultListController = buildResultList( headlessEngine, {
	options: {
		fieldsToInclude: [ "author", "date", "language", "urihash", "objecttype", "collection", "source", "permanentid", "displaynavlabel" ]
	}
} );
const querySummaryController = buildQuerySummary( headlessEngine );
const pagerController = buildPager( headlessEngine, { options: { numberOfPages: 9 } } );
const statusController = buildSearchStatus( headlessEngine );

if ( urlParams.allq || urlParams.exctq || urlParams.anyq || urlParams.noneq || urlParams.fqupdate || urlParams.dmn || urlParams.fqocct ) { 
	let aq = [];
	if ( urlParams.allq ) {
		aq.push( urlParams.allq );
	}
	if ( urlParams.exctq ) {
		aq.push( '"' + urlParams.exctq + '"' );
	}
	if ( urlParams.anyq ) {
		aq.push( urlParams.anyq.replace( ' ', ' OR ' ) );
	}
	if ( urlParams.noneq ) {
		aq.push( "NOT (" + urlParams.noneq + ")" );
	}
	let aqString = aq.length ? '(' + aq.join( ')(' ) + ')' : '';
	if ( urlParams.fqocct ) {
		if ( urlParams.fqocct === "title_t" )
			aqString = "@title=" + aqString;
		if ( urlParams.fqocct === "url_t" )
			aqString = "@title=" + aqString;
		if ( urlParams.fqocct === "body_t" )
			aqString = "@title=" + aqString;				
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
		aqString += ' @hostname="' + urlParams.dmn + '"';
	}
	searchBoxController.updateText( aqString );
	searchBoxController.submit();
}

if ( hashParams.q && searchBoxElement ) {
	searchBoxElement.value = hashParams.q;
}
else if ( urlParams.q && searchBoxElement ) {
	searchBoxElement.value = urlParams.q;
}

// Get the query portion of the URL
const fragment = () => {
	const hash = window.location.hash.slice( 1 );
	if (!statusController.state.firstSearchExecuted && !hashParams.q ) {					
		return window.location.search.slice( 1 ); // use query string if hash is empty
	}
	
	return hash;
};

const urlManager = buildUrlManager( headlessEngine, {
	initialState: {
		fragment: fragment(),
	},
} );

// Sync controllers when URL changes
const onHashChange = () => { 
	urlManager.synchronize( fragment() );
};

// Execute a search if parameters in the URL on page load
if ( !statusController.state.firstSearchExecuted && fragment() ) {
	headlessEngine.executeFirstSearch();
}

// Listen to URL change (hash)
window.addEventListener( 'hashchange', onHashChange );

// Unsubscribe to controllers

/* const unsubscribeManager = urlManager.subscribe( () => {
	if ( !params.enableHistoryPush	|| window.location.origin.startsWith( 'file://' ) ) {
		return;
	}
		
	let hash = `#${urlManager.state.fragment}`;

	if ( window.location.href.includes( '#' ) ) {
		hash = hash.replace( '#', '&' );
	}
	
	if ( !statusController.state.firstSearchExecuted ) {
		window.history.replaceState( null, document.title, window.location.href + hash );
		return;
	}
	window.history.pushState( null, document.title, window.location.href + hash );
}); */

let searchBoxState = null;
let resultListState = null;
let querySummaryState = null;
let pagerState = null;

let lastCharKeyUp = null;

// Show query suggestions if a search action was not executed (if enabled)
function updateSearchBoxState( newState ) {
	searchBoxState = newState;
	if ( !suggestionsElement ) {
		return;
	}
		
	if ( lastCharKeyUp === 13 ) {
		suggestionsElement.style.display = 'none';
		return;
	}

	if ( !searchBoxState.isLoadingSuggestions ) {
		suggestionsElement.textContent = '';
		searchBoxState.suggestions.forEach( ( suggestion ) => {
			const node = document.createElement( "li" );
			node.setAttribute( "class", "suggestion-item" );
			node.onclick = ( e ) => { 
				searchBoxController.selectSuggestion(e.currentTarget.innerText);
				searchBoxElement.value = e.currentTarget.innerText;
			};
			node.innerHTML = suggestion.highlightedValue;
			suggestionsElement.appendChild( node );
		});
		
		if ( searchBoxState.suggestions.length > 0 ) {
			suggestionsElement.style.display = 'block';
		}
	}
}

// Filters out dangerous URIs that can create XSS attacks such as `javascript:`.
function filterProtocol( uri ) {

	const isAbsolute = /^(https?|mailto|tel):/i.test( uri );
	const isRelative = /^(\/|\.\/|\.\.\/)/.test( uri );

	return isAbsolute || isRelative ? uri : '';
}

// Clear results list
function clearResultList() {
	resultListElement.textContent = "";
}

// Update results list
function updateResultListState( newState ) {
	resultListState = newState;
	
	if ( resultListState.isLoading ) {
		if ( suggestionsElement ) {
			suggestionsElement.style.display = 'none';
		}
	}
	else {
		clearResultList();
		if( !resultListState.hasError && resultListState.hasResults ) {
			resultListState.results.forEach( ( result ) => {
				const sectionNode = document.createElement( "section" );
				const highlightedExcerpt = HighlightUtils.highlightString( {
					content: result.excerpt,
					highlights: result.excerptHighlights,
					openingDelimiter: '<strong>',
					closingDelimiter: '</strong>',
				} );
				const resultDate = new Date( result.raw.date );

				sectionNode.innerHTML = resultTemplateHTML
					.replace( '%[result.clickUri]', filterProtocol( result.clickUri ) )
					.replace( 'https://www.canada.ca', filterProtocol( result.clickUri ) ) // hack, invalid href are stripped
					.replace( '%[result.title]', result.title )
					.replace( '%[result.raw.author]', result.raw.author ? result.raw.author : '' )
					.replace( '%[result.breadcrumb]', result.raw.displaynavlabel ? result.raw.displaynavlabel : result.printableUri )
					.replace( '%[result.printableUri]', result.printableUri )
					.replace( '%[short-date-en]', resultDate.getFullYear() + "-" + resultDate.getMonth() + 1 + "-" + resultDate.getDate() )
					.replace( '%[short-date-fr]', resultDate.getFullYear() + "-" + resultDate.getMonth() + 1 + "-" + resultDate.getDate() )
					.replace( '%[long-date-en]', monthsEn[ resultDate.getMonth() ] + " " + resultDate.getDate() + ", " + resultDate.getFullYear() )
					.replace( '%[long-date-fr]', resultDate.getDate() + " " + monthsFr[ resultDate.getMonth() ] + " " + resultDate.getFullYear() )
					.replace( '%[highlightedExcerpt]', highlightedExcerpt );
				
				const interactiveResult = buildInteractiveResult( headlessEngine, {
					options: { result },
				} );

				let resultLink = sectionNode.querySelector( ".result-link" );
				resultLink.onclick = () => { interactiveResult.select(); };
				resultLink.oncontextmenu = () => { interactiveResult.select(); };
				resultLink.onmousedown = () => { interactiveResult.select(); };
				resultLink.onmouseup = () => { interactiveResult.select(); };
				resultLink.ontouchstart = () => { interactiveResult.beginDelayedSelect(); };
				resultLink.ontouchend = () => { interactiveResult.cancelPendingSelect(); };

				resultListElement.appendChild( sectionNode );
			});
		}
		else if ( resultListState.firstSearchExecuted && !resultListState.hasResults && !resultListState.hasError ) {
			resultListElement.innerHTML = noResultTemplateHTML;
		}
	}
}

// Update heading that has number of results displayed
function updateQuerySummaryState( newState ) {
	querySummaryState = newState;
	
	if ( resultListState.firstSearchExecuted && !querySummaryState.isLoading && !querySummaryState.hasError ) {
		querySummaryElement.textContent = "";
		if ( querySummaryState.total > 0 ) {
			let numberOfResults = querySummaryState.total.toString();

			if ( numberOfResults.length > 3 ) {
				numberOfResults = numberOfResults.substring( 0, numberOfResults.length - 3 ) + ',' + numberOfResults.substring( numberOfResults.length - 3 );
			}
			if ( numberOfResults.length > 7 ) {
				numberOfResults = numberOfResults.substring( 0, numberOfResults.length - 7 ) + ',' + numberOfResults.substring( numberOfResults.length - 7 );
			}

			querySummaryElement.innerHTML = ( ( querySummaryState.query !== "" && !params.isAdvancedSearch ) ? querySummaryTemplateHTML : noQuerySummaryTemplateHTML )
				.replace( '%[numberOfResults]', numberOfResults )
				.replace( '%[query]', querySummaryState.query );
		}
	}
	else if ( querySummaryState.hasError ) {
		querySummaryElement.textContent = "";
		querySummaryElement.innerHTML = resultErrorTemplateHTML;
	}
}

// Update pagination
function updatePagerState( newState ) {
	pagerState = newState;
	pagerElement.textContent = "";

	if ( pagerState.hasPreviousPage ) {
		const liNode = document.createElement( "li" );
		liNode.innerHTML = previousPageTemplateHTML;
		const aNode= liNode.querySelector( 'a' );
		aNode.onclick = () => { 
			pagerController.previousPage();
			window.scrollTo( { top: 200, behavior: 'smooth' } );
		};
		pagerElement.appendChild( liNode );
	}
	pagerState.currentPages.forEach( ( page ) => {
		const liNode = document.createElement( "li" );
		if ( page === pagerState.currentPage ) {
			liNode.setAttribute( "class","active" );
		}
		const pageNo = page;
		liNode.innerHTML = pageTemplateHTML.replace( '%[page]', pageNo );
		const aNode = liNode.querySelector( 'a' );
		aNode.onclick = () => {
			pagerController.selectPage( pageNo );
			window.scrollTo( { top: 200, behavior: 'smooth' } );
		};
		pagerElement.appendChild( liNode );				
	} );
	if ( pagerState.hasNextPage ) {
		const liNode = document.createElement( "li" );
		liNode.innerHTML = nextPageTemplateHTML;
		const aNode = liNode.querySelector( 'a' );
		aNode.onclick = () => { 
			pagerController.nextPage(); 
			window.scrollTo( { top: 200, behavior: 'smooth' } );
		};
		pagerElement.appendChild( liNode );
	}
}

// Subscribe to Headless controllers
searchBoxController.subscribe( () => updateSearchBoxState( searchBoxController.state ) );
resultListController.subscribe( () => updateResultListState( resultListController.state ) );
querySummaryController.subscribe( () => updateQuerySummaryState( querySummaryController.state ) );
pagerController.subscribe( () => updatePagerState( pagerController.state ) );

// Listen to "Enter" key up event for search action
if ( searchBoxElement ) {
	searchBoxElement.onkeyup = ( e ) => {
		lastCharKeyUp = e.keyCode;
		if( e.keyCode === 13 ) {
			e.preventDefault(); // Ensure it is only this code that runs
			//searchBoxController.submit(); // not required, click on search button occurs automatically...
		}
		else {
			searchBoxController.updateText( e.target.value );
		}
	};
	searchBoxElement.onfocus = () => {
		lastCharKeyUp = null;
		searchBoxController.showSuggestions();
	};
}

// Listen to click event for search action
if (searchBoxButtonElement){
	searchBoxButtonElement.onclick = ( e ) => {
		if ( params.isAdvancedSearch ) {
			return; // advanced search forces a post back
		}
		
		e.preventDefault();

		if ( searchBoxElement && searchBoxElement.value ) {
			searchBoxController.submit();
		}
		else {
			resultListElement.textContent = "";
		}
	};
}

// Remove Query suggestion if click elsewhere
document.addEventListener( "click", function( evnt ) {
	if ( suggestionsElement && ( evnt.target.className !== "suggestion-item" && evnt.target.id !== "sch-inp-ac" ) ) {
		suggestionsElement.style.display = 'none';
	}
} );
