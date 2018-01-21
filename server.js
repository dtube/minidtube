const fs = require('fs')
const express = require('express')
const path = require('path')
const steem = require('steem')
const app = express()
const port = process.env.PORT || 3000

steem.api.setOptions({ url: 'https://api.steemit.com' });

app.get('*', function(req, res, next) {
    console.log('New GET!', req.query)
    //console.log('User-Agent: ', req.headers['user-agent'])
    if (req.query._escaped_fragment_) {
        var path = req.query._escaped_fragment_
        console.log(path)
        if (path.startsWith('/v/')) {
            getVideoHTML(path.split('/')[2], path.split('/')[3], function(err, contentHTML, pageTitle) {
                if (error(err, next)) return
                getDTubeHTML(function(err, baseHTML) {
                    if (error(err, next)) return
                    baseHTML = baseHTML.replace('@@CONTENT@@', contentHTML)
                    baseHTML = baseHTML.replace('@@TITLE@@', pageTitle)
                    res.send(baseHTML)
                })
            })
        }
    } else {
        next()
    }
})

app.use('/static', express.static(path.join(__dirname, 'static')))
app.listen(port, () => console.log('Example app listening on port '+port))

function error(err, next) {
    if (err) {
        console.log(err)
        next()
        return true
    }
    return false
}

function getDTubeHTML(cb) {
    fs.readFile(path.join(__dirname,"static","DTube.html"), 'utf8', function (err,data) {
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
        console.log(video.content.description)
        cb(null, html, video.info.title)
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