# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

现阶段为单人自用：开发者本人，日常在桌面浏览器里工作，需要一个比浏览器默认新标签页更顺手的搜索入口，以及自己筛选过的书签列表。未来可能小范围公开；在公开之前，设计取舍以自用效率为先，不为陌生用户提前承担引导、兼容和增长成本。

## Product Purpose

一个搜索与书签合一的浏览器起始页。搜索框可在 Google、百度、必应之间切换，通过链接跳转执行；书签列表直接来自浏览器自带收藏夹，由配套插件经页面内桥接传输到站点，无需登录、无需云端。成功的样子是：打开即可搜索、收藏夹里的书签即时可见，站点不保存任何用户数据。

## Positioning

本地优先、无账号、无云端的书签起始页。书签直接读取浏览器自身的收藏夹，由插件经页面内桥接传给站点，站点本身不持久化用户书签。浏览器若开启收藏夹同步，数据流向由浏览器自己的同步策略决定，产品不介入、不额外上传。

## Operating Context

- 日常动线：用浏览器收藏夹收藏网页（Ctrl+D 或插件 popup，popup 支持去重、删除、导出 JSON）；打开起始页后自动拉取并展示浏览器收藏夹。
- 站点与插件总是成对使用；站点单独打开时也必须可用（降级态）。
- 生产部署计划在自有域名上，域名待补充；插件 content script 的匹配范围需要随域名扩展。

## Capabilities and Constraints

确认能力：

- 搜索：Google / 百度 / 必应 切换，原生表单 GET 跳转（新标签页），不调用任何搜索 API。
- 书签：读取浏览器原生收藏夹（仅 http/https），通过 popup 添加/删除/导出 JSON；站点按创建时间倒序展示，显示标题、域名、可选文件夹；浏览器收藏夹发生变化时实时推送到已打开的站点。
- 兜底：未检测到插件时展示提示，可通过 JSON 文件导入书签（校验 http(s) URL，过滤非法条目）。
- 本地传输：站点与 content script 之间使用 window.postMessage 协议（BOOKMARKS_REQUEST / BOOKMARKS_RESPONSE / BOOKMARKS_UPDATED），基于同一页面 origin；content script 通过 background 服务读取 browser.bookmarks。

技术与运行约束：

- pnpm workspaces 单仓：apps/web（Next.js 16 App Router，静态渲染）、apps/extension（WXT / Manifest V3，通过 browser.bookmarks 读取浏览器收藏夹，background 服务承担读取与变更广播）、packages/shared（书签类型与桥接协议）。
- 插件 content script 当前仅匹配 localhost 与 127.0.0.1。
- 明确未决：云端存储暂不做，上线后根据用户反馈决定是否引入；生产域名尚未提供。

## Brand Commitments

站点暂用名 Qianxu，界面文案为中文。

## Evidence on Hand

当前没有真实用户数据、案例、评价或合作证明。公开前不得编造用户量、口碑或外部背书。

## Product Principles

1. 本地优先：书签取自浏览器收藏夹，产品自身不上传、不同步、不持久化用户书签。
2. 打开即用：无登录、无首屏引导，第一眼就是搜索与书签。
3. 按真实自用工作流打磨，不为想象中的大众用户增加负担。
4. 无插件也不走进死路：始终有一个可理解的降级状态和一条恢复路径。
5. 保持依赖克制：搜索用纯跳转，不绑定第三方搜索服务。
