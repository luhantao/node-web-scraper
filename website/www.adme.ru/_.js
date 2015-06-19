//作者：陆瀚陶

var route = [
    [/adme.ru\/{0,1}$/, 'index'],
    [/adme.ru\/video\/page/, 'index'],
    [/adme.ru\/video/, 'video-play'],
    ['/', 'index']
];

module.exports = function () {
    return {
        route: route
    };
};