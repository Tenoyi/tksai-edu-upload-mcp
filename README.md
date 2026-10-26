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

### 方式二：npm 包安装（需本机已装 Node.js ≥ 18，适合开发者）

1. 全局安装（只需执行一次）：

```bash
npm install -g tks-ai-edu-upload-mcp
```

2. 已在教学平台（https://edu.tksai.com）注册，通过「个人中心 → MCP 管理」创建密钥；
3. 在智能体的 MCP 配置中加入（`command` 使用 `npx tks-ai-edu-upload-mcp`，无需关心文件保存位置）：

```json
{
  "mcpServers": {
    "tks-ai-edu-upload": {
      "type": "stdio",
      "command": "npx tks-ai-edu-upload-mcp",
      "env": {
        "EDU_API_BASE": "https://edu.tksai.com/app-api",
        "EDU_API_KEY": "tksai_你的明文Key"
      }
    }
  }
}
```

> 安装完成后命令即为 `npx tks-ai-edu-upload-mcp`，各智能体的接入向导会自动用它生成配置。

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
