# @tks-ai/edu-upload-mcp

教学应用上传 MCP：让 AI 编程智能体（CodeBuddy / Trae / WorkBuddy / Codex 等）直接上传本地文件/文件夹，并在教学平台创建教学作品。

## 架构总览

**Java 后端 `yudao-module-mcp`（`https://edu.tksai.com/app-api/mcp`）提供业务类工具（create_work / update_work / 订单 / 收益等，同时支持 OAuth 2.1 与 API Key 鉴权）。**

**本地文件上传（upload_file / upload_folder / upload_cover）由本桥（stdio 进程，运行在用户本机）实现**——只有运行在用户机器上的进程才能读取本地文件并直传对象存储，因此上传类工具必须经由本桥。

三处交付产物联动：

| 产物 | 角色 | 实现内容 |
|---|---|---|
| **Java 后端服务** | MCP 服务端：业务类工具 + OAuth 2.1 + API Key 鉴权 | ✅ 业务工具的唯一事实来源 |
| **npm 包 / 免安装二进制** | 本地 stdio 桥：实现 3 个本地上传工具 + 转发后端业务工具 | ✅ 含本地上传实现（运行在用户本机） |
| **WorkBuddy 连接器包** | 远程 `streamableHttp` 配置，直连 Java 端点 | ❌ 仅配置（无本地上传能力） |

因此：

- **上传本地文件**必须经由本桥（stdio）：支持 stdio 的智能体（CodeBuddy / Trae / Codex 等）用方式二 / 方式三；
- 支持远程 `streamableHttp` 的平台（WorkBuddy）直连后端，**可调用业务工具，但无法直接上传本机文件**（需先把文件放到可访问地址）；
- 后端新增 / 调整业务工具时，桥接侧**无需发版即可同步**（工具清单在运行时从后端动态拉取）。

> 注：早期版本本包曾自带全部工具的 Node 实现，现已将业务工具迁入 Java 后端；而文件上传因必须读取用户本机文件，改由本桥在本机实现。

## 平台介绍：让教学作品变成可分享、可收益的资产

**好课件，不应该沉睡在硬盘里。**

你花心思做出的每一份教学作品，都值得被更多人看到，也更该为你带来回报。[AI 教学应用托管交易平台 edu.tksai.com](https://edu.tksai.com) 帮你**把教学作品，变成可分享、可收益的资产**：

- **永久分享链接**：上传后即刻获得稳定可访问的永久链接，可一键分享给任何老师、学生、培训机构，不必再反复传文件、发附件；
- **持续为你带来收益**：作品上架后，用户购买你的作品，你将持续获得收益——让每一份作品在你休息时也在持续创造价值；
- **多形态托管**：支持**教学应用、教学工具、教学技能**三类托管，覆盖你不同的产出形态。

**广泛兼容你的成果格式：**
- 单 HTML 网页应用（一个文件即可运行）
- 多文件 HTML 应用（含 `index.html` 的完整前端项目）
- PPT 课件
- PDF 文档

本 MCP 就是连接「你的 AI 智能体 / 本地成果」与「平台」的桥梁：在 AI 编程智能体里几步操作，即可把上述任意形态的作品发布到 edu.tksai.com，完成托管、分发与交易变现，让教学作品持续创造价值。

典型链路：用任意 AI 智能体做出教学应用 / 课件 → 接入本 MCP → 上传并发布到 edu.tksai.com → 获得永久分享链接 + 持续收益。

## 快速开始

先在教学平台（https://edu.tksai.com）注册，通过「个人中心 → MCP 管理」创建密钥（明文仅展示一次）。然后按你的智能体能力选一种方式。

### 方式一：远程直连（推荐，无需任何本地安装）

适合支持远程 `streamableHttp` 的智能体（WorkBuddy 等）。**不需要本地服务、不需要 Node.js**，可直接调用业务工具。

> ⚠️ 直连方式**无法直接上传你本机文件**（上传工具运行在本地桥进程里）。若需上传本地文件，请用方式二 / 方式三的本地桥；或先把文件放到可访问地址后再用业务工具引用。

```json
{
  "mcpServers": {
    "tks-ai-edu-upload": {
      "type": "streamableHttp",
      "url": "https://edu.tksai.com/app-api/mcp",
      "headers": {
        "Authorization": "Bearer tksai_你的明文Key"
      }
    }
  }
}
```

> WorkBuddy 用户无需手填：直接在连接器市场安装「智教坊」连接器（OAuth 版免密钥 / API Key 版填 Key 即可）。

### 方式二：npm 包桥接（需本机已装 Node.js ≥ 18）

适合只支持本地 stdio 的智能体（CodeBuddy / Trae / Codex 等）。

```json
{
  "mcpServers": {
    "tks-ai-edu-upload": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@tks-ai/edu-upload-mcp"],
      "env": {
        "EDU_API_KEY": "tksai_你的明文Key"
      }
    }
  }
}
```

> ⚠️ MCP 配置的 `command` 必须是单个可执行文件名（如 `npx`），参数要拆到独立的 `args` 数组里；切勿写成 `"command": "npx -y @tks-ai/edu-upload-mcp"`（会被当成单个文件名导致 ENOENT）。

### 方式三：免安装二进制（无需 Node.js，推荐新手）

1. 下载对应平台的单文件程序（亦可到 [GitHub Releases](https://github.com/Tenoyi/tksai-edu-upload-mcp/releases) 自行选择）：

| 平台 | 架构 | 下载地址 |
|---|---|---|
| macOS | Apple Silicon (arm64) | https://github.com/Tenoyi/tksai-edu-upload-mcp/releases/download/2.0.3/tks-ai-edu-upload-mcp-macos-arm64 |
| macOS | Intel (x64) | https://github.com/Tenoyi/tksai-edu-upload-mcp/releases/download/2.0.3/tks-ai-edu-upload-mcp-macos-x64 |
| Windows | x64 | https://github.com/Tenoyi/tksai-edu-upload-mcp/releases/download/2.0.3/tks-ai-edu-upload-mcp-win-x64.exe |
| Linux | x64 | https://github.com/Tenoyi/tksai-edu-upload-mcp/releases/download/2.0.3/tks-ai-edu-upload-mcp-linux-x64 |

2. 在智能体的 MCP 配置中加入（`command` 改为下载文件的实际路径）：

```json
{
  "mcpServers": {
    "tks-ai-edu-upload": {
      "type": "stdio",
      "command": "/Users/你的用户名/Downloads/tks-ai-edu-upload-mcp-macos-arm64",
      "env": {
        "EDU_API_KEY": "tksai_你的明文Key"
      }
    }
  }
}
```

> 平台「一键接入向导」可自动识别系统给出下载按钮、并生成填好 Key 的配置，无需手动编辑。
> 注意：macOS / Linux 下载后需 `chmod +x <文件>` 赋予执行权限。
> 完整接入指南（各智能体配置位置、FAQ）见教学平台文档《MCP 接入指引》。

### 环境变量

| 环境变量 | 说明 |
|---|---|
| `EDU_API_KEY` | 在「个人中心 → MCP 管理」创建的明文密钥（**必填**，仅创建时展示一次） |
| `EDU_MCP_URL` | 可选，后端 MCP 端点，默认 `https://edu.tksai.com/app-api/mcp`（一般无需设置） |
| `EDU_API_BASE` | 可选，业务网关基础地址，默认由 `EDU_MCP_URL` 去掉 `/mcp` 推导（上传接口使用，一般无需设置） |
| `EDU_TENANT_ID` | 可选，租户 ID；默认不发送，由后端依据 API Key 推导。若上传返回 401 / 租户相关错误可显式设置 |

> **认证方式**：以 `Authorization: Bearer <EDU_API_KEY>` 请求头携带密钥（**不是** `X-Api-Key`），无需、也不能在配置里手写其他请求头。
> 一般**不要**设置 `tenant-id`；仅在遇到租户相关报错时通过 `EDU_TENANT_ID` 显式指定。

## 提供的工具

工具分两类：

- **本地上传工具（由本桥在本机实现）**：`upload_file` / `upload_folder` / `upload_cover`——直接读取用户本机文件并直传对象存储；
- **业务工具（由 Java 后端提供，本桥运行时动态拉取后转发）**：`create_work` / `update_work` / `get_work` / 订单 / 收益 / 提现 / 作品数据 / `get_dict_options` / `get_api_key_help` 等。

常用工具：

| 工具 | 来源 | 作用 |
|---|---|---|
| `upload_file` | 本地桥 | 上传本机单个文件或目录，返回可访问 URL（目录会递归上传并保留相对结构） |
| `upload_folder` | 本地桥 | 批量上传本机目录（如 HTML 静态站点），用 OSS 预签名直传保留相对路径，返回站点根地址 |
| `upload_cover` | 本地桥 | 上传本机封面图，返回封面 URL，用于 `create_work` 的 `picUrl` |
| `create_work` | 后端（桥转发） | 基于已上传的 URL 创建教学作品 |
| `update_work` | 后端（桥转发） | 更新已有教学作品 |
| `get_api_key_help` | 后端（桥转发） | 返回 MCP 配置示例与说明 |

典型流程：先 `upload_cover` 拿封面 URL、`upload_file` / `upload_folder` 拿内容 URL → 再 `create_work`（传 `picUrl` + `previewUrl` + `contentType` 等）发布。

## 本地开发

```bash
npm install
npm run dev        # tsx 直接运行桥接（需先 export EDU_API_KEY）
npm run build      # tsc 编译到 dist/
npm run build:bin  # Bun 打各平台免安装可执行文件到 release/
```

本仓库 `src/` 只有桥接逻辑（单文件），**工具实现、OAuth 2.1、鉴权都在 Java 后端 `yudao-module-mcp` 中**，改工具请改后端。

## 发布与维护

本项目的分发渠道有三处，互不自动同步，需分别发布、且版本号保持一致：

1. **Java 后端**：工具实现的源头，随主后端部署（`yudao-module-mcp`）；
2. **npmjs.com + GitHub Releases**：桥接包（供 stdio 智能体 / 下载版用户）；
3. **WorkBuddy 开放平台**：连接器市场从你上传的 zip 上架。

> 统一约定：三者使用**同一版本号**（如改动后 bump 到 `2.0.1`）。GitHub tag 沿用历史命名（不带 `v` 前缀）。

### 任务零：改动工具需先改 Java 后端

任何工具的新增 / 修改 / 删除，都要改 Java 后端 `yudao-module-mcp`（`EduMcpTools`）并重新部署后端。

由于桥接侧与连接器侧都是运行时动态拉取后端工具清单，**这类改动无需发 npm、无需重传连接器包**。仅当涉及鉴权端点、端点 URL 或文档时才需同步下面几步。

### 任务一：构建发布 npmjs.com

影响 `npx` 用户，是其它分发渠道的「源头版本号」。

```bash
npm whoami                                 # 确认已登录 npm，未登录先 npm login
npm version patch --no-git-tag-version     # 提升版本（patch/minor/major，按需）
npm publish                               # prepublishOnly 会自动 tsc 重建 dist/ 再上传
npm view @tks-ai/edu-upload-mcp version   # 复核已发布版本
```

- 发布内容仅含 `dist/index.js`、`package.json`、`README.md`（npm 自动携带）。
- `npx` 用户稍等 npm CDN 同步（几分钟）后即自动拿到新版本，无需手动升级。

**何时需要执行**：桥接逻辑（`src/index.ts`）或依赖变动时必须发。仅改后端工具、或改文档 → 无需发版。

### 任务二：打包二进制并发布 GitHub Releases

影响「方式三下载版」用户。二进制是独立打包的运行时，**不会**随 npm 自动更新。

```bash
npm run build:bin             # 打全部 4 平台到 release/；可加 -- --target macos-arm64 指定单个平台
```

产物（`release/` 目录，约 400MB，已被 .gitignore 忽略，勿提交仓库）：

| 平台 | 文件 |
|---|---|
| macOS arm64 | `tks-ai-edu-upload-mcp-macos-arm64` |
| macOS x64 | `tks-ai-edu-upload-mcp-macos-x64` |
| Windows x64 | `tks-ai-edu-upload-mcp-win-x64.exe` |
| Linux x64 | `tks-ai-edu-upload-mcp-linux-x64` |

构建需本机已安装 `bun`（devDependency，随 `npm install` 安装，`node build.mjs` 调用）。随后在 GitHub 建 Release 并上传这 4 个文件：

- **Web 方式**：打开 `https://github.com/Tenoyi/tksai-edu-upload-mcp/releases` → Draft a new release → Tag 填 `2.0.3`（与 npm 版本一致，不带 `v` 前缀）→ 把 `release/` 下 4 个文件作为 assets 上传 → Publish。
- **CLI 方式**（需先 `brew install gh` 并 `gh auth login`）：`gh release create 2.0.3 release/* --title "2.0.3"`。

> 前端向导按 `VITE_MCP_RELEASE_BASE_URL` + 该 tag 拼接下载地址，故 **tag 必须与版本号严格对应**。
> ⚠️ 发布后务必把上面「方式三」下载表格里的链接版本号（当前写死 `2.0.3`）改成新 tag，否则新用户会下载到旧版二进制。

**何时需要执行**：桥接逻辑变动时（同任务一）。纯后端工具改动或文档改动可跳过。

### 任务三：打包 zip 并发布 WorkBuddy 开放平台

影响连接器市场的上架内容。zip 是独立交付物，需手动上传审核。

用仓库自带脚本一次性产出**两个**连接器包（OAuth 版 + API Key 版，内部已处理 `._` 元数据清理）：

```bash
python3 workbuddy/pack.py
```

产物：

| 文件 | 说明 |
|---|---|
| `tksai-edu-upload-connector.zip` | OAuth 版（免密钥，走标准 OAuth 2.1） |
| `tksai-edu-upload-token-connector.zip` | API Key 版（填 Key） |

随后登录 WorkBuddy 开放平台后台 → 连接器市场 → 上传/更新对应连接器，审核通过后上架。

提交前自检：

- 包内结构与文件齐全、无 `._` 冗余条目；
- 两个 `mcp.json` 均指向 `https://edu.tksai.com/app-api/mcp`（**HTTPS、各仅一个 server**）；
- API Key 版的 `mcp.json` 用 `${EDU_API_KEY}` 占位符，不出现任何真实密钥；
- `token-schema.json` 含顶级 `title` / `description`（必填）；
- 两个 `connector-meta.json` 的 `version` 与本次 npm 版本一致。

> 打包前先把两个 `connector-meta.json` 的 `version` 改为本次版本号，使市场版本与 npm 对齐。

**何时需要执行**：连接器包内任一文件变化时需重传（`connector-meta.json` 版本变更、`mcp.json` 字段调整、`skills/.../SKILL.md` 更新、图标更换等）。仅改后端工具 → 无需重传。

### 推荐发布顺序（保证三端一致）

1. 改 Java 后端工具 → 部署后端（桥接与连接器自动同步，无需重发）；
2. 若涉及桥接逻辑：`npm version patch --no-git-tag-version` + `npm publish` → 得到版本号（如 `2.0.1`）；
3. `npm run build:bin` → GitHub 建 `2.0.1` Release，上传 4 个二进制；
4. 把两个 `connector-meta.json` 的 `version` 改为 `2.0.1` → `python3 workbuddy/pack.py` → 上传 WorkBuddy；
5. 更新 README「方式三」下载表格链接版本号为 `2.0.1`。

按此顺序，`npx` 用户、下载版用户、市场用户三者拿到的逻辑完全一致，且都以 Java 后端为准。
