# Qianxu

一个搜索与书签合一的浏览器起始页。书签直接读取浏览器自带收藏夹，由配套扩展在页面内桥接传输；无账号、无云端，站点不保存任何用户数据。

## 功能

- **搜索**：Google / 百度 / 必应 切换，原生表单 GET 跳转（新标签页），不依赖搜索 API，引擎选择记在本地。
- **书签**：展示浏览器收藏夹中的 http(s) 链接，显示标题、站点图标、完整文件夹路径；按文件夹筛选，支持标题 / URL / 路径关键词过滤。
- **排序**：`最新`按收藏时间倒序；`常用`按 30 天半衰期的点击加权排序，未点击的书签按创建时间垫后。排序偏好本地记忆。
- **实时更新**：浏览器收藏夹增删改后，已打开的起始页自动刷新列表。
- **兜底**：未检测到扩展（或读取失败）时给出可重试的提示，并支持导入 JSON 文件查看；点「刷新」可切回浏览器收藏夹。
- **扩展 popup**：收藏当前页（按 URL 去重）、删除书签（二次确认）、导出 JSON。
- **主题**：跟随系统，支持亮 / 暗切换。

## 技术栈

| 部分 | 技术 |
| --- | --- |
| 网页端 | Next.js 16（App Router，`output: 'standalone'`）、React 19、Tailwind CSS 4、Radix UI、next-themes |
| 浏览器扩展 | WXT、Manifest V3、`browser.bookmarks` |
| 共享包 | TypeScript 类型与桥接协议（源码直出，由 Next / WXT 转译） |
| 工程 | pnpm workspaces、Docker 多阶段构建 |

## 目录结构

```text
qianxu/
├─ apps/
│  ├─ web/                      Next.js 起始页
│  │  └─ src/
│  │     ├─ app/                布局、页面、全局样式
│  │     ├─ components/         搜索、书签卡片、侧栏、筛选等 UI
│  │     └─ lib/                桥接、搜索引擎、导入解析、点击统计
│  └─ extension/                WXT 扩展
│     ├─ entrypoints/
│     │  ├─ background.ts       读取 / 监听收藏夹，广播变更
│     │  ├─ bridge.content.ts   页面与世界之间的桥接脚本
│     │  └─ popup/              收藏、删除、导出
│     └─ utils/                 书签扁平化、origin 白名单
├─ packages/shared/             书签类型、消息协议与类型守卫
├─ Dockerfile                   网页端镜像（含扩展打包 stage）
├─ docker-compose.yml
└─ pnpm-workspace.yaml
```

## 架构

### 数据流

```text
起始页 (apps/web)                 content script              background
     │  postMessage(BOOKMARKS_REQUEST)  │                        │
     ├────────────────────────────────▶│  runtime.sendMessage   │
     │                                 ├───────────────────────▶│ browser.bookmarks.getTree()
     │  postMessage(BOOKMARKS_RESPONSE) │◀───────────────────────┤
     │◀────────────────────────────────┤                        │
     │                                 │  onCreated / onRemoved │
     │  postMessage(BOOKMARKS_UPDATED) │◀────── 广播所有标签页 ──┤
     │◀────────────────────────────────┤                        │
```

要点：

- 页面与扩展只通过 `window.postMessage` 通信，始终基于同一页面 origin，不经过服务端。
- 消息结构与类型守卫统一放在 `packages/shared`，两端共用。
- 三重校验：页面侧校验 `event.source` 与 `event.origin`；content script 按构建期白名单拦截完整 origin；background 再校验消息来源，无法确认时不返回数据。
- 收藏夹变更事件做 120ms 防抖后推送到所有标签页。
- 页面请求超时 800ms 并重试一次，仍无响应视为「扩展未注入 / 未安装」，进入降级态。

### 数据与隐私

- 书签不做任何持久化，站点没有书签存储与服务端接口。
- 点击统计、排序偏好、搜索引擎选择存在浏览器 `localStorage`，不上传、不参与同步。
- Chrome 下站点图标通过扩展的 `_favicon` 本地缓存接口获取，页面打开时不访问外网；其他浏览器不注入图标。

## 本地开发

### 环境要求

- Node.js `>= 20.9`（推荐 22 LTS，与 Docker 镜像一致）
- pnpm `10.20.0`（见根 `package.json` 的 `packageManager`；`corepack enable` 或 `npm i -g pnpm@10.20.0`）

### 安装

```bash
pnpm install
```

安装会触发扩展的 `wxt prepare`，生成 WXT 类型与配置。

### 启动

分别开两个终端：

```bash
pnpm dev:web   # 起始页，http://localhost:3000
pnpm dev:ext   # WXT 开发模式，自动打开测试浏览器并访问起始页
```

两者同时运行时，起始页会自动加载收藏夹并接收实时更新。

也可以手动安装扩展：

```bash
pnpm --filter extension build
```

然后在 `chrome://extensions` 开启开发者模式，加载已解压的扩展，选择 `apps/extension/.output/chrome-mv3`。

### 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev:web` | 启动网页端开发服务器 |
| `pnpm dev:ext` | 启动扩展开发模式 |
| `pnpm build` | 构建全部 workspace（网页端 + 扩展） |
| `pnpm --filter web build` | 只构建网页端 |
| `pnpm zip:ext` | 打包扩展 zip |
| `cd apps/web && pnpm exec tsc --noEmit` | 网页端类型检查 |
| `pnpm --filter extension compile` | 扩展类型检查 |

### 环境变量

| 变量 | 作用域 | 说明 |
| --- | --- | --- |
| `WXT_SITE_ORIGINS` | 扩展构建期 | 允许通信的站点 origin，逗号分隔，需含协议（443 不必写端口）。未设置时回退为 `http://localhost:3000`、`http://127.0.0.1:3000` |

该变量会被写入 content script 的 `matches`、运行时 origin 校验和 Chrome 的 `web_accessible_resources`，因此**只在构建时生效**，运行期无法修改。默认白名单见 `apps/extension/utils/site-config.ts`。

## 构建与部署

### 网页端（Docker）

```bash
# 构建并启动
docker compose up -d --build

# 只构建镜像
docker build --target runner -t qianxu-web .
```

镜像说明（`Dockerfile`）：

- `deps`：只拷贝各 package.json 安装依赖，利用层缓存。
- `build`：执行 `pnpm --filter web build`，产物为 standalone。
- `runner`：基于 `node:22-slim`，只保留 `.next/standalone` 与 `.next/static`，以非 root 用户运行，监听 `3000`。
- `ext-build` / `ext`：扩展打包 stage，见下文。

`docker-compose.yml` 默认把容器端口绑定到 `127.0.0.1:3000`，只对本机开放。生产环境在容器前加反向代理（Nginx / OpenResty / Caddy 等），由代理终止 TLS 并对外提供域名访问。

更新：

```bash
git pull
docker compose up -d --build
```

网页端代码不包含域名配置，桥接使用 `window.location.origin`，因此换域名部署不需要重新构建镜像。

### 扩展

生产构建必须传入站点 origin：

```bash
WXT_SITE_ORIGINS="https://你的域名" pnpm --filter extension build
pnpm zip:ext   # 产物：apps/extension/.output/extension-<version>-chrome.zip
```

也可以用 Docker 的 `ext` stage 构建，产物直接导出到本地目录：

```bash
docker build --target ext --output type=local,dest=./dist/ext \
  --build-arg WXT_SITE_ORIGINS="https://你的域名" .
# 产物：dist/ext/ext/extension-<version>-chrome.zip
```

加载方式：上传扩展商店，或在 `chrome://extensions` 加载已解压的 `.output/chrome-mv3`。扩展里的域名在编译期固化，**换域名必须重新打包并发布新版本**。

### 生产域名的设置位置

1. **DNS**：域名 A 记录指向服务器。
2. **反向代理**：绑定域名、配置证书并强制 HTTPS，转发到 `127.0.0.1:3000`。
3. **扩展构建**：`WXT_SITE_ORIGINS` 填入同一个 origin；主域与 `www` 都使用时一并写入，逗号分隔。

## 提交与协作

提交信息格式、分支命名与提交前检查见 [AGENTS.md](./AGENTS.md)。产品定位、能力边界与未决事项见 [PRODUCT.md](./PRODUCT.md)。

## 现状与限制

- 尚未配置单元测试与 lint，目前以类型检查和构建作为主要校验手段。
- 扩展 content script 默认只匹配本地地址，生产域名需通过构建参数注入。
- 云端同步明确不做；是否引入取决于上线后的反馈。
