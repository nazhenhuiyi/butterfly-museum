# 原目录迁回与验证

日期：2026-09-09（Asia/Shanghai）。

## 迁回范围

- 原目录：`/Users/zilin/agents-projects/butterfly-museum`。
- 已验收副本：`/Users/zilin/.local/share/dsh-codex-lab/coordinator/data/worktrees/task-22ddc9a0-e97c-4f5e-9603-062cf4ffb590`，完整保留且未修改。
- 迁回前原目录 HEAD 为 `74c3ae9`，提交树为空，仅存在已知未跟踪 `package.json`。读取比较确认差异为已验收版测试脚本及格式调整，未发现额外用户改动。
- 迁回项目源码、锁文件、测试、配置、README、最终验收记录、最终日志、浏览器结果 JSON、五张最终截图及源码哈希。
- 不复制 `.git`、依赖目录、构建产物、缓存、浏览器 profile、测试生成目录、早期 baseline 和旧日志。
- `FINAL-ACCEPTANCE.md` 和 `*-final.*` 原样保留，描述旧副本验收，不是本轮原目录执行结果；其中关于未修改主项目的表述属于迁回前历史状态。
- 应用源码、锁文件、测试和正式 Playwright 配置均未修改；`shasum -a 256 -c evidence/final-source-sha256.txt` 全部 11 项通过。仅更新 README 的迁回状态并新增本轮记录和日志。

## 原目录真实执行结果

环境：Node.js 22.22.1、npm 10.9.4；锁定 Three.js 0.180.0、Vite 7.3.6、Playwright 1.63.0；浏览器使用本机 Google Chrome。

| 命令 | 结果 | 日志 |
| --- | --- | --- |
| `npm ci --cache .npm-cache --no-audit --no-fund` | 退出 0，安装 18 个包 | `migration-install.log` |
| `npm test` | 退出 0，6 通过、0 失败 | `migration-unit-tests.log` |
| `npm run build` | 退出 0，构建成功 | `migration-build.log` |
| `./node_modules/.bin/playwright test --config .browser-tmp/migration.playwright.config.js` | 退出 0，16 通过、0 失败、2 按设备跳过 | `migration-browser-tests.log` |

浏览器验证通过被忽略的临时配置导入正式配置，仅调整配置相对测试路径、服务器工作目录和端口为 4187。未修改测试断言、应用功能或视觉。默认 4173 的旧预览进程（PID 4012）保持运行，不复用、不停止。

临时配置内容如下，留作复现；临时文件及浏览器报告、截图输出不提交：

```js
import config from '../playwright.config.js';

export default {
  ...config,
  testDir: '../tests/browser',
  use: { ...config.use, baseURL: 'http://127.0.0.1:4187' },
  webServer: {
    ...config.webServer,
    command: 'npm run preview -- --port 4187 --strictPort',
    url: 'http://127.0.0.1:4187',
    cwd: process.cwd()
  }
};
```

## 提示与边界

- 生产主 JS 为 538.98 kB（gzip 139.20 kB），仍有 >500 kB 构建提示；不为消除提示改变已验收版本。
- 两项跳过为桌面项目的触摸专用用例与手机项目的鼠标滚轮专用用例，均在适用项目中通过。
- 手机仅为 Chrome/CDP 仿真，未新增物理手机、Safari/Firefox、低端 GPU 或屏幕阅读器实测。
- 待交付文本检查未发现常见私钥、访问令牌、认证字段或带凭据 URL；依赖安全审计未执行。
- 本次只创建一次新的本地 Git 提交，不 amend、不推送、不发布、不修改全局 Git 配置。
