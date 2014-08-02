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
            TRAVEL_TYPE_COLORS: {
                WALK: 'red',
                BUS: 'blue',
                METRO: 'orange',
                TAXI: 'yellow',
                CABLECAR: 'black',
                unknown: 'darkgray'
            },
            PRELOAD_BUFFER: 5 // how many media elements to load in addition to the current one
        });

    },

    dom: function(api, declare) {

        /**
         * Returns a node with the given name. The rest are var-args, so that:
         *
         * - an object sets attributes as key/value-pairs
         * - a string/number/boolean sets the text content of the node
         * - an array is treated as a list of child nodes
         *
         * As a special case, if the node name is "<!", a comment node is created,
         * with the following string as its content.
         *
         * For convenience, falsy values in the list of children are ignored.
         *
         * @todo https://developer.mozilla.org/en-US/docs/Web/API/document.createTextNode
         *
         * @example el('p', [
         *              el('a', 'Click here', {
         *                  href: '#some-location'
         *              })
         *          ]);
         *
         * @returns https://developer.mozilla.org/en-US/docs/Web/API/element
         *
         * @link https://gist.github.com/jareware/8dc0cc1a948c122edce0
         * @author Jarno Rantanen <jarno@jrw.fi>
         * @license Do whatever you want with it
         */
        function el(name) {
            var attributes = {}, text, children = [];
            Array.prototype.slice.call(arguments, 1).forEach(function(arg) {
                if (arg instanceof Array) {
                    children = arg;
                } else if (typeof arg === 'object') {
                    attributes = arg;
                } else if ([ 'string', 'number', 'boolean' ].indexOf(typeof arg) >= 0) {
                    text = arg;
                }
            });
            if (name === '<!') {
                return document.createComment(text);
            }
            var node = document.createElement(name);
            Object.keys(attributes).forEach(function(key) {
                node.setAttribute(key, attributes[key]);
            });
            if (text) {
                node.textContent = text;
            }
            children.forEach(function(child) {
                if (child) {
                    node.appendChild(child);
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
            legend: document.querySelector('aside > ul')
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
            media: 'media.json',
            tracks: 'tracks.json'
        }, function(data) {
            data.getByGroupID = function(array, groupID) {
                var match = array.filter(function(group) {
                    return group.groupID === groupID;
                });
                return match.length === 1 ? match[0] : null;
            };
            declare(data);
        });

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
        function updateMarker(coordinates) {
            if (marker) {
                marker.setMap(null); // remove previous marker
            }
            if (!coordinates) {
                return;
            }
            coordinates = {
                lat: parseFloat(coordinates.split(',')[0]),
                lng: parseFloat(coordinates.split(',')[1])
            };
            marker = new google.maps.Marker({
                position: coordinates, // or: new google.maps.LatLng(0, 0),
                map: map
            });
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

        var currentlyFocused;

        declare({
            focusMediaItem: function(mediaEl) {
                if (!mediaEl || currentlyFocused === mediaEl) { return }
                updateMarker(mediaEl.dataset.location);
                updatePolyline(mediaEl.dataset.groupID);
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

        declare({
            focusMediaItem: function(mediaEl) {
                if (!mediaEl || currentlyFocused === mediaEl) { return }
                currentlyFocused = mediaEl;
                var group = api.data.getByGroupID(api.data.media, mediaEl.dataset.groupID);
                if (!group) { return }
                api.dom.aside.querySelector('h2').innerText = group.title;
                api.dom.aside.querySelector('pre').innerText = mediaEl.dataset.timestamp + '\n' + (mediaEl.dataset.comment || '');
                api.map.focusMediaItem(mediaEl);
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
            }
        });

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
