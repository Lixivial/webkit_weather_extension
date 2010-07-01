/* Define some psuedo-constants */
/* A map of various conditions to known icons */
var CONDITION_MAP = {
	"cloudy"          : "cloudy",
	"overcast"        : "mostly_cloudy",
	"mostly cloudy"   : "mostly_cloudy",
	"partly cloudy"   : "partly_cloudy",
	"sunny"           : "sunny",
	"fair"            : "clear",
	"clear"           : "clear",
	"thunderstorm"    : "thunderstorm",
	"snow"            : "snow",
	"lightning"       : "lightning",
	"rain"            : "rain",
	"sleet"           : "rain",
	"hurricane"       : "hurricane",
	"new moon"        : "new_moon",
	"waxing crescent" : "waxing_crescent",
	"waxing gibbous"  : "waxing_crescent",
	"first quarter"   : "first_quarter",
	"last quarter"    : "last_quarter",
	"waning crescent" : "waning_crescent",
	"waning gibbous"  : "waning_crescent",
	"full moon"       : "full_moon",
	"unknown"         : "unknown"
};

var MONTH_NAMES = {
	"Jan"       : 1,
	"January"   : 1,
	"Feb"       : 2,
	"February"  : 2,
	"Mar"       : 3,
	"March"     : 3,
	"Apr"       : 4,
	"April"     : 4,
	"May"       : 5,
	"Jun"       : 6,
	"June"      : 6,
	"Jul"       : 7,
	"July"      : 7,
	"Aug"       : 8,
	"August"    : 8,
	"Sep"       : 9,
	"September" : 9,
	"Oct"       : 10,
	"October"   : 10,
	"Nov"       : 11,
	"November"  : 11,
	"Dec"       : 12,
	"December"  : 12,
}

var MOON_PHASES = {
	0  : "New Moon",
	25 : "Waxing Crescent",
	50 : "First Quarter",
	75 : "Waxing Gibbous",
	100: "Full Moon",
}

/* Unique command so that we only pickup events from our button */
var TOOLBAR_IDENTIFIER = "com.redonxi.weather.getWeather";
var CTXMENU_IDENTIFIER = "com.redonxi.weather.contextualMenu";

/* Define some globals */
var site          = null;
var refresh       = null;
var zip           = null;
var url           = null;
var moreInfoURL   = null;
var secondaryURL  = null;
var forecastURL   = null;
var unitOfMeasure = null;
var tooltip       = "";
var temperature   = 0;
var condition     = "unknown";
var intervalID    = null;

/* Attach the listeners */
safari.extension.settings.addEventListener("change", updateSettings, false);
safari.extension.secureSettings.addEventListener("change", updateSettings, false);
safari.application.addEventListener("command", displayWeather, false);
safari.application.addEventListener("validate", getWeather, false);
safari.application.addEventListener("contextmenu", updateContextualMenu, false);

/* Initialise and run the first iteration */
updateSettings();

/* Settings change listener */
function updateSettings(event) {
	site          = safari.extension.settings.getItem("site");
	refresh       = safari.extension.settings.getItem("refresh");
	zip           = safari.extension.secureSettings.getItem("zip");

	if (zip === null) {
		if (navigator.geolocation) {
			/* This appears to be disabled for use in extensions. */
			navigator.geolocation.watchPosition(function(position) {
				var XHR = new XMLHttpRequest();
				var url = "http://maps.google.com/maps/api/geocode/json?latlng=" 
						  + position.coords.latitude + "," + position.coords.longitude +
						  "&sensor=false";
				XHR.onreadystatechange = function() {
					if(this.readyState == 4 && this.status == 200) {
						var JSON = eval('(' + XHR.responseText + ')');
						if (JSON.status == "OK") {
							safari.extension.secureSettings.setItem("zip",
								JSON.results[2].address_components[0].long_name);
						} else {
							safari.extension.secureSettings.setItem("zip", "95014");
						}
					}
				};
				
				XHR.open("GET", url, true);
				XHR.send();
			}, function() {
				safari.extension.secureSettings.setItem("zip", "95014");
			});
		} else {
			safari.extension.secureSettings.setItem("zip", "95014");
		}
		return false;
	}
	
	unitOfMeasure = safari.extension.settings.getItem("unitOfMeasure");

	url           = formatURL();
	moreInfoURL   = formatMoreInfoURL();
	secondaryURL  = safari.extension.settings.getItem(site + "SecondaryURL");
	forecastURL   = safari.extension.settings.getItem(site + "ForecastURL");

	/* Disable/enable background updating */
	if (intervalID === null && refresh !== -1) {
		intervalID = setInterval(updateWeather, (refresh * 6) * 10000);
	} else if (intervalID !== null && refresh === -1) {
		clearInterval(intervalID);
		intervalID = null;
		updateWeather();
	} else {
		updateWeather();
	}

}

/* Button update listener */
function getWeather(event) {
	if (event.command === TOOLBAR_IDENTIFIER) {
		var button = event.target;
		button.image = safari.extension.baseURI + "conditions/" + CONDITION_MAP[condition] + ".png";
		button.toolTip = tooltip;
		button.badge = temperature;
	}
};

/* Button click listener; update button and then display radar, etc, information */
function displayWeather(event) {
	if (event.command !== TOOLBAR_IDENTIFIER && event.command !== CTXMENU_IDENTIFIER) return;
	
	updateWeather();
	
	if (event.command === CTXMENU_IDENTIFIER) {
		var newTab = safari.application.activeBrowserWindow.openTab("foreground", safari.application.activeBrowserWindow.tabs.length);
		newTab.url = moreInfoURL;
	}
	
}

/* Call our button's validate */
function dispatchValidate() {
	var toolbarItems = safari.extension.toolbarItems;
	for (var i = 0; i < toolbarItems.length; ++i) {
		if (toolbarItems[i].command === TOOLBAR_IDENTIFIER) {
			toolbarItems[i].validate();
			break;
		}
	}
}


/* Get the contextual menu item */
function updateContextualMenu(event) {
	var ctxMenus = event.contextMenu.contextMenuItems;
	for (var i = 0; i < ctxMenus.length; ++i) {
		if (ctxMenus[i].command === CTXMENU_IDENTIFIER) {
			var toolbarVisibility = isToolbarItemVisible();
			if (toolbarVisibility === false) {
				updateWeather();
			}
			ctxMenus[i].title = tooltip;
			break;
		}
	}
}


/* Determine if toolbar item is displayed */
function isToolbarItemVisible() {
	var toolbarItems = safari.extension.toolbarItems;
	for (var i = 0; i < toolbarItems.length; ++i) {
		if (toolbarItems[i].command === TOOLBAR_IDENTIFIER) {
			return true;
		}
	}
	return false;
}

/* XHR the preferred site and parse it out */
function updateWeather() {
	var XHR = new XMLHttpRequest();

	XHR.onreadystatechange = function() {
		var forecast, displayLocation, observationLocation, city, state, time, heatIndex, dewPoint,
		    cityName = null;
		if(this.readyState == 4 && this.status == 200) {
			var XML = XHR.responseXML;
			if (site === "wunder") {
				var stationID = XML.getElementsByTagName("icao")[0].firstChild.nodeValue;
				var count     = 0;
				secondaryURL  = secondaryURL.replace("%s%", stationID);
				XHR.onreadystatechange = function() {
					if(this.readyState == 4 && this.status == 200) {
						var secondaryXML        = XHR.responseXML;
						forecastURL = forecastURL.replace("%z%", zip);
						XHR.onreadystatechange = function() {
							if(this.readyState == 4 && this.status == 200) {
								var forecast            = XHR.responseXML;
								var displayLocation     = secondaryXML.getElementsByTagName("display_location")[0];
								var observationLocation = secondaryXML.getElementsByTagName("observation_location")[0];
								var city                = observationLocation.getElementsByTagName("city")[0].firstChild.nodeValue;
								var state               = displayLocation.getElementsByTagName("state")[0].firstChild.nodeValue;
								var time                = secondaryXML.getElementsByTagName("local_time")[0].firstChild.nodeValue;
								var heatIndex           = secondaryXML.getElementsByTagName("heat_index_" + unitOfMeasure)[0].firstChild.nodeValue;
								var dewPoint            = secondaryXML.getElementsByTagName("dewpoint_" + unitOfMeasure)[0].firstChild.nodeValue;
								
								city = city + ", " + state + " (" + zip + ")";
								time = time.split(" ");
								time = time[2] + " " + time[3];
								
								temperature = secondaryXML.getElementsByTagName("temp_" + unitOfMeasure)[0].firstChild.nodeValue;
								condition = secondaryXML.getElementsByTagName("weather")[0].firstChild.nodeValue.toLowerCase();
								
								if (condition.indexOf("heavy") > -1 || condition.indexOf("light") > -1) {
									condition = condition.split(" ")[1];
								}
								
								if (CONDITION_MAP[condition] === null || CONDITION_MAP[condition] === undefined) {
									condition = "unknown";
								} else if (CONDITION_MAP[condition] == "clear") {
									var moon = forecast.getElementsByTagName("percentIlluminated")[0].firstChild.nodeValue;
									condition = getClearConditions(forecast, moon, site);
								}
								
								tooltip = time + " " + city + ": " + condition + ", " +
													   temperature + "\u00B0" + unitOfMeasure + ", ";

								if (heatIndex !== "NA")
									tooltip += "heat index: " + heatIndex + "\u00B0" + unitOfMeasure + ", ";
								
								tooltip += "dew point: " + dewPoint + "\u00B0" + unitOfMeasure;

								dispatchValidate();
							}
						};
						XHR.open("GET", forecastURL);
						XHR.send();
					}
				};
				XHR.open("GET", secondaryURL);
				XHR.send();
			} else if (site === "weather") {
				var currentConditions = XML.getElementsByTagName("cc")[0];
				var location = XML.getElementsByTagName("loc")[0];
				var forecast = XML.getElementsByTagName("dayf")[0];
				var today    = forecast.getElementsByTagName("day")[0];
				
				var cityName = location.getElementsByTagName("dnam")[0].firstChild.nodeValue;
				var time     = location.getElementsByTagName("tm")[0].firstChild.nodeValue;
				
				var heatIndex = currentConditions.getElementsByTagName("flik")[0].firstChild.nodeValue;
				var dewPoint = currentConditions.getElementsByTagName("dewp")[0].firstChild.nodeValue;

				temperature = XML.getElementsByTagName("tmp")[0].firstChild.nodeValue;
				condition = currentConditions.getElementsByTagName("t")[0].firstChild.nodeValue.toLowerCase();

				if (condition.indexOf("heavy") > -1 || condition.indexOf("light") > -1) {
					condition = condition.split(" ")[1];
				}
				
				if (CONDITION_MAP[condition] === null || CONDITION_MAP[condition] === undefined) {
					condition = "unknown";
				} else if (CONDITION_MAP[condition] == "clear") {
					var moon = currentConditions.getElementsByTagName("moon")[0].getElementsByTagName("t")[0].firstChild.nodeValue.toLowerCase();
					condition = getClearConditions(today, moon, site);
				}

				tooltip = time + " " + cityName + ": " + condition + ", " + 
						  temperature + "\u00B0" + unitOfMeasure + ", ";
				
				if (heatIndex !== temperature) 
					tooltip += "heat index: " + heatIndex + "\u00B0" + unitOfMeasure + ", ";
				
				tooltip += "dew point: " + dewPoint + "\u00B0" + unitOfMeasure;

				dispatchValidate();
			}
		}
	};
	
	XHR.open("GET", url);
	XHR.send();
}

function formatURL() {
	var url = safari.extension.settings.getItem(site + "URL");
	
	/* Some more settings for weather.com's API */
	if (site == "weather") {
		var licenseKey = safari.extension.settings.getItem(site + "LicenseKey");
		var partnerID = safari.extension.settings.getItem(site + "PartnerID");
		url = url.replace("%p%", partnerID);
		url = url.replace("%k%", licenseKey);
		if (unitOfMeasure == "c")
			url = url.replace("%u%", "unit=m");
		else
			url = url.replace("%u%", "");
	}
	
	url = url.replace("%z%", zip);

	return url;
}

function formatMoreInfoURL() {
	var moreInfoURL = safari.extension.settings.getItem(site + "MoreInfoURL");
	moreInfoURL = moreInfoURL.replace("%z%", zip);
	return moreInfoURL;
}

function getClearConditions(dateXML, moon, site) {
	var sunsetTime, sunriseTime, forecastDate, currentDate, 
		sunsetDateString, sunriseDateString, result = null;
	if (site === "wunder") {
		var simpleForecast = dateXML.getElementsByTagName("simpleforecast")[0];
		sunsetTime         = dateXML.getElementsByTagName("sunset")[0].getElementsByTagName("hour")[0].firstChild.nodeValue
						     + ":" + 
						     dateXML.getElementsByTagName("sunset")[0].getElementsByTagName("minute")[0].firstChild.nodeValue;

		sunriseTime        = dateXML.getElementsByTagName("sunrise")[0].getElementsByTagName("hour")[0].firstChild.nodeValue
						     + ":" + 
						     dateXML.getElementsByTagName("sunrise")[0].getElementsByTagName("minute")[0].firstChild.nodeValue;

		forecastDateString = simpleForecast.getElementsByTagName("forecastday")[0].getElementsByTagName("month")[0].firstChild.nodeValue
						     + "/" +
						     simpleForecast.getElementsByTagName("forecastday")[0].getElementsByTagName("day")[0].firstChild.nodeValue
						     + "/" +
						     simpleForecast.getElementsByTagName("forecastday")[0].getElementsByTagName("year")[0].firstChild.nodeValue;
						   
		currentDate        = new Date();
		sunsetDateString   = forecastDateString + " " +
							 sunsetTime;
		sunriseDateString  = forecastDateString + " " +
							 sunriseTime;

		sunsetDate  = new Date(sunsetDateString);
		sunriseDate = new Date(sunriseDateString);
		
		if (Date.parse(currentDate) > Date.parse(sunriseDate) && Date.parse(currentDate) < Date.parse(sunsetDate)) {
			result = "sunny";
		} else if (Date.parse(currentDate) < Date.parse(sunriseDate)) {
			result = findNearestMoonPhase(moon);
		} else if (Date.parse(currentDate) > Date.parse(sunsetDate)) {
			result = findNearestMoonPhase(moon);
		}
	} else if (site == "weather") {
		sunsetTime       = dateXML.getElementsByTagName("suns")[0].firstChild.nodeValue;
		sunriseTime      = dateXML.getElementsByTagName("sunr")[0].firstChild.nodeValue;

		forecastDate     = dateXML.attributes.getNamedItem("dt").value.split(" ");
		currentDate      = new Date();
		sunsetDateString = MONTH_NAMES[forecastDate[0]] + "/" 
							   + forecastDate[1] + "/" 
							   + currentDate.getFullYear() + " " +
							   sunsetTime;
		sunriseDateString = MONTH_NAMES[forecastDate[0]] + "/" 
							   + forecastDate[1] + "/" 
							   + currentDate.getFullYear() + " " +
							   sunriseTime;

		sunsetDate  = new Date(sunsetDateString);
		sunriseDate = new Date(sunriseDateString);
		
		if (Date.parse(currentDate) > Date.parse(sunriseDate) && Date.parse(currentDate) < Date.parse(sunsetDate)) {
			result = "sunny";
		} else if (Date.parse(currentDate) < Date.parse(sunriseDate)) {
			result = moon;
		} else if (Date.parse(currentDate) > Date.parse(sunsetDate)) {
			result = moon;
		}
	} else {
		result = "sunny";
	}
	return result;
}

function findNearestMoonPhase(percent) {
	var diffs = [];
	var keys  = [];
	
	// calculate closest moon phase.
	for( var i in MOON_PHASES)
		diffs[Math.abs(percent - i)] = i;
	
	// sort keys
	for (k in diffs) {
		if (diffs.hasOwnProperty(k)) {
			keys.push(k);
		}
	}
	
	keys.sort(function (a, b){
		return (a - b);
	});
	
	// get the nearest moon phase.
	return MOON_PHASES[diffs[keys[0]]].toLowerCase();
}