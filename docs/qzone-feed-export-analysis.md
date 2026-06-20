# QQ 空间好友动态导出分析

## 结论

QzonePhoto v2.5.0 已经具备拉取好友主页动态正文、评论和媒体的能力，但下载功能只保存媒体文件。正文只参与目录摘要命名，评论没有写入磁盘。

## 源码依据

- `src/main/api/qzone/photo.js`
  - `feeds_home_html`：GUI「好友主页」使用 `feeds_html_module` / `feeds_html_act_all` 分页拉动态 HTML 和 `_feedsdata`。
  - `emotion_cgi_ic_getcomments`：展开评论时调用 `emotion_cgi_ic_getcomments` 拉评论 HTML。
- `src/renderer/src/views/photo/components/feeds-module.vue`
  - `normalize`：从动态 HTML 中解析正文、媒体、点赞/评论/浏览数。
  - `parseCommentsHtml` / `expandMoreComments`：解析内嵌评论，并按需补齐剩余评论。
  - `buildFeedDownloadPayload`：只把 `contentText/contentHtml` 截成 `desc`，把 `media` 转成下载任务。
- `src/main/services/main/download.js`
  - `addFeedsTasks`：动态下载目录为 `YYYYMMDD-HHmm_<desc 摘要>`，`desc` 先去标签/换行，再 `slice(0, 20)`。
  - 下载任务只包含媒体 URL、文件名、目录、来源等字段，不写正文全文和评论。

## 本机观察口径

- 安装目录：QzonePhoto 的本地安装目录。
- Electron userData：`%APPDATA%\qzone-photo`。
- 当前账号下载数据库：`download_o<当前账号QQ>.json`。
- 目标好友已下载动态媒体目录：QzonePhoto GUI 的“好友相册/说说”导出目录。
- 下载数据库可以按 `source_key=home` 和 `referer=https://user.qzone.qq.com/<目标好友QQ>` 聚合既有任务，用于对照媒体数量；该数据只作本机验收，不提交真实内容。

## 实现策略

新增 `scripts/export-qzone-feeds.mjs`，用 Node 直接复用上述官方接口：

1. 获取登录态：优先读参数/环境变量；否则从 QzonePhoto 的 Local Storage LevelDB 读取 `QZ-UIN/QZ-P-SKEY`，最后再尝试 Cookie DB。
2. 分页拉 `feeds_home_html` 同源接口，解析好友主页动态。
3. 对每条动态用 `emotion_cgi_ic_getcomments` 补齐评论。
4. 每条动态写一个 `index.md`，根目录写 `feeds.json` 和总 `index.md`。
5. 下载图片/视频到同一条动态目录，目录名保留更长摘要并追加 tid 防冲突。
6. 对动态里的视频，默认调用 `video_get_data` 建立视频索引，按时间、封面和标识符匹配真实 mp4；`--no-video` 可禁用该解析。

脚本支持本地 JSON 配置：默认读取 `scripts/qzone-feed-export.config.local.json`，仓库只提交 `scripts/qzone-feed-export.config.example.json`。配置文件可写目标 QQ、输出目录、导出格式和本地登录参数，`.local.json` 被 `.gitignore` 忽略。

## LLM 语料模式

`--format llm` 用于蒸馏语料，默认不改变完整导出模式。该模式会：

- 去掉每条动态目录名末尾的 `tid`，仅重名时追加短数字后缀。
- 去掉单条 `index.md` 的作者 QQ、类型/appid、媒体文件列表。
- 评论昵称用同一个正则策略压缩：取第一个 `（` 或 `(` 前的文本，再取最后一个 `-` 或空格后的片段。
- 评论不输出 QQ 号；同一日期连续评论首条保留日期，后续只保留时间。
- 根目录额外生成 `llm-corpus.md`，把所有动态按导出顺序串成单文件语料。
- 默认仍下载图片和真实 mp4；只要纯文本语料时使用 `--skip-media`。

## 计数字段

- 点赞数：主页 HTML 的点赞按钮主要把数值放在 `.qz_like_btn_v3` 的 `data-likecnt`，只读 `<em>` 会得到 0。
- 转发数：脚本已按转发按钮常见属性、`<em>` 文本和接口字段兜底解析；若完整导出中仍全部为 0，通常表示当前主页接口未暴露非零转发计数或确实没有转发。
- 视频：feed HTML 会把视频封面和播放地址混在一起；脚本需要保留视频 URL 候选，且在候选返回图片 content-type 时继续用视频列表索引补真实 mp4。

## 当前注意点

- QzonePhoto 正在运行时可能独占锁定 Cookie DB；Local Storage 登录态读取不依赖 DPAPI，通常不需要关闭应用。
- 部分分页会偶发 `Invalid right`，脚本已加入短重试；如果连续失败，会保留已收集内容并报错。
