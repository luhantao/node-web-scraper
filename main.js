var fs = require('fs'),
	Promise = require('bluebird'),
	_ = require('underscore'),

	hostUrl = '',			//当前主机地址
	threads = 1,			//线程数
	interval = 100,			//间隔时间
	taskQueue = [];			//主任务队列


//读取config.txt
function getConfig() {
	return new Promise(function(resolve, reject){
		fs.readFile('./txt/config.txt', 'utf-8', function(err, data){
			if (err){
				reject(err);
				return ;
			}
			//解析json，拿出线程数与入口url
			try{
				var config = JSON.parse(data);
				threads = parseInt(config['threads']);
				interval = parseInt(config['interval']);

				entrance_url = config['entrance_url'][0];
				//取出主机地址
				hostUrl = entrance_url.replace(/http(s*):\/\//, '');
				hostUrl = hostUrl.split('/')[0];
				
				//将入口url，推入任务队列
				taskQueue.push(entrance_url);
				resolve();
			}
			catch (err){
				console.log(err);
				reject(err);
			}
		});	

	});	
}

//清空原有urls.txt，videoInfo.txt
function cleanFiles(){

	return new Promise(function(resolve, reject){
		fs.writeFile('txt/urls.txt', '', {"encoding":"utf-8"}, function(err){
			if (err){
				reject(err);
				return ;
			}
			//非常不好的嵌套写法，但暂时没想到同时处理异步的方法，会有bug。。。
			fs.writeFile('txt/videoInfo.txt', '', {"encoding":"utf-8"}, function(err){
				if (err){
					reject(err);
					return ;
				}
				resolve();
			});
		});
	});
}

//主Worker类
function Worker(){
	this.working = false;
	this.url = '';
}

//Worker加载url对应路由，找出处理文件
Worker.prototype.queryRouter = function(url){
	var routerFile = require('./website/' + hostUrl + '/_.js');
	var router = routerFile()['route'];

	//根据url查询路由表，找出对应解析文件，返回解析接口
	var workerFileName = '';
	for (var i = 0; i < router.length; i++) {
		var cur = router[i];
		var reg = cur[0];

		//匹配路由正则
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
	});

}


//Worker获得数据后写入到文件
Worker.prototype.writeData = function(data){
	var urls_to_Write = '';
	for (var i = 0; i < data.grabUrls.length; i++) {
		//将爬回来的url，推入任务队列
		taskQueue.push(data.grabUrls[i]);
		urls_to_Write += data.grabUrls[i] + '\n';
	}

	var Info = data.videoInfo;

	return new Promise(function(resolve, reject){
		//grabUrls数组不为空
		if (urls_to_Write != ''){
			fs.appendFile('./txt/urls.txt', urls_to_Write, 'utf-8', function(err){
				if (err){
					reject(err);
					return ;
				}
				//电影信息对象不为空
				if (!_.isEmpty(data.videoInfo)){
					fs.appendFile('./txt/videoInfo.txt', data.videoInfo + '\n', 'utf-8', function(err){
						if (err){
							reject(err);
							return ;
						}
						resolve();
					})
				}
				else{
					resolve();
				}
			})
		}
		else{
			resolve();
		}
	});
}

//Worker启动函数
Worker.prototype.startup = function(){
	var that = this;
	//将工作状态置为true
	that.working = true;

	//启动工作
	that
	.queryRouter(that.url)
	.then(function(arg){
		//调用解析接口
		return arg.worker(arg.url);
	})
	.then(function(data){
		return that.writeData(data);
	})
	.then(function(){
		//工作完成，将worker状态置为false
		that.working = false;
		console.log('sucessfully grab ' + that.url);
	})
	.catch(function(err){
		that.working = false;
		console.log(err);
	});
}


//入口函数
function main(){
	//读取配置 + 清空原有数据

	
	getConfig()
	.then(function(){
		return cleanFiles();
	})
	.then(function(){
		//根据线程数，初始化worker
		var workerArray = [];
		for (var i = 0; i < threads; i++) {
			var worker = new Worker();
			workerArray.push(worker);
		}
		//根据间隔，定时检查worker状态
		setInterval(function(){
			console.log(taskQueue.length)
			//有未处理任务
			for (var i = 0; i < threads; i++) {
				if (taskQueue.length > 0){
					//console.log(workerArray[i].working)
					//worker空闲
					if (!workerArray[i].working){
						var taskUrl = taskQueue.shift();
						workerArray[i].url = taskUrl;
						workerArray[i].startup();
					}
				}
				else{
					break;
				}
			}
		}, interval);
	})
}


//主入口
main();


