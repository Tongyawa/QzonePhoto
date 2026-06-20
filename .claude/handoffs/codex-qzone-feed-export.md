# Handoff: codex-qzone-feed-export

## 1. 意图与验收

问题：QzonePhoto GUI 的好友主页动态下载只保存媒体和摘要目录名，不能把完整说说正文、评论、点赞/转发/浏览统计和真实 mp4 视频一起落盘。

完成 = 可以用本仓库脚本从已登录的 QzonePhoto 登录态导出指定好友主页动态；`full` 版保留审计字段和媒体清单，`llm` 版去除冗余字段、压缩昵称和评论日期；默认下载图片和真实 mp4；真实配置、cookie、签名 URL、导出 data 不进入 git。

## 2. 范围

改了：

- 新增 `scripts/export-qzone-feeds.mjs` 动态导出脚本。
- 新增 `scripts/qzone-feed-export.config.example.json`，本地 `.local.json` 配置由 `.gitignore` 忽略。
- 新增/更新导出说明、源码分析和协作约束文档。
- 更新 `.gitignore`，忽略导出目录、本地配置和本地测试产物目录。

没改：

- 没改 Electron/Vue GUI 功能。
- 没提交任何真实导出内容、好友正文、评论、图片、视频、cookie、`p_skey` 或签名媒体 URL。
- 没向上游 `main` 拉取或合并更新。

## 3. 改动

- `.gitignore`：新增 `/exports/`、`/.test/`、`.claude/test-artifacts/local-only/` 和本地 `qzone-feed-export.config.local.json` 忽略规则，降低误 `git add` 风险。
- `CLAUDE.md`：写入本项目目录、隐私、配置和测试产物约束，便于多 Agent 接手。
- `scripts/export-qzone-feeds.mjs`：从 QzonePhoto Local Storage/Cookie DB 或 CLI/env 获取登录态；分页抓主页/说说；补齐评论；解析点赞/转发/浏览；下载图片和视频；支持 `full`/`llm`、`--skip-media`、`--no-video`、`--include-urls`、`--config`。
- `scripts/qzone-feed-export.config.example.json`：提供可复制的本地配置模板；真实 `.local.json` 不上云。
- `scripts/README-qzone-feed-export.md`：说明脚本用法、配置、输出结构和 LLM 模式。
- `README.codex-qzone-export.md`：说明 Git/fork/upstream 结构、上游更新流程、full/llm 区别、单独运行命令和 data 不入库规则。
- `docs/qzone-feed-export-analysis.md`：记录 GUI 源码依据、为什么原 GUI 不落正文评论、脚本实现策略和计数字段注意点。

## 4. 决策与假设

含糊点：视频 mp4 应从哪里拿。

选择：先保留 feed HTML 内已有视频候选；对视频媒体再调用 `video_get_data` 建立索引，按时间、封面和标识符补真实 mp4；下载时若候选返回图片 content-type，则继续尝试后续候选。

依据：目标是“不让单个视频失败中断整批导出”，同时默认尽力保存真实 mp4。

何时重选：如果 QQ 空间视频接口返回结构变化，或 feed HTML 不再包含直连视频候选，应重审 `fetchVideoIndex`、`extractVideoArray`、`videoMatchScore`。

含糊点：本地运行参数如何避免上云。

选择：脚本自动读取 `scripts/qzone-feed-export.config.local.json`，仓库只提交 `.example.json`；CLI/env 仍可覆盖配置。

依据：目标 QQ、输出路径、登录参数是本机隐私；配置文件提升本地可用性，同时由 `.gitignore` 防泄露。

## 5. 验证

命令：

```powershell
node --check scripts\export-qzone-feeds.mjs
node scripts\export-qzone-feeds.mjs --help
git check-ignore -v scripts\qzone-feed-export.config.local.json qzone-feed-export.config.local.json exports\dummy.txt .claude\test-artifacts\local-only\dummy.txt
rg -n "<真实目标QQ>|<真实账号QQ>|<本机用户名>|<正文样本>|<签名URL特征>" CLAUDE.md README.codex-qzone-export.md docs scripts .gitignore
```

结果：

- 语法检查通过。
- `--help` 正常输出，包含 `--config`、`--no-video`、`--skip-media` 等参数。
- 本地配置、导出目录和本地测试产物目录均被 `.gitignore` 命中。
- 敏感扫描未命中真实 QQ、真实本机路径、正文样本、cookie 或签名 URL。
- 本机会话联网全量验证通过：`full` 与 `llm` 均导出 296 条动态、815 个媒体文件、43 个 mp4；两版媒体扩展名统计一致。真实导出路径和内容未写入仓库。

环境前提：

- Windows PowerShell。
- Node.js 可运行 ES module 脚本。
- QzonePhoto 已登录，或提供有效 `QZONE_UIN/QZONE_P_SKEY`/本地配置。
- 联网访问 QQ 空间官方接口。

未覆盖：

- 未在全新机器上验证 Local Storage/Cookie DB 路径自动发现。
- 未对 QQ 接口结构变化做 fixture 测试。
- 未接入 GUI。

## 6. 风险与评审重点

重点查：

- `scripts/export-qzone-feeds.mjs` 的 HTML 解析启发式、评论合并、视频 URL 候选排序和 content-type 回退。
- `llm` 模式是否真正去掉作者 QQ、类型/appid、媒体列表和评论 QQ。
- `.gitignore` 是否足以阻止本地配置与导出 data 误提交。

薄弱点：

- QQ 空间接口偶发 `Invalid right`，脚本有重试和保留已收集内容逻辑，但仍依赖登录态和接口稳定性。
- `video_get_data` 返回数量可能有限；当前全量验证主要依赖 feed HTML 中已有真实 mp4 候选，视频索引用作补充。
- 某些导出轮次可能出现单个媒体临时下载失败；最终交付前需要用扩展名和数量统计复核。

未验证启发式：

- 极老动态、转发动态、分享类动态的字段结构可能和目标样本不同。
- 非 Windows 平台的 QzonePhoto userData 路径需要另行确认。

## 7. 状态

分支/worktree：`codex-qzone-feed-export` / `E:\.100_Code\Github\QzonePhoto\.claude\worktrees\codex-qzone-feed-export`

base main SHA：`79cd1fa67e50b68413bd4745286a23fac790bf3d`

提交：

- `c8e928e feat: 增加 QQ 空间动态导出脚本`
- 本 handoff 提交将作为分支最后一个提交。

已 rebase：否，分支从当前 `main` 切出后未拉取上游更新。

已 push：提交 handoff 时未 push；本轮随后推送到 `origin/codex-qzone-feed-export`。

## 8. 待办与移交

下一个 Agent：

- 如要集成进新版 GUI，先读 `README.codex-qzone-export.md` 和本 handoff，再决定是保留独立脚本还是抽取接口到 `src/main/api/qzone/`。
- 如原项目后续更新，先 `git fetch upstream`，在 `main` 上 `merge --ff-only upstream/main`，再 rebase 本分支，只处理脚本/文档相关冲突。

阻塞：无。

待人决策：

- 是否把导出能力接入 GUI。
- 是否把 `llm` 输出进一步改成 JSONL/训练样本格式。

---

## 评审

结论：未评审。

查了&命令：无。

没查：无。

问题：无。

最小修复：无。
