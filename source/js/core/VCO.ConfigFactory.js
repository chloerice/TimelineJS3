/* VCO.ConfigFactory.js
 * Build TimelineConfig objects from other data sources
 */
;(function(VCO){
    /*
     * Convert a URL to a Google Spreadsheet (typically a /pubhtml version but somewhat flexible) into an object with the spreadsheet key (ID) and worksheet ID.

     If `url` is actually a string with no `/` characters, then it's assumed to be an ID
     already. If we had a more precise way of testing to see if the input argument was a valid key, we might apply it, but I don't know where that's documented.

     If we're pretty sure this isn't a bare key or a url that could be used to find a Google spreadsheet then return null.
     */
    function parseGoogleSpreadsheetURL(url) {
        parts = {
            key: null,
            worksheet: 0 // not really sure how to use this to get the feed for that sheet, so this is not ready except for first sheet right now
        }
        // key as url parameter (old-fashioned)
        var pat = /\bkey=([-_A-Za-z0-9]+)&?/i;
        if (url.match(pat)) {
            parts.key = url.match(pat)[1];
            // can we get a worksheet from this form?
        } else if (url.match("docs.google.com/spreadsheets/d/")) {
            var pos = url.indexOf("docs.google.com/spreadsheets/d/") + "docs.google.com/spreadsheets/d/".length;
            var tail = url.substr(pos);
            parts.key = tail.split('/')[0]
            if (url.match(/\?gid=(\d+)/)) {
                parts.worksheet = url.match(/\?gid=(\d+)/)[1];
            }
        } else if (url.indexOf('/') == -1) {
            parts.key = url;
        }

        if (parts.key) {
            return parts;
        } else {
            return null;
        }
    }

    function extractGoogleEntryData_V1(item) {
        var item_data = {}
        for (k in item) {
            if (k.indexOf('gsx$') == 0) {
                item_data[k.substr(4)] = item[k].$t;
            }
        }
        if (!item_data.startdate) {
            throw("All items must have a start date column.")
        }
        var d = {
            media: {
                caption: item_data.mediacaption || '',
                credit: item_data.mediacredit || '',
                url: item_data.media || '',
                thumb: item_data.mediathumbnail || ''
            },
            text: {
                headline: item_data.headline || '',
                text: item_data.text || ''
            },
            group: item_data.tag || '',
            type: item_data.type || ''
        }
        d['start_date'] = VCO.Date.parseDate(item_data.startdate);
        if (item.enddate) {
            d['end_date'] = VCO.Date.parseDate(item.enddate);
        }


        return d;
    }

    function extractGoogleEntryData_V3(item) {

        var item_data = {}
        for (k in item) {
            if (k.indexOf('gsx$') == 0) {
                item_data[k.substr(4)] = VCO.Util.trim(item[k].$t);
            }
        }
        var d = {
            media: {
                caption: item_data.mediacaption || '',
                credit: item_data.mediacredit || '',
                url: item_data.media || '',
                thumb: item_data.mediathumbnail || ''
            },
            text: {
                headline: item_data.headline || '',
                text: item_data.text || ''
            },
            start_date: {
                year: item_data.year,
                month: item_data.month || '',
                day: item_data.day || ''
            },
            end_date: {
                year: item_data.endyear || '',
                month: item_data.endmonth || '',
                day: item_data.endday || ''
            },
            display_date: item_data.displaydate || '',

            type: item_data.type || ''
        }

        if (item_data.time) {
            VCO.Util.extend(d.start_date,VCO.DateUtil.parseTime(item_data.time));
        }

        if (item_data.endtime) {
            VCO.Util.extend(d.end_date,VCO.DateUtil.parseTime(item_data.endtime));
        }


        if (item_data.group) {
            d.group = item_data.group;
        }

        if (d.end_date.year == '') {
            var bad_date = d.end_date;
            delete d.end_date;
            if (bad_date.month != '' || bad_date.day != '' || bad_date.time != '') {
                var label = d.text.headline ||
                trace("Invalid end date for spreadsheet row. Must have a year if any other date fields are specified.");
                trace(item);
            }
        }

        if (item_data.background) {
            if (item_data.background.match(/^(https?:)?\/\/?/)) { // support http, https, protocol relative, site relative
                d['background'] = { 'url': item_data.background }
            } else { // for now we'll trust it's a color
                d['background'] = { 'color': item_data.background }
            }
        }

        return d;
    }

    var getGoogleItemExtractor = function(data) {
        if (typeof data.feed.entry === 'undefined' 
                || data.feed.entry.length == 0) {
            throw('No data entries found.');
        }
        var entry = data.feed.entry[0];
        if (typeof entry.gsx$startdate !== 'undefined') {
            return extractGoogleEntryData_V1;
        } else if (typeof entry.gsx$year !== 'undefined') {
            return extractGoogleEntryData_V3;
        } else {
            throw('Invalid data format.');
        }
    }

    var buildGoogleFeedURL = function(parts) {
        return "https://spreadsheets.google.com/feeds/list/" + parts.key + "/1/public/values?alt=json";

    }

    var configFromGoogleURL = function(url) {
        var url = buildGoogleFeedURL(parseGoogleSpreadsheetURL(url));
            var timeline_config = { 'events': [] };
            var data = VCO.ajax({
                url: url, 
                async: false
            });
            data = JSON.parse(data.responseText);
            return googleFeedJSONtoTimelineConfig(data);
        }

    var googleFeedJSONtoTimelineConfig = function(data) {
        var timeline_config = { 'events': [] }
        var extract = getGoogleItemExtractor(data);
        for (var i = 0; i < data.feed.entry.length; i++) {
            var event = extract(data.feed.entry[i]);
            var row_type = 'event';
            if (typeof(event.type) != 'undefined') {
                row_type = event.type;
                delete event.type;
            }
            if (row_type == 'title') {
                timeline_config.title = event;
            } else {
                timeline_config.events.push(event);
            }
        };
        return timeline_config;

    }

    VCO.ConfigFactory = {
        // export for unit testing and use by authoring tool
        parseGoogleSpreadsheetURL: parseGoogleSpreadsheetURL,
        // export for unit testing
        googleFeedJSONtoTimelineConfig: googleFeedJSONtoTimelineConfig,


        fromGoogle: function(url) {
            console.log("VCO.ConfigFactory.fromGoogle is deprecated and will be removed soon. Use VCO.ConfigFactory.makeConfig(url,callback)")
            return configFromGoogleURL(url);

        },

        /*
         * Given a URL to a Timeline data source, read the data, create a TimelineConfig
         * object, and call the given `callback` function passing the created config as
         * the only argument. This should be the main public interface to getting configs
         * from any kind of URL, Google or direct JSON.
         */

        makeConfig: function(url, callback) {
            var key = parseGoogleSpreadsheetURL(url);  

            if (key) {
                var config = configFromGoogleURL(url);
                callback(config);

            }
        }

    }
})(VCO)
