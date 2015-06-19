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
            console.log(body.substr(0,50))
            //cheerio解析页面源码
            $ = cheerio.load(body); 

            var data = {
                grabUrls: grabUrls,
                videoInfo: videoInfo
            }

            resolve(data);
        });
    })
};