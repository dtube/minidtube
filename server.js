const fs = require('fs')
const express = require('express')
const cors = require('cors')
const path = require('path')
const { createClient } = require('lightrpc');
const htmlEncode = require('htmlencode').htmlEncode;
const app = express()
app.use(cors())
const port = process.env.PORT || 3000
const jsonfile = require('jsonfile')
const file = 'robots.json'
const crawlers = jsonfile.readFileSync(file)
const rootDomain = 'https://d.tube'

const lightrpc = createClient('https://api.steemit.com');
const javalon = require('javalon')

let layouts = {}

app.use('/DTube_files', express.static(path.join(__dirname, 'static/production/DTube_files')))
app.use('/favicon.ico', express.static(path.join(__dirname, 'static/production/DTube_files/images/dtubefavicon.png')))
app.get('*', function(req, res, next) {
    var isRobot = getRobotName(req.headers['user-agent'])

    // parsing the query
    var reqPath = null
    if (req.query._escaped_fragment_ && req.query._escaped_fragment_.length > 0)
        reqPath = req.query._escaped_fragment_
    else
        reqPath = req.path

    if (reqPath.startsWith('/sockjs/info')) {
        res.send('{}')
        return;
    }

    if (isRobot)
        console.log(isRobot, 'GET', req.path, req.query)
    
    // isRobot = true
    if (isRobot && reqPath.startsWith('/v/')) {
        // DIRTY ROBOTS
        getVideoHTML(
        reqPath.split('/')[2],
        reqPath.split('/')[3],
        function(err, contentHTML, pageTitle, description, url, snap, urlvideo, duration, embedUrl) {
            if (error(err, next)) return
            getRobotHTML(function(err, baseHTML) {
                if (error(err, next)) return
                baseHTML = baseHTML.replace(/@@CONTENT@@/g, contentHTML)
                baseHTML = baseHTML.replace(/@@TITLE@@/g, htmlEncode(pageTitle))
                baseHTML = baseHTML.replace(/@@DESCRIPTION@@/g, htmlEncode(description))
                baseHTML = baseHTML.replace(/@@URL@@/g, htmlEncode(url))
                baseHTML = baseHTML.replace(/@@URLNOHASH@@/g, htmlEncode(url).replace('/#!',''))
                // facebook minimum snap is 200x200 otherwise useless
                baseHTML = baseHTML.replace(/@@SNAP@@/g, htmlEncode(snap))
                baseHTML = baseHTML.replace(/@@VIDEO@@/g, htmlEncode(urlvideo))
                baseHTML = baseHTML.replace(/@@EMBEDURL@@/g, htmlEncode(embedUrl))
                if (duration) {
                    var durationHTML = '<meta property="og:video:duration" content="@@VIDEODURATION@@" />'
                    durationHTML = durationHTML.replace(/@@VIDEODURATION@@/g, htmlEncode(""+Math.round(duration)))
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
        if (reqPath == '/') {
            getHumanHTML(function(err, humanHTML) {
                if (error(err, next)) return
                res.send(humanHTML)
            })
        } else {
            res.redirect('/#!'+reqPath);
        }
    }
    
})

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
    if (layouts.robot) {
        cb(null, layouts.robot)
        return
    }
    else {
        fs.readFile(path.join(__dirname,"static","robots.html"), 'utf8', function (err,data) {
            if (err) {
                cb(err)
                return
            } else {
                layouts.robot = data
                cb(null, data)
                return
            }
        });
    }
}

function getHumanHTML(cb) {
    if (layouts.human) {
        cb(null, layouts.human)
        return
    } else {
        fs.readFile(path.join(__dirname,"static","production","index.html"), 'utf8', function (err,data) {
            if (err) {
                cb(err)
                return
            } else {
                layouts.human = data
                cb(null, data)
                return
            }
        });
    }
}
function handleChainData(author, permlink, video, cb) {
    if (video.json.ipfs) {
        var hashVideo = video.json.ipfs.videohash
        if (video.json.ipfs.video240hash) hashVideo = video.json.ipfs.video240hash
        if (video.json.ipfs.video480hash) hashVideo = video.json.ipfs.video480hash
    }

    var html = ''
    html += '<iframe src="https://emb.d.tube/#!/'+author+'/'+permlink+'/true" width="480" height="270" frameborder="0" scrolling="no" webkitallowfullscreen="" mozallowfullscreen="" allowfullscreen=""></iframe>'
    var title = video.json.title || video.json.info.title
    html += '<h1>'+title+'</h1>'
    html += '<h2>Author: '+video.author+'</h2>'

    var description = null
    if (video.json.description)
        description = video.json.description
    else if (video.json.content.description)
        description = video.json.content.description
    if (description)
        html += '<p><strong>Description: </strong>'+description.replace(/(?:\r\n|\r|\n)/g, '<br />')+'</p>'

    var url = rootDomain+'/#!/v/'+author+'/'+permlink
    var snap = null
    if (video.json.ipfs && video.json.ipfs.snaphash)
        snap = 'https://snap1.d.tube/ipfs/'+video.json.ipfs.snaphash
    if (video.json.thumbnailUrl)
        snap = video.json.thumbnailUrl
    
    var urlVideo = null
    if (hashVideo) 
        urlVideo = 'https://player.d.tube/btfs/'+hashVideo
    var embedUrl = 'https://emb.d.tube/#!/'+author+'/'+permlink+'/true'
    var duration = video.json.duration || null
    
    cb(null, html, title, description, url, snap, urlVideo, duration, embedUrl)

}
function getVideoHTML(author, permlink, cb) {
    var steemDone = false
    var avalonDone = false
    javalon.getContent(author, permlink, function(err, video) {
        avalonDone = true
        if (err) {
            if (steemDone && cb)
                cb(err)
            return
        }
        handleChainData(author, permlink, video, cb)
    })
    lightrpc.send('get_state', [`/dtube/@${author}/${permlink}`], function(err, result) {
        steemDone = true
        if (err) {
            if (avalonDone && cb)
                cb(err)
            return
        }
        if (!result.content[author+'/'+permlink]) {
            if (avalonDone && cb)
                cb('Not found')
            return
        }
        var video = parseVideo(result.content[author+'/'+permlink])
        handleChainData(author, permlink, video, cb)
    })
}

function parseVideo(video, isComment) {
    try {
      var newVideo = {} 
      newVideo.json = JSON.parse(video.json_metadata).video
    } catch(e) {
        console.log(e)
    }
    if (!newVideo) newVideo = {}
    // newVideo.active_votes = video.active_votes
    newVideo.author = video.author
    newVideo.body = video.body
    // newVideo.total_payout_value = video.total_payout_value
    // newVideo.curator_payout_value = video.curator_payout_value
    // newVideo.pending_payout_value = video.pending_payout_value
    newVideo.permlink = video.permlink
    newVideo.created = video.created
    // newVideo.net_rshares = video.net_rshares
    // newVideo.reblogged_by = video.reblogged_by
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
