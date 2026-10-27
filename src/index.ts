#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { uploadFile, uploadFolder, createWork, updateWork } from './eduClient.js'

const server = new McpServer({ name: 'tks-ai-edu-upload', version: '1.0.3' })

server.registerTool(
  'upload_file',
  {
    title: '上传单个文件',
    description: '将本地单个文件上传到教学平台对象存储，返回可访问 URL。directory 可选，用于归类。',
    inputSchema: {
      localPath: z.string().describe('本地文件绝对路径'),
      directory: z.string().optional().describe('可选，存储目录 / 归类'),
    },
  },
  async ({ localPath, directory }) => {
    const { url } = await uploadFile(localPath, directory)
    return { content: [{ type: 'text', text: JSON.stringify({ url }, null, 2) }] }
  }
)

server.registerTool(
  'upload_folder',
  {
    title: '上传文件夹（教学应用）',
    description:
      '将本地文件夹（必须含 index.html）打包为 zip 并上传，返回首页 URL(indexUrl) 与根 URL(rootUrl)。directory 可选。',
    inputSchema: {
      localDir: z.string().describe('本地文件夹绝对路径，需包含 index.html'),
      directory: z.string().optional().describe('可选，存储目录 / 归类'),
    },
  },
  async ({ localDir, directory }) => {
    const r = await uploadFolder(localDir, directory)
    return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] }
  }
)

server.registerTool(
  'create_work',
  {
    title: '创建教学作品',
    description: '基于已上传的内容 URL 创建教学作品(SPU)。name 与 contentUrl 必填，其余可选。',
    inputSchema: {
      name: z.string().describe('作品名称'),
      contentUrl: z.string().describe('内容 URL（由 upload_file / upload_folder 得到）'),
      coverUrl: z.string().optional().describe('封面 URL'),
      description: z.string().optional().describe('简介'),
      tags: z.array(z.string()).optional().describe('标签列表'),
      price: z.number().optional().describe('价格，单位：分'),
      productType: z.number().optional().describe('商品类型'),
      title: z.string().optional().describe('标题'),
    },
  },
  async (args) => {
    const r = await createWork(args)
    return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] }
  }
)

server.registerTool(
  'update_work',
  {
    title: '更新教学作品',
    description: '更新已有教学作品(SPU)。spuId 必填，其余字段可选（仅传需要更新的字段）。',
    inputSchema: {
      spuId: z.number().describe('作品编号'),
      contentUrl: z.string().optional().describe('新的内容 URL'),
      coverUrl: z.string().optional().describe('新的封面 URL'),
      name: z.string().optional().describe('新的名称'),
      description: z.string().optional().describe('新的简介'),
      tags: z.array(z.string()).optional().describe('新的标签列表'),
      price: z.number().optional().describe('新的价格，单位：分'),
    },
  },
  async (args) => {
    const r = await updateWork(args)
    return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] }
  }
)

server.registerTool(
  'get_api_key_help',
  {
    title: '获取 MCP 配置示例',
    description:
      '返回在 AI 编程智能体（CodeBuddy / Trae / WorkBuddy / Codex）中配置本 MCP Server 的 JSON 示例与说明。',
    inputSchema: {},
  },
  async () => {
    // 最新命令模式：npx（无需本地下载，自动从 npm 拉取 @tks-ai/edu-upload-mcp）
    const example = {
      mcpServers: {
        'tks-ai-edu-upload': {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@tks-ai/edu-upload-mcp'],
          env: {
            EDU_API_BASE: 'https://edu.tksai.com/app-api',
            EDU_API_KEY: 'tksai_xxxx（在「个人中心 → API Key 管理」创建）',
          },
        },
      },
    }
    const text =
      JSON.stringify(example, null, 2) +
      '\n\n说明：\n' +
      '1. 推荐使用 npx 模式（如上）：无需安装 Node 之外的任何东西，首次运行自动从 npm 拉取 @tks-ai/edu-upload-mcp。注意 command 必须是可执行文件、args 单独成数组，禁止把 "npx -y ..." 写进同一个 command 字符串（否则会报 ENOENT）。\n' +
      '2. 免安装版（无 Node 环境）：改 command 为下载的二进制实际路径，例如 macOS arm64 为 /Users/你的用户名/Downloads/tks-ai-edu-upload-mcp-macos-arm64，Windows 为 C:\\Users\\你的用户名\\Downloads\\tks-ai-edu-upload-mcp-win-x64.exe。\n' +
      '3. EDU_API_BASE 为后端 /app-api 地址；EDU_API_KEY 为在个人中心创建的 API Key。\n' +
      '4. 不要填写 tenant-id，后端会根据 API Key 自动推导租户。\n' +
      '5. 工具：upload_file / upload_folder / create_work / update_work。\n' +
      '6. WorkBuddy 接入：env 必须用 ${VAR} 占位符（EDU_API_BASE / EDU_API_KEY），真实值在 WorkBuddy 密钥管理中填，禁止写进配置。\n' +
      '7. 鉴权方式：Server 自动以 Authorization: Bearer <EDU_API_KEY> 调用后端，不要在配置里写 X-Api-Key 请求头（后端不认，会 401）。'
    return { content: [{ type: 'text', text }] }
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
