# 基于node.js的简易爬虫框架
对每个想爬取的网站，在website文件夹中，建立一个同根域名子文件夹（如：www.baidu.com）文件夹中 '_.js'为路由文件，用于建立网站子页面，与解析文件的对应关系。输出的数据将,在每个解析器中的'output_data'子文件夹中。

============

在config/config.txt中配置线程数，与入口网站url数组。

###启动命令为 'node main.js' 

最终将在txt/urls.txt中输出爬取过的url，在txt/videoInfo中输出视频的信息集合
