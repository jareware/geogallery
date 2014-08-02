var path = require('path');
var fs = require('fs');
var exec = require('child_process').exec;

var INPUT_PATH = '/path/to/source';
var EXIFTOOL_CMD = 'exiftool -GPSPosition -CreateDate -ImageDescription -coordFormat "%+.6f" -dateFormat "%Y-%m-%d %H:%M:%S+00:00" -json';
var EXEC_COUNT = 8;
var OUTPUT_FILE = 'media.json';

var commands = fs.readdirSync(INPUT_PATH).filter(function(fileName) {
    return path.extname(fileName).toLowerCase() === '.jpg';
}).map(function(fileName) {
    return 'cd "' + INPUT_PATH + '"; ' + EXIFTOOL_CMD + ' "' + fileName + '"';
});

function getExecutor(maybeDone) {
    return function next() {
        if (commands.length) {
            exec(commands.pop(), function(err, stdout) {
                if (err) {
                    console.log(err);
                } else {
                    results.push(stdout);
                    next();
                }
            });
        } else {
            maybeDone();
        }
    }
}

var count = commands.length;
var results = [];

new Array(EXEC_COUNT + 1).join('x').split('').forEach(function() {
    getExecutor(function() {
        if (results.length === count) {
            done(results);
        }
    })();
});

function done(results) {
    var groups = {};
    results.map(function(string) {
        return JSON.parse(string)[0];
    }).map(function(result) {
        return {
            url: 'images/' + result.SourceFile,
            timestamp: result.CreateDate,
            comment: (result.ImageDescription || '').trim(),
            location: result.GPSPosition ? result.GPSPosition.split(', ').map(parseFloat) : null
        };
    }).forEach(function(image) {
        var groupID = image.timestamp.split(' ')[0];
        if (!groups[groupID]) {
            groups[groupID] = {
                groupID: groupID,
                title: '',
                description: '',
                media: []
            };
        }
        groups[groupID].media.push(image);
    });
    groups = Object.keys(groups).map(function(key) {
        return groups[key];
    }).sort(function(a, b) {
        return a.groupID > b.groupID ? 1 : -1;
    });
    groups.forEach(function(group, index) {
        group.title = 'Day ' + (index + 1);
        group.media.sort(function(a, b) {
            return a.timestamp > b.timestamp ? 1 : -1;
        });
    });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(groups, undefined, 4));
}
