# Codex QQ 空间动态导出说明

## 当前 Git 结构

本仓库保留原项目上游和自己的 fork：

```powershell
origin   = https://github.com/Tongyawa/QzonePhoto.git
upstream = https://github.com/11273/QzonePhoto.git
```

Codex 改动位于独立 worktree/分支：

```powershell
E:\.100_Code\Github\QzonePhoto\.claude\worktrees\codex-qzone-feed-export
branch: codex-qzone-feed-export
```

不要在有未提交改动的分支上执行 `git pull`。同步原项目新版时使用：

```powershell
git status --short --branch
git fetch upstream
git switch main
git merge --ff-only upstream/main
git switch codex-qzone-feed-export
git rebase main
```

如有冲突，只处理脚本和文档相关文件；导出的 data 不进 git。提交时显式列文件，不使用 `git add .`。

## 新增能力

新增脚本 `scripts/export-qzone-feeds.mjs`，用于导出好友主页动态：

- 正文全文、评论、点赞/评论/转发/浏览统计。
- 图片和视频媒体文件。
- 默认解析真实 mp4 视频；`--no-video` 可禁用 mp4 解析，仅保存视频封面。
- `full` 和 `llm` 两种输出格式。
- 登录态优先来自参数/环境变量，其次读取 QzonePhoto Local Storage，再回退 Cookie DB。

视频解析逻辑：

1. 先使用 feed HTML 中已有的媒体 URL。
2. 对动态里的视频，调用 QQ 空间 `video_get_data` 建立视频索引。
3. 用动态时间、视频序号、封面 URL 和标识符匹配真实 mp4 URL。
4. 匹配失败时保留该动态和封面，并在控制台输出 warning，不中断整批导出。

## 导出结构

根目录：

```text
<out>/
├── index.md
├── feeds.json
├── llm-corpus.md        # 仅 --format llm 生成
└── <YYYYMMDD-HHmm_正文摘要...>/
    ├── index.md
    ├── 01_photo_1.jpg
    ├── 02_video_1.mp4
    └── ...
```

`full` 的 `feeds.json` 保留完整结构：`tid/topicId/uin/name/appid/type/text/stats/comments/media/directory`。`media[]` 包含 `id/name/type/localFile/downloadSource`；只有显式加 `--include-urls` 才写入签名媒体 URL。

`llm` 的 `feeds.json` 为轻量结构：`time/text/stats/comments/directory`。`stats` 可包含 `likes/comments/forwards/views/media/videos`，不列媒体文件清单；媒体文件仍在每条动态目录里。

## full 与 llm 区别

`full` 适合审计和完整归档：

- 保留作者 QQ、类型/appid、统计、评论、媒体文件列表。
- 每条动态一个 `index.md`，根目录 `index.md` 汇总链接。

`llm` 适合蒸馏：

- 去掉单条 `index.md` 的作者 QQ、类型/appid、媒体列表。
- 评论作者不带 QQ 号；昵称压缩为最后一个 `-` 或空格后的文本，并去掉第一个 `（` 或 `(` 后的说明。
- 同一日期连续评论只在首条显示日期，后续只显示时间。
- 根目录额外生成 `llm-corpus.md`，便于直接投给 LLM。

## 常用命令

推荐先复制示例配置，再编辑本地私有配置：

```powershell
Copy-Item .\scripts\qzone-feed-export.config.example.json .\scripts\qzone-feed-export.config.local.json
notepad .\scripts\qzone-feed-export.config.local.json
```

`scripts/qzone-feed-export.config.local.json` 已被 `.gitignore` 忽略，可写真实目标 QQ、输出目录和本地登录参数。配置存在时可直接运行：

```powershell
node .\scripts\export-qzone-feeds.mjs
```

也可以显式指定配置文件：

```powershell
node .\scripts\export-qzone-feeds.mjs --config .\scripts\qzone-feed-export.config.local.json
```

完整归档，默认下载图片和真实 mp4，命令行参数会覆盖配置：

```powershell
node .\scripts\export-qzone-feeds.mjs --source home --target 123456789 --comments full --format full --out "D:\QzonePhoto\exports\123456789-full"
```

LLM 语料，默认下载图片和真实 mp4：

```powershell
node .\scripts\export-qzone-feeds.mjs --source home --target 123456789 --comments full --format llm --out "D:\QzonePhoto\exports\123456789-llm"
```

LLM 纯文本，不下载媒体：

```powershell
node .\scripts\export-qzone-feeds.mjs --source home --target 123456789 --comments full --format llm --skip-media --out "D:\QzonePhoto\exports\123456789-llm-text"
```

禁用真实 mp4 解析，仅保留视频封面：

```powershell
node .\scripts\export-qzone-feeds.mjs --source home --target 123456789 --comments full --format full --no-video --out "D:\QzonePhoto\exports\123456789-cover-only"
```

## 不提交 data

真实导出内容、图片、视频、`feeds.json`、签名 URL、cookie、`p_skey` 都不进入 git。推荐输出到源码目录以外，例如 `D:\QzonePhoto\exports\...`。如果临时输出到仓库内，`/exports/` 已被 `.gitignore` 忽略。

本地配置文件也不提交：

- `qzone-feed-export.config.local.json`
- `scripts/qzone-feed-export.config.local.json`

仓库只保留 `scripts/qzone-feed-export.config.example.json` 作为字段示例。

提交前检查：

```powershell
git status --short
rg -n "p_skey|cookie|https://.*(qpic|photovideo|photo.qq|qzone)" .
```

如果 `git status` 出现导出目录、图片、视频或真实好友内容，不要提交。
