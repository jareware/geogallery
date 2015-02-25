var fs = require('fs');

[
    '20140526 Mon.gpx',
    '20140527 Tue.gpx',
    '20140528 Wed.gpx',
    '20140529 Thu.gpx',
    '20140530 Fri.gpx',
    '20140531 Sat.gpx',
    '20140601 Sun.gpx',
    '20140602 Mon.gpx',
    '20140603 Tue.gpx',
    '20140604 Wed.gpx',
    '20140605 Thu.gpx',
    '20140606 Fri.gpx',
].forEach(function(inputFileName) {
    var date = inputFileName.replace(/^(\d{4})(\d{2})(\d{2}).*$/, '$1-$2-$3');
    extractTracks(date, '/path/to/GPS/' + inputFileName, 'tracks.json');
    console.log(date + ' done');
});

function extractTracks(date, inputFile, outputFile) {

    var segments = (fs.readFileSync(inputFile) + '')
        .split(/<\/trk>\s*<trk>/) // yes, I'm "parsing" XML with a regex, deal with it
        .map(function(segmentString) {
            return {
                type: segmentString.match(/<name>\d+ (.*?)<\/name>/)[1],
                points: segmentString.match(/<trkpt [^>]+>/g).map(function(trkptString) {
                    return [
                        parseFloat(trkptString.match(/lat="(\d+\.\d+)"/)[1]),
                        parseFloat(trkptString.match(/lon="(\d+\.\d+)"/)[1])
                    ];
                })
            };
        });

    var existingDB = JSON.parse(fs.readFileSync(outputFile));

    fs.writeFileSync(outputFile, JSON.stringify(existingDB.concat({
        date: date,
        segments: segments
    }), undefined, 4));

}