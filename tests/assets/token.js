// This file is to facilitate testing of the search pages through GitHub pages

const formToken = document.getElementById( "sr-token" );
const searchElm = document.querySelector( "[data-gc-search]" );
const sessionName = "searchToken";
const tokenSaved = sessionStorage.getItem( sessionName );

if( searchElm && tokenSaved ) {
	let configData = JSON.parse( searchElm.dataset.gcSearch );

	configData.accessToken = tokenSaved;
	searchElm.dataset.gcSearch = JSON.stringify( configData );
}

if( formToken ) {
	formToken.onsubmit = function( e ) {
		e.preventDefault();

		let formData = new FormData( formToken );
		let statusElm = document.getElementById( "sr-token-ok" );
		let tmpElm = document.createElement( "DIV" );

		tmpElm.innerHTML = formData.get( "token" );
		formData = tmpElm.textContent;
		sessionStorage.setItem( sessionName, formData );

		statusElm.hidden = false;
		const hideFeedback = setTimeout( function() { statusElm.hidden = true; }, 5000 );

		return false;
	};
}
