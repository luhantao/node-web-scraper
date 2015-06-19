var _ = require('underscore'),
    cheerio = require('cheerio'),
    request = require('request'),
    Promise = require('bluebird'),
    iconv = require('iconv-lite'),

    conf = require('../../conf'),
    blockTag = [
        'p','div', 'center', 'pre',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
    ],

    ENCODING = 'utf-8',

    defaultOptions = {
        timeout: 5000,
        proxy: null,
        retries: 0,
        encoding: ENCODING
    };

function isBlockTag(name) {
    return blockTag.indexOf(name) > -1;
}

function get(context, options, resolve, reject) {
    if (!context) {
        reject('NULL_CONTEXT');
        return;
    }
    if (!options) {
        reject('NULL_OPTIONS');
        return;
    }


    // 引入默认配置
    var requestOptions = _.extend({},
                            defaultOptions,
                            options),
        needDecode = false,
        needRetries = false,
        retries = requestOptions.retries,
        encoding;

    if (requestOptions.encoding !== ENCODING) {
        needDecode = true;
        encoding = requestOptions.encoding;
        requestOptions.encoding = null;
    }

    //重试次数不为0
    if (_.isNumber(retries) && retries !== 0){
        needRetries = true;
        var tryCount = 0;
    }


    // 按照配置进行请求
    request(requestOptions, function (err, res, body) {
        if (err || !res || !body) {
            //失败重试
            if (needRetries && tryCount < retries){
                tryCount ++;
                console.log('Request failed! Retry ' + tryCount);
                return request(requestOptions, arguments.callee);
            }
            else{
                reject('RESPONSE_NULL', err);
                return;
            }
        }


        // 需要解码则调用 iconv 进行解码
        if (needDecode) {
            body = iconv.decode(body, encoding);
        }

        // 将页面内容放到上下文中
        context.content = body;
        // 解析页面
        parse(context);
        if (!context.$root) {
            reject('UNKNOW_DOC_TYPE');
        } else {
            resolve();
        }
    });
}

function parse(context, options) {
    if (!context) {
        console.warn('PARSE_ERROR', 'No Context', context);
        return;
    }

    var content = context.content;
    if (!_.isString(content)) {
        console.warn('PARSE_ERROR', 'No Content', content);
        return;
    }

    var head = content.substring(0, 100).trim().toLowerCase(),
        $ = cheerio.load(content, options);
    if (head.indexOf('<!doctype') > -1 ||
        head.indexOf('<html>') > -1) {
        context.$ = $('html');
        context.$root = $('html');
    }
}

function extractContent(item, maxDepth, depth) {
    var content = '',
        children = item && item.children;

    if (!item) {
        return content;
    }

    if (!depth) {
        depth = 0;
    }

    // 提取内容
    // 如果标签是块级元素，则在后面附带上换行符
    if (item.data) {
        content += item.data;
        if (item.type === 'tag' &&
            isBlockTag(item.name)) {
            content += '\n';
        }

    // 将 <br> 转为换行符
    } else if (item.type === 'tag' &&
        item.name === 'br') {
        content += '\n';
    }

    // 遍历下级
    _.each(children, function (child) {
        if (isNaN(maxDepth) || depth < maxDepth) {
            content += extractContent(child, maxDepth, depth + 1);
        }
    });

    return content;
}

function Grab() {
    var that = this;

    // 配置
    this.options = {
        encoding: 'utf-8'
    };

    // 初始化 context
    this.context = {
        // 页面源码
        content: null,
        // 数据
        data: {},
        // 根选择器
        $root: null,
        // 选择器
        $: null
    };

    // 队列
    this.queue = [];

    // 日志
    this._log = function (msg) {
        console.log('LOG', msg);
    };

    // 原始方法
    this.rawFn = {};

    // 包装所有方法，使之变成可以链式调用
    var prevPromise;
    _.each([
        'get',
        'set',
        'config',
        'encoding',
        'follow',
        'doc',
        'find',
        'data',
        'parse',
        'then',
        'done',
        'log',
        'error'
    ], function (name) {
        var fn = this[name];

        this.rawFn[name] = fn;
        this[name] = function() {
            var args = Array.prototype.slice.call(arguments),
                task = {
                    name: name,
                    fn: fn,
                    args: args
                };
            that.queue.push(task);

            if (name === 'done') {
                that.next();
            }

            return that;
        };
    }, this);

    return this;
}

Grab.prototype.config = function(opt) {
    var options = this.options;

    return new Promise(function (resolve, reject) {
        if (!opt) {
            reject('NULL_CONFIG');
            return;
        }
        _.extend(options, opt);
        resolve();
    });
};

Grab.prototype.encoding = function (enc) {
    var config = this.rawFn.config;
    return config({
            encoding: enc
        });
};

Grab.prototype.find = function (selector) {
    var context = this.context;

    return new Promise(function (resolve, reject) {
        if (!selector) {
            reject('NULL_FIND_SELECTOR');
            return;
        }
        var $ = context.$;
        context.$ = $.find(selector);
        resolve();
    });
};

Grab.prototype.get = function (url) {
    var context = this.context,
        options = this.options,
        requestOptions;

    if (_.isString(url)) {
        requestOptions = {
            url: url
        };
    } else if (_.isObject(url)) {
        requestOptions = url;
        url = requestOptions.url;
    }

    // 如果有指定编码，则使用指定编码请求
    if (options.encoding) {
        requestOptions.encoding = options.encoding;
    }

    //如果有指定重试次数，则再request错误后重试
    if (options.retries) {
        requestOptions.retries = options.retries;
    }

    return new Promise(function (resolve, reject) {
        get(context, requestOptions, resolve, reject);
    });
};

Grab.prototype.parse = function (content) {
    var context = this.context;

    return new Promise(function (resolve, reject) {
        if (!content) {
            reject('NULL_CONTENT');
            return;
        }
        // 将页面内容放到上下文中
        context.content = content;
        // 解析页面
        parse(context);
        resolve();
    });
};

// 先查找 data 是否有对应键的值
// 如果找不到，则尝试查找元素是否有值
Grab.prototype.follow = function (key) {
    var get = this.rawFn.get,
        context = this.context,
        data = context.data,
        value = data[key],
        url;

    if (!_.isUndefined(value)) {
        url = value;
    }

    return get(url);
};

Grab.prototype.then = function (fn) {
    var that = this,
        context = this.context,
        data = context.data;

    return new Promise(function (resolve, reject) {
        if (!fn) {
            reject('NULL_THEN_FN');
            return;
        }
        fn.call(that, context, data, resolve);
    });
};

Grab.prototype.set = function (key, selector) {
    var that = this,
        context = this.context,
        data = context.data,
        $ = context.$,
        options = {};

    if (_.isString(key) &&
        _.isString(selector)) {
        options[key] = selector;

    } else if (_.isObject(key)) {
        options = key;
    }

    return new Promise(function (resolve, reject) {
        // options 为
        // {
        //     key1: selector1,
        //     key2: selector2
        // }
        _.each(options, function (selector, key) {
            if (!selector) {
                return;
            }

            var isArray = (key.lastIndexOf('[]') === key.length - 2),
                atIndex = selector.indexOf('@'),
                attr,
                valueType = 'text',
                selectorArray,
                currentTextOnly = false;
            
            // 检查有没有要求提取 Attributes，
            // 有则先把 Attritube Name 提取出来
            if (atIndex > -1) {
                attr = selector.substring(atIndex + 1);
                selector = selector.substring(0, atIndex);
                valueType = 'attr';
            }

            // 将 XPATH 的选择器替换为 CSS 选择器
            selector = selector.replace(/\[(\d+)\]/g, ':nth-child($1)');

            // 检查是否有 /
            // 有的话就进行选择器切割
            if (selector.indexOf('/') > -1) {
                selectorArray = _.map(selectorArray, function (selector) {
                    // 切分 xpath 的选择器
                    if (selector.indexOf('/') > -1) {
                        return selector.split('/');

                    } else {
                        return selector;
                    }
                });
                // 扁平化数组
                selectorArray = _.flatten(selectorArray);
                // 是数字就转换为数字
                // 是字符串就过滤前后空格
                selectorArray = _.map(selectorArray, function (selector) {
                    if (/^\d+$/.test(selector)) {
                        return Number(selector);
                    } else {
                        return selector.trim();
                    }
                });
                // 压缩字符串，替换 false 字符，避免空字符混入
                selectorArray = _.compact(selectorArray);
            }

            try {
                var $dom = $,
                    values = [];

                // 如果是复杂选择器数组，
                // 就来吧，分步骤选择出元素
                if (selectorArray) {
                    _.find(selectorArray, function (selector, i) {
                        if (_.isString(selector)) {
                            // 检查是否是 xpath 选择器
                            if (selector.indexOf('()') > -1) {
                                if (selector === 'text()') {
                                    // 标记为只到达当前元素深度
                                    currentTextOnly = true;
                                }
                                return true;

                            // 一般的 CSS 选择器
                            } else {
                                $dom = $dom.find(selector);
                            }

                        } else if (_.isNumber(selector)) {
                            $dom = $dom.eq(selector - 1);
                        }
                    });

                // 简单选择器，直接查找出元素
                } else {
                    $dom = $dom.find(selector);
                }

                // 遍历元素，找出需要的值
                $dom.each(function (index, item) {
                    // 元素内容
                    if (valueType === 'text') {
                        var maxDepth;
                        if (currentTextOnly) {
                            maxDepth = 1;
                        }
                        var value = extractContent(item, maxDepth).trim(),
                            length = value.length;
                        values.push(value);

                    // 元素属性
                    } else if (valueType === 'attr') {
                        values.push(item.attribs[attr]);
                    }
                });
                // 如果结果不需要数组，则只取第一个
                if (!isArray) {
                    values = values[0];
                    // 如果结果值未定义，那就返回 null
                    if (typeof values === 'undefined') {
                        values = null;
                    }

                // 如果是数组，要把数组的标示去掉
                } else {
                    key = key.replace('[]', '');
                }
                // 将数据存储到对应键上
                data[key] = values;
            } catch(err) {
                reject('SET_ERROR', err);
            }
        });
        resolve();
    });
};

Grab.prototype.doc = function () {
    var that = this,
        context = this.context,
        $root = context && context.$root;

    return new Promise(function (resolve, reject) {
        if ($root) {
            // 回到页面顶部
            context.$ = $root.clone();
            resolve();
        } else {
            reject('NULL_CONTEXT');
        }
    });
};

Grab.prototype.data = function (fn) {
    var that = this,
        context = this.context,
        data = context && context.data;

    return new Promise(function (resolve, reject) {
        if (!fn) {
            reject('NULL_DATA_FN');
            return;
        }
        if (data) {
            fn.call(that, data);
            resolve();
        } else {
            reject('NULL_DATA');
        }
    });
};

Grab.prototype.next = function () {
    var that = this,
        queue = this.queue,
        task = queue && queue.shift(),
        isLast = queue.length === 0;

        var fn = task.fn,
            args = task.args,
            promise;

        if (fn) {
            promise = fn.apply(this, args);
            if (!isLast) {
                promise
                .then(function () {
                    that.next();
                })
                .catch(function(err) {
                    that._log(arguments);
                    that.next();
                });
            }
        } else {
            this.next();
        }

        return this;
    };

Grab.prototype.done = function (fn) {
    var that = this,
        context = this.context;

    return new Promise(function (resolve, reject) {
        fn.call(that, context);
        resolve(context);
    });
};

Grab.prototype.log = function (fn) {
    var that = this,
        context = this.context,
        _log = this._log;

    return new Promise(function (resolve, reject) {
        if (fn) {
            _log(fn.apply(that, context));
            resolve();
        } else {
            reject('NULL_LOG_FN');
        }
    });
};

Grab.prototype.error = function (fn) {
    var that = this,
        context = this.context,
        _log = this._log;

    return new Promise(function (resolve, reject) {
        if (fn) {
            _log(fn.apply(that, context));
            resolve();
        } else {
            reject('NULL_ERROR_FN');
        }
    });
};

module.exports = Grab;