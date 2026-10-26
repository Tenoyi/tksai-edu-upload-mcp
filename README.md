# @tks-ai/edu-upload-mcp

教学应用上传 MCP Server：让 AI 编程智能体（CodeBuddy / Trae / WorkBuddy / Codex / Cursor 等）直接上传本地文件/文件夹，并在教学平台创建教学作品。

## 平台介绍：AI 教学应用托管交易平台

[AI 教学应用托管交易平台](https://edu.tksai.com)（edu.tksai.com）是一个面向 AI 教学应用的**托管与交易变现**平台。无论你在哪个 AI 编程智能体上开发出了网页课件、互动习题、教学小游戏或 AI 辅导应用，都可以借助本 MCP Server，把本地成果**一键发布**到平台，快速完成托管上架、获得曝光，并支持定价交易实现变现。

本 MCP 帮你解决三件事：
- **免搬运**：在智能体里直接把本地文件夹（含 `index.html` 的网页应用）或单个素材上传到平台对象存储，拿到可访问地址；
- **免手工上架**：基于上传地址一键创建教学作品（SPU），填写名称 / 封面 / 价格即可上架；
- **零依赖跨平台**：提供单文件免安装程序（无需 Node.js），也支持 `npx` 方式，覆盖 macOS / Windows / Linux。

典型链路：用任意 AI 智能体做出可运行的网页教学应用 → 接入本 MCP → 几步发布到 edu.tksai.com → 平台托管、分发、交易变现。

## 快速开始（免安装版，无需 Node.js）

1. 到 GitHub Releases 下载对应平台的单文件程序（macOS arm64/x64、Windows、Linux）；
2. 已在教学平台「个人中心 → API Key 管理」创建 API Key；
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
> 完整接入指南（各智能体配置位置、FAQ）见教学平台文档《MCP 接入指引》。

| 环境变量 | 说明 |
|---|---|
| `EDU_API_BASE` | 后端 `https://edu.tksai.com/app-api` 地址（必填） |
| `EDU_API_KEY` | 登录平台`https://edu.tksai.com`后，在个人中心创建的 MCP 明文密钥（必填，仅创建时展示一次） |
| `EDU_TERMINAL` | 可选，终端类型，默认 `20`（H5） |

## 提供的工具

| 工具 | 作用 |
|---|---|
| `upload_file` | 上传单个文件，返回可访问 URL |
| `upload_folder` | 把本地文件夹（含 `index.html`）打包为 zip 上传，返回首页 URL |
| `create_work` | 基于已上传的 URL 创建教学作品 |
| `update_work` | 更新已有教学作品 |
| `get_api_key_help` | 返回 MCP 配置示例与说明 |

## 本地开发

```bash
npm install
npm run dev        # tsx 直接运行源码
npm run build      # tsc 编译到 dist/
npm run build:bin  # Bun 打各平台免安装可执行文件到 release/
```
