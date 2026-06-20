# QzonePhoto 协作规范

## 项目定位

这是 Electron + Vue 的 QQ 空间相册/动态客户端，主进程复用 QQ 空间官方接口，渲染进程负责时间线展示和下载任务提交。

## 目录约定

- `src/main/api/qzone/`：QQ 空间官方接口封装。
- `src/main/services/`：主进程业务服务。
- `src/renderer/src/`：Vue 前端界面和数据 normalize。
- `scripts/`：本仓库可复用的本地辅助脚本。
- `.claude/test-artifacts/`：测试产物和一次性调试输出，只放说明或可复现实验记录，不提交隐私数据、cookie、p_skey、导出的好友内容。

## 导出与隐私约束

- 不把 `p_skey`、cookie、QQ 好友正文、评论、图片签名 URL 写入仓库。
- 导出产物默认写到用户下载目录或显式 `--out` 指定目录，不写入源码目录。
- 本地导出配置写入 `qzone-feed-export.config.local.json` 或 `scripts/qzone-feed-export.config.local.json`；仓库只提交 `.example.json`。
- 运行需要联网访问 QQ 空间官方接口；缺依赖或缺登录态时先停下提示，不绕过。

## 测试约定

- 新增脚本至少支持 `--help` 和参数校验。
- 每次生成真实导出产物前，先确认上一轮测试产物已归档或不在仓库内。
- 可提交的测试记录写入 `.claude/test-artifacts/README.md`，不要提交真实导出内容。
