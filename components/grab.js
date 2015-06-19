var osmosis = require('osmosis'),
    conf = require('../../conf'),
    proxy = require('../proxy/proxy');

osmosis.config({
    tries: 0,
    concurrency: conf.worker.count,
    timeout: conf.worker.timeout - 1000,
    proxy: proxy.get('all')
});

module.exports = osmosis
    .debug(function (msg) {
        console.log('[DEBUG] Grab', msg);
    });