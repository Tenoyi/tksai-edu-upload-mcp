# 教学应用 MCP「本地文件上传 + 作品发布」改造方案

> 目标：把文件上传从「Java 远端 base64/可访问 url 抓取」迁移到「运行在用户本机的 MCP 客户端（Node 桥）直接读本地文件、直传 OSS」，并补齐 `create_work` 等工具，使其严格对齐前端 `WorkEditor.vue` / `UploadZone.vue` 的作品发布流程。
>
> 本文件为改造方案与落地依据（不改代码阶段）。附录 B 为待写入 MCP `SKILL.md` 的草稿，严格遵循 `WorkEditor.vue` 的字段与校验要求。

---

## 1. 背景与现状

### 1.1 当前架构（问题根源）
- **`tksai-edu-upload-mcp`（`src/index.ts`）是纯透传桥**：stdio 客户端（CodeBuddy / Trae / Codex）↔ 远程 Java MCP 端点（`EDU_MCP_URL`）。`ListTools` / `CallTool` 原样转发，**自身不实现任何业务逻辑**，工具定义与执行全在 Java 后端。
- **Java 后端 `EduMcpTools.java` 实现了 `upload_file` / `upload_folder`**：因跑在远端服务器，读不到用户本地文件，只能靠 `fileUrl`（可访问 HTTP 地址）或 `fileContent`（Base64）入参——即用户诟病的「base64 / 可访问 url 传递给 Java」局限。

### 1.2 参考目标：前端人工上传 → 发布流程（`tksai-edu-vue3-user`）
前端**不走 base64**，而是在客户端直接拿字节上传 OSS：
- `UploadZone.vue` → `EduApi.uploadFile` / `EduApi.uploadFolder`（`src/api/edu.js`）：
  - **单文件**（`uploadFile` 普通模式）：直接 `multipart/form-data` POST 到 `/app-api/infra/file/upload`，返回 `{ code, data: url }`。
  - **文件夹**（`uploadFolder`）：**不再打包 zip**，遍历目录得到 `[{ file, path(相对路径) }]`，对每个文件调 `/app-api/infra/file/presigned-url-folder?name=<相对路径>&directory=<folderKey>` 拿到 `uploadUrl`，**逐个文件直接 PUT 到 OSS**（并发 5），保留原相对路径结构（保证静态站点 `index.html` + 子资源可加载）。返回 `{ indexUrl, rootUrl, files }`。
  - OSS PUT 时 `.html` 显式设 `Content-Type: text/html` + `Content-Disposition: inline`。
- `WorkEditor.vue` → `EduApi.createWork` POST `/app-api/product/spu/create`，把 `contentUrl`（文件夹的 `indexUrl` 或单文件的 `url`）连同标题/封面/分类等写入 SPU。
  - **封面与内容同 OSS 目录**：`EduApi.uploadFile(coverImg, deriveContentDirectory(shareLink))`——从内容 URL 截出目录，封面落在同一路径（`WorkEditor.vue:130-158`）。
- 目录生成 `buildUploadDirectory()`（`uploadPath.js`）：`WebPage/PLAT/yyyy/MM/dd/<10位随机>`。

---

## 2. 总体目标与架构

**把文件上传从「Java 远端 base64/url」迁移到「Node 桥（客户端，能读本地文件系统）直接上传 OSS」**，完全复刻前端 `uploadFile` / `uploadFolder` / `createWork` 三步流程，且不再向 Java 传递 base64 或用于「下载再上传」的可访问 url。

```
AI 客户端
   │ (stdio)
   ▼
Node 桥 (tksai-edu-upload-mcp)  ←── 新增：本地读文件 + 直传 OSS（upload_file / upload_folder / upload_cover）
   │   create_work / 其它工具        转发 upstream（Java）
   ▼
Java 后端 MCP
   │   create_work（仅收 URL + 元数据，不含文件字节）→ /product/spu/create（@PermitAll）
   ▼
业务 / 对象存储
```

### 2.1 模块职责（改造后）

| 模块 | 负责工具 | 说明 |
|---|---|---|
| `tksai-edu-upload-mcp`（客户端 / Node，本地有 FS） | `upload_file`、`upload_folder`、`upload_cover` | 本地读文件 → 直传 OSS → 返回 url + 同目录 directory |
| `yudao-module-mcp`（Java 后端） | `create_work`、`update_work`（**重写全字段**）、`get_work`、`list_my_works`、`get_dict_options`、`get_api_key_help` 等 | **删除** `upload_file` / `upload_folder`（base64/url）；清理无用 import |
| Java `EduApiClient` | — | 保留，`create_work` 仍用它调 `/product/spu/create` |

---

## 3. 鉴权方案（复用 MCP OAuth/token，不使用前端 EDU_API_KEY）

- **复用 MCP 已建立的 OAuth / token**：即桥连接 `/app-api/mcp` 所用的 Bearer 凭证（也就是既有的 `EDU_API_KEY` / OAuth token）。直接以此 token 调 `/infra/file/*`、`/product/spu/create` 等业务接口。
- 这与 Java `EduApiClient` 现有做法完全一致（它转发 `McpAuthContext` 里的调用方 token）。
- 调业务接口时仅需 `Authorization: Bearer <MCP_TOKEN>` + `terminal: 20`，**无需 `tenant-id`**（后端据 key 推导），也**不引入前端 `getAccessToken()` 那套**。
- **边界说明**：`create_work` 接收的 `contentUrl` 是「上传后返回的 OSS 发布链接」（前端 `extension.url` / `previewUrl` 本就这么传），属于正常业务字段；需要删除的违规做法是 Java 端用 base64 / 可访问 url **去抓取再上传**的那段。

---

## 4. 前端参考流程关键事实（供改造对齐）

### 4.1 单文件上传（`EduApi.uploadFile` 普通模式，`edu.js`）
- `POST /infra/file/upload`，`FormData` 字段：`file` + 可选 `directory`。
- 返回 `{ code, data: url }`。

### 4.2 文件夹上传（`EduApi.uploadFolder`，`edu.js`）
- **逐文件 presigned PUT，不打 zip**。
- `folderKey`：`directory` 以 `/` 结尾则直接用，否则 `${directory}/${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}`。
- 对每个文件：`GET /infra/file/presigned-url-folder?name=<相对路径>&directory=<folderKey>` → `{ uploadUrl, url }` → `PUT` 到 OSS（`.html` 设 `text/html` + `Content-Disposition: inline`），并发 5。
- 返回 `{ indexUrl（index.html 的 url）, rootUrl, files:[{url,name,size}] }`。

### 4.3 封面上传（与内容同目录，`WorkEditor.vue:130-158`）
- `EduApi.uploadFile(coverImg, deriveContentDirectory(shareLink))`。
- `deriveContentDirectory(url)`：从内容 URL 截出 OSS 目录，封面落到同一路径；重传封面不会生成新随机目录。

### 4.4 创建作品 payload 与校验（严格来源，见附录 A）
- `POST /product/spu/create`，字段见附录 A。
- 关键映射：`picUrl = coverUrl`、`sliderPicUrls = [coverUrl]`、`previewUrl = contentUrl`、`extension.url = contentUrl`、`extension.type = contentType`、`productType`（app=2/tool=3/skill=4）。
- 价格界面填「元」，后端收「分」：`price = Math.round(Number(元) * 100)`，空值=0（免费）。
- 可见范围：`1=公开 / 2=组织内共享 / 3=完全私有`；`scope=2` 时 `orgIds` 必填（来自 `getMyOrganizations`）。

---

## 5. 客户端（Node 桥 `tksai-edu-upload-mcp`）改造

### 5.1 端点与环境变量
- 复用 `EDU_MCP_URL`（连 MCP 上游）。
- 新增 `EDU_API_BASE`：由 `EDU_MCP_URL` 推导 `new URL(EDU_MCP_URL).origin + '/app-api'`（默认 `https://edu.tksai.com/app-api`），支持环境变量覆盖。
- 复用 `EDU_API_KEY`（即 MCP 的 OAuth/token）。
- 常量 `EDU_API_TERMINAL = '20'`。

### 5.2 业务 HTTP 辅助（Node 18+ 全局 `fetch`）
```ts
function authHeaders() {
  return { Authorization: `Bearer ${EDU_API_KEY}`, terminal: EDU_API_TERMINAL }
}
async function apiGet(path, params): Promise<any>           // GET 业务接口
async function uploadMultipart(buffer, fileName, mime, directory?): Promise<string> // POST /infra/file/upload → url
async function ossPut(uploadUrl, buffer, contentType, extraHeaders?): Promise<void>  // 直传 OSS（无鉴权头）
```

### 5.3 复刻 `buildUploadDirectory`（`uploadPath.js`，不依赖 localStorage）
```ts
const CONTENT_BASE = 'WebPage/PLAT'
function buildUploadDirectory(base = CONTENT_BASE) {
  const d = new Date(); const p = n => String(n).padStart(2, '0')
  const rand = Math.random().toString(36).slice(2, 12)
  return `${base}/${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}/${rand}`
}
```

### 5.4 本地工具 1：`upload_file`
- **入参**：`{ path: 本地文件绝对路径, directory?: OSS 目录(缺省自动生成), name?: 文件名覆盖 }`
- **行为（复刻 `EduApi.uploadFile` 普通模式）**：
  1. `fs.accessSync(path)` 确认存在且为文件；`fs.readFileSync` 读 Buffer。
  2. 由扩展名推断 `mime`（内联小映射，或可选加 `mime-types`；`.html`→`text/html`）。
  3. `uploadMultipart(buffer, name, mime, directory ?? buildUploadDirectory())`。
  4. 解析 `{ code, data: url }`。
  5. **返回 `{ url, directory }`**（`directory` = 传入的 directory 或 由 url 去掉文件名反推），供封面复用。

### 5.5 本地工具 2：`upload_folder`
- **入参**：`{ path: 本地文件夹绝对路径, directory?: OSS 根目录(缺省自动生成), include?: 仅含扩展名如 html,js, exclude?: 默认 ['.git','node_modules'] }`
- **行为（复刻 `EduApi.uploadFolder`，逐文件 presigned PUT，不打 zip）**：
  1. 递归遍历目录，收集 `{ buffer, relPath }`（relPath 用 `/` 分隔，保留子目录结构）。
  2. 应用 `exclude`（默认跳过 `.git`、`node_modules`）、可选 `include` 扩展名过滤。
  3. `folderKey`：`directory` 以 `/` 结尾则直接用，否则 `${directory}/${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}`。
  4. 校验根目录存在 `index.html`（按前端约定；缺失则报错提示）。
  5. 逐文件：`GET /infra/file/presigned-url-folder?name=<relPath>&directory=<folderKey>` → `ossPut(uploadUrl, buffer, contentType, isHtml?{Content-Disposition:'inline'})`，并发 5。
  6. 计算 `indexUrl`（`index.html` 的 url）与 `rootUrl`。
  7. **返回 `{ indexUrl, rootUrl, directory: folderKey, files: [{url,name}] }`**。

### 5.6 本地工具 3：`upload_cover`（推荐新增，等价于前端逻辑）
- **入参**：`{ contentUrl: 内容 URL（来自 upload_file.url / upload_folder.indexUrl）, coverPath: 本地封面图绝对路径 }`
- **行为**：`directory = deriveContentDirectory(contentUrl)`（从 URL 截出 OSS 目录）→ 调 `upload_file(coverPath, directory)` → **返回 `{ coverUrl }`**（与作品同目录）。

### 5.7 工具列表合并 + 路由
```ts
const LOCAL_TOOLS = new Set(['upload_file', 'upload_folder', 'upload_cover'])
// ListTools：上游过滤掉本地已实现的工具，再拼上本地工具定义
const upstream = (await upstreamClient.listTools()).tools.filter(t => !LOCAL_TOOLS.has(t.name))
return { tools: [...LOCAL_TOOL_DEFS, ...upstream] }
// CallTool：本地工具本地执行，其余转发
if (LOCAL_TOOLS.has(name)) return localHandlers[name](request.params.arguments)
return upstreamClient.callTool(request.params)
```

### 5.8 依赖
- **无需归档依赖**（复刻前端逐文件 presigned PUT，不用 `archiver`）。
- 仅用 Node 内置 `node:fs` / `node:path` / `node:url` + 全局 `fetch` / `FormData` / `Blob`（Node 18+）。
- 可选：加 `mime-types`（精确 content-type）或 `minimatch`（include/exclude glob）；建议先内联小映射，不加依赖。

---

## 6. Java 后端（`yudao-module-mcp`）改造

### 6.1 删除 `upload_file` / `upload_folder`
- 删除 `EduMcpTools.java` 中 `@Tool upload_file`（行 30）、`@Tool upload_folder`（行 42）及私有辅助 `uploadFile` / `uploadFolder` / `downloadToBuffer`。
- 清理无用 import：`RestTemplate`、`HttpHeaders`、`HttpMethod`、`ByteArrayResource`、`HttpEntity`、`MultipartBodyBuilder`、`Resource`、`java.util.Base64`、`java.net.URL`、`java.util.UUID`（确认无其它用处后删）。

### 6.2 重写 `create_work` / `update_work`（对齐前端 `WorkEditor.vue:531-561`）
当前 Java `create_work` 字段**对不上后端真实契约**（发 `coverUrl` 而前端用 `picUrl`/`sliderPicUrls`；发 `contentUrl` 而前端用 `previewUrl`/`extension.url`；`extension` 只透传 `orgIds`+任意 map，缺少 `trial*`/`priceValidityDays`/`storageKey`/各分类标签/`url`/`type`/`files`）。必须重写：

**`create_work` 入参（全部显式命名）**
- 通用：`name`(≤60,必填)、`workType`('app'|'tool'|'skill'，必填)、`contentUrl`(必填，来自上传)、`contentType`(html|folder|pdf|ppt|…，→`type`&`extension.type`)、`coverUrl`(可选)、`introduction`、`description`(仅 skill)、`price`(**元**，自动×100→分，空=0)、`costPrice`(元→分)、`visibilityScope`(1公开/2组织/3私有，默认1)、`orgIds`(scope=2 必填)、`storageKey`、`trialSeconds`(默认0)、`trialPages`(默认5)、`priceValidityDays`(默认0)、`watermarkEnabled`(默认false)、`watermarkText`、`files`(folder 类型文件清单 `[{url,name}]`)
- 教学应用：`materials`、`subjects`、`grades`、`units`、`labes`
- 教学工具：`toolTypes`、`toolLabels`
- 教学技能：`skillTypes`、`skillLabels`

**内部生成（与前端完全一致）**
- `productType` = app?2 : tool?3 : skill?4
- `introduction` 取值：app→`description`、tool→`toolDescription`、skill→`skillIntro`（对应入参 `introduction` 之外，需按 workType 取对应字段；见附录 A 映射）
- `description`（后端字段，仅 skill）= skillDetail
- `picUrl = coverUrl`；`sliderPicUrls = coverUrl ? [coverUrl] : []`
- `previewUrl = contentUrl`；`extension = { orgIds, watermarkEnabled, watermarkText, trialSeconds(≤0→0), trialPages(默认5), priceValidityDays(默认0), storageKey, [按 workType 子字段], url: contentUrl, type: contentType, files }`
- 缺省值：price 空=0（免费）；trialSeconds≤0→0（不限时长）；trialPages 默认5；priceValidityDays 默认0。

**`update_work`**：保留 `id`，支持上述字段可选更新，同样修正 `picUrl`/`sliderPicUrls`/`previewUrl`/`extension` 结构。

### 6.3 更新文档类工具
- `get_api_key_help`：工具列表去掉 `upload_file` / `upload_folder`，改为 `upload_file / upload_folder / upload_cover`（客户端本地工具），并说明入参是本地路径。
- `get_dict_options`：继续提供下拉 value；可选新增 `get_work_schema(workType)` 返回某类型必填/选填字段与对应 dict 来源（降低 Agent 填参成本）。

### 6.4 编译验证
- `mvn -pl yudao-module-mcp -am compile -o`

---

## 7. 端到端流程（改造后）

```
1) upload_file({ path, directory? })            → { url, directory }
2) upload_folder({ path })                       → { indexUrl, rootUrl, directory, files }
3) upload_cover({ contentUrl: indexUrl,
                  coverPath })                   → { coverUrl }   （与作品同 OSS 目录）
4) create_work({ name, workType, contentUrl: indexUrl,
                 contentType, coverUrl, …按类型字段 }) → { spuId }   ✅ 作品发布完成
```
> 可选增强：新增 `create_work_from_local(...)` 合并 2+3+4；建议保留分步以复用已上传 URL，与前端一致。

---

## 8. 取舍：WorkBuddy 远程直连

- 删除 Java `upload_*` 后，**直连 Java 的 WorkBuddy 远程连接器将无法本地上传**（这是「读本地文件必须客户端有 FS」的固有局限）。
- 选择 **A（推荐，符合「不用 base64/url」）**：直接删除 Java `upload_*`，更新 WorkBuddy `SKILL.md` 说明限制；若 WorkBuddy 用户也需要，后续让其也走本地桥。
- 选择 **B**：Java 端保留 `upload_*` 仅作 deprecated 远程 fallback（仍 base64/url）——与要求冲突，不建议。

---

## 9. 验证步骤

1. `cd tksai-edu-upload-mcp && npm i && npm run dev`，在 MCP 客户端连 stdio。
2. `upload_file`（本地 html）→ 返回 OSS URL 且浏览器可直访。
3. `upload_folder`（含 `index.html` 的子目录站点）→ `indexUrl` 可预览、子资源相对路径正常。
4. `upload_cover({ contentUrl: indexUrl, coverPath })` → `coverUrl` 与 `indexUrl` 同目录。
5. `create_work`（按类型填全字段）→ 生成 SPU，前端 `Preview` 可打开。
6. `mvn -pl yudao-module-mcp -am compile -o` 通过；`tools/list` 中已无 Java 的 `upload_*`，只有桥本地三工具。
7. 同步更新 `README.md`、两份 `SKILL.md`、`connector-meta.json`（去掉 base64/url 旧描述，改为本地路径入参）。

---

# 附录 A：`create_work` 字段与校验规则（严格对齐 `WorkEditor.vue`）

## A.1 校验规则（`WorkEditor.vue:451-500`，MCP 侧同样强制）
| 校验项 | 规则 |
|---|---|
| 标题 `name` | 必填，去空格非空；长度 ≤ 60 |
| 作品类型 `workType` | 必填，取值 `app` / `tool` / `skill` |
| 封面 `coverUrl` | **必填**（前端 `editWork.coverRequired`） |
| 技能详情 `description`（仅 skill） | 必填（markdown 非空） |
| 标签 `labes` | `app` 或 `skill` 时必填（≥1） |
| 教材 `materials` | `app` 时必填（≥1） |
| 学科 `subjects` | `app` 时必填（≥1） |
| 年级 `grades` | `app` 时必填（≥1） |
| 单元 `units` | `app` 时必填（≥1） |
| 工具分类 `toolTypes` | `tool` 时必填（≥1） |
| 技能分类 `skillTypes` | `skill` 时必填（≥1） |
| 组织 `orgIds` | `visibilityScope=2`（组织内共享）时必填（≥1） |

## A.2 字段映射与默认值（`WorkEditor.vue:506-561`）
| 后端字段 | 来源 / 计算 | 默认 |
|---|---|---|
| `productType` | app=2 / tool=3 / skill=4 | — |
| `name` | 标题 | — |
| `introduction` | app→`description`；tool→`toolDescription`；skill→`skillIntro` | 空串 |
| `description` | 仅 skill→`skillDetail` | 不传 |
| `picUrl` | = `coverUrl` | — |
| `sliderPicUrls` | `coverUrl ? [coverUrl] : []` | — |
| `price` / `costPrice` | 界面「元」×100 → 后端「分」；空=0（免费） | 0 |
| `visibilityScope` | 1=公开 / 2=组织 / 3=私有 | 1 |
| `previewUrl` | = `contentUrl` | — |
| `type` / `extension.type` | = `contentType`（html/folder/pdf/ppt/…） | — |
| `extension.url` | = `contentUrl` | — |
| `extension.orgIds` | scope=2 时传 | [] |
| `extension.watermarkEnabled` | 布尔 | false |
| `extension.watermarkText` | 文本 | '' |
| `extension.trialSeconds` | >0 否则 0（0=不限时长） | 0 |
| `extension.trialPages` | 数字 | 5 |
| `extension.priceValidityDays` | 数字 | 0 |
| `extension.storageKey` | 文本 | '' |
| `extension.materials/subjects/grades/units/labes` | `app` 分类标签 | [] |
| `extension.toolTypes/toolLabels` | `tool` 分类标签 | [] |
| `extension.skillTypes/skillLabels` | `skill` 分类标签 | [] |
| `extension.files` | `folder` 类型：`[{url,name}]` | 不传 |

## A.3 下拉数据源（`get_dict_options` / `WorkEditor.vue:189`）
`materials`、`subjects`、`grades`、`units`、`labes`、`edu_tool_type`、`edu_tool_labels`、`edu_skill_type`、`edu_skill_labels`（返回 `[{value,label}]`，提交用 `value`）。

---

# 附录 B：MCP `SKILL.md` 草稿（严格对齐 `WorkEditor.vue`）

> 以下为待写入 MCP `SKILL.md` 的内容。**每条工具都按前端 `WorkEditor.vue` 的真实字段与校验编写；当参数不全时，AI 智能体必须主动向用户提问补齐，禁止臆造 `name`/`coverUrl`/`contentUrl`/分类标签等关键信息。**

```markdown
# 教学应用作品上传与发布 MCP

本 MCP 用于在 AI 编程智能体中，将用户本地的教学作品（单文件 / 含 index.html 的文件夹站点）
上传到对象存储，并创建为平台作品（SPU）完成发布。

## 鉴权
使用 MCP 已配置的 OAuth / token（即连接 /app-api/mcp 的 Bearer 凭证），无需额外配置。

## 工具一览
- upload_file：上传单个本地文件 → 返回 { url, directory }
- upload_folder：上传本地文件夹（含 index.html）→ 返回 { indexUrl, rootUrl, directory, files }
- upload_cover：把本地封面图上传到与作品内容相同的 OSS 目录 → 返回 { coverUrl }
- create_work：基于已上传的内容 URL 创建作品（见下方严格字段与校验）
- update_work / get_work / list_my_works / get_dict_options / get_api_key_help 等

## 上传步骤（必须先于 create_work）
1. upload_file({ path: "<本地绝对路径>", directory? }) → { url, directory }
2. upload_folder({ path: "<本地文件夹绝对路径>" }) → { indexUrl, rootUrl, directory, files }
   - 文件夹必须包含 index.html，否则报错。
   - 内部逐文件直传 OSS，不打 zip，保留相对路径结构。
3. upload_cover({ contentUrl: "<步骤1/2 返回的 url 或 indexUrl>", coverPath: "<本地封面图绝对路径>" })
   → { coverUrl }（与作品内容同 OSS 目录）

## create_work（严格按前端 WorkEditor.vue 要求）

### 必填参数
- name：作品标题（≤60 字，必填）。
- workType：作品类型，三选一：
  - "app"  教学应用
  - "tool" 教学工具
  - "skill" 教学技能
- contentUrl：内容链接，来自 upload_file.url 或 upload_folder.indexUrl（必填）。
- coverUrl：封面图链接，来自 upload_cover.coverUrl（**必填**，前端强制要求封面）。
- contentType：内容形态，如 html / folder / pdf / ppt（与上传步骤一致）。

### 按 workType 必填的分类/标签（用 get_dict_options 取值后提交 value）
- workType="app"：materials（教材）、subjects（学科）、grades（年级）、units（单元）、labes（标签）——均 ≥1。
- workType="tool"：toolTypes（分类）≥1；可选 toolLabels（标签）。
- workType="skill"：skillTypes（分类）≥1、labes（标签）≥1。

### 可选参数
- introduction：作品简介。
  - app 对应"应用简介"；tool 对应"工具简介"；skill 对应"技能简介"。
- description：仅 skill 使用，技能详情（markdown，必填见上）。
- price：在线使用价格，单位「元」（将自动 ×100 转分）；留空=0（免费）。
- costPrice：下载价格，单位「元」；留空=0。
- visibilityScope：可见范围，1=完全公开（默认）/ 2=组织内共享 / 3=完全私有。
- orgIds：当 visibilityScope=2 时必填（组织 ID 列表，来自 get_dict_options 或 getMyOrganizations）。
- watermarkEnabled / watermarkText：水印开关与文字。
- trialSeconds：试看时长（秒），0 或留空=不限时长。
- trialPages：试看页数，默认 5。
- priceValidityDays：价格有效期（天），默认 0。
- storageKey：存储键（一般留空）。
- files：当 contentType="folder" 时，传 upload_folder 返回的 files 清单 [{url,name}]。

### 校验失败将返回明确错误，常见原因
- 缺 name / workType / coverUrl / contentUrl。
- app 缺 materials/subjects/grades/units/labes；tool 缺 toolTypes；skill 缺 skillTypes/labes/skillDetail。
- visibilityScope=2 却缺 orgIds。

## ⚠️ 参数收集与追问策略（重要）
调用 create_work 前，AI 智能体必须确保必填参数齐全。**当参数不全时，必须主动向用户提问补齐，不得臆造**：
1. 先确认 workType（app/tool/skill）——它决定后续要收集哪些分类字段。
2. 若用户未给 name / coverUrl / contentUrl，明确询问并提供上传方式（本地路径走 upload_file/upload_folder/upload_cover）。
3. 分类/标签字段必须用 get_dict_options 获取可选项后，以「选项列表」形式请用户勾选/确认，不要凭空编造 value。
4. 价格、可见范围、试看等可选参数若用户未提，可给默认值（免费/公开/不限时长）并在提交前复述确认。
5. 对所有写操作（创建/更新作品、提现等），执行前用一句话向用户复述关键参数并等待确认。
```

---

# §10 部署 / 分发与 `mcp.json` 配置

> 三种方式都要求桥进程**运行在用户本机（stdio）**，差异只在「如何获得并启动这个进程」。环境变量完全一致。
> 注意：本地无桥（直连 Java 的 streamableHttp）方案**已取消**，仅保留下面三种本地桥（stdio）方式；上传必须经由本机桥进程才能读取本地文件。

## 10.1 环境变量（三种方式通用）

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `EDU_API_KEY` | **是** | 无 | MCP OAuth / 个人 API Key（Bearer）。同时用于：① 连接上游 Java MCP 端点；② 改造后调用 `/infra/file/*`、`/product/spu/*` 等业务接口。**不是**前端的 `getAccessToken` 体系。 |
| `EDU_MCP_URL` | 否 | `https://edu.tksai.com/app-api/mcp` | 上游 Java 后端 MCP 端点（streamableHttp）。 |
| `EDU_API_BASE` | 否 | 由 `EDU_MCP_URL` 推导（取 origin + `/app-api`，如 `https://edu.tksai.com/app-api`） | 业务接口基址。仅改造后新增的本地上传工具需要；不配则自动从 `EDU_MCP_URL` 推导。 |

> 密钥提示：`EDU_API_KEY` 来自「个人中心 → MCP 管理」创建的 API Key / OAuth token，请勿提交进仓库。

## 10.2 方式一：本地源码运行（开发者）
前置：`cd tksai-edu-upload-mcp && npm install && npm run build`（产物 `dist/index.js`）。
开发态免构建可用：`npx tsx src/index.ts`。

```json
{
  "mcpServers": {
    "tks-ai-edu-upload": {
      "command": "node",
      "args": ["/abs/path/tksai-edu-upload-mcp/dist/index.js"],
      "env": {
        "EDU_API_KEY": "tk_xxxxxxxxxxxx",
        "EDU_MCP_URL": "https://edu.tksai.com/app-api/mcp"
      }
    }
  }
}
```
> 也可用 `"command": "npm", "args": ["start"], "cwd": "/abs/path/tksai-edu-upload-mcp"`（依赖已 build）。

## 10.3 方式二：Bun 单文件二进制（非开发者 / 小白，免装 Node）
前置：`npm install && npm run build:bin`（见 `build.mjs`），产物在 `release/`：
`tks-ai-edu-upload-mcp-macos-arm64` / `macos-x64` / `win-x64.exe` / `linux-x64`（内嵌 Bun 运行时，单文件）。

```json
{
  "mcpServers": {
    "tks-ai-edu-upload": {
      "command": "/abs/path/tksai-edu-upload-mcp/release/tks-ai-edu-upload-mcp-macos-arm64",
      "args": [],
      "env": {
        "EDU_API_KEY": "tk_xxxxxxxxxxxx"
      }
    }
  }
}
```
> 二进制直接做 `command`，无需 `node`、无需 `npx`；平台选对应文件即可。

## 10.4 方式三：`npx`（需先把包 `npm publish` 到 npmjs.com）
包名为 **`@tks-ai/edu-upload-mcp`**（`package.json` 已配 `publishConfig.public` + npmjs registry），不是 `@tks-ai/tks-ai-upload-mcp`。`npx` 会在本机下载并执行其 `bin`（`tks-ai-edu-upload-mcp` → `dist/index.js`），**仍在本机运行、具备本地 FS 权限**。

```json
{
  "mcpServers": {
    "tks-ai-edu-upload": {
      "command": "npx",
      "args": ["-y", "@tks-ai/edu-upload-mcp"],
      "env": {
        "EDU_API_KEY": "tk_xxxxxxxxxxxx"
      }
    }
  }
}
```
> 仅当包已发布到 npmjs.com 时 `npx -y @tks-ai/edu-upload-mcp` 才可用；未发布请改用方式一/二。

## 10.5 小结
| 方式 | 是否需要发 npm | 是否需要 Node | 适合人群 |
|---|---|---|---|
| 一、本地源码 | 否 | 是 | 开发者 / 调试 |
| 二、Bun 二进制 | 否（走 GitHub Releases） | 否 | 终端用户 / 小白 |
| 三、npx | **是** | 否（npx 自带） | 想一条命令启动的全体用户 |

**结论**：改造本身不强制发布 npm；发布与否只是分发渠道选择。三种方式下 `mcp.json` 的 `command`/`args` 不同；**但 `env` 不随认证模式变化**——对本地 stdio 桥而言 OAuth 与 Token 等价，都只填 `EDU_API_KEY`（详见 §10.6）。

---

## 10.6 认证模式：Token（API Key）与 OAuth 的真实关系（重要更正）

> **结论先行**：对**本地 stdio 桥**而言，OAuth token 与 API Key **完全等价**——都只是一个 `Authorization: Bearer <token>` 字符串，桥不区分来源。因此 **stdio 桥只有一种 mcp.json 形态**，不存在「独立的 OAuth 版」。

### 10.6.1 当前代码里 OAuth 是怎么注入的（事实，非设想）
- **我们的桥 `src/index.ts` 没有任何 OAuth 代码**：只读取 `EDU_API_KEY`，以 `Authorization: Bearer ${apiKey}` 转发给上游（Java `/app-api/mcp`）。
- **后端**：`yudao-module-mcp` 复用 framework 的 `TokenAuthenticationFilter`，**同时接受 `tksai_ API Key` 与 `OAuth Bearer`**，并挂 system 的 OAuth AS——即后端认可 OAuth 签发的 access token。
- **OAuth 的授权动作发生在 AI 客户端/平台（如 WorkBuddy）**：WorkBuddy 自行完成 OAuth 2.1 PKCE——弹浏览器让用户登录授权，拿到 access token 后自动注入到每个 MCP 请求的 `Authorization` 头。**用户不手填密钥**。
- 仓库已有真实证据：
  - `workbuddy/oauth/mcp.json`（**无桥、直连 streamableHttp**）：
    ```json
    { "mcpServers": { "tks-ai-edu-upload": { "type": "streamableHttp", "url": "https://edu.tksai.com/app-api/mcp", "timeout": 30000 } } }
    ```
    没有 `Authorization`、没有额外 env——OAuth 全在 WorkBuddy 内部。
  - `workbuddy/token/mcp.json`（无桥、直连 streamableHttp）：仅多了 `"headers": { "Authorization": "Bearer ${EDU_API_KEY}" }`。
  - `workbuddy/oauth/skills/.../SKILL.md`：「通过 WorkBuddy 标准 OAuth 2.1（PKCE）授权接入，**无需手动填写密钥**；若 401 在 WorkBuddy 中重新授权即可」。

### 10.6.2 之前编造的「桥内 OAuth」配置已作废
此前本节写了 `EDU_AUTH_MODE` / `EDU_OAUTH_AUTHORIZE_URL` / `EDU_OAUTH_TOKEN_URL` / `EDU_OAUTH_CLIENT_ID` 等 env——**这套代码在仓库中不存在、也不需要**：
- stdio 桥是 AI 客户端 spawn 的子进程，不适合弹浏览器做 PKCE；即便做了，结果也只是拿到一个 Bearer token 再塞进 `EDU_API_KEY`，与直接填静态 Key 没有区别。
- **结论：本地 stdio 桥不需要、也不应引入任何 OAuth 相关 env**；所谓「OAuth 版 mcp.json」对本桥不成立。

### 10.6.3 直连 Java streamableHttp（无桥）方案已取消
> 已确认：**不再提供「无本地桥、直连 Java streamableHttp」的方案**。上传必须经由本机桥进程（stdio）才能读取本地文件，故仅保留 §10.2–§10.4 三种本地桥方式 + §10.7 三种 mcp.json 样例。

### 10.6.4 小结
| 场景 | mcp.json 形态 | 凭证来源 |
|---|---|---|
| 本地 stdio 桥（源码 / 二进制 / npx） | `env: { EDU_API_KEY: "<bearer>" }` | API Key 或 OAuth token，桥不区分 |
| WorkBuddy 直连 streamableHttp · token（无桥，已取消） | `type:streamableHttp` + `headers.Authorization: Bearer ${EDU_API_KEY}` | 手填 Key |
| WorkBuddy 直连 streamableHttp · OAuth（无桥，已取消） | `type:streamableHttp` + `url`（无 auth 块） | WorkBuddy 自动 OAuth 注入 |

- **对本地 stdio 桥而言，OAuth 与 Token 完全等价，都只填 `EDU_API_KEY`**，不存在需要额外 OAuth env 变量的配置。
- 当前代码仅有 Token（API Key）路径；OAuth token 只要放进 `EDU_API_KEY` 即可被桥原样转发，无需任何桥侧改造。

---

## 10.7 三种 mcp.json 完整样例（本地 stdio 桥唯一方案）

只保留三种分发方式；**每种只有一种形态**（OAuth 与 Token 对桥等价，都填 `EDU_API_KEY`）。`EDU_API_BASE` 一般无需配置，默认由 `EDU_MCP_URL` 推导。

### 1) 本地源码
```json
{
  "mcpServers": {
    "tks-ai-edu-upload": {
      "command": "node",
      "args": ["/abs/path/tksai-edu-upload-mcp/dist/index.js"],
      "env": {
        "EDU_API_KEY": "tk_xxxxxxxxxxxx（或 OAuth 换得的 token）",
        "EDU_MCP_URL": "https://edu.tksai.com/app-api/mcp"
      }
    }
  }
}
```

### 2) Bun 二进制
```json
{
  "mcpServers": {
    "tks-ai-edu-upload": {
      "command": "/abs/path/tksai-edu-upload-mcp/release/tks-ai-edu-upload-mcp-macos-arm64",
      "args": [],
      "env": { "EDU_API_KEY": "tk_xxxxxxxxxxxx（或 OAuth 换得的 token）" }
    }
  }
}
```

### 3) npx（需先 `npm publish` 到 npmjs.com，包名 `@tks-ai/edu-upload-mcp`）
```json
{
  "mcpServers": {
    "tks-ai-edu-upload": {
      "command": "npx",
      "args": ["-y", "@tks-ai/edu-upload-mcp"],
      "env": { "EDU_API_KEY": "tk_xxxxxxxxxxxx（或 OAuth 换得的 token）" }
    }
  }
}
```

> 说明：三种方式下 `command`/`args` 不同，但 `env` 完全一致——都只需 `EDU_API_KEY`（API Key 或 OAuth token 皆可）。**不存在需要额外 OAuth env 变量的配置**；若某 AI 客户端支持自动 OAuth，把换来的 access token 填入 `EDU_API_KEY` 即可，桥侧零改动。
