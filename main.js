var fs = require('fs'),
	Promise = require('bluebird'),
	_ = require('underscore'),

	taskQueue = [];			//主任务队列



//从entrance_url.txt中取得任务url
function getEntrance() {
	return new Promise(function(resolve, reject){
		fs.readFile('./txt/entrance_url.txt', 'utf-8', function(err, data){
			if (err){
				reject(err);
				return ;
			}
			//解析json，拿出首个url
			try{
				var urlArr = JSON.parse(data);
				var url = urlArr[0];	
				resolve(url);
			}
			catch (err){
				console.log(err);
				reject('PARSE ERROR!');
			}
		});	
	});	
}


//加载该网站对应路由
worker.prototype.loadRouter = function(url){
	//截去http(s)://
	var hostUrl = url.replace(/http(s*):\/\//, '');
	//取出主机地址，加载对应路由
	hostUrl = hostUrl.split('/')[0];
	var routerFile = require('./website/' + hostUrl + '/_.js');
	var router = routerFile()['route'];

	return new Promise(function(resolve, reject){
		resolve({
			url: url,
			hostUrl: hostUrl,
			router: router
		});
	});
}

//找出输入url的解析文件，获得解析接口
worker.prototype.loadWorkFile = function(url, hostUrl, router){
	var workerFileName = '';
	for (var i = 0; i < router.length; i++) {
		var cur = router[i];
		var reg = cur[0];

		if (url.match(reg)){
			workerFileName = cur[1];
			break;
		}
	}

	return new Promise(function(resolve, reject){
		//找到解析文件
		if (workerFileName != ''){
			var worker = require('./website/' + hostUrl + '/' + workerFileName);
			resolve({
				url: url,
				worker: worker
			});
		}
		else{
			reject('NO MATCH PATH');
		}
	})
}

//获得数据后写入到文件
worker.prototype.writeUrls = function(data){
	var urls = '';
	for (var i = 0; i < data.grabUrls.length; i++) {
		urls += dta.grabUrls[i] + '\n';
	}

	var Info = data.videoInfo;

	return new Promise(function(resolve, reject){
		var flag1 = false,
			flag2 = false;
		//url数组不为空
		if (urls != ''){
			fs.appendFile('./txt/urls.txt', urls,  'utf-8', function(err, data){
				flag1 = true;
				if (err){
					reject(err);
					return ;
				}
			})
		}
		//电影信息对象不为空
		if (!_.isEmpty(data.videoInfo)){
			fs.appendFile('./txt/videoInfo.txt', data.videoInfo,  'utf-8', function(err, data){
				flag2 = true;
				if (err){
					reject(err);
					return ;
				}
			})
		}
		while (true){
			if (flag1 && flag2){
				resolve();
				break;
			}
		}
	});
}

//worker启动函数
worker.prototype.startup = function(){
	var that = this;
	//将工作状态置为true
	that.working = true;

	//启动工作
	that
	.loadRouter(that.url)
	.then(function(arg){
		return that.loadWorkFile(arg.url, arg.hostUrl, arg.router);
	})
	.then(function(arg){
		return arg.worker(arg.url);
	})
	.then(function(data){

	})
}


//主worker类
function worker(url){
	this.working = false;
	this.url = url;
	//worker启动函数
	this.startup = startup;
}



//主入口
getEntrance()
.then(function(url){
	return loadRouter(url);
})
.then(function(arg){
	return loadWorkFile(arg.url, arg.hostUrl, arg.router);
})
.then(function(arg){
	return arg.worker(arg.url);
})
.then(function(data){
	console.log(data)
	for (var i = 0; i < data.grabUrls.length; i++) {
		taskQueue.push(data.grabUrls[i]);
	}
})
.catch(function(err){
	console.log(err);
});