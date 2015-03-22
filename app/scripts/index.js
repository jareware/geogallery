(function bootstrap(modules) {
    var todo = Object.keys(modules);
    (function next(api) {
        var module = todo.shift();
        if (!module) { return } // all done!
        modules[module](api, function(declarations) {
            if (declarations) {
                api[module] = {};
                Object.keys(declarations).forEach(function(key) {
                    api[module][key] = declarations[key];
                });
            }
            next(api);
        });
    })({});
})({

    config: function(api, declare) {

        declare({
            DAY_THEME_PALETTE: [
                '#ff406e',
                '#E2655E',
                '#8fcc67',
                '#6faa3c',
                '#5c9fa3',
                '#5685a3',
                '#91aeb8'
            ],
            TRAVEL_TYPE_COLORS: {
                WALK: '#DB3340',
                BUS: '#1BB4D6',
                METRO: '#5EB240',
                TAXI: '#FF0295',
                CABLECAR: '#069E9E',
                unknown: '#E0E4CC'
            },
            PRELOAD_BUFFER: 5 // how many media elements to load in addition to the current one
        });

    },

    dom: function(api, declare) {

        /**
         * Utility function for generating HTML/XML DOM trees in the browser.
         *
         * Returns a node with the given name. The rest are var-args, so that:
         *
         * - an object sets attributes as key/value-pairs
         * - a string/number/boolean sets the text content of the node
         * - a node is treated as a child node
         * - an array is treated as a list of child nodes
         *
         * For convenience, falsy values in the list of children are ignored.
         *
         * There's three special cases for the name argument:
         *
         * - when "", a text node is created, with content from the 2nd arg
         * - when "<!", a comment node is created, with content from the 2nd arg
         * - when an existing node, that node is used instead of creating a new one
         *
         * @example el('p',
         *              el('<!', 'this is a comment'),
         *              el('a', 'Click here', {
         *                  href: '#some-location'
         *              }),
         *              el('', 'Text after link')
         *          );
         *
         * @example el('ul',
         *              [ 1, 2, 3, 4, 5 ].map(function(i) {
         *                  if (i % 2) return el('li', i);
         *              })
         *          );
         *
         * @example el(document.querySelector('#existing-root'),
         *              el('p', 'New node added under root')
         *          );
         *
         * @returns https://developer.mozilla.org/en-US/docs/Web/API/element
         *
         * @link https://gist.github.com/jareware/8dc0cc1a948c122edce0
         * @author Jarno Rantanen <jarno@jrw.fi>
         * @license Do whatever you want with it
         */
        function el(name) {
            function isNode(n) {
                return typeof n === 'object' && n.nodeType && n.nodeName;
            }
            if (name === '<!') {
                return document.createComment(arguments[1]);
            } else if (name === '') {
                return document.createTextNode(arguments[1]);
            }
            var node = isNode(name) ? name : document.createElement(name);
            Array.prototype.slice.call(arguments, 1).forEach(function(arg) {
                if (arg instanceof Array) {
                    arg.forEach(function(child) {
                        child && node.appendChild(child);
                    });
                } else if (typeof arg === 'object') {
                    if (isNode(arg)) {
                        node.appendChild(arg);
                    } else {
                        Object.keys(arg).forEach(function(key) {
                            node.setAttribute(key, arg[key]);
                        });
                    }
                } else if ([ 'string', 'number', 'boolean' ].indexOf(typeof arg) >= 0) {
                    node.textContent = arg;
                }
            });
            return node;
        }

        declare({
            el: el,
            document: document,
            body: document.body,
            header: document.querySelector('header'),
            main: document.querySelector('main'),
            aside: document.querySelector('aside'),
            map: document.getElementById('map-container'),
            legend: document.querySelector('aside > ul'),
            dayList: document.querySelector('header > .header-days ul')
        });

    },

    data: function(api, declare) {

        function getJSON(url, callback) {
            var request = new XMLHttpRequest();
            request.open('GET', url, true);
            request.onload = function() {
                if (request.status >= 200 && request.status < 400 || document.location.protocol === 'file:') { // with "file:" protocol, there's no response status
                    callback(JSON.parse(request.responseText));
                } else {
                    throw new Error('Server returned an error');
                }
            };
            request.onerror = function() {
                throw new Error('Connection error');
            };
            request.send();
        }

        function getParallel(map, callback) {
            var done = {};
            Object.keys(map).forEach(function(key) {
                getJSON(map[key], function(data) {
                    done[key] = data;
                    if (Object.keys(done).length === Object.keys(map).length) {
                        callback(done);
                    }
                });
            });
        }

        getParallel({
            config: 'config.json',
            media: 'media.json',
            tracks: 'tracks.json'
        }, function(data) {
            data.getByGroupID = function(array, groupID) {
                var match = array.filter(function(group) {
                    return group.groupID === groupID;
                });
                return match.length === 1 ? match[0] : null;
            };
            data.getMediaByEl = function(mediaEl) {
                var group = api.data.getByGroupID(api.data.media, mediaEl.dataset.groupID);
                var url = mediaEl.dataset.src;
                var match = group.media.filter(function(mediaItem) {
                    return mediaItem.url === url;
                });
                return match.length === 1 ? match[0] : null;
            };
            declare(data);
        });

    },

    header: function(api, declare) {

        var el = api.dom.el;
        var plt = api.config.DAY_THEME_PALETTE;

        Object.keys(api.data.config.headerContent).forEach(function(key) {
            api.dom.header.querySelector('#config-' + key).innerText = api.data.config.headerContent[key];
        });

        el(api.dom.header.querySelector('#config-infoBoxContent'),
            Object.keys(api.data.config.infoBoxContent).map(function(key) {
                return el('li',
                    el('div', { 'class': 'spec-title' }, key),
                    el('div', api.data.config.infoBoxContent[key])
                );
            })
        );

        api.data.media.forEach(function(group, index) {
            api.dom.dayList.appendChild(
                el('li', { style: 'background-image: url("' + group.thumbnailURL + '")', 'data-link': group.media[0].url }, [
                    el('div', { 'class': 'overlay-layer', style: 'background: ' + plt[index % plt.length] }),
                    el('div', { 'class': 'day-title' }, group.title)
                ])
            );
        });

        declare();

    },

    legend: function(api, declare) {

        var lookup = {};

        Object.keys(api.config.TRAVEL_TYPE_COLORS).forEach(function(key) {
            var el = document.createElement('li');
            el.innerText = key;
            el.style.color = api.config.TRAVEL_TYPE_COLORS[key];
            api.dom.legend.appendChild(el);
            lookup[key] = el;
        });

        declare({
            updateVisibleTypes: function(types) {
                Object.keys(lookup).forEach(function(key) {
                    lookup[key].classList.toggle('active', types.indexOf(key) !== -1);
                });
            }
        });

    },

    map: function(api, declare) {

        var map = new google.maps.Map(api.dom.map, {
            center: new google.maps.LatLng(0, 0), // TODO: Add more sensible default..?
            zoom: 8
        });

        var marker;

        // @example coordinates = "37.551,126.988"
        // @example coordinates = [37.551,126.988]
        function updateMarker(coordinates) {
            if (!coordinates) {
                if (marker) {
                    marker.setMap(null); // remove previous marker
                }
                return;
            }
            if (typeof coordinates === 'string') {
                coordinates = coordinates.split(',').map(parseFloat);
            }
            coordinates = {
                lat: coordinates[0],
                lng: coordinates[1]
            };
            if (marker) {
                marker.setPosition(coordinates);
            } else {
                marker = new google.maps.Marker({
                    position: coordinates, // or: new google.maps.LatLng(0, 0),
                    map: map
                });
            }
            map.panTo(coordinates);
        }

        var polylines;
        var currentlyDrawnGroupID;

        function updatePolyline(groupID) {
            if (groupID === currentlyDrawnGroupID) { return }
            currentlyDrawnGroupID = groupID;
            var group = api.data.getByGroupID(api.data.tracks, groupID);
            if (!group) { return }
            if (polylines) {
                polylines.forEach(function(polyline) {
                    polyline.setMap(null); // remove from map
                });
            }
            var bounds = new google.maps.LatLngBounds();
            polylines = group.segments.map(function(segment) {
                var coords = segment.points.map(function(pointTuple) {
                    return new google.maps.LatLng(pointTuple[0], pointTuple[1]);
                });
                var polyLine = new google.maps.Polyline({
                    path: coords,
                    geodesic: true,
                    strokeColor: api.config.TRAVEL_TYPE_COLORS[segment.type] || api.config.TRAVEL_TYPE_COLORS.unknown,
                    strokeOpacity: 1.0,
                    strokeWeight: 4
                });
                polyLine.setMap(map);
                coords.forEach(function(c) {
                    bounds.extend(c);
                });
                return polyLine;
            });
            map.fitBounds(bounds);
            api.legend.updateVisibleTypes(group.segments.map(function(segment) {
                return segment.type;
            }));
        }

        // @see https://developer.mozilla.org/en-US/docs/Web/Guide/Events/Media_events
        function videoTimeUpdated() {
            var timeIndex = Math.round(currentlyFocused.currentTime);
            var location = currentMediaLocations[timeIndex] || currentMediaLocations[currentMediaLocations.length - 1];
            updateMarker(location);
        }

        var currentlyFocused;
        var currentMediaLocations;

        declare({
            focusMediaItem: function(mediaEl) {
                if (!mediaEl || currentlyFocused === mediaEl) {
                    return;
                }
                if (currentlyFocused && currentlyFocused.tagName === 'VIDEO') {
                    currentlyFocused.removeEventListener('timeupdate', videoTimeUpdated);
                }
                if (mediaEl.tagName === 'VIDEO') {
                    mediaEl.addEventListener('timeupdate', videoTimeUpdated);
                    currentMediaLocations = api.data.getMediaByEl(mediaEl).location;
                    updateMarker(currentMediaLocations[0]);
                } else {
                    updateMarker(mediaEl.dataset.location);
                }
                updatePolyline(mediaEl.dataset.groupID);
                currentlyFocused = mediaEl;
            }
        });

    },

    scroll: function(api, declare) {

        var scrollResetTimeout;
        var animationEndTimeout;
        var ignoreNextScroll = false;
        var scrollHandlers = [];
        var syntheticScrollTop = 0;

        function onScroll() {
            scrollHandlers.forEach(function(handler) {
                handler(syntheticScrollTop || api.dom.body.scrollTop);
            });
        }

        api.dom.document.addEventListener('scroll', function() {
            if (ignoreNextScroll) {
                ignoreNextScroll = false;
            } else {
                onScroll();
            }
        });

        declare({
            on: function(handler) {
                scrollHandlers.push(handler); // handlers are invoked on natural scroll events, plus at the end of a synthetic "smooth-scroll"
                window.setTimeout(handler, 1); // for convenience, invoke each handler on boot, too
            },
            to: function(el) {
                if (!el) { return }
                var currentScrollTop = api.dom.body.scrollTop;
                var wantedScrollTop = syntheticScrollTop = Math.round(api.dom.header.offsetHeight + el.offsetTop - (window.innerHeight / 2) + (el.offsetHeight / 2));
                api.dom.body.style.top = (currentScrollTop - wantedScrollTop) + 'px';
                window.clearTimeout(animationEndTimeout);
                window.clearTimeout(scrollResetTimeout);
                animationEndTimeout = window.setTimeout(onScroll, 500);
                scrollResetTimeout = window.setTimeout(function() {
                    ignoreNextScroll = true;
                    syntheticScrollTop = 0;
                    api.dom.body.classList.add('without-transition');
                    api.dom.body.style.top = 0;
                    api.dom.body.scrollTop = wantedScrollTop;
                    api.dom.body.classList.remove('without-transition');
                }, 1000);
            }
        });

    },

    aside: function(api, declare) {

        var asideToggleAt = api.dom.header.offsetHeight + api.dom.header.offsetTop;
        var aside = api.dom.aside;

        function onScroll(scrollTop) {
            if (scrollTop > asideToggleAt && !aside.classList.contains('active')) {
                aside.classList.add('active');
            } else if (scrollTop <= asideToggleAt && aside.classList.contains('active')) {
                aside.classList.remove('active');
            }
        }

        api.scroll.on(onScroll);

        var currentlyFocused;
        var currentMediaTimestamps;

        function getReadableDate(date) {
            var dateObj = new Date(date.split(' ').slice(0,2).join(' ')); // drop the TZ info (display as if local time)
            var weekdays = [ 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            var months = [ 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

            function addZeroPad(minutes) {
                if (parseInt(minutes, 10) < 10) { minutes = '0' + minutes; }
                return minutes;
            }

            return '<span>' + weekdays[dateObj.getDay()] + '</span> &nbsp;&nbsp;&nbsp;&nbsp;' + months[dateObj.getMonth()] + ' ' + dateObj.getDate() + ' &nbsp&nbsp&nbsp' + dateObj.getFullYear() + '&nbsp;&nbsp;&nbsp;&nbsp; <span>' + dateObj.getHours() + ':' + addZeroPad(dateObj.getMinutes() + '</span>');
        }

        function showUpdatedTimestamp(timestamp) {
            aside.querySelector('div.image-info p:first-child').innerHTML = getReadableDate(timestamp);
        }

        // @see https://developer.mozilla.org/en-US/docs/Web/Guide/Events/Media_events
        function videoTimeUpdated() {
            var timeIndex = Math.round(currentlyFocused.currentTime);
            var timestamp = currentMediaTimestamps[timeIndex] || currentMediaTimestamps[currentMediaTimestamps.length - 1];
            showUpdatedTimestamp(timestamp);
        }

        declare({
            focusMediaItem: function(mediaEl) {
                if (!mediaEl || currentlyFocused === mediaEl) { return }
                var group = api.data.getByGroupID(api.data.media, mediaEl.dataset.groupID);
                if (!group) { return }
                var groupIndex = api.data.media.indexOf(group);
                aside.querySelector('h2').innerHTML = group.title + '<i class="fa fa-chevron-up"></i>';
                aside.querySelector('h2').style.background = api.config.DAY_THEME_PALETTE[groupIndex % api.config.DAY_THEME_PALETTE.length];
                aside.querySelector('div.image-info p:last-child').innerHTML = mediaEl.dataset.comment || '';

                // TODO: Sorry
                $(aside.querySelector('h2 i')).on('click', function() {
                    $(window).scrollTop(0);
                });

                if (currentlyFocused && currentlyFocused.tagName === 'VIDEO') {
                    currentlyFocused.removeEventListener('timeupdate', videoTimeUpdated);
                }
                if (mediaEl.tagName === 'VIDEO') {
                    mediaEl.addEventListener('timeupdate', videoTimeUpdated);
                    currentMediaTimestamps = api.data.getMediaByEl(mediaEl).timestamp;
                    showUpdatedTimestamp(currentMediaTimestamps[0]);
                } else {
                    showUpdatedTimestamp(mediaEl.dataset.timestamp);
                }
                api.map.focusMediaItem(mediaEl);
                currentlyFocused = mediaEl;
            }
        });

    },

    media: function(api, declare) {

        function createMediaEl(group, media) {
            var el;
            if (media.url.match(/\.(jpg)$/)) {
                el = document.createElement('img');
                el.dataset.src = media.url;
                el.dataset.groupID = group.groupID;
                el.dataset.location = media.location;
                el.dataset.timestamp = media.timestamp;
                el.dataset.comment = media.comment;
            } else if (media.url.match(/\.(mp4)$/)) {
                el = document.createElement('video');
                el.dataset.src = media.url;
                el.dataset.groupID = group.groupID;
                el.dataset.location = media.location;
                el.dataset.timestamp = media.timestamp;
                el.dataset.comment = media.comment;
                el.setAttribute('controls', 'controls');
                el.setAttribute('muted', 'muted');
            } else {
                el = document.createElement('pre');
                el.innerText = 'Unknown media type: ' + media.url;
            }
            return el;
        }

        api.data.media.forEach(function(group) {
            group.media.forEach(function(media) {
                api.dom.main.appendChild(createMediaEl(group, media));
            });
        });

        var asideWidth = api.dom.aside.offsetWidth;
        var firstMediaEl = api.dom.main.querySelector('img, video');
        var activeMediaEl;

        function setActiveEl(newMediaEl, withScroll) {

            if (!newMediaEl || !(newMediaEl.tagName === 'IMG' || newMediaEl.tagName === 'VIDEO') || newMediaEl === activeMediaEl) {
                return;
            }

            if (activeMediaEl) {
                activeMediaEl.classList.remove('active');
            }

            newMediaEl.classList.add('active');

            if (withScroll) {
                api.scroll.to(newMediaEl);
            }

            api.aside.focusMediaItem(newMediaEl);

            if (activeMediaEl && activeMediaEl.tagName === 'VIDEO') {
                activeMediaEl.pause();
            }

            if (newMediaEl.tagName === 'VIDEO') {
                newMediaEl.play();
            }

            activeMediaEl = newMediaEl;

            preloadMediaAsNeeded(activeMediaEl);

        }

        api.aside.focusMediaItem(firstMediaEl);

        preloadMediaAsNeeded(firstMediaEl);

        function preloadMediaAsNeeded(cursorEl) {

            for (var i = 0; i <= api.config.PRELOAD_BUFFER; i++) {
                if (!cursorEl.getAttribute('src')) {
                    cursorEl.setAttribute('src', cursorEl.dataset.src);
                    if (cursorEl.tagName === 'IMG') { // only images are classified as portrait/landscape
                        cursorEl.addEventListener('load', (function(el) {
                            return function() {
                                el.classList.add(el.naturalWidth > el.naturalHeight ? 'landscape' : 'portrait');
                            }
                        })(cursorEl));
                    }
                }
                if (!(cursorEl = cursorEl.nextSibling)) { break } // end of media list reached
            }

        }

        api.scroll.on(function() {
            setActiveEl(api.dom.document.elementFromPoint(asideWidth + (window.innerWidth - asideWidth) / 2, window.innerHeight / 2));
        });

        declare({
            goToNext: function() {
                setActiveEl(activeMediaEl ? activeMediaEl.nextSibling : firstMediaEl, true);
            },
            goToPrev: function() {
                setActiveEl(activeMediaEl ? activeMediaEl.previousSibling : null, true);
            },
            setActiveEl: setActiveEl
        });

    },

    headerDateNavi: function(api, declare) {

        $(api.dom.dayList).on('click', 'li', function() {
            var link = $(this).data('link');

            var targetImage = $('img[data-src="' + link + '"]')[0];
            api.media.setActiveEl(targetImage, true);
        });

        declare();

    },

    keyboard: function(api, declare) {

        api.dom.document.addEventListener('keydown', function(event) {
            switch (event.keyCode) {
                case 40: // down
                    api.media.goToNext();
                    event.preventDefault();
                    break;
                case 38: // up
                    api.media.goToPrev();
                    event.preventDefault();
                    break;
                case 37: // left
                    break;
                case 39: // right
                    break;
            }
        });

        declare();

    },

    publish: function(api, declare) {

        window.api = api;

        declare();

    }

});
