import express from 'express';
import WebTorrent from 'webtorrent';
import request from 'request';

const router = express.Router();

//
//	1.	When the server starts create a WebTorrent client
//
const client = new WebTorrent();

//
//	2.	The object that holds the client stats to be displayed in the front end
//	using an API call every n amount of time using jQuery.
//
let stats = {
    progress: 0,
    downloadSpeed: 0,
    ratio: 0
}

//
//	3.	The variable that holds the error message from the client. Farly crude but
//		I don't expect to much happening hear aside the potential to add the same
//		Magnet Hash twice.
//
let error_message = "";

//
//	4.	Listen for any potential client error and update the above variable so
//		the front end can display it in the browser.
//
client.on('error', function(err) {

    error_message = err.message;

});

//
//	5.	Emitted by the client whenever data is downloaded. Useful for reporting the
//		current torrent status of the client.
//
client.on('download', function(bytes) {

    //
    //	1.	Update the object with fresh data
    //
    stats = {
        progress: Math.round(client.progress * 100 * 100) / 100,
        downloadSpeed: client.downloadSpeed,
        ratio: client.ratio
    }

});

//
//	API call that adds a new Magnet Hash to the client so it can start
//	downloading it.
//
//	magnet 		-> 	Magnet Hash
//
//	return 		<-	An array with a list of files
//
router.get('/add/:magnet', function(req, res) {

    //
    //	1.	Extract the magnet Hash and save it in a meaningful variable.
    //
    const magnet = req.params.magnet;

    //
    //	2.	Add the magnet Hash to the client
    //
    client.add(magnet, function (torrent) {

        //
        //	1.	The array that will hold the content of the Magnet Hash.
        //
        let files = [];

        //
        //	2.	Loop over all the file that are inside the Magnet Hash and add
        //	them to the above variable.
        //
        torrent.files.forEach(function(data) {

            files.push({
                name: data.name,
                length: data.length
            });

        });

        // sort torrent files by name
        files.sort((a, b) => {
            if (a.name < b.name) {
                return -1;
            }
            if (a.name > b.name) {
                return 1;
            }
            return 0;
        })

        //
        //	->	Once we have all the data send it back to the browser to be
        //		displayed.
        //
        res.status(200)
        res.json(files);

    });

});

//
//	The API call to start streaming the selected file to the video tag.
//
//	magnet 		-> 	Magnet Hash
//	file_name 	-> 	the selected file name that is within the Magnet Hash
//
//	return 		<-	A chunk of the video file as buffer (binary data)
//
router.get('/stream/:magnet/:file_name', async function (req, res, next) {

    //
    //	1.	Extract the magnet Hash and save it in a meaningful variable.
    //
    const magnet = req.params.magnet;

    //
    //	2.	Returns the torrent with the given torrentId. Convenience method.
    //		Easier than searching through the client.torrents array. Returns
    //		null if no matching torrent found.
    //
    const torrent = await client.get(magnet);

    if (torrent === null) {
        return next('No files!');
    }

    //
    //	3.	Variable that will store the user selected file
    //
    //let file = {};

    //
    //	4.	Loop over all the files contained inside a Magnet Hash and find the one
    //		the user selected.
    //
    const file = torrent.files.find(function (file) {
        return file.name === req.params.file_name
    })

    if (!file) {
        //
        // 	1.	Create the error
        //
        const err = new Error("File not found in the torrent");
        err.status = 416;

        //
        //	->	Send the error and stop the request.
        //
        return next(err);
    }

    /*for (let i = 0; i < torrent.files.length; i++) {
        if (torrent.files[i].name == req.params.file_name) {
            file = torrent.files[i];
        }
    }*/

    //
    //	5.	Save the range the browser is asking for in a clear and
    //		reusable variable
    //
    //		The range tells us what part of the file the browser wants
    //		in bytes.
    //
    //		EXAMPLE: bytes=65534-33357823
    //
    const range = req.headers.range;

    console.log(range);

    //
    //	6.	Make sure the browser ask for a range to be sent.
    //
    if (!range) {
        //
        // 	1.	Create the error
        //
        const err = new Error("Wrong range");
        err.status = 416;

        //
        //	->	Send the error and stop the request.
        //
        return next(err);
    }

    //
    //	7.	Convert the string range in to an array for easy use.
    //
    const positions = range.replace(/bytes=/, "").split("-");

    //
    //	8.	Convert the start value in to an integer
    //
    const start = parseInt(positions[0], 10);

    //
    //	9.	Save the total file size in to a clear variable
    //
    const file_size = file.length;

    //
    //	10.	IF 		the end parameter is present we convert it in to an
    //				integer, the same way we did the start position
    //
    //		ELSE 	We use the file_size variable as the last part to be
    //				sent.
    //
    const end = positions[1] ? parseInt(positions[1], 10) : file_size - 1;

    //
    //	11.	Calculate the amount of bits will be sent back to the
    //		browser.
    //
    const chunkSize = (end - start) + 1;

    //
    //	12.	Create the header for the video tag so it knows what is
    //		receiving.
    //
    const head = {
        "Content-Range": "bytes " + start + "-" + end + "/" + file_size,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": "video/mp4"
    }

    //
    //	13.	Send the custom header
    //
    res.writeHead(206, head);

    //
    //	14.	Create the createReadStream option object so createReadStream
    //		knows how much data it should be read from the file.
    //
    const stream_position = {
        start: start,
        end: end
    }

    //
    //	15.	Create a stream chunk based on what the browser asked us for
    //
    const stream = file.createReadStream(stream_position)

    //
    //	16.	Pipe the video chunk to the request back to the request
    //
    stream.pipe(res);

    //
    //	->	If there was an error while opening a stream we stop the
    //		request and display it.
    //
    stream.on("error", function (err) {

        return next(err);

    });

});

//
//	The API call that gets all the Magnet Hashes that the client is actually
//	having.
//
//	return 		<-	An array with all the Magnet Hashes
//
router.get('/list', function(req, res, next) {

    //
    //	1.	Loop over all the Magnet Hashes
    //
    const torrent = client.torrents.reduce(function(array, data) {

        array.push({
            hash: data.infoHash
        });

        return array;

    }, []);

    //
    //	->	Return the Magnet Hashes
    //
    res.status(200);
    res.json(torrent);

    // subtitles/en.vtt
    // subtitles/ru.vtt

    // subtitles/The Wire - 1x02 - The Detail.en.vtt
    // subtitles/The_Wire_102_The_Detail.vtt

});

//
//	The API call that sends back the stats of the client
//
//	return 		<-	A object with the client stats
//
router.get('/stats', function(req, res, next) {

    res.status(200);
    res.json(stats);

});

//
//	The API call that gets errors that occurred with the client
//
//	return 		<-	A a string with the error
//
router.get('/errors', function(req, res, next) {

    res.status(200);
    res.json(error_message);

});

//
//	The API call to delete a Magnet Hash from the client.
//
//	magnet 		-> 	Magnet Hash
//
//	return 		<-	Just the status of the request
//
router.get('/delete/:magnet', function(req, res, next) {

    //
    //	1.	Extract the magnet Hash and save it in a meaningful variable.
    //
    const magnet = req.params.magnet;

    //
    //	2.	Remove the Magnet Hash from the client.
    //
    client.remove(magnet).then(r => {
        res.status(200);
        res.end();
    });

});

router.get('/subtitles/:fileName', function(req, res, next) {

    const apiKey = 'JSnxQah80H1ntf0egIJcSlCm6uP43IR1'
    const userAgent = 'Double sub video viewer v0.1'
    const formats = ['crt', 'webvtt']




    let filename = req.params.fileName

   /* const os = new OS({apikey: apiKey})

    os.login({
        username: 'madcoder',
        password: 'j8zE8@ZDhLf82&i'
    }).then((response) => {
        /!* response {
          token: '<YOUR BEARER TOKEN>',
          user: { <USER PROFILE DETAIL > },
          status: 200
        }*!/

        console.log(response)

        os.subtitles({
            query: filename,
        }).then((response) => {

            console.log(response)

            /!* response {
              total_pages: 1,
              total_count: 13,
              page: 1,
              data: <SUBTITLES LIST>
            } *!/
        }).catch(console.error)

    }).catch(console.error)
*/

/*
    request({
        headers: {
            'Content-Type': 'application/json',
            'Api-Key': apiKey,
            'User-Agent': userAgent
        },
        uri: 'https://api.opensubtitles.com/api/v1/infos/formats',
        qs: {
            api_key: apiKey,
            query: filename
        }
    }).pipe(res)*/

    // get a list of  languages
   /* request({
        headers: {
            'Content-Type': 'application/json',
            'Api-Key': apiKey,
            'User-Agent': userAgent
        },
        uri: 'https://api.opensubtitles.com/api/v1/infos/languages',
        qs: {
            api_key: apiKey,
            query: filename
        }
    }).pipe(res)*/

    // parse S04E05;

    const regex = /S([0-9]{2})E([0-9]{2})/
    const result = filename.match(regex);

    const season = Number.parseInt(result[1]);
    const episode = Number.parseInt(result[2]);

    // @TODO: find a way to find IMDB ID of a movie
    let imdbID = 749451

    // find subtitles
    request({
        headers: {
            'Content-Type': 'application/json',
            'Api-Key': apiKey,
            'User-Agent': userAgent
        },
        uri: 'https://api.opensubtitles.com/api/v1/subtitles',
        qs: {
            api_key: apiKey,
            query: filename.replace('.mp4', ''),
            //imdb_id: imdbID,
            languages: 'en,ru,uk',
            episode_number: episode,
            season_number: season,
            type: 'episode'
        }
    }).pipe(res)

});


router.post('/upload', function(req, res, next) {
    try {
        if(!req.files) {
            res.send({
                status: false,
                message: 'No file uploaded'
            });
        } else {
            let data = [];

            //loop all files
            for (let i = 0; i < req.files.subs.length; i++) {

                //move photo to uploads directory
                req.files.subs[i].mv('subtitles/' + req.files.subs[i].name).then(r => {
                    //push file details
                    data.push({
                        name: req.files.subs[i].name,
                        mimetype: req.files.subs[i].mimetype,
                        size: req.files.subs[i].size
                    });
                });
            }
            //return response
            res.send({
                status: true,
                message: 'Files are uploaded',
                data: data
            });
        }
    } catch (err) {
        console.log(err)
        res.status(500).send(err);
    }
});

export default router;