---
name: 智教坊
description: 智教坊（教学平台内容上传与作品管理 MCP，OAuth 版）。用于将本地文件 / 文件夹（含 index.html 的教学应用）上传到对象存储得到可访问 URL，并基于 URL 创建 / 更新教学作品(SPU)，以及查询订单、收益、提现等。当用户需要"把做好的网页 / 课件 / 素材传到教学平台""生成作品链接""创建或更新教学作品"时使用本技能。
---

# 智教坊 教学上传连接器（OAuth 版）

本连接器提供 19 个 MCP 工具，帮助 AI 智能体把教学类内容（单个文件或前端应用）上传到平台对象存储、创建 / 维护对应的教学作品，并查询订单、收益、提现等。通过 WorkBuddy 标准 OAuth 2.1（PKCE）授权接入，**无需手动填写密钥**。

## 认证前置（OAuth 2.1，自动授权）

- 首次使用会在浏览器打开授权确认页，登录教学平台并「允许」后即可调用，无需手动配置任何密钥或地址。
- 授权范围（最小权限）：`files.upload` / `works.read` / `works.write` / `orders.read` / `revenue.read`（提现等写操作仍需你在对话中确认）。
- 全链路 HTTPS；单工具响应 ≤30s。
- 若调用返回 `401`：在 WorkBuddy 中对该连接器「重新授权 / 撤销并重连」即可，**不要**手动添加 `Authorization` 头或 `tenant-id`。

## 工具清单与用途

1. `upload_file` — 上传单个文件，返回 `{ url }`
2. `upload_folder` — 上传文件夹（**须含 index.html**），返回 `{ indexUrl, rootUrl }`
3. `create_work` — 创建教学作品（SPU）
4. `update_work` — 更新教学作品
5. `get_work` — 获取作品明细（参数 `spuId`）
6. `list_my_works` — 我的作品列表（分页，`pageSize` 默认 10、最大 20，返回 `{ list, total }`）
7. `list_purchased_works` — 已购作品列表（分页）
8. `get_work_rights` — 作品权益：在线使用 / 下载的已付与已购数量（参数 `spuId`）
9. `list_orders` — 订单列表（分页，`status` 可选：0待付款 10待发货 20待收货 30待评价 40已完成 50已退款）
10. `get_order_count` — 订单数量统计（按状态）
11. `get_order_detail` — 订单明细（参数 `id`，`sync` 可选同步支付状态）
12. `get_revenue` — 收益概览（累计 / 今日 / 本月、趋势、明细）
13. `get_wallet_balance` — 钱包余额（可提现，单位：分）
14. `list_withdrawals` — 提现记录（分页）
15. `create_withdraw` — **创建提现（高风险）**（参数 `type` 1微信/2支付宝/3银行卡、`price` 单位：分）
16. `list_temp_works` — 我的临时分享链接（分页）
17. `get_work_data` — 读取作品数据（参数 `spuId`, `ownerKey`）
18. `save_work_data` — 保存作品数据（参数 `spuId`, `ownerKey`, `storageKey`, `data`）
19. `get_api_key_help` — 获取在各 AI 智能体中的接入配置示例

## 核心工具用法（详细参数 / 默认值）

### upload_file
- `localPath`（string，**必填**）：本地文件绝对路径。
- `directory`（string，可选）：存储目录 / 归类。
- 返回：`{ "url": "https://..." }`
- 示例：`upload_file({ localPath: "/Users/me/lesson/cover.png", directory: "covers" })`

### upload_folder
- `localDir`（string，**必填**）：本地文件夹绝对路径，目录内**必须含 `index.html`**。
- `directory`（string，可选）：存储目录 / 归类。
- 返回：`{ "indexUrl": "https://.../index.html", "rootUrl": "https://..." }`
- 示例：`upload_folder({ localDir: "/Users/me/my-course", directory: "courses" })`
- 错误：若 `localDir` 内不存在 `index.html` 会直接报错——务必先确认目录结构。

### create_work
- `name`（**必填**）、`contentUrl`（**必填**，来自 `upload_file`/`upload_folder` 的 `url`/`indexUrl`/`rootUrl`）。
- 可选：`coverUrl`、`description`、`tags`(string[])、`price`(number，**单位：分**)、`productType`、`title`。
- 示例：`create_work({ name: "勾股定理互动课件", contentUrl: "<indexUrl>", price: 0 })`

### update_work
- `spuId`（**必填**），其余字段可选：`contentUrl`/`coverUrl`/`name`/`description`/`tags`/`price`。
- 示例：`update_work({ spuId: 123, name: "勾股定理互动课件 v2" })`

### get_api_key_help
- 无参数，返回配置 JSON 文本 + 说明（含各平台接入方式）。

## 典型工作流（AI 应遵循）
1. 用户给出本地内容路径。若是文件夹，先确认包含 `index.html`。
2. 调用 `upload_file` 或 `upload_folder` 得到 URL。
3. 调用 `create_work`，把 URL 作为 `contentUrl` 创建作品。
4. 后续如需改内容 / 名称 / 价格，先重新上传取得新 URL，再调 `update_work`。

## 能力边界
- **不提供下单能力**：本连接器只能查询订单与收益，不能代替用户下单 / 支付。
- 收益、订单等均为**只读**查询；写入仅限作品（`create_work`/`update_work`）与提现（`create_withdraw`，高风险）。

## 高风险操作确认规则
- `create_work` / `update_work` 写入对外可见作品数据：执行前应向用户复述名称、contentUrl、价格，确认无误再调用。
- `price` 单位为「分」：9.9 元传 `990`，务必核对，避免填错。
- `create_withdraw` 会发起**真实收益提现**：执行前必须向用户复述 `type`/`price`/账号，并等待其明确确认。
- 失败（网络 / 鉴权 / 文件不存在）时把原始错误信息原样返回，不要静默重试或编造 URL。

## 错误处理与恢复
- `401`：在 WorkBuddy 中重新授权（撤销并重连），无需改任何配置。
- 网络 / 域名错误：联系平台（OAuth 版无需自行配置后端地址）。
- 文件不存在 / 文件夹缺 `index.html`：提示用户核对本地路径与目录结构。
