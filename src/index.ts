#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { uploadFile, uploadFolder, createWork, updateWork } from './eduClient.js'

const server = new McpServer({ name: 'tks-ai-edu-upload', version: '1.0.0' })

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
    // 免安装版为主线（无需 Node.js）：command 指向下载的二进制文件
    const example = {
      mcpServers: {
        'tks-ai-edu-upload': {
          type: 'stdio',
          command: '/Users/你的用户名/Downloads/tks-ai-edu-upload-mcp-macos-arm64',
          env: {
            EDU_API_BASE: 'https://你的域名/app-api',
            EDU_API_KEY: 'tksai_xxxx（在「个人中心 → API Key 管理」创建）',
          },
        },
      },
    }
    const text =
      JSON.stringify(example, null, 2) +
      '\n\n说明：\n' +
      '1. 本程序为免安装版：command 请改为下载后文件的实际路径（Windows 例：C:\\\\Users\\\\你的用户名\\\\Downloads\\\\tks-ai-edu-upload-mcp-win-x64.exe）。\n' +
      '2. EDU_API_BASE 为后端 /app-api 地址；EDU_API_KEY 为在个人中心创建的 API Key。\n' +
      '3. 不要填写 tenant-id，后端会根据 API Key 自动推导租户。\n' +
      '4. 工具：upload_file / upload_folder / create_work / update_work。\n' +
      '5. WorkBuddy 接入：env 必须用 ${VAR} 占位符（EDU_API_BASE / EDU_API_KEY），真实值在 WorkBuddy 密钥管理中填，禁止写进配置。'
    return { content: [{ type: 'text', text }] }
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
