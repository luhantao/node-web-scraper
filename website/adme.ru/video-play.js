//作者：陆瀚陶

var _ = require('underscore'),
    request = require('request'),
    grab = require('../../components/grab/grab');

/* 
    'http://www.adme.ru/video/50-sposobov-zavyazat-palantin-sharf-platok-787060/'
*/
module.exports = function (task) {
    var honey = {}, flower = [];

    grab.get(task.url)
    .set({
        'title' : 'head meta[property="og:title"]@content',
        'image_large' : 'head meta[property="og:image"]@content',
        'summary' : 'head meta[property="og:description"]@content',
        'source_create_time' : '#js-article-social-buttons .al-stats .al-stats-date',
        'total_play_count' : '#js-article-social-buttons .al-stats-views a'
    })
    .data(function(data){
        try {
            data.url = task.url;
            data.origin_id = task.url.split('/')[4];
            var reg = /\d+$/;
            data.origin_id = reg.exec(data.origin_id)[0];
            data.platform = 1; 

            honey = data;
        }
        catch (err){
            console.log(err);
        }
    })
    .set({
        'realted_url[]' : '.fresh .js-article-list-item a[1]@href'
    })
    .data(function(data){
        try {
            for (var i = 0; i < data.realted_url.length; i++) {
                flower.push({
                    'url' : 'http://www.adme.ru' + data.realted_url[i]
                });
            }
        }
        catch (err){
            console.log(err);
        }
    })
    .done(function(msg){
        task.harvest = {
                tag: 'video',
                honey: honey,
                flower: flower
            };
        task.done(null, task);
    });
};