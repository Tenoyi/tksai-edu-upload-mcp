---
name: 智教坊
description: 智教坊（教学平台内容上传与作品管理 MCP）。用于将本地文件 / 文件夹（含 index.html 的教学应用）上传到对象存储得到可访问 URL，并基于 URL 创建 / 更新教学作品(SPU)。当用户需要“把做好的网页 / 课件 / 素材传到教学平台”“生成作品链接”“创建或更新教学作品”时使用本技能。
---

# 智教坊 教学上传连接器

本连接器提供 5 个 MCP 工具，帮助 AI 智能体把教学类内容（单个文件或前端应用）上传到平台对象存储，并创建 / 维护对应的教学作品。

## 认证前置（必须，否则所有工具报错）

连接器通过两个环境变量鉴权，启动前必须配置好：

- `EDU_API_BASE`：后端 API 地址，固定 `https://edu.tksai.com/app-api`。
- `EDU_API_KEY`：登录`https://edu.tksai.com`，在「个人中心 → MCP 管理」创建的密钥。

注意：
- **不要**设置 `tenant-id`，后端会依据 API Key 自动推导租户。
- **不要**在配置里加 `X-Api-Key` 等请求头：Server 已自动以 `Authorization: Bearer <EDU_API_KEY>` 携带密钥，多余请求头无效（后端只认 Bearer，误用 X-Api-Key 会 401）。
- 配置修改后需重启智能体（MCP 在启动时读取环境变量）。

## 工具清单与用法

### 1. upload_file — 上传单个文件
把本地单个文件上传到对象存储，返回可访问 URL。
- 参数：
  - `localPath`（string，**必填**）：本地文件绝对路径。
  - `directory`（string，可选）：存储目录 / 归类，用于分类管理。
- 返回：`{ "url": "https://..." }`
- 示例：`upload_file({ localPath: "/Users/me/lesson/cover.png", directory: "covers" })`

### 2. upload_folder — 上传文件夹（教学应用）
把本地文件夹（**必须包含 index.html**）打包为 zip 上传，返回首页 URL 与根 URL。用于上传一个完整的前端教学应用 / 课件。
- 参数：
  - `localDir`（string，**必填**）：本地文件夹绝对路径，目录内需有 `index.html`。
  - `directory`（string，可选）：存储目录 / 归类。
- 返回：`{ "indexUrl": "https://.../index.html", "rootUrl": "https://..." }`
- 示例：`upload_folder({ localDir: "/Users/me/my-course", directory: "courses" })`
- 错误：若 `localDir` 内不存在 `index.html`，会直接报错——务必先确认目录结构。

### 3. create_work — 创建教学作品（SPU）
基于已上传的内容 URL 创建教学作品。
- 参数：
  - `name`（string，**必填**）：作品名称。
  - `contentUrl`（string，**必填**）：内容 URL，由 `upload_file` / `upload_folder` 得到的 `url` / `indexUrl` / `rootUrl` 传入。
  - `coverUrl`（string，可选）：封面 URL。
  - `description`（string，可选）：简介。
  - `tags`（string[]，可选）：标签列表。
  - `price`（number，可选）：价格，**单位：分**（如 9.9 元传 990）。
  - `productType`（number，可选）：商品类型。
  - `title`（string，可选）：标题。
- 返回：创建后的作品对象（含 `spuId` 等字段）。
- 示例：`create_work({ name: "勾股定理互动课件", contentUrl: "<indexUrl>", price: 0 })`

### 4. update_work — 更新教学作品（SPU）
更新已有作品，仅传需要变更的字段。
- 参数：
  - `spuId`（number，**必填**）：作品编号（来自 `create_work` 返回值）。
  - `contentUrl` / `coverUrl` / `name` / `description` / `tags` / `price`（各自可选）：需要更新的字段。
- 返回：更新后的作品对象。
- 示例：`update_work({ spuId: 123, name: "勾股定理互动课件 v2" })`

### 5. get_api_key_help — 获取接入配置示例
返回在各 AI 智能体（CodeBuddy / Trae / WorkBuddy / Codex）中配置本 MCP Server 的 JSON 示例与说明。当用户不知道如何接入或询问配置格式时调用。
- 参数：无。
- 返回：配置 JSON 文本 + 文字说明（含 WorkBuddy 要求 `env` 用 `${VAR}` 占位、禁止写真实凭证）。

## 典型工作流（AI 应遵循）
1. 用户给出本地内容路径。若是文件夹，先确认包含 `index.html`。
2. 调用 `upload_file` 或 `upload_folder` 得到 URL。
3. 调用 `create_work`，把 URL 作为 `contentUrl` 创建作品。
4. 后续如需改内容 / 名称 / 价格，先重新上传取得新 URL，再调 `update_work`。

## 高风险操作确认规则
- `create_work` / `update_work` 会向平台写入**对外可见的作品数据**。执行前应向用户复述将要创建 / 更新的关键字段（名称、contentUrl、价格），确认无误再调用。
- `price` 单位为「分」，务必与用户核对，避免价格填错（如 9.9 元应传 990 而非 9.9）。
- 上传 / 创建失败（网络、鉴权、文件不存在）时，把原始错误信息原样返回给用户，不要静默重试或编造 URL。

## 错误处理与恢复
- 鉴权失败：检查 `EDU_API_KEY` 是否有效、是否已过期，提示用户到「个人中心 → MCP 管理」重新创建。
- 网络 / 域名错误：检查 `EDU_API_BASE` 是否指向正确的 `/app-api` 后端。
- 文件不存在 / 文件夹缺 `index.html`：提示用户核对本地路径与目录结构。
- 修改配置后不生效：提示用户**重启智能体**（MCP 在启动时读取环境变量）。
