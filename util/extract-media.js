var path = require('path'); // http://nodejs.org/api/path.html
var fs = require('fs'); // http://nodejs.org/api/fs.html
var exec = require('child_process').exec;

var INPUT_PATHS = [ 'images', 'videos' ];
var DEFAULT_TIMEZONE = '+09:00';
var DEFAULT_GROUP = 'Ungrouped';
var EXIFTOOL_CMD = 'exiftool -GPSPosition -CreateDate -ImageDescription -coordFormat "%+.6f" -dateFormat "%Y-%m-%d %H:%M:%S " -json';
var OUTPUT_FILE = 'media.json';

processFiles(INPUT_PATHS, function(err, mediaItems) {
    if (err) {
        throw err;
    } else {
        var output = JSON.stringify(groupMediaItems(mediaItems), null, 4);
        fs.writeFileSync(OUTPUT_FILE, output);
    }
});

function listFiles(fromPaths) {
    return fromPaths.reduce(function(memo, fromPath) {
        return memo.concat(fs.readdirSync(fromPath).map(function(fileName) {
            return path.join(fromPath, fileName);
        }));
    }, []);
}

function processFiles(fromPaths, callback) {
    var outputItems = [];
    var checkIfDone = function(err, mediaItem) {
        if (err) return callback(err);
        outputItems.push(mediaItem);
        if (outputItems.length === inputCount) callback(null, outputItems);
    };
    var inputCount = listFiles(fromPaths).map(function(fileName) {
        switch (path.extname(fileName).toLowerCase()) {
            case '.jpg':
                processImageFile(fileName, checkIfDone);
                return true; // this file counts
            case '.mp4':
                processVideoFile(fileName, checkIfDone);
                return true; // this file counts
        }
        return false; // this file doesn't count
    }).filter(function(willBeProcessed) {
        return willBeProcessed;
    }).length;
}

function processImageFile(fileName, callback) {
    var cmd = EXIFTOOL_CMD + ' "' + fileName + '"';
    exec(cmd, function(err, stdout) {
        try {
            if (err) throw err;
            var exif = JSON.parse(stdout)[0];
            callback(null, {
                type: 'image',
                url: exif.SourceFile,
                timestamp: exif.CreateDate + DEFAULT_TIMEZONE,
                comment: (exif.ImageDescription || '').trim(),
                location: exif.GPSPosition ? exif.GPSPosition.split(', ').map(parseFloat) : null
            });
        } catch (e) {
            callback(e)
        }
    });
}

function processVideoFile(fileName, callback) {
    var item = {
        type: 'video',
        url: fileName,
        timestamp: [],
        comment: '',
        location: []
    };
    var candidate = path.join(path.dirname(fileName), path.basename(fileName, path.extname(fileName)) + '.srt');
    fs.readFile(candidate, function(err, subtitleContent) {
        if (err) return callback(null, item); // TODO: Implement default timestamp based on file created date..?
        (subtitleContent + '').split('\n\n').forEach(function(metadata) {
            metadata = metadata.split('\n');
            if (metadata[2] && metadata[3]) {
                item.timestamp.push(metadata[2]);
                var coords = parseWGS84String(metadata[3]);
                item.location.push([ coords.lat, coords.lng ]);
            }
        });
        callback(null, item);
    });
}

function timestampToString(item) {
    var ts = (Array.isArray(item.timestamp) ? item.timestamp[0] : item.timestamp) + '';
    if (!ts.match(/^\d+-\d+-\d+ \d+:\d+:\d+ [+-]\d+:\d+$/)) {
        throw new Error('Non-standard date "' + ts + '" encountered, expecting e.g. "2014-01-01 12:34:56 +3:00", related item is:\n' + JSON.stringify(item, undefined, 4));
    }
    return ts;
}

function generateGroupID(forItem) {
    var tsPieces = timestampToString(forItem).split(' ');
    var hourPart = new Date('1970-01-01 ' + tsPieces[1]).getHours();
    if (hourPart < 3) { // with timestamps between midnight and 03:00, group the images with the PREVIOUS date, as it usually makes more narrative sense
        return new Date(new Date(tsPieces[0]).getTime() - 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
    } else {
        return tsPieces[0];
    }
}

function groupMediaItems(mediaItems) {
    var groups = {};
    mediaItems.forEach(function(item) {
        var groupID = generateGroupID(item) || DEFAULT_GROUP;
        if (!groups[groupID]) {
            groups[groupID] = {
                groupID: groupID,
                title: '',
                description: '',
                media: []
            };
        }
        groups[groupID].media.push(item);
    });
    groups = Object.keys(groups).map(function(key) {
        return groups[key];
    }).sort(function(a, b) {
        return a.groupID > b.groupID ? 1 : -1;
    });
    groups.forEach(function(group, index) {
        group.title = group.groupID === DEFAULT_GROUP ? DEFAULT_GROUP : 'Day ' + (index + 1);
        group.media.sort(function(a, b) {
            return timestampToString(a) > timestampToString(b) ? 1 : -1;
        });
    });
    return groups;
}

/**
 * Converts the given string representation of WGS84 coordinates into a standard lat/lng object.
 *
 * @example 60 deg 08.2151' N, 24 deg 25.6136' E
 * @example 43°38'19.39"N,116°14'28.86"W
 * @example +43.6387194°, -116.2413500°
 *
 * For convenience (and to avoid "Cannot read property 'lat' of undefined" errors), always returns an
 * object with the aforementioned keys. For invalid input, the VALUES of the keys will be undefined.
 *
 * @returns https://developers.google.com/maps/documentation/javascript/reference#LatLngLiteral
 *
 * @link https://gist.github.com/jareware/083ecc072bab29130415
 * @author Jarno Rantanen <jarno@jrw.fi>
 * @license Do whatever you want with it
 */
function parseWGS84String(input) {
    return (typeof input === 'string' ? input : '0,0').replace(/deg/gi, '°').split(',').map(function(part) {
        return (part.match(/([+-]?\d+(?:\.\d+)?\s*[°'"]|[nesw])+?/gi) || []).reduce(function(memo, component) {
            var unit = component && component[component.length - 1].toUpperCase();
            var power = '°\'"'.indexOf(unit);
            if (power >= 0) {
                return (memo || 0) + parseFloat(component) / Math.pow(60, power);
            } else if ('SW'.indexOf(unit) >= 0) {
                return (memo || 0) * -1;
            }
            return memo;
        }, null);
    }).reduce(function(memo, part, index) {
        memo[index ? 'lng' : 'lat'] = typeof part === 'number' ? part : undefined;
        return memo;
    }, { lat: undefined, lng: undefined });
}
