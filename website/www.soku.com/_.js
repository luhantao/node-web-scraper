var route = [
    [/www.soku.com\/search_video/, 'index'],
    [/www.tudou.com/, 'tudou-video-play'],
    [/v.youku.com/, 'youku-video-play'],
    ['/', 'index']
];

module.exports = function () {
    return {
        route: route
    };
};