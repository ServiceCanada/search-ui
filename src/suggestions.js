( function( document, window ) {
"use strict";

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
	"searchBoxQuery": "#wb-srch-q",
	"lang": "en",
	"numberOfSuggestions": 5,
	"minimumCharsForSuggestions": 3,
	"originLevel3": originPath,
	"pipeline": "",
	"endpoint": "https://apps.canada.ca/search"
};
let lang = document.querySelector( "html" )?.lang;
let paramsOverride = baseElement ? JSON.parse( baseElement.dataset.gcSearch ) : {};
let paramsDetect = {};
let params = {};
let urlParams;
let originLevel3RelativeUrl = "";

// UI states
let updateSearchBoxFromState = false;
let searchBoxState;
let lastCharKeyUp;
let activeSuggestion = 0;

// Firefox patch
let isFirefox = navigator.userAgent.indexOf( "Firefox" ) !== -1;
let waitForkeyUp = false;

// UI Elements placeholders 
let searchBoxElement;
let formElement = document.querySelector( 'form[name="cse-search-box"]' );
let suggestionsElement = document.querySelector( '#suggestions' );
let qsA11yHintHTML = document.getElementById( 'sr-qs-hint' )?.innerHTML;

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

	paramsDetect.originLevel3 = formElement.action;

	// Final parameters object
	params = Object.assign( defaults, paramsDetect, paramsOverride );

	// Initialize templates
	initTpl();

	// override origineLevel3 through query parameters 
	if ( urlParams?.originLevel3 ) {
		params.originLevel3 = urlParams.originLevel3;
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

	// Do nothing if no access token is provided
	if ( !params.accessToken ) {
		return;
	}

	// Initialize the engine
	initEngine();
}

// Initialize default templates
function initTpl() {
	// auto-create suggestions element
	searchBoxElement = document.querySelector( params.searchBoxQuery );
	if ( searchBoxElement ) {

		// default searchbox attributes
		searchBoxElement.setAttribute( 'type', 'search' ); // default, when query suggestions are disabled

		// if query suggestions are enabled and not advanced search, auto-create suggestions element and update searchbox attributes
		if ( params.numberOfSuggestions > 0 && !suggestionsElement ) {
			searchBoxElement.setAttribute( 'type', 'text' );
			searchBoxElement.role = "combobox";
			searchBoxElement.setAttribute( 'autocomplete', 'off' );
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

function sanitizeQuery(q) {
	return q.replace(/<[^>]*>?/gm, '');
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

// Strip HTML tags of a given string
function stripHtml(html) {
	let tmp = document.createElement( "DIV" );
	tmp.innerHTML = html;
	return tmp.textContent || tmp.innerText || "";
}

// Initiate engine
function initEngine() {
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
			if ( e.target.value ) {
				updateSearchBoxText( sanitizeQuery( e.target.value ) );
			}
			if ( e.target.value.length < params.minimumCharsForSuggestions ){
				closeSuggestionsBox();
			}
		};
		searchBoxElement.onfocus = () => {
			lastCharKeyUp = null;
			if ( searchBoxElement.value.length >= params.minimumCharsForSuggestions ) {
				updateSearchBoxText( sanitizeQuery( searchBoxElement.value ) );
			}
		};
	}

	// Listen to submit event from the search form (advanced searches will instead reload the page with URl parameters to search on load)
	if ( formElement ) {
		formElement.onsubmit = ( e ) => {
			e.preventDefault();
			redirectToSearchPage( 'headerSearchBoxSubmit' );
		};
	}
}

function redirectToSearchPage( actionCause ) {
	if ( formElement && searchBoxElement ) {
		window.location.href = formElement.action + "?" + buildCleanQueryString( { q: searchBoxElement.value, actionCause : actionCause } );
	}
}

function formatHighlightedSuggestion( highlighted ) {
	return highlighted.replaceAll( '[', '<strong>' )
		.replaceAll( ']', '</strong>' )
		.replaceAll( '(', '' )
		.replaceAll( ')', '' )
		.replaceAll( '{', '' )
		.replaceAll( '}', '' );
}

function updateSearchBoxText( text ) {
	if ( text.length < params.minimumCharsForSuggestions ) {
		return;
	}

	const body = {
		count: params.numberOfSuggestions,
		q: text,
		locale: params.lang,
		timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		context:{
			searchPageUrl: params.originLevel3,
			searchPageRelativeUrl: originLevel3RelativeUrl
		},
		searchHub: params.searchHub
	};

	const options = {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': 'Bearer ' + params.accessToken
		},
		body: JSON.stringify( body )
	};

	fetch(params.endpoint + "/querySuggest?organizationId=" + params.organizationId, options)
		.then((response) => {
			if (!response.ok) {
				// Handle HTTP errors, e.g., 404 Not Found
				console.error("HTTP error while getting query suggestions: ", response.status, response.statusText);
			}
			// Parse the response body as JSON and return a new Promise
			return response.json(); 
		})
		.then((data) => {
			updateSearchBoxState( {
				isLoadingSuggestions: false,
				isLoading: false,
				value: text,
				suggestions: data.completions.map( suggestion => ( {
					highlightedValue: formatHighlightedSuggestion( suggestion.highlighted ),
					highlighted: suggestion.highlighted
				} ) )
			} );
		})
		.catch((error) => {
			// Handle network errors or errors thrown in the .then() block
			console.error("Error updating search box suggestions: ", error);
		});
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

		if ( selectedVal ) {
			searchBoxElement.value = selectedVal;
			redirectToSearchPage( 'headerSearchBoxSuggestion' );
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
	if ( !searchBoxState.isLoadingSuggestions ) {
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
				searchBoxElement.value = stripHtml( e.currentTarget.innerText );
				redirectToSearchPage( 'headerSearchBoxSuggestion' );
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

// Run Search UI
initSearchUI();

} )( document, window );
