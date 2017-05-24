var cluster = require('cluster'),		//多进程模块
 	fs = require('fs'),					//读写文件模块
	Promise = require('bluebird'),		//Promise模块
	_ = require('underscore'),			//underscore模块
	colors = require('colors/safe'),	//命令行字体颜色模块

	threadNums = 1,						//默认子进程数
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


//主进程读取config.txt配置文件
function master_getConfig() {
	return new Promise(function(resolve, reject){
		fs.readFile('./config/config.txt', 'utf-8', function(err, data){
			if (err){
				reject(err);
				return ;
			}
			//解析json，拿出线程数与入口url
			try{
				var config = JSON.parse(data);
				threadNums = parseInt(config['threadNums']);
				workerNums = parseInt(config['workerNums']);
				timeout = parseInt(config['timeout']);
				retries = parseInt(config['retries']);
				configTaskQueue = config['tasks'];

				resolve();
			}
			catch (err){
				console.log(colors.red.bold(err));
				reject(err);
			}
		});	
	});	
}

//子进程更新配置信息
function childProc_updateConfig(){
	return new Promise(function(resolve, reject){
		process.on('message', function(message){
			if (message.type == 'updateConfig'){
				workerNums = message.workerNums;
				timeout = message.timeout;
				retries = message.retries;

				resolve();
			}
		});
	});
}

//子进程向主进程请求task，并初始化
function childProc_getStart(){
	return new Promise(function(resolve, reject){
		//向主进程请求获得新任务
		process.send({
			type: 'getNewTask',
		});
		process.on('message', function(message){
			if (message.type == 'hasNewTask'){
				var getNewTask = message.newTask;
				//全局记录当前任务
				taskName = getNewTask['name'];
				taskUrl = getNewTask['url'];

				//取出根域名
				hostUrl = taskUrl.replace(/http(s*):\/\//, '');
				hostUrl = hostUrl.split('/')[0];
				workQueue.push(taskUrl);

				console.log(colors.cyan.bold('====================================='));
				console.log(colors.cyan.bold('Thread ' + cluster.worker.id + ' start grabbing task: ' + taskName));
				console.log(colors.cyan.bold('====================================='));

				//根据配置worker数，初始化worker
				workerArray = [];
				for (var i = 0; i < workerNums; i++) {
					var worker = new Worker();
					worker.num = i+1;
					workerArray.push(worker);
				}

				resolve();
			}
		});
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

	console.log('Thread ' + cluster.worker.id + ' Worker ' + that.num + ' start -> ' + that.url);
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
		console.log(colors.green('Thread ' + cluster.worker.id + ' Worker ' + that.num + ' grab successfully!'));
		//工作完成，将worker状态置为false
		that.working = false;
		clearTimeout(set_timeout);
		that.urlDone();
	})
	.catch(function(err){
		console.log(colors.red.bold('Thread ' + cluster.worker.id + ' Worker ' + that.num + ' ' +err));
		//socket hang up 错误时候加入队列重试
		if (err == 'Error: socket hang up'){
			var failed_url = that.url;

			if (retries > 0){
				//已经重试过
				if (retryCount[failed_url]){
					//重试次数小于配置总次数，继续重试
					if (retryCount[failed_url] < retries){
						console.log(colors.yellow('Socket hang up, retry'));
						workQueue.push(failed_url);
						retryCount[failed_url] ++;
					}
				}
				else{
					console.log(colors.yellow('Socket hang up, retry'));
					workQueue.push(failed_url);
					retryCount[failed_url] = 1;
				}
			}
		}
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
	console.log(colors.yellow.bold('Thread ' + cluster.worker.id + ' Worker ' + this.num + ' timeout!!! Restart worker!'));
	//工作状态置为空闲
	this.working = false;

	//对超时的url，判断是否要重新加进工作队列
	var failed_url = this.url;

	if (retries > 0){
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
		childProc_getStart()
		.then(function(){
			return cleanFiles();
		})
		.then(function(){
			//开始工作！
			var taskUrl = workQueue.shift();
			workerArray[0].url = taskUrl;
			workerArray[0].startup();
		})
		.catch(function(err){
			console.log(colors.red.bold(err));
			//this = null;
			retrun ;
		});
	};
}

//主入口函数
function main(){
	//主进程
	if (cluster.isMaster){
		//读取配置文件
		master_getConfig()
		.then(function(){
			//记录被杀死的子进程数
			var thread_killed_num = 0;
			//初始化子进程
			var threads = [];
			for (var i = 0; i < threadNums; i++){
				threads[i] = cluster.fork();
				//发送配置文件中信息给子进程
				threads[i].send({
					type: 'updateConfig',
					workerNums: workerNums,
					timeout: timeout,
					retries: retries,
				});

				(function(i){
					//主进程监听子进程消息
					threads[i].on('message', function(message){
						if (message.type == 'getNewTask'){
							//有未处理task
							if (configTaskQueue.length > 0){
								var newTask = configTaskQueue.shift();
								threads[i].send({
									type: 'hasNewTask',
									newTask: newTask
								});
							}
							//任务已全部派发完毕，杀死子进程！
							else{
								console.log(colors.cyan('No more new Tasks, kill thread ' + (i+1)));
								threads[i].kill();
								thread_killed_num ++;
								//全部子进程被杀，全部任务完成，结束主进程！
								if (thread_killed_num == threadNums){
									console.log(colors.blue.bold('All tasks in "config.txt" has been finished!!! Program exit'));
									console.log(' ');
									process.exit(0);
								}
							}
						}
					});
				})(i);

			}
		})
	}
	//子进程
	else{
		childProc_updateConfig()
		.then(function(){
			task = new Task();
			task.init();
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
					console.log(colors.cyan.bold('Task in thread ' + cluster.worker.id + ' is done! Getting new task...'));
					console.log(' ');
					//取下一个任务
					task = new Task();
					task.init();			
				}
			}
		}, 10*1000);
	}
}


//入口
main();