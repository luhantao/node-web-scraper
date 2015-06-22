var _ = require('underscore'),
    Promise = require('bluebird'),
    request = require('request'),
    cheerio = require('cheerio');


module.exports = function (url) {
    var grabUrls = [];
    var videoInfo = {};

    return new Promise(function(resolve, reject){
        request(url, function (err, res, body) {
            if (err || !res || !body) {
                reject(err);
                return ;
            }

            //cheerio解析页面源码
            $ = cheerio.load(body); 
            try{
                videoInfo = {
                    title: $('meta[name="irTitle"]').attr('content'),
                    keywords: $('meta[name="keywords"]').attr('content'),
                    descirption: $('meta[name="descirption"]').attr('content'),
                    category: $('meta[name="irCategory"]').attr('content'),
                    url: url,
                    like: $('#upVideoTimes').text(),
                    unlike: $('#downVideoTimes').text(),
                }

                var data = {
                    grabUrls: grabUrls,
                    videoInfo: videoInfo
                }

                resolve(data);
            }
            catch(err){
                console.log(err);
            }
        });
    })
};