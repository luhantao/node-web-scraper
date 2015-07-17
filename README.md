# 基于node.js的爬虫框架

##介绍
借鉴自己在公司实习时的爬虫项目经历，自己也开发了一个简易的node.js爬虫框架。框架主要可以用于网站文本信息的抓取，如视频网站中，所有视频标题、概况等介绍信息；微博账号中，大量用户发表的微博内容；新闻网站的多篇报道等等。

##所用核心模块
本框架用到的node核心模块，主要有：cluster多进程模块、Promise格式的bluebird模块、fs文件读写模块、cheerio页面DOM解析模块

##工作原理
在给出一个主入口url后，框架要爬取页面的信息，主要有两类：一类是我们真正需要的信息，如微博内容，视频介绍，新闻文章等；另一类则是下一页/加载更多/微博内容中@的用户/相关文章等，它们的url地址。把这两样信息放在两个数据结构返回，框架把内容信息，写出到txt文件中，而把新的url地址（通常有多个），全加入到框架的工作队列中，供下次爬取，并不断重复循环。

把每个页面想象成，一张图中的一个点，最终就是利用类似BFS宽度优先搜索的思路，对整个域名下的大量页面都进行爬取(需要做去重处理)，并把大量的信息爬取到本地。

##爬取效率优化
对于输入要爬取的，每一个入口url，通常都会有大量的子页面，真正要爬取的页面数，可能会成百上千甚至更多。如果只是采用串行的一个个爬取，效率将会极其低下，网络带宽也没有充分利用起来。在不考虑目标网站会请求密度等做防爬处理时，使用高并发同时爬取是一个很好的选择。而node的基于事件流的设计模式，在这里就显现出很好的优势。

设计时，每一个入口url都对应一个单独的进程，然后在每一个进程中，维护一个workQueue工作队列，装的是所有待爬取的子页面url。每一个url都交给一个worker去爬取，然后worker爬取成功异步回调时，写入爬回来的数据和新的url，并再请求新的任务。通过加大进程中的worker数目，可以使得工作队列中多个任务被并发爬取。

除此之外，我在开发本框架时，还加入了node的cluster多进程模块，对于多个待爬取的入口url（如一个为微博，一个为优酷，一个为youtube），可以在多个子进程中同时爬取，直至所有的入口地址任务，都已经被完成，程序最终才退出。通过测试，在提高并发度后，最终框架的性能瓶颈，主要是在网络带宽。


##使用方法
###一、网站解析
对每个想爬取的网站，需要在website文件夹中，编写对应的爬虫解析(具体例子可参考项目中的www.soku.com解析)。具体的方法如下：
+ 1）建立一个同根域名子文件夹（如：www.soku.com）。
+ 2）在文件夹中添加 '_.js'，作为路由文件，用于建立网站子页面，与对应处理解析文件的映射关系。
+ 3）编写页面解析文件。每一个文件，把页面中对应的子url，和真实所需信息解析后，放在一个json中，并回调返回。
+ 4）在文件夹中，加入'output_data'子文件夹中。输出数据将会存放在这里，其中一个文件为所有爬取过的url地址，另一个为爬取回来的所需信息。

###二、编写配置文件
配置文件位置为config/config.txt，主要内容如下：
+ 1）threadNums：爬取子进程的数目，每一个子进程，对应爬取下面task中的一个任务。若threadNums大于task中剩余的任务数，多余的进程会被杀死。所有任务完成后，所有子进程被杀死，程序退出。
+ 2）workerNums: 每一个进程中，worker的数目。
+ 3）timeout：在爬取url时，worker的超时时间。
+ 4）retries：worker爬取失败时，该url的重试次数。
+ 5）tasks：待完成的爬取任务数组。里面的每一项，name为任务名，用于输出数据时，数据文件的命名；url即为任务的主入口url。

###三、启动
####配置node环境（Ubuntu），命令行进入到项目文件夹，输入命令 'node main.js'


