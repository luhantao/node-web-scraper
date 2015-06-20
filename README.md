# 基于node.js的爬虫框架demo
对每个想爬取的网站，在website文件夹中，建立一个同名子文件夹（使用根域名，如：www.baidu.com）文件夹中_.js为路由文件，用于建立网站子页面，与解析文件的对应关系。

============

在txt/config.txt中配置线程数，与入口网站url。

###启动命令为 'node main.js' 

最终将在txt/urls.txt中输出爬取过的url，在txt/videoInfo中输出视频的信息集合
