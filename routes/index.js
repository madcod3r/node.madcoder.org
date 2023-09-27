import express from 'express';
import fs from 'fs';
import subsrt from 'subsrt';

let router = express.Router();

router.get('/', function(req, res, next) {

    //
    //	->	Display the index view with the video tag
    //
    res.render("index", {
        base_url: process.env.BASE_URL
    });

});
router.get('/client', function(req, res, next) {

    //
    //	->	Display the index view with the video tag
    //
    res.render("client", {
        base_url: process.env.BASE_URL
    });

});
router.get('/seed', function(req, res, next) {

    //
    //	->	Display the index view with the video tag
    //
    res.render("seed", {
        base_url: process.env.BASE_URL
    });

});

router.get('/subtitles/:subFileName', function(req, res, next) {

    let subFileName = req.params.subFileName
    let subPath = 'subtitles/' + subFileName

    try {
        if (fs.existsSync(subPath)) {
            res.send(fs.readFileSync(subPath, 'utf8'))
        } else {
            const srt = fs.readFileSync(subPath.replace('.vtt', '.srt'), 'utf8')
                .replace(/\r\n/g, "\n")
                .replace(/\n/g, "\r\n");

            const captions = subsrt.parse(srt);

            const content = subsrt.build(captions, { format: 'vtt', eol: "\r\n" });

            //Write content to .vtt file
            fs.writeFileSync(subPath, content)

            res.send(fs.readFileSync(subPath, 'utf8'))
        }
    } catch(err) {
        console.error(err)
    }
});

export default router;