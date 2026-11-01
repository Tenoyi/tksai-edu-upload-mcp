---
name: 智教坊
description: 智教坊教学平台作品管理（本地进程 + OAuth 版）。以本地进程（npx）运行在用户本机，既能直接读取并上传本地文件/目录/封面到平台对象存储（upload_file / upload_folder / upload_cover），也能创建/更新教学作品（SPU）、查询订单、收益、提现等。通过 OAuth 2.1 浏览器登录鉴权，无需手动填写密钥。当用户需要"把本地网页/课件/素材上传并发布为教学作品"时使用本技能。
---

# 智教坊 教学上传连接器（本地进程 + OAuth 版）

本连接器以本地进程（`npx` 拉取 `@tks-ai/edu-upload-mcp`）运行在**用户本机**，同时提供两类能力：

- **本地文件上传**：`upload_file` / `upload_folder` / `upload_cover` 直接读取本机文件并直传平台对象存储，入参是**本机绝对路径**。
- **业务工具**：创建 / 更新教学作品（SPU）、查询订单、收益、提现等（上游 Java 后端的工具由原样转发，因此本连接器同时拥有上传与业务工具）。

通过 **OAuth 2.1（PKCE，公共客户端）** 鉴权：首次调用会自动打开浏览器，登录教学平台并「允许」后缓存令牌，**无需手动填写任何密钥**。

## 认证前置（OAuth 2.1，自动授权）

- 首次使用会在浏览器打开授权确认页，登录教学平台并「允许」后即可调用，无需手动配置任何密钥或地址。
- 令牌缓存于本机 `~/.tks-edu/oauth-token.json`；过期后自动用 refresh_token 续期（约 1 小时有效期，refresh_token 不少于 30 天），refresh_token 失效则需重新登录。
- 授权范围（最小权限）：`files.upload` / `works.read` / `works.write` / `orders.read` / `revenue.read`（提现等写操作仍需你在对话中确认）。
- 全链路 HTTPS；单工具响应 ≤30s。
- 若调用返回 `401`：删除 `~/.tks-edu/oauth-token.json` 后重新触发登录，或检查网络。
- **不要**手动添加 `Authorization` 头或 `tenant-id`（桥会自动处理）；仅在高级调试时可用 `EDU_API_KEY` 环境变量跳过 OAuth。

## 工具清单与用途

### 上传工具（桥本地实现，读本机文件）

- `upload_file`：上传单个本地文件或整个目录到对象存储，返回可访问直链。
  - 文件：`{ path, directory? }` → `{ url }`
  - 目录：递归上传并保留相对目录结构 → `{ urls, indexUrl?, rootUrl? }`
- `upload_folder`：批量上传整个本地目录（HTML 静态站点、PPT 导出目录等），OSS 预签名直传，完整保留相对路径，返回站点根地址与文件清单。
  - `{ path, directory? }` → `{ rootUrl, indexUrl?, files }`
- `upload_cover`：上传作品封面图（本地图片），返回封面 URL。
  - `{ path }` → `{ url }`

### 业务工具（上游 Java 后端转发）

- `create_work`：创建教学作品（SPU），返回 `id` 与 `url`。**必填 `workName`、`picUrl`（先用 `upload_cover` 或 `upload_file` 得到）、`zipUrl`（用 `upload_folder` 得到站点根地址或其 zip）。**
- `update_work`：更新已有作品。
- `get_api_key_help`：返回鉴权与接入说明（OpenAPI 文档链接 / 申请入口），用于"怎么拿到 key / 怎么接入"。
- `query_order` / `query_revenue` / `query_withdraw`：查询订单 / 收益 / 提现记录。
- `withdraw`：提现（高风险，需用户确认）。

> 工具名、参数以 `tools/list` 实时返回为准；以上为常用集合。

## create_work 完整流程（最重要）

1. **询问素材位置**：确认本地 H5/课件目录与封面图路径（或让用户提供）。
2. **上传封面**：`upload_cover({ path: "/abs/cover.png" })` → `picUrl`。
3. **上传站点**：若已是 zip，`upload_file({ path: "/abs/site.zip" })` → `zipUrl`；若是目录，`upload_folder({ path: "/abs/site" })` → 取 `rootUrl`（或打包 zip 后走 `upload_file`）。**用 `rootUrl` 需运行时可访问的外网地址**：若对象存储直链不可公网访问，应改用 `upload_file` 上传 zip 并把 `zipUrl` 传给平台解压。
4. **创建作品**：`create_work({ workName, picUrl, zipUrl })`。校验返回 `code===0` 与 `data.id`。
5. **回执**：返回作品 `url`（用户可访问的购买/预览页）与 `id`。

## 典型调用示例与返回

- 上传封面：`upload_cover({ path:"/Users/me/cover.png" })` → `{ "url": "https://cdn.../cover/2026/01/01/abc.png" }`
- 创建作品：`create_work({ workName:"初中物理互动课件", picUrl:"https://cdn.../cover/...", zipUrl:"https://cdn.../WebPage/..." })` → `{ "code":0, "data": { "id": 123, "url":"https://edu.tksai.com/work/123" } }`

## 错误场景与恢复

| 现象 | 原因 | 恢复 |
|---|---|---|
| `401` / 登录页反复出现 | 令牌失效或缓存损坏 | 删除 `~/.tks-edu/oauth-token.json` 重新登录 |
| `文件或目录不存在` | 路径非本机绝对路径 | 确认运行 WorkBuddy 的机器上存在该路径 |
| `获取预签名失败` | 目录为空 / 无上传权限 | 检查目录内容与服务授权范围 |
| `token 刷新失败` | refresh_token 过期 | 重新走浏览器登录 |
| `unauthorized` / `无权限` | 范围不足或作品不属于当前账号 | 检查授权范围、用 `query_order` 核对 |

## 高风险操作确认规则

- `withdraw`（提现）、`update_work`（改已发布作品）属于不可逆/影响收益的操作，**必须先把完整参数回显给用户确认**，得到明确同意后再调用。
- 涉及金额、订单、收益数字时，优先用 `query_*` 工具核对后再下结论，不要凭空编造。

## 网络与域名

- 网关基址由运行环境决定（`EDU_MCP_URL` 默认 `https://edu.tksai.com/app-api/mcp`），无需用户配置。
- 上传与业务均走 HTTPS；对象存储直链需公网可访问才能被平台加载。
