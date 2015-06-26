var fs = require('fs'),					//读写文件模块
	Promise = require('bluebird'),		//Promise模块
	_ = require('underscore'),			//underscore模块
	colors = require('colors/safe'),	//命令行字体颜色模块

	workerNums = 1,						//默认worker个数
	timeout = 10000,					//默认超时时间(10秒)
	retries = 5,						//默认重试次数
	task,								//当前任务对象
	taskName = '',						//当前任务名（用于输出txt的名字）
	taskUrl = '',						//当前任务url
	hostUrl = '',						//当前任务主域名
	configTaskQueue = [],				//配置文件任务入口
	workQueue = [],						//任务的对应主工作队列
	workerArray = [],					//worker数组
	hasDone = [],						//去重，记录所有已爬取过的url
	retryCount = {};					//超时重试次数记录


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
				workerNums = parseInt(config['workerNums']);
				timeout = parseInt(config['timeout']);
				retries = parseInt(config['retries']);
				configTaskQueue = config['tasks'];

				//根据线程数，初始化worker
				for (var i = 0; i < workerNums; i++) {
					var worker = new Worker();
					worker.num = i+1;
					workerArray.push(worker);
				}

				resolve();
			}
			catch (err){
				console.log(colors.red.bold(err));
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

			console.log(colors.cyan.bold('================================'));
			console.log(colors.cyan.bold('Start grabbing task: ' + taskName));
			console.log(colors.cyan.bold('================================'));

			resolve();
		}
		else{
			console.log(colors.red.bold('Get tasks in "config.txt" err!'));
			reject();
		}
	});
}

//清空原有urls.txt，videoInfo.txt
function cleanFiles(){
	return new Promise(function(resolve, reject){
		var write_cnt = 0;
		//确保两个文件都写完才调用resolve
		function finish_writing(){
			if (write_cnt == 2){
				resolve();
			}
		}
		fs.writeFile('website/'+hostUrl+'/output_data/'+taskName+'_urls.txt', '', {"encoding":"utf-8"}, function(err){
			if (err){
				reject(err);
				return ;
			}
			write_cnt ++;
			finish_writing();
		});
		fs.writeFile('website/'+hostUrl+'/output_data/'+taskName+'_videoInfo.txt', '', {"encoding":"utf-8"}, function(err){
			if (err){
				reject(err);
				return ;
			}
			write_cnt++;
			finish_writing();
		});
	});
}

//定义主Worker类
function Worker(){
	this.working = false;		//工作状态
	this.num = 0;				//线程号
	this.url = '';				//当前工作中url
}

//(原型方法)Worker加载url对应路由，找出处理文件
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
		if (_.indexOf(hasDone, data.grabUrls[i]) == -1){
			//若url未被爬取过，推入去重数组
			hasDone.push(data.grabUrls[i]);	
			//推入任务队列
			workQueue.push(data.grabUrls[i]);
			urls_to_Write += data.grabUrls[i] + '\n';
		}
	}

	return new Promise(function(resolve, reject){
		//记录写文件状态
		var need_cnt = 0,
			finish_cnt = 0;

		//确保两个文件都写完才调用resolve
		function finish_writing(){
			if (need_cnt == finish_cnt){
				resolve();
			}
		}
		//视频urls数组
		if (urls_to_Write != ''){
			need_cnt ++;
			fs.appendFile('website/'+hostUrl+'/output_data/'+taskName+'_urls.txt', urls_to_Write, 'utf-8', function(err){
				if (err){
					reject(err);
					return ;
				}
				finish_cnt ++;
				finish_writing();
			});
		}
		//单个视频具体信息
		if (!_.isEmpty(data.videoInfo)){
			need_cnt ++;
			fs.appendFile('website/'+hostUrl+'/output_data/'+taskName+'_videoInfo.txt', JSON.stringify(data.videoInfo) + '\n\n', 'utf-8', function(err){
				if (err){
					reject(err);
					return ;
				}
				finish_cnt++;
				finish_writing();
			})
		}

	});
}

//Worker启动工作函数
Worker.prototype.startup = function(){
	var that = this;

	//启动超时函数记录，timeout时间根据全局配置
	var set_timeout = setTimeout(that.hasTimeout.bind(that), timeout);

	//将工作状态置为true
	that.working = true;

	console.log('Worker ' + that.num + ' start -> ' + that.url);
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
		console.log(colors.green('Worker ' + that.num + ' grab successfully!'));
		//工作完成，将worker状态置为false
		that.working = false;
		clearTimeout(set_timeout);
		that.urlDone();
	})
	.catch(function(err){
		console.log(colors.red.bold('Worker ' + that.num + ' ' +err));
		//任务除错，抛弃任务
		that.working = false;
		clearTimeout(set_timeout);
		that.urlDone();
	});
}

//worker完成一个url后，直接触发自定义事件，请求新url，并触发所有worker一起来high！
//是对直接setInterval定时检测分配的方式进行优化；可减轻线程中事件堆积，均衡同一瞬间的网络请求，提高worker利用率与成功率
Worker.prototype.urlDone = function(){
	for (var i = 0; i < workerNums; i++) {
		if (workQueue.length > 0){
			if (!workerArray[i].working){
				var taskUrl = workQueue.shift();
				workerArray[i].url = taskUrl;
				workerArray[i].startup();
			}
		}
		else{
			break;
		}
	}
}

//worker失败超时函数
Worker.prototype.hasTimeout = function(){
	console.log(colors.yellow.bold('Worker ' + this.num + ' timeout!!! Start a new worker!'));
	//工作状态置为空闲
	this.working = false;

	//对超时的url，判断是否要重新加进工作队列
	var failed_url = this.url;

	//已经重试过
	if (retryCount[failed_url]){
		//重试次数小于配置总次数，继续重试
		if (retryCount[failed_url] < retries){
			workQueue.push(failed_url);
			retryCount[failed_url] ++;
		}
	}
	else{
		workQueue.push(failed_url);
		retryCount[failed_url] = 1;
	}

	//请求新任务
	for (var i = 0; i < workerNums; i++) {
		if (workQueue.length > 0){
			if (!workerArray[i].working){
				var taskUrl = workQueue.shift();
				workerArray[i].url = taskUrl;
				workerArray[i].startup();
			}
		}
		else{
			break;
		}
	}
}

//定义task工作类。同时刻只能有一个活动task对象
function Task(){
	//初始启动 + 配置全局变量 + 清空原有数据
	this.init = function(){
		getStart()
		.then(function(){
			return cleanFiles();
		})
		.then(function(){
			//开始工作！
			var taskUrl = workQueue.shift();
			workerArray[0].url = taskUrl;
			workerArray[0].startup();
		})
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
		console.log(colors.red.bold(err));
		task = null;
	});

	//每隔(10)秒，定时检查当前task是否已完成
	setInterval(function(){
		if (workQueue.length == 0){
			//若为true，有worker处于工作状态，task未完成
			var notFinish = _.some(workerArray, function(worker){
				return worker.working;
			});
			
			//所有worker空闲，证明原任务已完成
			if (!notFinish){
				//清空原任务
				task = null;
				console.log(' ');
				console.log(colors.cyan.bold('Current task is done! Getting new task...'));
				console.log(' ');
				//若有，则取下一个任务
				if (configTaskQueue.length > 0){
					task = new Task();
					task.init();			
				}
				//config.txt中所有任务对已经完成，程序出口，结束程序！
				else{
					console.log(colors.blue.bold('All tasks in "config.txt" has been done!!!'));
					console.log(' ');
					//强制退出进程，防止有时卡死无法退出的情况
					process.exit(0);
				}
			}
		}
	}, 10*1000);
}


//入口
main();