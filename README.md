# 山城赴约

以重庆立体山城为主题的浏览器探索小游戏。亲自走过街巷和梯道，搭乘直梯、扶梯、单轨与索道，管理100点体力，完成四次赴约。不限时，沿途发现自愿探索。

在线试玩：[山城赴约](https://rrrrrrubbish.github.io/shancheng-rendezvous/)。电脑和手机均可通过链接打开，手机建议横屏。

## 操作

| 设备 | 移动 | 观察 | 搭乘与暂停 |
| --- | --- | --- | --- |
| 电脑 | WASD或方向键 | 鼠标左键拖动，V总览，R居中 | 入口附近按E，Esc暂停 |
| 手机 | 左下虚拟摇杆 | 另一指拖动场景，点击总览或居中 | 点击乘坐提示、暂停按钮 |

手机横屏优先，竖屏也能操作。轻推摇杆慢走，松手停止。角色行走和爬升消耗体力；自动交通不消耗步行体力，轨道首次有效行程可恢复20点，青色歇脚点首次经过自动恢复15点。体力归零后可回歇脚点或重试。

## 四个目的地

1. **李子坝**：从佛图关方向上单轨，到李子坝下车，再步行前往观景平台。
2. **皇冠大扶梯**：搭乘长坡扶梯，或沿中层街巷、近路与折返梯道探索。
3. **长江索道**：寻找站口、跨江观景，到岸后继续步行赴约。
4. **黄桷湾立交**：沿五层主线与弯曲匝道寻找上行路线。

场景为真实地标主题的局部压缩和游戏改编，不作为现实导航。黄桷湾是以机动车立交为原型的游戏化步行关卡，不代表现实匝道允许行人进入。

## 本地运行

需要Node.js 24和npm。

```sh
npm ci
npm run dev
```

默认开发地址为 http://127.0.0.1:5173。局域网手机测试可执行 `npm run dev:lan`，然后在同一网络的手机上打开终端显示的Network地址。

```sh
npm test
npm run build
npm run check:pages
npm run preview
```

生产预览默认 http://127.0.0.1:4173；dist需要HTTP服务。推荐支持WebGL的现代Chrome、Edge或Safari；可以在设置中切换轻量画质、减少动态效果和音量。真实手机表现取决于设备。

## 自动部署

推送main后，GitHub Actions使用锁定依赖安装、规则测试、类型检查和生产构建，再验证发布文件并部署到Pages。仓库子路径由PAGES_BASE_PATH配置，发布目录仅为dist。部署状态见 [Actions](https://github.com/RrRrRrubbish/shancheng-rendezvous/actions/workflows/pages.yml)。

部署来源使用Settings → Pages → Build and deployment → Source → **GitHub Actions**。日常更新推送main即可，无需手动上传dist。

维护者通过SSH推送：

```sh
git push origin main
```

## 数据与许可

进度、札记与设置保存在当前浏览器；没有账号或服务端存档。刷新会结束本关，保留已完成进度。文化说明使用重庆政府部门和华龙网正文，具体来源可在游戏中查看。

代码许可见 [LICENSE](LICENSE)，第三方声明见 [THIRD_PARTY_NOTICES](public/THIRD_PARTY_NOTICES.txt)。
