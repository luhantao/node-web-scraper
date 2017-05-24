var route = [
    [/www.zhihu.com\/people\/.+\/following$/, 'following.js'],
    [/www.zhihu.com\/people\/.+\/followers$/, 'follower.js'],
    [/www.zhihu.com\/people/, 'user.js'],
    [/www.zhihu.com\/question\/\d+\/answer\/\d+/, 'answer.js'],
    [/www.zhihu.com$/, 'index.js']
];

module.exports = function () {
    return {
        route: route
    };
};