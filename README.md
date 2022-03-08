# sb3-player

## 下载发行版（推荐）
如果你下载的是发行版zip文件，首先解压zip文件，然后把你的sb3文件命名为scratch.sb3,替换根目录下的resources\app\scratch.sb3，然后双击运行sb3-player.exe即可

## 自己打包
你只需把你的sb3文件命名为scratch.sb3,替换根目录下的resources\app\scratch.sb3，然后运行npm命令进行打包，然后根目录会生成dist_electron文件夹，其中：win-ia32-unpacked是32位免安装版，win-unpacked是64位免安装版，sb3-player Setup 0.1.0.exe是32+64位安装包，

```bash
# 安装
npm install
# 运行web
npm run serve
# 运行electron
npm run electron:serve
# web打包
npm run build
# electron打包
npm run electron:build
```

### 社交平台
- 博客：[技术羊的博客](http://www.jishuyang.com)
- B站：[技术羊](https://space.bilibili.com/494729228)
- QQ：746576029
- 微信：yj746576029
- 抖音：yj746576029
- 快手：yj746576029
- 视频号：技术羊
