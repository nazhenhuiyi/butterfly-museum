# 最终验收记录

日期：2026-09-09（Asia/Shanghai）。本记录描述权限更新后在任务 worktree 内直接完成的最新验收；早期 `baseline/` 与非 `-final` 日志保留历史过程，不代表当前验收状态。

## 结果

| 项目 | 实际结果 | 证据 |
| --- | --- | --- |
| 依赖与锁文件 | 在线安装成功，随后锁文件离线重装成功 | `install-final.log` |
| 生产构建 | 成功，保留 >500kB 提示 | `build-final.log` |
| 单元测试 | 6 通过，0 失败 | `unit-tests-final.log` |
| 生产构建浏览器测试 | 16 通过，0 失败，2 设备不适用跳过 | `browser-tests-final.log` |

环境：Node 22.22.1、Chrome 152.0.7977.83、Three.js 0.180.0、Vite 7.3.6、Playwright 1.63.0。使用本机 Chrome headless、独立临时 profile，不读取日常浏览器个人数据。测试访问 `vite preview`，不是仅检查测试文件存在。

两项跳过分别为桌面上下文中的手机触摸专用用例、手机上下文中的鼠标滚轮专用用例。对应交互均已在适用上下文执行。

## 最终截图

- `desktop-morpho.png`、`desktop-monarch.png`：1440×1000 桌面，两种标本。
- `mobile-morpho.png`、`mobile-monarch.png`：390×844 手机尺寸仿真，完整页面，像素比 2。
- `mobile-webgl-fallback.png`：拦截 WebGL 创建后的降级提示。

这些根目录截图将由本次最后一次测试输出更新，不是设计稿或早期 baseline。测试比较两种模型的画布截图，断言学名和科普信息同步；视觉辨识由人工看图补充判断。

## 已覆盖

按钮、方向键切换；拖动旋转；缩放及上下限；重置；普通滚轮缩放、Shift 滚轮切换；桌面文案独立滚动；手机 CDP 触摸旋转、双指缩放、导航区上下滑动及文案滚动；扇翅暂停；reduced-motion 默认及动态设置；WebGL 创建失败；WEBGL_lose_context 触发的上下文丢失；320px 窄屏溢出检查；参考与艺术化说明可见性。

## 科学核验

- 已实际读取 FWS 帝王蝶页面：确认北美存在迁徙与非迁徙种群、东西部越冬地点、乳草依赖及多世代迁徙说明。页面链接为 https://www.fws.gov/species/monarch-danaus-plexippus 。
- Crossref API 确认 *Quantified interference and diffraction in single Morpho butterfly scales* 的题名、作者与 DOI `10.1098/rspb.1999.0794`。未通读论文全文，不声称模型为论文中的几何复原。
- 已移除早期 404 或受访问挑战拦截的链接。

## 未验证与限制

未做物理手机、Safari / Firefox、低端 GPU 帧率、屏幕阅读器实际朗读或长期内存压力测试。手机为 Chrome 仿真。JS 主包约 539kB（gzip 139kB），存在构建体积提示。模型是艺术化背面展示，腹面复用纹理，不用于物种鉴定或科研。

没有合并、发布、部署或改动主项目。`final-source-sha256.txt` 标记本轮测试对应的源码快照；如随后源码改变，应重新运行验收。
