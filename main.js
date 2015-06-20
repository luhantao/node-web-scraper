var fs = require('fs'),					//读写文件模块
	Promise = require('bluebird'),		//Promise模块
	_ = require('underscore'),			//underscore模块

	threads = 1,			//默认线程数
	task,					//当前任务对象
	taskName = '',			//当前任务名（用于txt输出）
	taskUrl = '',			//当前任务url
	hostUrl = '',			//当前主机地址
	configTaskQueue = [],	//配置文件入口，任务队列
	workQueue = [],			//任务的对应主工作队列
	workerArray = [];		//worker数组


//读取config.txt配置文件
function getConfig() {
	return new Promise(function(resolve, reject){
		fs.readFile('./config/config.txt', 'utf-8', function(err, data){
			if (err){
				reject(err);
				return ;
			}
			//解析json，拿出线程数与入口url
			try{
				var config = JSON.parse(data);
				threads = parseInt(config['threads']);
				configTaskQueue = config['tasks'];

				//根据线程数，初始化worker
				for (var i = 0; i < threads; i++) {
					var worker = new Worker();
					worker.num = i+1;
					workerArray.push(worker);
				}

				resolve();
			}
			catch (err){
				console.error(err);
				reject(err);
			}
		});	
	});	
}

//根据configTaskQueue中读入的任务，取出第一个，并初始化全局变量
function getStart(){
	return new Promise(function(resolve, reject){
		if (configTaskQueue.length > 0){
			var getNewTask = configTaskQueue.shift();
			//全局记录当前任务
			taskName = getNewTask['name'];
			taskUrl = getNewTask['url'];

			//取出根域名
			hostUrl = taskUrl.replace(/http(s*):\/\//, '');
			hostUrl = hostUrl.split('/')[0];
			workQueue.push(taskUrl);

			console.log('================================');
			console.log('Start grabbing task: ' + taskName);
			console.log('================================');

			resolve();
		}
		else{
			console.error('Get tasks in "config.txt" err!');
			reject();
		}
	});
}

//清空原有urls.txt，videoInfo.txt
function cleanFiles(){
	return new Promise(function(resolve, reject){
		fs.writeFile('website/'+hostUrl+'/output_data/'+taskName+'_urls.txt', '', {"encoding":"utf-8"}, function(err){
			if (err){
				reject(err);
				return ;
			}
			//非常不好的嵌套写法（慢！），但暂时没想到，同时处理异步的方法，会有bug。。。
			fs.writeFile('website/'+hostUrl+'/output_data/'+taskName+'_videoInfo.txt', '', {"encoding":"utf-8"}, function(err){
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
	this.num = 0;
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
		workQueue.push(data.grabUrls[i]);
		urls_to_Write += data.grabUrls[i] + '\n';
	}

	var Info = data.videoInfo;

	return new Promise(function(resolve, reject){
		//grabUrls数组不为空
		if (urls_to_Write != ''){
			fs.appendFile('website/'+hostUrl+'/output_data/'+taskName+'_urls.txt', urls_to_Write, 'utf-8', function(err){
				if (err){
					reject(err);
					return ;
				}
				//电影信息对象不为空
				if (!_.isEmpty(data.videoInfo)){
					fs.appendFile('website/'+hostUrl+'/output_data/'+taskName+'_videoInfo.txt', data.videoInfo + '\n', 'utf-8', function(err){
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

//Worker启动工作函数
Worker.prototype.startup = function(){
	var that = this;
	//将工作状态置为true
	that.working = true;
	console.log('Thread ' + that.num + ' start -> ' + that.url);

	//启动工作
	that
	.queryRouter(that.url)
	.then(function(arg){
		//调用解析接口
		return arg.worker(arg.url);
	})
	.then(function(data){
		//写获得数据
		return that.writeData(data);
	})
	.then(function(){
		//工作完成，将worker状态置为false
		that.working = false;
		console.log('Thread ' + that.num + ' finish -> ' + that.url);
	})
	.catch(function(err){
		//任务除错，抛弃任务
		that.working = false;
		console.error('Thread ' + that.num + ' ' +err);
	});
}


//task工作类。同时刻只能有一个活动对象
function Task(){
	var worker_interval;
	//初始启动 + 配置全局变量 + 清空原有数据
	this.init = function(){
		getStart()
		.then(function(){
			return cleanFiles();
		})
		.then(function(){
			//定时检查worker状态
			worker_interval = setInterval(function(){
				//有未处理任务
				for (var i = 0; i < threads; i++) {
					if (workQueue.length > 0){
						//worker空闲，派发新任务
						if (!workerArray[i].working){
							var taskUrl = workQueue.shift();
							workerArray[i].url = taskUrl;
							workerArray[i].startup();
						}
					}
					else{
						//暂时任务队列为空
						break ;
					}
				}
			}, 100);
		})
	};
	this.done = function(){
		clearInterval(worker_interval);
	};
}

//主入口函数
function main(){
	//初始调用getConfig，然后启动任务函数
	getConfig()
	.then(function(){
		task = new Task();
		task.init();
	})
	.catch(function(err){
		console.error(err);
		task.done();
		task = null;
	});

	//定时检查当前task是否已完成
	var task_interval = setInterval(function(){
		if (workQueue.length == 0){
			//有worker处于工作状态，未完成
			var notFinish = _.some(workerArray, function(worker){
				return worker.working;
			});
			
			//所有worker空闲，证明原任务已完成
			if (!notFinish){
				//清空原任务
				task.done();
				task = null;
				console.log(' ');
				console.log('current task done! Getting new task...');
				console.log(' ');
				//若有，则取下一个任务
				if (configTaskQueue.length > 0){
					task = new Task();
					task.init();			
				}
				//config.txt中所有任务对已经完成，结束程序！
				else{
					console.log('All tasks in "config.txt" has been dong!!!');
					clearInterval(task_interval);
				}
			}
		}
	}, 5*1000);
}


//入口
main();
