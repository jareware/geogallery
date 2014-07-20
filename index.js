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
            }
        });

    },

    dom: function(api, declare) {

        declare({
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
                if (request.status >= 200 && request.status < 400){
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
                    lookup[key].className = (types.indexOf(key) !== -1) ? 'active' : '';
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
            // map.panTo(coordinates);
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
                handler(syntheticScrollTop);
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
                var wantedScrollTop = syntheticScrollTop = api.dom.header.offsetHeight + el.offsetTop - (window.innerHeight / 2) + (el.offsetHeight / 2);
                api.dom.body.style.top = (currentScrollTop - wantedScrollTop) + 'px';
                window.clearTimeout(animationEndTimeout);
                window.clearTimeout(scrollResetTimeout);
                animationEndTimeout = window.setTimeout(onScroll, 500);
                scrollResetTimeout = window.setTimeout(function() {
                    ignoreNextScroll = true;
                    api.dom.body.className = 'without-transition';
                    api.dom.body.style.top = 0;
                    api.dom.body.scrollTop = wantedScrollTop;
                    api.dom.body.className = '';
                }, 2500);
            }
        });

    },

    aside: function(api, declare) {

        var asideToggleAt = api.dom.header.offsetHeight + api.dom.header.offsetTop;
        var aside = api.dom.aside;

        function onScroll(scrollTop) {
            if (scrollTop > asideToggleAt && !aside.className) {
                aside.className = 'active';
            } else if (scrollTop <= asideToggleAt && aside.className === 'active') {
                aside.className = '';
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
                api.map.focusMediaItem(mediaEl);
            }
        });

    },

    media: function(api, declare) {

        var firstMediaEl;

        api.data.media.forEach(function(group) {
            group.media.forEach(function(media) {
                var el = document.createElement('img');
                el.setAttribute('src', media.url);
                el.dataset.groupID = group.groupID;
                el.dataset.location = media.location;
                el.dataset.timestamp = media.timestamp;
                api.dom.main.appendChild(el);
                firstMediaEl = firstMediaEl || el;
            });
        });

        var asideWidth = api.dom.aside.offsetWidth;

        function deactivateCurrent() {
            (api.dom.main.querySelector('img.active') || {}).className = '';
        }

        function onScroll() {
            var newTarget = api.dom.document.elementFromPoint(asideWidth + (window.innerWidth - asideWidth) / 2, window.innerHeight / 2);
            if (newTarget === api.dom.header) {
                deactivateCurrent();
                firstMediaEl.className = 'active';
                api.aside.focusMediaItem(firstMediaEl);
            } else if (newTarget.className !== 'active') {
                deactivateCurrent();
                newTarget.className = 'active';
                api.aside.focusMediaItem(newTarget);
            }
        }

        api.scroll.on(onScroll);

        firstMediaEl.className = 'active';
        api.aside.focusMediaItem(firstMediaEl);

        function scrollToMediaItem(mediaEl) {
            deactivateCurrent();
            if (!mediaEl) { return }
            mediaEl.className = 'active';
            api.aside.focusMediaItem(mediaEl);
            api.scroll.to(mediaEl);
        }

        function getCurrent() {
            return api.dom.main.querySelector('img.active') || {};
        }

        declare({
            goToNext: function() {
                scrollToMediaItem(getCurrent().nextSibling); // TODO: CHECK TYPE
            },
            goToPrev: function() {
                scrollToMediaItem(getCurrent().previousSibling); // TODO: CHECK TYPE
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
