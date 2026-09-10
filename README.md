# 鳞光 · 蝴蝶三维图谱

基于具名博物馆标本照片的交互式蝴蝶学习图谱，使用 Three.js 与 Vite。静止观察与电影式飞行观赏分开，适配桌面和手机。

## 功能

- 展示 **Morpho menelaus huebneri 雄性**与 **Danaus plexippus plexippus 雄性**。
- 独立背腹面照片配准；支持背面、腹面、侧面快捷观察，以及拖拽旋转和缩放。
- 连续头胸腹、体表鳞纹和短毛、触角、盘卷喙、两条退化前足与四条步行足的受约束三维重建。
- 主动进入 24 秒循环的慢镜飞行：同步翅拍、有限翼面柔性、空间轨迹、跟随及弧线镜头。
- 默认静止；支持暂停/继续、减少动态偏好、页面隐藏暂停，以及图片/WebGL 失败降级。
- 科普信息、Wikipedia 与按需展开的来源说明，不需要账号、后端或环境密钥。

## 本地运行

需要 Node.js 22.12+ 和 npm。

```sh
npm ci
npm run dev
```

```sh
npm run build
npm run preview -- --port 4193 --strictPort
```

构建产物为 `dist/`。运行时标本图片来自本站 `public/specimens/`；只有主动打开资料链接时才访问外部网站。

## 操作

| 输入 | 行为 |
| --- | --- |
| 背面 / 腹面 / 侧面 | 回到对应静止观察面 |
| 拖动 / 单指拖动 | 旋转模型（静止图谱模式） |
| 滚轮 / 双指开合 / +、− | 缩放（静止图谱模式） |
| Shift + 滚轮 / ↑、↓ / 导航按钮 | 切换物种 |
| 手机导航区上下滑动 | 切换物种，不拦截科普区滚动 |
| 重置 / 展厅聚焦后 R | 恢复默认背面视角 |
| 飞行观赏 / 暂停飞行 / 继续飞行 | 进入或暂停/恢复独立飞行镜头 |
| 回到图谱 / Esc | 退出飞行，恢复观察相机和拖拽缩放 |

飞行中换种会先回到图谱，再加载新标本。开启 `prefers-reduced-motion` 时，进入飞行仍暂停，可明确再次点击继续；动态开启减少动态会保持当前姿态暂停。页面隐藏后不累计动画时间。

## 标本、来源与科学限制

四张照片均由 **Didier Descouens / Muséum de Toulouse (MHNT)** 发布，采用 **CC BY-SA 4.0**。完整原图 URL、署名、许可与改编说明见 [资产署名](public/specimens/ATTRIBUTION.txt)。

- 闪蝶照片记录为巴西 Pará 的 huebneri 雄性；未确认个体馆藏号和采集日期。
- 帝王蝶照片记录为魁北克 Lac Valmont 的雄性指名亚种，馆藏字段原文 `MNHT.CUT.2011.0.171`；照片日期不等于采集日期。
- 两种模型按展示尺寸归一化，不宜用模型比较真实翼展。照片保留摄影光照条件，不模拟闪蝶结构色的完整光谱响应。
- 头胸腹、足节、厚度、鳞毛与末端是有参考的近似，不是扫描；未达到科研测量或独立鉴定精度。
- 飞行参考 Johansson 与 Henningsson 的银斑豹蛱蝶起飞研究和补充录像，**不是目标两物种的实测运动**。显示拍频、轨迹、镜头为慢镜展示选择，未求解空气动力学、精确翼翼接触或个体飞行收足姿势。

参考入口：

- [Monarch Watch / University of Kansas：Monarch Biology](https://www.monarchwatch.org/biology/)
- [NC State：Nymphalidae](https://genent.cals.ncsu.edu/insect-identification/order-lepidoptera/family-nymphalidae/)
- [Johansson & Henningsson：柔性翼与起飞机制](https://doi.org/10.1098/rsif.2020.0854)
- [起飞录像 Movie S1](https://rs.figshare.com/articles/journal_contribution/13585729)
- [Vukusic 等：闪蝶结构色研究](https://doi.org/10.1098/rspb.1999.0794)
- [USFWS：帝王蝶自然史](https://www.fws.gov/species/monarch-danaus-plexippus)

当前版本只分发运行所需照片；额外原始参考素材、私人工作日志、完整截图/录像及重复源码快照不纳入当前文件清单或站点。仓库保留早期 Git 历史，历史提交中的旧截图和工作记录仍可访问。

## 测试

```sh
npm test
npx playwright install chromium ffmpeg
E2E_PORT=4194 npm run test:e2e
```

测试端口必须空闲，Playwright 不复用已有站点，结束后自行关闭测试服务。macOS 默认使用安装在标准位置的 Google Chrome；可通过 `CHROME_PATH` 指定浏览器可执行文件。其他平台使用 Playwright Chromium。

覆盖模型结构、循环/时钟与投影约束、桌面/手机交互、进入/退出飞行、reduce、页面可见性分支、异步换种和降级。手机用例为 Chromium 仿真，不代替实体手机、Safari 或生物学准确性验证。构建可能报告主包超过 500kB 的提示。

## Vercel 部署

将此项目导入 Vercel，使用 Vite 预设：`npm run build`，输出目录 `dist`。`vercel.json` 已声明这些设置，不需要环境变量。

也可在自己的账号完成 CLI 登录后使用 `npx vercel --prod`。`.vercel/` 关联元数据仅留本地；`.vercelignore` 排除证据、缓存、日志与测试输出。Git 自动部署需要账号对该仓库的 GitHub 集成授权，不能仅凭一次 CLI 部署推断已接通。

## 源码导航

- `src/morphology.js`：标本记录、手工对应轮廓与配准数据。
- `src/butterfly.js`、`src/body.js`：双面翼面、身体几何、翅根与资源释放。
- `src/flight.js`：飞行采样、时钟、镜头过渡与轻量背景。
- `src/main.js`、`src/interaction.js`：界面、观察控制、异步加载与状态切换。
- `src/species.js`：科普、差异与来源。
- `tests/`：单元与浏览器回归。

## 权利说明

照片、据照片描绘的轮廓/配准及相关改编遵循资产署名中的 **CC BY-SA 4.0**；再分发或改编时须保留相应署名与许可。此项目不暗示博物馆或摄影师背书。

**本仓库没有为无关原创应用代码另行指定开源许可证。** 公开可见不表示所有代码和资产统一采用 MIT；第三方依赖保留各自许可证。
