# 🎉 Release v2.7.0

[![总下载量](https://img.shields.io/github/downloads/11273/QzonePhoto/total?style=flat-square&logo=github&color=blue)](https://github.com/11273/QzonePhoto/releases/tag/v2.7.0) [![下载统计](https://img.shields.io/github/downloads/11273/QzonePhoto/v2.7.0/total?style=flat-square&logo=github&color=green)](https://github.com/11273/QzonePhoto/releases/tag/v2.7.0) [![访问统计](https://komarev.com/ghpvc/?username=11273-QzonePhoto-v2-7-0&label=Views&color=brightgreen&style=flat-square)](https://github.com/11273/QzonePhoto/releases/tag/v2.7.0)

[![Windows](https://img.shields.io/badge/Windows-0078D6?style=flat-square&logo=windows&logoColor=white)](https://github.com/11273/QzonePhoto/releases/tag/v2.7.0) [![macOS](https://img.shields.io/badge/macOS-000000?style=flat-square&logo=apple&logoColor=white)](https://github.com/11273/QzonePhoto/releases/tag/v2.7.0) [![Linux](https://img.shields.io/badge/Linux-FCC624?style=flat-square&logo=linux&logoColor=black)](https://github.com/11273/QzonePhoto/releases/tag/v2.7.0)

---

## [2.7.0](https://github.com/11273/QzonePhoto/compare/v2.6.0...v2.7.0) (2026-07-26)

### ✨ Features | 新功能

* **download:** 支持保留动态媒体信息 ([75145d9](https://github.com/11273/QzonePhoto/commit/75145d96205e355c2c6eeca5cbedf1fc8b985ec9))
* **download:** 支持保留动态图片文案 ([2822e74](https://github.com/11273/QzonePhoto/commit/2822e748046a4fdca4521d552c6d295e511fc3ad)), closes [#44](https://github.com/11273/QzonePhoto/issues/44)
* launch official website and harden releases ([870e8c4](https://github.com/11273/QzonePhoto/commit/870e8c491c9256a9f458f74d050875ce2968e496))
* **photo:** 支持批量复制动态图片链接 ([2fd2cfc](https://github.com/11273/QzonePhoto/commit/2fd2cfc9ba944cf24efe7ab6013a345e3b8305ce))
* **photo:** 支持批量复制图片链接 ([6d327ed](https://github.com/11273/QzonePhoto/commit/6d327edfbb8ac4b64b5e9961f95901132feb2b37)), closes [#42](https://github.com/11273/QzonePhoto/issues/42)
* **release:** 强化 R2 发布与安全更新流程 ([433dcae](https://github.com/11273/QzonePhoto/commit/433dcae54bd927e73eb47ad4b322d7331bd20d65))
* **release:** 完善更新链路与 R2 发布校验 ([a7244c6](https://github.com/11273/QzonePhoto/commit/a7244c68d193a0a19e725df1f5fb4a18e5ec8009))
* **update:** 优化更新体验与品牌展示 ([9539089](https://github.com/11273/QzonePhoto/commit/95390895f152c41ccbced2a2baadd2f756e9b2cc))
* **website:** 优化官网体验与检索 ([623f24e](https://github.com/11273/QzonePhoto/commit/623f24e1867bea81b4bb7b4e622fd3e12d923c48))
* **website:** 重构官网视觉与下载体验 ([64c9aa4](https://github.com/11273/QzonePhoto/commit/64c9aa4be388e063d5ff16d3c031a68b9c2603ce))

### 🐛 Bug Fixes | Bug 修复

* **app:** 修复更新检查与相册加载状态 ([2be5da7](https://github.com/11273/QzonePhoto/commit/2be5da73f8c673b129520fa252b64bed3048ce28))
* **brand:** optically center the legacy Z-star icon ([7f193b1](https://github.com/11273/QzonePhoto/commit/7f193b15316bc857bf857ec798ed9f60c2813f0b))
* **brand:** synchronize exact legacy transform outputs ([ec5c312](https://github.com/11273/QzonePhoto/commit/ec5c31288e5a015b7e5706790273ddef75ca7d65))
* **build:** 关闭 DMG 自动收缩 ([ad257d6](https://github.com/11273/QzonePhoto/commit/ad257d6025f826d21467ff035d4d77b43012db89))
* **login:** 修复代理环境启动空白 ([16aa589](https://github.com/11273/QzonePhoto/commit/16aa589ec8176828cf57050b58e92ab40f4fbefb))
* **release:** 复用已验证发布清单 ([98d5971](https://github.com/11273/QzonePhoto/commit/98d597116ced5507a19748064d69ecb7cc9d6a0e))
* **release:** 修复多架构更新元数据 ([66ca80d](https://github.com/11273/QzonePhoto/commit/66ca80d7a722d7fbf7446b12e6420ca85ee044db))
* **release:** 修复历史版本回退发布 ([8779b99](https://github.com/11273/QzonePhoto/commit/8779b99297b99f32b7c92723358a99b34c92111e))
* **release:** 支持稳定通道回退 ([81954d2](https://github.com/11273/QzonePhoto/commit/81954d2fa2185b77ce0350fb3dfd68945f5c9809))
* **security:** 使用随机令牌限制 qzone-local 文件访问 ([#45](https://github.com/11273/QzonePhoto/issues/45)) ([dddcae3](https://github.com/11273/QzonePhoto/commit/dddcae3d807b5985e1a4801b09b569ac71038d7b))
* **security:** 完善本地媒体访问限制 ([80f4e79](https://github.com/11273/QzonePhoto/commit/80f4e791545cce0ca84f36fb250c12dddafaa1a1))
* **security:** 延长本地媒体令牌并自动重试 ([5f85a9e](https://github.com/11273/QzonePhoto/commit/5f85a9e1790cb98ec4ee9f4055d3583ca4c5d5b0))
* **update:** 修复 R2 检查超时兜底 ([772356a](https://github.com/11273/QzonePhoto/commit/772356abd6ed8b5f7ae24cb0b489e8bef50dc9a9))
* **update:** 移除重复的重启安装入口 ([2e864cf](https://github.com/11273/QzonePhoto/commit/2e864cf8cf2ddb1ce771c5b1dfeaba5eab7f9aac))
* **update:** 优化更新来源与发布兜底 ([9b4e163](https://github.com/11273/QzonePhoto/commit/9b4e16362636a70aff63c828d9e89888c14e1456))
* **website:** 更新 Apple 芯片下载提示 ([ef74978](https://github.com/11273/QzonePhoto/commit/ef74978553e8f3dd01b0c90f0a01f1e73045a5b7))
* **website:** 统一版本选择边框 ([9201c59](https://github.com/11273/QzonePhoto/commit/9201c593693e4fee5d55536ca4e7ff7c63fabe7e))
* **website:** allow Cloudflare Analytics under CSP ([b5f9fa6](https://github.com/11273/QzonePhoto/commit/b5f9fa6616c7eb8807681050f092aba3bb67e083))

### 👷‍ Build System | 构建

* **mac:** 移除安装包目标的固定架构 ([592e8c8](https://github.com/11273/QzonePhoto/commit/592e8c81c5168d0243534a80ad59575f2e70a930))

### 🔧 Continuous Integration | CI 配置

* **actions:** 升级官方 Action 运行时 ([6552d1e](https://github.com/11273/QzonePhoto/commit/6552d1e280300fb2bd895a396500e80dd357516c))
* **github:** 完善 PR 检查与协作规范 ([9675a23](https://github.com/11273/QzonePhoto/commit/9675a23ba1651defa50d3d76191fd8c176ada51d))
* **release:** 拆分验证发布与 R2 同步 ([ab3cb46](https://github.com/11273/QzonePhoto/commit/ab3cb466ae32cb61f00ad3a78ce3337e8aa8ea90))
* **release:** 修复 32 位 Windows 构建依赖安装 ([42a9c7b](https://github.com/11273/QzonePhoto/commit/42a9c7b28d1a578df2ab23dc4894652d91a3768a))

### 🎫 Chores | 其他更新

* **config:** 停止跟踪环境变量文件 ([eeaba9a](https://github.com/11273/QzonePhoto/commit/eeaba9ace7ae037649a138f105642da7631de6aa))