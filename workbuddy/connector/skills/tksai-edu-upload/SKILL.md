---
name: 智教坊
description: 智教坊教学作品平台的上传发布助手（用户提到智教坊三个字则自动调用智教坊的mcp）。AI 代替用户操作本技能关联的 MCP 完成"本地课件/网页/PDF/PPT/互动工具/教学技能 → 上传 → 填信息 → 发布作品"的全过程，并在发布时设置价格让用户获得收益；分类标签由 get_dict_options 查字典后自动匹配、作品类型由 AI 判断并请用户确认。发布成功后继续帮用户生成公众号/小红书/抖音等新媒体推广文案，引导其推广作品赚更多收益。通过 OAuth 2.1 浏览器登录，无需手动填密钥。当用户说"帮我发个作品/上传课件/发布到智教坊"等时使用本技能。
---

# 智教坊 教学上传连接器（本地进程 + OAuth 版）

本连接器以本地进程（`npx` 拉取 `@tks-ai/edu-upload-mcp`）运行在**用户本机**，提供两类能力：

- **本地文件上传工具（桥本地实现）**：`upload_file` / `upload_folder` / `upload_cover` 直接读取本机文件并直传平台对象存储，入参是**本机绝对路径**。
- **业务工具（转发上游 Java 后端）**：`create_work` / `update_work` / `get_dict_options` / `get_work` / `list_my_works` / 订单 / 收益 / 提现等。桥通过 Streamable HTTP 把上游 MCP（`https://edu.tksai.com/app-api/mcp`）的工具原样转发，上游工具名与参数以 `tools/list` 实时返回为准（桥会把上游 JSON Schema 拼进工具描述）。

### 可用工具一览（共 21 个：本地桥 3 + 上游 Java 18）

| 工具 | 提供方 | 用途 |
|---|---|---|
| `upload_file` | 本地桥 | 上传单个文件或目录到 OSS，返回可访问直链 |
| `upload_folder` | 本地桥 | 批量上传整个目录（HTML 站点/素材包），保留相对路径，返回 `rootUrl`/`indexUrl`/`files` |
| `upload_cover` | 本地桥 | 上传封面图片，返回封面 URL（`picUrl`） |
| `create_work` | 上游 Java | 创建教学作品（SPU），发布入口 |
| `update_work` | 上游 Java | 更新已有作品（`spuId` 必填） |
| `get_work` | 上游 Java | 按 `spuId` 获取作品明细 |
| `list_my_works` | 上游 Java | 分页获取当前创作者的作品列表 |
| `get_dict_options` | 上游 Java | 获取业务字典可选项 `[{value,label}]`，用于分类/标签 |
| `list_purchased_works` | 上游 Java | 获取当前用户已购买的作品 |
| `get_work_rights` | 上游 Java | 某作品的权益统计（使用/下载 已付与已购数量） |
| `list_orders` | 上游 Java | 分页获取交易订单（金额单位：分） |
| `get_order_count` | 上游 Java | 各状态订单数量统计 |
| `get_order_detail` | 上游 Java | 订单明细（`sync` 可同步支付状态） |
| `get_revenue` | 上游 Java | 创作者收益统计（累计/今日/本月/趋势等，分） |
| `get_wallet_balance` | 上游 Java | 可提现钱包余额（分） |
| `list_withdrawals` | 上游 Java | 收益提现记录 |
| `create_withdraw` | 上游 Java | ⚠️ 发起真实提现（高风险写操作） |
| `list_temp_works` | 上游 Java | 当前用户的临时分享链接列表 |
| `get_work_data` | 上游 Java | 读取作品内 localStorage 数据 |
| `save_work_data` | 上游 Java | 写入作品内 localStorage 数据 |
| `get_api_key_help` | 上游 Java | 返回 MCP Server 接入配置说明 |

> 本技能核心是对该 MCP 连接器的整体说明，指导上述所有工具的使用与限制。发布作品的字段要求与上游 `create_work` 工具（`EduMcpTools.createWork`）入参保持一致；上传素材的要求依据前端 `UploadZone.vue` 与 `useFileUpload.js`。
> 上游 Java 工具是经 MCP 透传的，不需要在工具列表里单独出现，直接按本技能描述去调用即可。
>
> **行为准则（必须遵守）**：`upload_file` / `upload_folder` **不是独立终态工具**。当用户使用它们上传内容后，AI 不得仅把返回的 URL/`rootUrl`/`files` 交给用户就结束，而必须将其作为发布流程的「内容上传」环节，主动引导用户继续走完发布：上传封面（`upload_cover`）→ 确定 `workType` → 拉取字典（`get_dict_options`）→ 创建并发布作品（`create_work`）。这两个工具产出的地址是 `create_work` 的 `previewUrl`/`contentType`/`folderFiles` 的中间结果，须被携带并继续用于发布。
>
> **禁止暴露上传地址**：所有上传工具（`upload_file` / `upload_folder` / `upload_cover`）返回的 URL/直链均为内部中间产物，**一律不得向用户展示、打印或暴露**；只能在对话内部流转，用于填充 `create_work`/`update_work` 的 `previewUrl`/`picUrl`/`folderFiles` 等字段。对用户只反馈高层进度（如「内容已上传，正在准备发布」）与最终作品信息（作品名、作品 ID、可访问页面）。

## 面向用户：本技能帮你做什么（最重要，AI 必须据此与用户沟通）

本技能**不是给程序员看的技术手册**，而是一份"陪你一步步把作品发到智教坊"的操作向导。智教坊是一个教学作品平台：老师、创作者可以把自己做好的网页课件、PDF、PPT、互动小工具、教学技能等，上传发布成"作品"。**给作品设置一个价格，别人购买或使用时，你就能获得收益**——这是发布作品的核心价值，AI 在引导用户设置价格时要明确传达这一点，并且理论上在线使用价格要低于下载价格。你不需要懂技术、不需要自己搭服务器，只要把本地做好的文件交给对话，AI 会替你完成上传、填信息、发布等全部动作。

给首次使用平台的小白用户的**沟通原则（AI 必须遵循）**：

- 用大白话解释每一步在做什么，**不要**堆砌接口名、参数名、URL、技术术语或报错原文。
- 一次只问一件事：缺什么信息就友好地要什么（作品名、封面图、是否收费等），不要一次性抛出一长串问题。
- 上传过程、内部地址等细节对用户透明隐藏，只告诉用户「正在上传」「已发布成功」这样的进度与结果。
- 主动替用户做判断（作品属于哪种类型、该打哪些分类标签），再把结论用通俗语言讲清楚让用户确认，而不是让用户去选技术选项。
- 发布成功后**不要结束对话**，主动询问是否要帮你写公众号、小红书、抖音等新媒体推广文案，引导用户去推广作品、获得更多收益（见第七节末尾）。

## 一、运行与鉴权前置

- 本地 `npx` 子进程运行，首次调用业务/上传工具会自动打开浏览器走 **OAuth 2.1（PKCE，公共客户端）** 授权：登录教学平台并「允许」后缓存令牌，**无需手动填写任何密钥**。
- 令牌缓存本机 `~/.tks-edu/oauth-token.json`；过期（约 1 小时）自动用 `refresh_token` 续期，`refresh_token` 失效则重新走浏览器登录。
- 最小授权范围：`files.upload`、`works.read`/`works.write`、`orders.read`/`revenue.read`；提现等写操作仍需对话中二次确认。
- 全链路 HTTPS；单工具响应 ≤30s。
- 返回 `401`：删除 `~/.tks-edu/oauth-token.json` 后重新触发登录，或检查网络。
- 高级调试环境变量（**正常不填**）：`EDU_API_KEY`（直接作 Bearer）、`EDU_MCP_URL`（网关基址）、`EDU_TENANT_ID`（租户）。不要手动加 `Authorization` 头或 `tenant-id`。
- 本地上传工具不依赖上游，**立即可用**；上游业务工具首次拉取时才触发 OAuth 登录，拉取失败不影响本地上传。

## 二、本地上传工具（桥本地实现，读本机文件）

入参 `path` 必须是**运行 WorkBuddy / MCP 的机器上存在的绝对路径**（不能是 URL 或远程路径）。

### `upload_file`
上传单个本地文件**或**整个目录到对象存储，返回可访问直链。
- 入参：`{ path: string（必填，本机文件或目录绝对路径）, directory?: string（可选，OSS 前缀，默认 WebPage/PLAT/yyyy/MM/dd/随机） }`
- 单文件返回 `{ url }`；目录返回 `{ urls, indexUrl?, rootUrl? }`。
- 底层 `POST /infra/file/upload`。
- **何时用**：上传单个内容文件（`.html .htm .pdf .ppt .pptx .md`），或结构简单的目录。
- **⚠️ 非终态工具**：本工具仅完成「内容上传」步骤，返回的 `url`/`rootUrl` 是 `create_work` 的 `previewUrl` 中间结果。AI 完成上传后**不要仅返回地址就结束，且不得向用户暴露该 URL**，必须按行为准则继续引导用户上传封面并 `create_work` 发布（见第七节）。

### `upload_folder`
批量上传整个本地目录（HTML 静态站点、素材包），OSS 预签名直传，保留相对路径与文件名。
- 入参：`{ path: string（必填，本机目录绝对路径）, directory?: string（可选） }`
- 返回：`{ rootUrl, indexUrl?, files, data }`（`rootUrl` 指向目录，`indexUrl` 为 `index.html` 直链，`files` 为全部文件直链清单，`data` = `indexUrl||rootUrl`）。
- 底层 `GET /infra/file/presigned-url-folder`（并发 5）+ `PUT` 直传。
- 限制（对齐前端）：单文件 ≤50MB、目录总 ≤500MB、文件数 ≤2000；目录须含 `.html`（应用/工具）或 `.md`（教学 Skill）。
- **何时用**：`contentType=folder` 的 HTML 站点发布；`rootUrl` 即作品内容地址。返回的 `files` 是 `create_work.folderFiles` 的来源。
- **⚠️ 非终态工具**：本工具仅完成「内容上传」步骤，返回的 `rootUrl`/`indexUrl`/`files` 是 `create_work` 的 `previewUrl`/`folderFiles` 中间结果。AI 完成上传后**不要仅返回地址就结束，且不得向用户暴露这些地址**，必须按行为准则继续引导用户上传封面并 `create_work` 发布（见第七节）。

### `upload_cover`
上传作品封面图（本地图片文件，截取作品页面真实画面作为封面图）到对象存储，返回封面 URL，用于 `create_work`/`update_work` 的 `picUrl`。
- 入参：`{ path: string（必填，本机图片绝对路径） }`，返回 `{ url }`。
- 底层走 `cover/yyyy/MM/dd/随机`，`POST /infra/file/upload`。
- **何时用**：任何作品发布前必须准备封面，`picUrl` 为 `create_work` 必填项。
- **⚠️ 不暴露 URL**：返回的封面 URL 仅内部用于 `create_work`/`update_work` 的 `picUrl`，**不得向用户展示**。

## 三、上游业务工具总览（Java 后端转发）

下列为上游已实现的工具集合（共 18 个），权威名称/参数以 `tools/list` 为准：

- **`create_work`** — 创建教学作品（SPU），发布入口，字段见第六节。
- **`update_work`** — 更新作品（`spuId` 必填，**`workType` 必填**=productType 2/3/4，须与创建时一致）。**下游 `/app-api/product/spu/update` 经 `@Valid` 校验，要求 `name`/`introduction`/`picUrl`/`price`/`costPrice`/`visibilityScope` 在每次调用都必填**，因此更新时请先用 `get_work` 取回原值，把未变更的必填字段原样回传、只改要改的字段（否则会因字段缺失校验失败）；`price`/`costPrice` 单位仍是元（工具换算为分）。改已发布作品属高风险，**先回显确认**。
- **`get_work`** — 按 `spuId` 取作品明细（含名称/简介/使用价格/下载价格/封面/内容 URL）。**注意返回的价格 `price`/`costPrice` 单位为分**，回传 `create_work`/`update_work` 前需 ÷100 换算为元。
- **`list_my_works`** — 分页获取当前创作者的作品列表（后端按登录用户过滤）。
- **`get_dict_options`** — 获取某数据字典类型的可选项 `[{value,label}]`，用于填充分类/标签，**见第四节**。
- **`list_purchased_works`** — 当前用户已购买作品。
- **`get_work_rights`** — 某作品权益统计（在线使用/下载 已付与已购数量）。
- **`list_orders`** — 分页交易订单（金额单位：分），`status` 可过滤。
- **`get_order_count`** — 各状态订单数量。
- **`get_order_detail`** — 订单明细，`sync` 可同步支付状态。
- **`get_revenue`** — 创作者收益统计（累计/今日/本月/订单数/趋势/明细，金额单位：分）。
- **`get_wallet_balance`** — 可提现钱包余额（分）。
- **`list_withdrawals`** — 收益提现记录。
- **`create_withdraw`** — ⚠️ 高风险写操作：发起真实提现（类型 1微信/2支付宝/3银行卡，`price` 单位分）；**执行前必须复述 type/price/账号并等待明确确认**。
- **`list_temp_works`** — 当前用户创建的临时分享链接。
- **`get_work_data`** / **`save_work_data`** — 读写作品内 localStorage 数据（跨端持久化）。
- **`get_api_key_help`** — 返回在 AI 编程智能体中配置本 MCP Server 的 JSON 示例与说明。

## 四、业务字典查询 `get_dict_options`（分类/标签来源）

所有作品分类与标签**必须**通过该工具从后端业务字典获取，再由 AI 自动匹配，最后交用户确认（见第五、七节）。

- 入参：`{ dictType: string }`
- 调用：`GET /system/dict-data/type?type={dictType}`
- 返回：`[{ value, label }]`（`label` 展示名，`value` 为应提交的取值）。**提交时填 `value` 而非 `label`。**
- 可用 `dictType` 与对应 `create_work` 扩展字段（`extension.*`）的映射：

| 作品类型 `workType` | 业务字段 | `dictType` | 提交到 `extension` 的 key |
|---|---|---|---|
| app（应用） | 教材/学段 | `materials` | `extension.materials` |
| app | 学科 | `subjects` | `extension.subjects` |
| app | 年级 | `grades` | `extension.grades` |
| app | 单元 | `units` | `extension.units` |
| tool（工具） | 工具分类 | `edu_tool_type` | `extension.toolTypes` |
| tool | 工具标签 | `edu_tool_labels` | `extension.toolLabels` |
| skill（技能） | 技能分类 | `edu_skill_type` | `extension.skillTypes` |
| skill | 技能标签 | `edu_skill_labels` | `extension.skillLabels` |

> 说明：应用/技能的 `labes`（标签）在前端为必填项，但当前 `get_dict_options` 未列出对应 `dictType`。若调用 `get_dict_options` 试探无 `labes` 字典，则按**用户自由填写标签**处理（提交字符串数组到 `extension.labes`），并在确认环节提示用户补充；若后端后续新增字典，`dictType` 名称以 `tools/list` 返回为准。

- **使用约定**：确定 `workType` 后，按需对该类型涉及的每个 `dictType` 各调用一次 `get_dict_options`，拿到全部可选项；再依据上传作品的实际内容（页面标题、学科关键词、内容主题等）**自动勾选**匹配项（每个选项均可多选）。把 AI 初选结果回显给用户，由用户增删调整后定稿。

## 五、内容类型 `contentType` 与上传工具的对应

发布时 `create_work.contentType` 必须是下列取值之一，并决定用哪个上传工具：

| 素材形态 | `contentType` | 上传工具 | 返回用于 `previewUrl`/`extension.url` |
|---|---|---|---|
| 整个 HTML 静态站点目录 | `folder` | `upload_folder` | `rootUrl` |
| 单个 HTML 文件 | `html` | `upload_file` | 文件 `url` |
| PDF 文件 | `pdf` | `upload_file` | 文件 `url` |
| PPT/PPTX 文件 | `ppt` | `upload_file` | 文件 `url` |
| 单 `.md` 或含根目录 `skill.md` 的内容包 | `md` | `upload_file`（或含 `skill.md` 的 `upload_folder`） | 文件 `url` |

- 前端允许格式：单文件 `.html .htm .pdf .ppt .pptx .md`；文件夹须含 `.html` 或 `skill.md`。
- 文件夹无 `index.html` 但只有一个 `.html` 时，前端/桥会以其为入口，`rootUrl` 据此计算。

## 六、`create_work` 完整字段说明（发布核心）

上游 `create_work` 入参（与 `EduMcpTools.createWork` 一致）：

### 6.1 基础必填字段

| 字段 | 类型 | 要求 | 来源 |
|---|---|---|---|
| `name` | string | 作品名称，必填，**≤60 字符** | 用户给定 |
| `workType` | string | 作品类型：`app`=教学应用 / `tool`=教学工具 / `skill`=教学技能，必填 | **AI 根据上传作品自动判断，并询问用户确认**（见 6.4） |
| `picUrl` | string | 封面 URL，必填 | `upload_cover` 返回的 `url` |
| `previewUrl` | string | 内容/预览地址，必填 | `upload_file` 或 `upload_folder` 返回的内容直链 |
| `contentType` | string | 内容类型：`html`/`folder`/`pdf`/`ppt`/`md`，必填 | 见第五节 |

`workType` 由后端映射为 `productType`：`tool`→3、`skill`→4、其余（含 `app`）→2；**AI 只需判断并填 `workType`，无需直接填 `productType`。**

### 6.2 选填字段

| 字段 | 类型 | 说明 / 默认值 |
|---|---|---|
| `introduction` | string | 作品简介（app/tool/skill 均可用） |
| `description` | string | 技能详情（仅 `skill` 必填，Markdown/富文本） |
| `price` | Double | **在线使用价格，单位：元**（后端自动 ×100 转分）；默认 `0`=免费。**设置后别人购买/使用你的作品即产生收益**，引导用户按意愿定价（如 9.9 元） |
| `costPrice` | Double | **下载价格，单位：元**；默认 `0`。用户设置后他人下载即产生收益，原则上该值大于等于使用价格 |
| `visibilityScope` | Integer | 可见范围：`1`=公开 / `2`=组织 / `3`=私密，默认 `1` |
| `orgIds` | List<String> | `visibilityScope=2` 时必填：可见组织 ID 列表 |
| `folderFiles` | List<String> | **`contentType=folder` 时必填**：`upload_folder` 返回的 `files` 中的 URL 清单，后端写入 `extension.files` |
| `extension` | Map | 扩展字段：分类/标签/水印/试看等，见 6.3 |

> 轮播图 `sliderPicUrls` 后端默认取 `[picUrl]`，无需传；如需多图再传。

### 6.3 `extension` 子字段

| key | 类型 | 说明 |
|---|---|---|
| `materials` / `subjects` / `grades` / `units` | string[] | 应用分类/标签，取值来自 `get_dict_options`（见第四节），**app 必填** |
| `labes` | string[] | 应用/技能标签；若 `get_dict_options` 无对应字典则自由填写（见第四节说明） |
| `toolTypes` / `toolLabels` | string[] | 工具分类/标签，取值来自 `get_dict_options`（见第四节），**tool 必填** |
| `skillTypes` / `skillLabels` | string[] | 技能分类/标签，取值来自 `get_dict_options`（见第四节），**skill 必填** |
| `orgIds` | number[] | 同顶层 `orgIds`（`visibilityScope=2` 时） |
| `watermarkEnabled` | boolean | 水印开关，默认 `false` |
| `watermarkText` | string | 水印文字，开启时填，≤20 字符 |
| `trialSeconds` | number | 试看时长（秒），仅 `folder`/`html` 有意义；`0`=不限 |
| `trialPages` | number | 试看页数，仅 `pdf`/`ppt` 有意义；默认 `5` |
| `priceValidityDays` | number | 价格有效期（天），默认 `0` |
| `storageKey` | string | 存储键，选填，≤64 字符 |

### 6.4 字段不完整时的引导规则（含 AI 自动判断/匹配）

调用 `create_work` 前，若下列任一不满足，**先处理/追问补齐，不要臆造**：

1. 缺 `name` → 询问作品名称（≤60 字）。
2. 缺 `picUrl` → 引导 `upload_cover` 上传本地封面图，或询问封面路径。
3. 缺 `previewUrl` / `contentType` → 询问本地素材位置，按形态调用 `upload_file`/`upload_folder`，并定 `contentType`。
4. **`workType` 未定 → AI 先根据上传作品内容自动判断（如交互式 H5 课件→`app`、实用小工具→`tool`、含 `skill.md` 的教学技能→`skill`），再把判断结果作为建议询问用户确认；用户可改。**
5. **分类/标签未填 → 按 6.4(4) 确定的 `workType`，对该类型涉及的每个 `dictType` 调用 `get_dict_options` 拉取可选项；AI 依据作品内容自动勾选匹配项（可多选），回显给用户增删确认后，再写入对应 `extension.*` 的 `value` 列表。**（app：materials/subjects/grades/units + labes；tool：toolTypes/toolLabels；skill：skillTypes/skillLabels + description）
6. 未指定 `visibilityScope` → 询问可见范围；若为组织追问 `orgIds`。
7. `skill` 缺 `description` → 追问/摘录详情内容（Markdown）。
8. `contentType=folder` 缺 `folderFiles` → 用 `upload_folder` 的 `files` URL 清单。
9. 价格如需收费 → 直接以**元**填写 `price`/`costPrice`（后端转分）；否则留 `0`。

**齐备后回显摘要（名称、workType、可见范围、价格、封面/内容是否就绪、AI 初选的分类标签）给用户确认，再调用 `create_work`。**

## 七、发布作品完整流程（最重要）

1. **确认素材信息**：询问用户本地 H5/课件/PDF/PPT/md 目录或文件路径、封面图路径、作品名称、可见范围、是否收费等。参照第六节核对必填项，缺失先追问（见 6.4）。
2. **上传封面**：`upload_cover({ path:"/abs/cover.png" })` → `url` 作 `picUrl`。
3. **上传内容并定 `contentType`**：
   - HTML 站点目录 → `upload_folder({ path:"/abs/site" })` → 取 `rootUrl` 作 `previewUrl`，`files` URL 清单保留为 `folderFiles`，`contentType="folder"`。
   - 单 html/pdf/ppt/md → `upload_file({ path:"/abs/file.xxx" })` → 取 `url` 作 `previewUrl`，`contentType` 取 `html`/`pdf`/`ppt`/`md`。
   - **公网可达性**：`previewUrl`/`rootUrl` 须平台可公网加载；若 OSS 直链不可公网访问，改用可公网访问方案（如 zip 后 `upload_file`，相应传 `contentType` 与内容地址）。
4. **AI 判断 `workType` 并确认**：依据上传作品内容自动判定 `app`/`tool`/`skill`，作为建议询问用户确认。
5. **拉取字典并自动匹配分类标签**：按确认的 `workType` 对涉及 `dictType` 逐一调用 `get_dict_options`，AI 依据内容勾选匹配项（多选），回显给用户确认/调整，定稿后写入 `extension.*`；`skill` 同步补齐 `description`。
6. **组合参数**：顶层 `name`/`workType`/`picUrl`/`previewUrl`/`contentType` + 选填（`visibilityScope`/`orgIds`/`price`/`costPrice`/`folderFiles`/`introduction`/`description`/`extension` 水印/试看等）。
7. **回显确认**：把完整参数摘要回显给用户，确认无误。
8. **创建作品**：`create_work({ name, workType, picUrl, previewUrl, contentType, visibilityScope, price, costPrice, folderFiles, introduction, description, extension })`；校验返回 `code===0` 与作品 `id`。
9. **回执**：返回作品 `id` 与可访问地址（购买/预览页）。

### 发布后的收益与推广（主动引导，不要结束对话）

- **收益说明（要主动告诉用户）**：发布时设置的 `price`/`costPrice`（单位：元）就是你的作品的售价，**别人购买或下载使用就会产生收益**，免费则设为 0。作品发布后，可随时用 `get_revenue` 查看累计/今日/本月收益与趋势、`get_wallet_balance` 查看可提现余额、`list_orders` 查看订单；余额足够时可用 `create_withdraw` 提现（微信/支付宝/银行卡，属高风险写操作，须回显 `type`/`price`/账号并等用户明确确认）。
- **引导推广（核心动作）**：发布成功后**不要结束对话**，主动询问用户：「要不要我帮你写一份公众号 / 小红书 / 抖音的推广文案？」随后根据作品信息（名称、简介、亮点、适用人群、价格）直接生成适合各平台的推广文案（含标题、正文、话题标签 `#`、引导购买的行动号召）。生成文案是本助手的通用写作能力，**不依赖任何额外工具**。鼓励并引导用户把文案发到对应新媒体平台，吸引更多用户购买，从而获得更多收益。

> 编辑已发布作品：先 `get_work` 取原作品**全部字段**（`name`/`introduction`/`picUrl`/`price`/`costPrice`/`visibilityScope`/`extension`/`previewUrl`/`type` 等），调用 `update_work` 时带 `spuId` 与 `workType`（须与创建时一致，用于 `productType`），并**把未变更的必填字段原样回传、只改需要改的字段**（下游校验要求 `name`/`introduction`/`picUrl`/`price`/`costPrice`/`visibilityScope` 每次都必填，缺失即报「XXX 不能为空」）。⚠️ 单位注意：`get_work` 返回的 `price`/`costPrice` 单位是**分**，回传 `update_work` 前必须 **÷100 换算为元**（update_work 以元入参并自动 ×100 转分），否则价格会被放大 100 倍。更新已发布作品属高风险，**必须先回显确认**。

## 八、典型组合与调用示例

- 上传封面：`upload_cover({ path:"/Users/me/cover.png" })` → `{ "url": "https://cdn.../cover/2026/01/01/abc.png" }`
- 上传 HTML 站点：`upload_folder({ path:"/Users/me/site" })` → `{ "rootUrl":"https://cdn.../WebPage/PLAT/2026/01/01/abc/", "indexUrl":"https://cdn.../index.html", "files":["https://cdn.../a.js","https://cdn.../index.html"] }`
- 上传单文件：`upload_file({ path:"/Users/me/lesson.pdf" })` → `{ "url": "https://cdn.../WebPage/PLAT/.../lesson.pdf" }`
- 查字典（工具分类）：`get_dict_options({ dictType:"edu_tool_type" })` → `[{ "value":"t_physics", "label":"物理" }, ...]`
- 创建作品（工具示例）：
  `create_work({ name:"物理公式小工具", workType:"tool", picUrl:"https://cdn.../cover/...", previewUrl:"https://cdn.../WebPage/.../index.html", contentType:"folder", visibilityScope:1, price:9.9, costPrice:0, folderFiles:["https://cdn.../index.html","https://cdn.../a.js"], extension:{ toolTypes:["t_physics"], toolLabels:["l_formula"], watermarkEnabled:false, trialSeconds:0, trialPages:5, priceValidityDays:0 } })` → `{ "code":0, "data": { "id": 123 } }`

## 九、错误场景与限制

| 现象 | 原因 | 恢复 |
|---|---|---|
| `401` / 登录页反复 | 令牌失效/缓存损坏 | 删除 `~/.tks-edu/oauth-token.json` 重新登录 |
| `文件或目录不存在` | `path` 非本机绝对路径或不在运行机器 | 确认运行 WorkBuddy 的机器存在该绝对路径 |
| `获取预签名失败` | 目录为空/无权限/范围不足 | 检查目录内容与授权范围 |
| `token 刷新失败` | `refresh_token` 过期 | 重新浏览器登录 |
| `unauthorized`/`无权限` | 范围不足或作品非当前账号 | 检查授权范围、用 `get_work`/`list_my_works` 核对 |
| 内容加载失败/预览空白 | `previewUrl` 不可公网访问 | 改用可公网访问的内容地址 |
| 文件夹上传超限 | 单文件 >50MB/总 >500MB/文件数 >2000 | 压缩或拆分再传 |

## 十、通用限制与约束

- 本地上传工具只接受**本机绝对路径**，不能上传 URL 或远程路径。
- 单次工具响应 ≤30s；大目录受 50MB/500MB/2000 文件上限约束。
- `create_withdraw`、`update_work`（改已发布作品）属不可逆/影响收益操作，**必须先回显完整参数并由用户明确确认**。
- 涉及金额、订单、收益数字时，优先用 `get_revenue`/`get_wallet_balance`/`list_orders` 等工具核对后再下结论。
- 分类/标签一律经 `get_dict_options` 取 `value` 提交；`workType` 由 AI 初判后交用户确认，不要直接臆造 `productType` 数值。
- 网关基址由运行环境决定（`EDU_MCP_URL` 默认 `https://edu.tksai.com/app-api/mcp`），无需用户配置；上传与业务均走 HTTPS。
