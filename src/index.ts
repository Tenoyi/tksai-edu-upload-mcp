#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerTools } from './tools.js'
import { startHttpServer } from './http.js'
import type { AuthCtx } from './eduClient.js'

const SERVER_INFO = { name: 'tks-ai-edu-upload', version: '1.0.4' }

// 传输模式：默认 stdio（本地/其它平台）；MCP_TRANSPORT=http 启动 streamableHttp 远程服务
const mode = (process.env.MCP_TRANSPORT || process.env.TRANSPORT || 'stdio').toLowerCase()

if (mode === 'http' || mode === 'streamablehttp' || mode === 'streamable') {
  startHttpServer()
} else {
  const server = new McpServer(SERVER_INFO)
  // stdio 模式：token / tenant-id 来自环境变量（用户在「个人中心 → API Key 管理」创建）
  const envAuth: AuthCtx = {
    token: process.env.EDU_API_KEY,
    tenantId: process.env.EDU_TENANT_ID,
  }
  registerTools(server, envAuth)
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
