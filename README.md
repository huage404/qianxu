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
├─ Dockerfile                   网页端镜像
├─ Dockerfile.ext               扩展 zip 打包（可选，与网页端部署无关）
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
| `ICP_NUMBER` | 网页构建期 | 网站 ICP 备案号，显示在页脚并链接到工信部备案系统；未设置则不显示。仓库不保存备案号，需自行通过环境变量提供 |

`WXT_SITE_ORIGINS` 会被写入 content script 的 `matches`、运行时 origin 校验和 Chrome 的 `web_accessible_resources`，因此**只在构建时生效**，运行期无法修改。默认白名单见 `apps/extension/utils/site-config.ts`。

`ICP_NUMBER` 在网页构建时写入预渲染的 HTML，本地开发可放在 `apps/web/.env.local`，Docker 部署见下方说明，同样**修改后需要重新构建**。

## 构建与部署

### 网页端（Docker）

```bash
# 构建并启动（备案号等站点信息放在仓库外的 .env 中）
cp .env.example .env
docker compose up -d --build

# 只构建镜像
docker build --build-arg ICP_NUMBER="湘ICP备xxxxxxxx号" -t qianxu-web .
```

启动后访问 `http://localhost:17871`。宿主机端口只在 `docker-compose.yml` 的 `ports` 中配置，容器内部仍监听 `3000`，两者互不影响。若要在本机 Docker 环境下使用扩展桥接，构建扩展时需把 `WXT_SITE_ORIGINS` 设为 `http://localhost:17871`。

镜像说明（`Dockerfile`）：

- `deps`：只拷贝各 package.json 并只安装网页端依赖（`--filter web...`），扩展的依赖不参与部署。
- `build`：执行 `pnpm --filter web build`，产物为 standalone。
- `runner`：基于 `node:22-slim`，只保留 `.next/standalone` 与 `.next/static`，以非 root 用户运行，监听 `3000`。

扩展打包拆在独立的 `Dockerfile.ext` 里，网页端构建不会触碰它；旧版 Docker 构建器会执行 Dockerfile 中的所有 stage，这也是两者必须分开的原因。

`docker-compose.yml` 默认把容器端口绑定到 `127.0.0.1:17871`（容器内部仍是 `3000`），只对本机开放。生产环境在容器前加反向代理（Nginx / OpenResty / Caddy 等），由代理终止 TLS 并对外提供域名访问。

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

也可以用 Docker 的 `Dockerfile.ext` 构建，产物直接导出到本地目录：

```bash
docker build -f Dockerfile.ext --target ext --output type=local,dest=./dist/ext \
  --build-arg WXT_SITE_ORIGINS="https://你的域名" .
# 产物：dist/ext/ext/extension-<version>-chrome.zip
```

加载方式：上传扩展商店，或在 `chrome://extensions` 加载已解压的 `.output/chrome-mv3`。扩展里的域名在编译期固化，**换域名必须重新打包并发布新版本**。

### 生产域名的设置位置

1. **DNS**：域名 A 记录指向服务器。
2. **反向代理**：绑定域名、配置证书并强制 HTTPS，转发到 `127.0.0.1:17871`。
3. **扩展构建**：`WXT_SITE_ORIGINS` 填入同一个 origin；主域与 `www` 都使用时一并写入，逗号分隔。

协议也是 origin 的一部分：站点从 HTTP 切到 HTTPS（或反向代理开启强制 HTTPS）后，白名单必须同步改成 `https://`，否则 content script 不会被注入，页面会一直显示「未检测到书签插件」。同理，证书必须覆盖实际访问的子域名，证书无效时 Chrome 停在告警页，扩展脚本也不会执行。

### 桥接排查

在页面控制台执行 `localStorage.setItem('qianxu:debug', '1')` 后刷新，页面与扩展两侧都会输出 `[qianxu:bridge]` 前缀的日志（请求发出、响应回来、超时判定，以及 content script 的注入与 origin 校验结果）。关闭用 `localStorage.removeItem('qianxu:debug')`。

按日志判读：

| 现象 | 结论 |
| --- | --- |
| 只有「发送请求 / 本轮请求无响应」，没有「收到响应」 | content script 没有应答，继续看下面两条 |
| 控制台完全没有「content script 已注入」 | 页面未命中 manifest 的 `matches`（协议或域名不对）。到 `chrome://extensions` → 详情 → 内容脚本 查看已安装扩展实际固化的 matches |
| 有「content script 已注入」，但提示「当前 origin 不在扩展白名单」 | `matches` 只到主机名，完整 origin（协议/端口）不在 `WXT_SITE_ORIGINS`，需要重新打包扩展 |
| 出现「收到响应」但 `ok: false` | 桥接正常，是扩展读取收藏夹失败，看扩展侧「向后台请求书签失败」日志 |

## 提交与协作

提交信息格式、分支命名与提交前检查见 [AGENTS.md](./AGENTS.md)。产品定位、能力边界与未决事项见 [PRODUCT.md](./PRODUCT.md)。

## 现状与限制

- 尚未配置单元测试与 lint，目前以类型检查和构建作为主要校验手段。
- 扩展 content script 默认只匹配本地地址，生产域名需通过构建参数注入。
- 云端同步明确不做；是否引入取决于上线后的反馈。
