(function() {
  	document.addEventListener("contextmenu", test, false);

	function test(event) {
		console.log(event.userInfo);
		/*if (event.command === CTXMENU_IDENTIFIER) {
			var newTab = safari.application.activeBrowserWindow.openTab("foreground", safari.application.activeBrowserWindow.tabs.length);
			newTab.url = moreInfoURL;
		}*/
	}

})();
