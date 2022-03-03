const {shell} = require('electron')
module.exports = [
  {
    label: '官网',
    click: function () {
      shell.openExternal('http://www.jishuyang.com')
    }
  },
  {
    label: '哔哩哔哩',
    click: function () {
      shell.openExternal('https://space.bilibili.com/494729228')
    }
  },
  {
    label: '码云',
    click: function () {
      shell.openExternal('https://gitee.com/yangjie-oh-yeah')
    }
  }
]
