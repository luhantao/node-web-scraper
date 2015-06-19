var fs = require('fs'),
	Promise = require('bluebird'),
	_ = require('underscore');

//从grabList.txt中取得任务url
function getWebsite() {
	return new Promise(function(resolve, reject){
		fs.readFile('grabList.txt', 'utf-8', function(err, data){
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
function loadRouter(url){
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
function loadWorker(url, hostUrl, router){
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



//主入口
getWebsite()
.then(function(url){
	return loadRouter(url);
})
.then(function(arg){
	return loadWorker(arg.url, arg.hostUrl, arg.router);
})
.then(function(arg){
	return arg.worker(arg.url);
})
.then(function(data){
	console.log(data)
})
.catch(function(err){
	console.log(err);
});