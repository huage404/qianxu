# AGENTS.md

本文件记录本仓库的协作约定，AI 与人工提交都必须遵守。

## 项目概览

- pnpm workspace:`apps/web`(Next.js 起始页)、`apps/extension`(WXT 浏览器扩展)、`packages/shared`(共享书签协议与类型)
- 常用命令:`pnpm dev:web`、`pnpm dev:ext`、`pnpm build`
- 书签数据只在本地通过 postMessage 桥接传输，不经过服务端

## 提交信息规范

严格遵循三段式结构，第一行必须存在：

```text
类型(可选的范畴): 简短描述

可选的详情

可选的注解
```

- 类型(必须):从下方类型表中选择一个
- 范畴(可选):用括号括起,如 `fix(parser)`,描述影响范围
- 描述(必须):简洁说明本次改动,使用中文
- 详情/注解(可选):多行时用空行与首行分隔,可用列表说明具体改动点

### 类型表

| 类型 | 含义 |
| --- | --- |
| feat | 新功能、新行为 |
| fix | 修缺陷 |
| chore | 日常维护,比如 linter 配置 |
| test | 测试相关 |
| refactor | 不改行为的结构整理 |
| style | 缩进、空行一类;动到结构用 refactor |
| cosm | cosmetic,纯视觉、不改行为 |
| docs | 文档和注释 |
| build | 构建、CI |

### 硬性约束

1. 不要使用 emoji,方便工具解析,也避免终端兼容问题
2. 描述使用中文
3. 首行必须让机器和人同时读懂,类型 + 短描述就够,详情放正文
4. 描述控制在 60 个字符以内,超出部分移到详情
5. 一个提交只做一件事,不要把多个不相关的改动塞进同一条提交

### 示例

```text
feat: 新增分析师清理功能

分析师清理功能，包括
1. 查询分析师
2. 分时段清理
```

```text
fix: 修复登录态过期后未跳转的问题
```

```text
refactor(parser): 拆分词法分析与语法分析模块
```

```text
docs: 补充分支模型的说明
```

## 分支管理

- `main`:主线,始终可运行。不直接提交未完成的工作
- 从 `main` 切出短生命周期分支,一个分支只做一件事:
  - `feat/<slug>` 新功能
  - `fix/<slug>` 缺陷修复
  - `refactor/<slug>` 结构整理
  - `chore/<slug>` 维护、依赖、工具配置
  - `docs/<slug>` 文档
- `slug` 使用英文小写与连字符,例如 `feat/start-page-shell`
- 完成后合回 `main`,优先 `git merge --ff-only`;合并后删除该分支
- 需要保留合并节点时使用 `git merge --no-ff`,不做 `rebase` 改写已共享的历史
- 不强制推送 `main`;不执行 `reset --hard`、`clean -fd` 等可能丢失工作区的操作

## 提交前检查

- 类型检查:`cd apps/web && pnpm exec tsc --noEmit`
- 构建:`pnpm build`
- 不提交 `node_modules/`、`.next/`、`.output/`、`.wxt/`、`.impeccable/review/`、`.env*`
- 提交前用 `git status` 与 `git diff` 确认改动范围,避免夹带截图、临时文件或密钥
