//作者：陆瀚陶

var _ = require('underscore'),
    request = require('request'),
    grab = require('../../components/grab/grab');

/* 
    'http://www.adme.ru/'
    'http://www.adme.ru/video/page2/'
*/
module.exports = function (task) {
    var honey = {}, flower = [];
    if (!task.url.match(/adme.ru\/video\/page/)){
        task.url = 'http://www.adme.ru/video/page1/';
    }

    grab.get(task.url)
    .set({
        'main_url[]' : '.article-list .article-list-block a[1]@href',
        'right_url[]' : '.fresh .js-article-list-item a[1]@href',
        'page[]' : 'ul.pag li a@href'
    })
    .data(function(data){
        try {
            for (var i = 0; i < data.main_url.length; i++) {
                flower.push({
                    'url' : 'http://www.adme.ru' + data.main_url[i]
                });
            }
            
            for (var i = 0; i < data.right_url.length; i++) {
                flower.push({
                    'url' : 'http://www.adme.ru' + data.right_url[i]
                });
            }

            for (var i = 0; i < data.page.length; i++) {
                flower.push({
                    'url' : 'http://www.adme.ru' + data.page[i]
                });
            }
        }
        catch (err){
            console.log(err);
        }

    })
    .done(function(msg){
            task.harvest = {
                flower: flower
            };
        task.done(null, task);
    });

};