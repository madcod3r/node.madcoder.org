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

router.get('/subtitles/:subFileName', function(req, res, next) {

    let subFileName = req.params.subFileName
    //let subPath = 'subtitles/' + subFileName.replace('.vtt', '.srt')
    let subPath = 'subtitles/' + subFileName

   /* res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    let data = fs.readFileSync(subPath, 'utf8');
    res.send("WEBVTT\n\n" + data.toString())*/




    const lang = subFileName.replace('.vtt', '');

    try {
        if (fs.existsSync(subPath)) {
            //res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
            res.send(fs.readFileSync(subPath, 'utf8'))
        } else {
            const srt = fs.readFileSync(subPath.replace('.vtt', '.srt'), 'utf8');

            const captions = subsrt.parse(srt);

            const helper = {
                toMilliseconds: function(s) {
                    const match = /^\s*(\d{1,2}:)?(\d{1,2}):(\d{1,2})([.,](\d{1,3}))?\s*$/.exec(s);
                    const hh = match[1] ? parseInt(match[1].replace(":", "")) : 0;
                    const mm = parseInt(match[2]);
                    const ss = parseInt(match[3]);
                    const ff = match[5] ? parseInt(match[5]) : 0;
                    return hh * 3600 * 1000 + mm * 60 * 1000 + ss * 1000 + ff;
                },
                toTimeString: function(ms) {
                    const hh = Math.floor(ms / 1000 / 3600);
                    const mm = Math.floor(ms / 1000 / 60 % 60);
                    const ss = Math.floor(ms / 1000 % 60);
                    const ff = Math.floor(ms % 1000);
                    return (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm + ":" + (ss < 10 ? "0" : "") + ss + "." + (ff < 100 ? "0" : "") + (ff < 10 ? "0" : "") + ff;
                }
            };


            //Build the WebVTT content
            subsrt.format['vtt-my'] = {
                name: 'vtt-my',
                parse: function(content, options) {
                    let index = 1;
                    const captions = [ ];
                    const eol = options.eol || "\r\n";
                    const parts = content.split(/\r?\n\s+\r?\n/);
                    for (let i = 0; i < parts.length; i++) {
                        //WebVTT data
                        const regex = /^([^\r\n]+\r?\n)?((\d{1,2}:)?\d{1,2}:\d{1,2}([.,]\d{1,3})?)\s*\-\-\>\s*((\d{1,2}:)?\d{1,2}:\d{1,2}([.,]\d{1,3})?)\r?\n([\s\S]*)(\r?\n)*$/gi;
                        const match = regex.exec(parts[i]);
                        if (match) {
                            const caption = { };
                            caption.type = "caption";
                            caption.index = index++;
                            if (match[1]) {
                                caption.cue = match[1].replace(/[\r\n]*/gi, "");
                            }
                            caption.start = helper.toMilliseconds(match[2]);
                            caption.end = helper.toMilliseconds(match[5]);
                            caption.duration = caption.end - caption.start;
                            const lines = match[8].split(/\r?\n/);
                            caption.content = lines.join(eol);
                            caption.text = caption.content
                                .replace(/\<[^\>]+\>/g, "") //<b>bold</b> or <i>italic</i>
                                .replace(/\{[^\}]+\}/g, ""); //{b}bold{/b} or {i}italic{/i}
                            captions.push(caption);
                            continue;
                        }

                        //WebVTT meta
                        let meta = /^([A-Z]+)(\r?\n([\s\S]*))?$/.exec(parts[i]);
                        if (!meta) {
                            //Try inline meta
                            meta = /^([A-Z]+)\s+([^\r\n]*)?$/.exec(parts[i]);
                        }
                        if (meta) {
                            const caption = { };
                            caption.type = "meta";
                            caption.name = meta[1];
                            if (meta[3]) {
                                caption.data = meta[3];
                            }
                            captions.push(caption);
                            continue;
                        }

                        if (options.verbose) {
                            console.log("WARN: Unknown part", parts[i]);
                        }
                    }
                    return captions;
                },
                build: function(captions, options) {
                    const eol = options.eol || "\r\n";
                    let content = "WEBVTT" + eol + eol;
                    for (let i = 0; i < captions.length; i++) {
                        const caption = captions[i];
                        if (caption.type == "meta") {
                            if (caption.name == "WEBVTT") continue;
                            content += caption.name + eol;
                            content += caption.data ? caption.data + eol : "";
                            content += eol;
                            continue;
                        }

                        if (typeof caption.type === "undefined" || caption.type == "caption") {
                            content += (i + 1).toString() + eol;
                            content += helper.toTimeString(caption.start) + " --> " + helper.toTimeString(caption.end) + eol;
                            content += '<lang ' + lang + '>' + caption.text + '</lang>' + eol;
                            content += eol;
                            continue;
                        }

                        if (options.verbose) {
                            console.log("SKIP:", caption);
                        }
                    }

                    return content;
                }
            };

            const content = subsrt.build(captions, { format: 'vtt-my' });

            //Write content to .vtt file
            fs.writeFileSync(subPath, content)

            //res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
            res.send(fs.readFileSync(subPath, 'utf8'))
        }
    } catch(err) {
        console.error(err)
    }
});

export default router;