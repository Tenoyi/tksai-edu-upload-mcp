# @tks-ai/edu-upload-mcp

教学应用上传 MCP Server：让 AI 编程智能体（CodeBuddy / Trae / WorkBuddy / Codex / Cursor 等）直接上传本地文件/文件夹，并在教学平台创建教学作品。

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

本 MCP Server 就是连接「你的 AI 智能体 / 本地成果」与「平台」的桥梁：在 AI 编程智能体里几步操作，即可把上述任意形态的作品发布到 edu.tksai.com，完成托管、分发与交易变现，让教学作品持续创造价值。

典型链路：用任意 AI 智能体做出教学应用 / 课件 → 接入本 MCP → 上传并发布到 edu.tksai.com → 获得永久分享链接 + 持续收益。

## 快速开始

本 MCP 提供两种接入方式，功能完全一致，按你的习惯选择即可。

### 方式一：免安装版（下载程序文件，无需 Node.js，推荐新手）

1. 下载对应平台的单文件程序（亦可到 [GitHub Releases](https://github.com/Tenoyi/tksai-edu-upload-mcp/releases) 自行选择）：

| 平台 | 架构 | 下载地址 |
|---|---|---|
| macOS | Apple Silicon (arm64) | https://github.com/Tenoyi/tksai-edu-upload-mcp/releases/download/1.0.0/tks-ai-edu-upload-mcp-macos-arm64 |
| macOS | Intel (x64) | https://github.com/Tenoyi/tksai-edu-upload-mcp/releases/download/1.0.0/tks-ai-edu-upload-mcp-macos-x64 |
| Windows | x64 | https://github.com/Tenoyi/tksai-edu-upload-mcp/releases/download/1.0.0/tks-ai-edu-upload-mcp-win-x64.exe |
| Linux | x64 | https://github.com/Tenoyi/tksai-edu-upload-mcp/releases/download/1.0.0/tks-ai-edu-upload-mcp-linux-x64 |

2. 已在教学平台（https://edu.tksai.com）注册，通过「个人中心 → MCP 管理」创建密钥；
3. 在智能体的 MCP 配置中加入（`command` 改为下载文件的实际路径）：

```json
{
  "mcpServers": {
    "tks-ai-edu-upload": {
      "type": "stdio",
      "command": "/Users/你的用户名/Downloads/tks-ai-edu-upload-mcp-macos-arm64",
      "env": {
        "EDU_API_BASE": "https://edu.tksai.com/app-api",
        "EDU_API_KEY": "tksai_你的明文Key"
      }
    }
  }
}
```

> 平台「一键接入向导」可自动识别系统给出下载按钮、并生成填好 Key 的配置，无需手动编辑。
> 注意：macOS / Linux 下载后需 `chmod +x <文件>` 赋予执行权限。
> 完整接入指南（各智能体配置位置、FAQ）见教学平台文档《MCP 接入指引》。

### 方式二：npm 包安装（需本机已装 Node.js ≥ 18，适合开发者，最新命令模式）

1. 全局安装（只需执行一次）：

```bash
npm install -g @tks-ai/edu-upload-mcp
```

2. 已在教学平台（https://edu.tksai.com）注册，通过「个人中心 → MCP 管理」创建密钥；
3. 在智能体的 MCP 配置中加入（`command` 用 `npx`，`args` 为 `["-y","@tks-ai/edu-upload-mcp"]`，无需关心文件保存位置）：

```json
{
  "mcpServers": {
    "tks-ai-edu-upload": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@tks-ai/edu-upload-mcp"],
      "env": {
        "EDU_API_BASE": "https://edu.tksai.com/app-api",
        "EDU_API_KEY": "tksai_你的明文Key"
      }
    }
  }
}
```

> 安装完成后的运行命令为 `npx -y @tks-ai/edu-upload-mcp`，各智能体的接入向导会自动用它生成配置。
> ⚠️ 注意：MCP 配置的 `command` 必须是单个可执行文件名（如 `npx`），参数要拆到独立的 `args` 数组里；切勿写成 `"command": "npx -y @tks-ai/edu-upload-mcp"`（会被当成单个文件名导致 ENOENT）。

| 环境变量 | 说明 |
|---|---|
| `EDU_API_BASE` | 后端 `https://edu.tksai.com/app-api` 地址（必填） |
| `EDU_API_KEY` | 登录平台`https://edu.tksai.com`后，在个人中心创建的 MCP 明文密钥（必填，仅创建时展示一次） |
| `EDU_TERMINAL` | 可选，终端类型，默认 `20`（H5） |

> **认证方式**：本 MCP Server 调用后端接口时，会以 `Authorization: Bearer <EDU_API_KEY>` 请求头携带密钥（**不是** `X-Api-Key`），无需、也不能在配置里手写任何请求头。只要 `EDU_API_KEY` 填对，鉴权即生效。

## 提供的工具

| 工具 | 作用 |
|---|---|
| `upload_file` | 上传单个文件，返回可访问 URL |
| `upload_folder` | 把本地文件夹（含 `index.html`）打包为 zip 上传，返回首页 URL |
| `create_work` | 基于已上传的 URL 创建教学作品 |
| `update_work` | 更新已有教学作品 |
| `get_api_key_help` | 返回 MCP 配置示例与说明 |

## 方式三：远程 streamableHttp（支持 MCP 远程连接的平台）

适合 MCP Inspector、WorkBuddy 等支持 `streamableHttp` 传输与 MCP OAuth 2.1 的客户端。MCP Server 以 HTTP 服务形式常驻，客户端通过 `Authorization: Bearer <OAuth token 或 tksai_ API Key>` 连接 `/mcp`，无需本地安装。

启动（需先 `npm run build` 编译到 dist/）：

```bash
MCP_TRANSPORT=http PORT=3000 node dist/index.js
```

客户端连接 `http://<host>:3000/mcp`：
- 无 `Authorization` 时返回 `401` + `WWW-Authenticate: Bearer resource_metadata="<MCP_BASE_URL>/.well-known/oauth-protected-resource"`，引导走 OAuth 授权；
- OAuth 通道：客户端拉取 `/.well-known/oauth-protected-resource`（返回 `authorization_servers` 指向后端 AS）→ 走标准 `/oauth/authorize` + PKCE → 拿到 token 后携带调用 `/mcp`；
- API Key 通道（CodeBuddy / Trae / Codex 等）：直接带 `Authorization: Bearer tksai_xxxx`（在「个人中心 → API Key 管理」创建）。

| 环境变量 | 说明 |
|---|---|
| `MCP_TRANSPORT` | 设为 `http` 启用 streamableHttp（默认 `stdio`） |
| `PORT` | HTTP 监听端口，默认 `3000` |
| `MCP_BASE_URL` | 本 MCP 服务对外域名，用于元数据 `resource` 与 `WWW-Authenticate`，默认 `https://mcp.tksai.com` |
| `MCP_AUTH_SERVER` | 后端授权服务器地址（出现在 `authorization_servers`），默认 `https://api.tksai.com` |
| `EDU_API_BASE` / `EDU_API_KEY` / `EDU_TERMINAL` | 同方式一/二（stdio 回退用；http 模式通常由调用方透传，可不设） |

> 两种传输共用同一套工具实现；差异仅在后端如何把凭据解析为登录用户（OAuth token 或 tksai_ API Key），MCP Server 侧无差别、不保存任何用户凭据。

## 本地开发

```bash
npm install
npm run dev        # tsx 直接运行源码
npm run build      # tsc 编译到 dist/
npm run build:bin  # Bun 打各平台免安装可执行文件到 release/

## 发布与维护

本项目的分发渠道有三处，互不自动同步，需分别发布、且版本号保持一致：

1. **npmjs.com**：`npx -y @tks-ai/edu-upload-mcp` 走的是它；
2. **GitHub Releases**：「方式一下载版」向导从这里拉取免安装二进制；
3. **WorkBuddy 开放平台**：连接器市场从你上传的 zip 上架。

> 统一约定：三者使用**同一版本号**（如代码改动后 bump 到 `1.0.3`）。GitHub tag 沿用历史命名（现有为 `1.0.0`，即不带 `v` 前缀，故新 tag 为 `1.0.3`），便于排障与用户核对。

### 任务一：构建发布 npmjs.com

影响 `npx` 用户，是其它分发渠道的「源头版本号」。

```bash
npm whoami                                 # 确认已登录 npm，未登录先 npm login
npm version patch --no-git-tag-version     # 提升版本（patch/minor/major，按需；去掉该参数可同时打 git tag）
npm publish                               # prepublishOnly 会自动 tsc 重建 dist/ 再上传
npm view @tks-ai/edu-upload-mcp version   # 复核已发布版本
```

- 发布内容仅含 `dist/`、`package.json`、`README.md`（npm 自动携带），`skills/` 等不进 npm 包。
- `npx` 用户稍等 npm CDN 同步（几分钟）后即自动拿到新版本，无需手动升级。

**何时需要执行**：任何会编译进 `dist/` 的源码改动（`src/eduClient.ts`、`src/index.ts`、依赖升级等）都必须 bump 版本并发布。仅改 `README.md` 等不在包内文档、且不影响运行时时可不发；但改了 `get_api_key_help` 文案（位于 `src/index.ts`）则需要发。

### 任务二：打包二进制并发布 GitHub Releases

影响「方式一下载版」用户。二进制是独立打包的运行时，**不会**随 npm 自动更新。

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

- **Web 方式**：打开 `https://github.com/Tenoyi/tksai-edu-upload-mcp/releases` → Draft a new release → Tag 填 `1.0.3`（与 npm 版本一致，沿用不带 `v` 前缀的约定）→ 把 `release/` 下 4 个文件作为 assets 上传 → Publish。
- **CLI 方式**（需先 `brew install gh` 并 `gh auth login`）：`gh release create 1.0.3 release/* --title "1.0.3"`。

> 前端向导按 `VITE_MCP_RELEASE_BASE_URL` + 该 tag 拼接下载地址，故 **tag 必须与版本号严格对应**（若前端约定带 `v`，则此处也用 `v1.0.3`，两边保持一致）。
> ⚠️ 发布后务必把上面「方式一」下载表格里的链接版本号（当前写死 `1.0.0`）改成新 tag（如 `1.0.3`），否则新用户会下载到旧版二进制。

**何时需要执行**：任何会编译进二进制的源码改动（基本等于「要发 npm 时」）。不重建会导致下载版用户仍跑旧逻辑（例如旧版 `X-Api-Key` 头会 401）。纯文档改动（README / SKILL / 连接器元数据）不影响二进制，可跳过；但建议二进制版本号与 npm 对齐。

### 任务三：打包 zip 并发布 WorkBuddy 开放平台

影响连接器市场的上架内容。zip 是独立交付物，需手动上传审核。

先用 **Python** 打包（避免 macOS `ditto`/`zip` 塞入 `._` 元数据污染）：

```bash
python3 - <<'PY'
import zipfile, os
files = [
    ('connector-meta.json', 'connector-meta.json'),
    ('mcp.json', 'mcp.json'),
    ('token-schema.json', 'token-schema.json'),
    ('icon.svg', 'icon.svg'),
    ('README.md', 'README.md'),
    ('skills/tks-ai-edu-upload/SKILL.md', 'skills/tks-ai-edu-upload/SKILL.md'),
]
out = 'tksai-edu-upload-connector.zip'
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for src, arc in files:
        assert os.path.exists(src), src
        z.write(src, arc)
print('written', out, os.path.getsize(out), 'bytes')
PY
```

随后登录 WorkBuddy 开放平台后台 → 连接器市场 → 上传/更新该连接器（提交生成的 `tksai-edu-upload-connector.zip`），审核通过后上架。

提交前自检：
- 包内 6 个文件、结构正确、无 `._` 冗余条目；
- `token-schema.json` 含顶级 `title` / `description`（必填）；
- `mcp.json` 指向正确 npm 包 `@tks-ai/edu-upload-mcp` 且 `env` 用 `${EDU_API_BASE}` / `${EDU_API_KEY}` 占位符；
- `connector-meta.json` 的 `version` 与本次 npm 版本一致、`auth_mode` 为 `token`。

> 打包前先把 `connector-meta.json` 的 `version` 改为本次版本号（如 `1.0.3`），使市场版本与 npm 对齐。

**何时需要执行**：连接器包内任一文件变化时需重传——`connector-meta.json` 版本变更、`mcp.json` / `token-schema.json` 字段调整、`skills/.../SKILL.md` 或 zip 内 `README.md` 内容更新、或底层 npm 包升级（`mcp.json` 引用的包建议同步对齐版本）。

### 推荐发布顺序（保证三端一致）

1. 完成源码改动；
2. `npm version patch --no-git-tag-version` + `npm publish` → 得到版本号（如 `1.0.3`）；
3. `npm run build:bin` → GitHub 建 `1.0.3` Release，上传 4 个二进制；
4. 把 `connector-meta.json` 的 `version` 改为 `1.0.3` → 重新打包 zip → 上传 WorkBuddy；
5. 更新 README「方式一」下载表格链接版本号为 `1.0.3`。

按此顺序，`npx` 用户、下载版用户、市场用户三者拿到的逻辑完全一致。
```
