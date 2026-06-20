# QQ 空间好友动态导出工具

## 背景

QzonePhoto v2.5.0 的 GUI 动态页能拉到好友主页正文、评论和媒体，但下载服务只把图片/视频加入任务队列。下载目录名来自 `feed.desc` 摘要，因此会截断长文案，也不会写评论。

本脚本复用同一批 QQ 空间官方接口：

- `feeds_html_module` / `feeds_html_act_all`：分页拉好友主页动态 HTML。
- `emotion_cgi_ic_getcomments`：按动态补齐评论 HTML。
- 媒体 URL：从动态 HTML 的图片/视频节点提取并下载。

## 使用

先复制示例配置，填写真实目标 QQ 和输出目录：

```powershell
Copy-Item .\scripts\qzone-feed-export.config.example.json .\scripts\qzone-feed-export.config.local.json
notepad .\scripts\qzone-feed-export.config.local.json
```

`scripts/qzone-feed-export.config.local.json` 已被 git 忽略。配置存在时，在 worktree 根目录直接运行：

```powershell
node .\scripts\export-qzone-feeds.mjs
```

也可以不用配置，直接在命令行传参：

```powershell
node .\scripts\export-qzone-feeds.mjs --target 123456789 --out "D:\QzonePhoto\exports\123456789"
```

如果不想关闭 QzonePhoto，也可以显式传登录态：

```powershell
$env:QZONE_UIN = "o<你的QQ>"
$env:QZONE_P_SKEY = "<你的 p_skey>"
node .\scripts\export-qzone-feeds.mjs --target 123456789 --out "D:\QzonePhoto\exports\123456789"
```

调试时建议先限量：

```powershell
node .\scripts\export-qzone-feeds.mjs --target 123456789 --limit 3 --skip-media --comments inline
```

生成给 LLM 蒸馏用的轻量语料，并默认下载图片和真实 mp4 视频：

```powershell
node .\scripts\export-qzone-feeds.mjs --source home --target 123456789 --comments full --format llm --out "D:\QzonePhoto\exports\123456789-llm"
```

只导出 LLM 文本、不下载任何媒体时再加 `--skip-media`。如果只想保留视频封面、不解析真实 mp4，使用 `--no-video`。

## 输出

```text
<out>/
├── index.md
├── feeds.json
└── <YYYYMMDD-HHmm_正文摘要_tid>/
    ├── index.md
    ├── 01_photo_1.jpg
    └── ...
```

默认 `feeds.json` 不写入签名媒体 URL；需要排障时加 `--include-urls`，但不要把产物提交到仓库。

`--format llm` 会保持每条动态一个 `index.md`，同时在根目录生成 `llm-corpus.md`。该模式会：

- 去掉每条动态目录名末尾的 `tid` 字符串，只在重名时追加 `_2` 这类短后缀。
- 去掉动态 Markdown 里的作者 QQ、类型/appid、媒体文件列表。
- 评论作者只保留昵称最后一个 `-` 或空格后的部分，并去掉第一个 `（` 或 `(` 之后的说明。
- 评论不再附带 QQ 号；同一日期下连续评论只在首条显示日期，后续只显示时间。
- 点赞数优先读取 `qz_like_btn_v3` 的 `data-likecnt`；转发数优先读取转发按钮属性，读不到再回退到文本和接口字段。

视频默认开启真实 mp4 解析。脚本会先用 feed HTML 里已有的媒体 URL，再通过 QQ 空间 `video_get_data` 建立视频索引，用时间、封面和标识符匹配动态里的视频；解析失败时会保留动态和封面，不中断整批导出。
