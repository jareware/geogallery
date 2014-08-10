var path = require('path');
var fs = require('fs');
var exec = require('child_process').exec;

var INPUT_PATHS = [ 'images', 'videos' ];
var DEFAULT_TIMEZONE = '+00:00';
var EXIFTOOL_CMD = 'exiftool -GPSPosition -CreateDate -ImageDescription -coordFormat "%+.6f" -dateFormat "%Y-%m-%d %H:%M:%S" -json';
var OUTPUT_FILE = 'media.json';

processFiles(INPUT_PATHS, function(err, mediaItems) {
    if (err) {
        console.log('ERROR:', err);
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
    var inputFiles = listFiles(fromPaths).filter(function(fileName) {
        return path.extname(fileName).toLowerCase() === '.jpg';
    });
    var outputItems = [];
    inputFiles.forEach(function(fileName) {
        processImageFile(fileName, function(err, mediaItem) {
            if (err) return callback(err);
            outputItems.push(mediaItem);
            if (outputItems.length === inputFiles.length) callback(null, outputItems);
        })
    });
}

function processImageFile(fileName, callback) {
    var cmd = EXIFTOOL_CMD + ' "' + fileName + '"';
    exec(cmd, function(err, stdout) {
        try {
            if (err) throw err;
            var exif = JSON.parse(stdout)[0];
            callback(null, {
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

function groupMediaItems(mediaItems) {
    var groups = {};
    mediaItems.forEach(function(item) {
        var groupID = item.timestamp.split(' ')[0];
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
        group.title = 'Day ' + (index + 1);
        group.media.sort(function(a, b) {
            return a.timestamp > b.timestamp ? 1 : -1;
        });
    });
    return groups;
}
