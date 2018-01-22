const fs = require('fs')
const express = require('express')
const path = require('path')
const steem = require('steem')
const htmlEncode = require('htmlencode').htmlEncode;
const app = express()
const port = process.env.PORT || 3000
const jsonfile = require('jsonfile')
const file = 'robots.json'
const crawlers = jsonfile.readFileSync(file)
// currently whitelisting a few robots
const allowedRobots = ['facebookexternalhit', 'Discordbot', 'bingbot']

steem.api.setOptions({ url: 'https://api.steemit.com' });

app.get('*', function(req, res, next) {
    var isRobot = getRobotName(req.headers['user-agent'])
    console.log('GET', req.path, req.query)
    console.log('Robot: ', isRobot)

    var reqPath = null
    if (req.query._escaped_fragment_)
        reqPath = req.query._escaped_fragment_
    else
        reqPath = req.path

    // if (reqPath.startsWith('/DTube_files/')) {
    //     console.log('test')
    //     fs.readFile(path.join(__dirname,"static","production","DTube_files",reqPath.replace('/DTube_files/','')), 'utf8', function (err,data) {
    //         if (error(err, next)) return
    //         res.send(data)
    //         return
    //     });
    //     return
    // }

    if (reqPath.startsWith('/sockjs/info')) {
        res.send('{}')
        return;
    }

    if (isRobot && allowedRobots.indexOf(isRobot) > -1 && reqPath.startsWith('/v/')) {
        // DIRTY ROBOTS
        getVideoHTML(
        reqPath.split('/')[2],
        reqPath.split('/')[3],
        function(err, contentHTML, pageTitle, description, url, snap, urlvideo, duration) {
            if (error(err, next)) return
            getRobotHTML(function(err, baseHTML) {
                if (error(err, next)) return
                baseHTML = baseHTML.replace(/@@CONTENT@@/g, contentHTML)
                baseHTML = baseHTML.replace(/@@TITLE@@/g, htmlEncode(pageTitle))
                baseHTML = baseHTML.replace(/@@DESCRIPTION@@/g, htmlEncode(description))
                baseHTML = baseHTML.replace(/@@URL@@/g, htmlEncode(url))
                // facebook minimum snap is 200x200 otherwise useless
                baseHTML = baseHTML.replace(/@@SNAP@@/g, htmlEncode(snap))
                baseHTML = baseHTML.replace(/@@VIDEO@@/g, htmlEncode(urlvideo))
                if (duration) {
                    var durationHTML = '<meta property="og:video:duration" content="@@VIDEODURATION@@" />'
                    console.log(duration)
                    durationHTML = durationHTML.replace(/@@VIDEODURATION@@/g, htmlEncode(""+duration))
                    baseHTML = baseHTML.replace(/@@METAVIDEODURATION@@/g, durationHTML)
                } else {
                    baseHTML = baseHTML.replace(/@@METAVIDEODURATION@@/g, '')
                }
                
                res.send(baseHTML)
            })
        })
    } else {
        // HUMAN BROWSER
        // AND DISALLOWED ROBOTS
        if (reqPath != '/' && !reqPath.startsWith('/DTube_files/')) {
            res.redirect('/#!'+reqPath);
        } else if (reqPath == '/') {
            getHumanHTML(function(err, humanHTML) {
                if (error(err, next)) return
                res.send(humanHTML)
            })
        } else {
            next()
        }
    }
    
})

app.use('/DTube_files', express.static(path.join(__dirname, 'static/production/DTube_files')))
app.listen(port, () => console.log('minidtube listening on port '+port))

function error(err, next) {
    if (err) {
        console.log(err)
        next()
        return true
    }
    return false
}

function getRobotHTML(cb) {
    fs.readFile(path.join(__dirname,"static","robots.html"), 'utf8', function (err,data) {
        if (err) {
            cb(err)
            return
        } else {
            cb(null, data)
        }
    });
}

function getHumanHTML(cb) {
    fs.readFile(path.join(__dirname,"static","production","index.html"), 'utf8', function (err,data) {
        if (err) {
            cb(err)
            return
        } else {
            cb(null, data)
        }
    });
}

function getVideoHTML(author, permlink, cb) {
    steem.api.getState('/dtube/@'+author+'/'+permlink, function(err, result) {
        if (err) {
            cb(err)
            return
        }
        var video = parseVideo(result.content[author+'/'+permlink])
        var hashVideo = video.content.video480hash ? video.content.video480hash : video.content.videohash
        var upvotedBy = []
        var downvotedBy = []
        for (let i = 0; i < video.active_votes.length; i++) {
            if (parseInt(video.active_votes[i].rshares) > 0)
                upvotedBy.push(video.active_votes[i].voter);    
            if (parseInt(video.active_votes[i].rshares) < 0)
                downvotedBy.push(video.active_votes[i].voter);         
        }

        var html = ''
        html += '<video src="https://ipfs.io/ipfs/'+hashVideo+'" poster="https://ipfs.io/ipfs/'+video.info.snaphash+'" controls></video><br />'
        html += '<h1>'+video.info.title+'</h1>'
        html += '<h2>Author: '+video.info.author+'</h2>'
        html += '<h2>Date: '+video.created.split('T')[0]+'</h2>'
        html += '<p><strong>Description: </strong>'+video.content.description.replace(/(?:\r\n|\r|\n)/g, '<br />')+'</p>'
        if (upvotedBy.length > 0) {
            html += '<p><strong>Upvoted by: </strong>'
            html += upvotedBy.join(', ')
            html += '</p>'
        }
        if (downvotedBy.length > 0) {
            html += '<p><strong>Downvoted by: </strong>'
            html += downvotedBy.join(', ')
            html += '</p>'
        }
        
        var url = 'https://obscure-headland-27356.herokuapp.com/#!/v/'+video.info.author+'/'+video.info.permlink
        var snap = 'https://ipfs.io/ipfs/'+video.info.snaphash
        var urlVideo = 'https://ipfs.io/ipfs'+hashVideo
        var duration = video.info.duration || null
        var description = video.content.description.replace(/(?:\r\n|\r|\n)/g, ' ').substr(0, 300)
        cb(null, html, video.info.title, description, url, snap, urlVideo, duration)
    })
}

function parseVideo(video, isComment) {
    try {
      var newVideo = JSON.parse(video.json_metadata).video
    } catch(e) {}
    if (!newVideo) newVideo = {}
    newVideo.active_votes = video.active_votes
    newVideo.author = video.author
    newVideo.body = video.body
    newVideo.total_payout_value = video.total_payout_value
    newVideo.curator_payout_value = video.curator_payout_value
    newVideo.pending_payout_value = video.pending_payout_value
    newVideo.permlink = video.permlink
    newVideo.created = video.created
    newVideo.net_rshares = video.net_rshares
    newVideo.reblogged_by = video.reblogged_by
    return newVideo;
}

function getRobotName(userAgent) {
    for (let i = 0; i < crawlers.length; i++) {
        var re = new RegExp(crawlers[i].pattern);
        var isRobot = re.test(userAgent)
        if (isRobot) return crawlers[i].pattern;
    }
    return;
}