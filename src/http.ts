import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { registerTools } from './tools.js'
import type { AuthCtx } from './eduClient.js'
import { oauthProtectedResource, wwwAuthenticateHeader } from './auth.js'

const SERVER_INFO = { name: 'tks-ai-edu-upload', version: '1.0.4' }
const PORT = Number(process.env.PORT || 3000)

// 有状态 session：sessionId -> transport
const transports = new Map<string, StreamableHTTPServerTransport>()

/** 设置 CORS（MCP Inspector / 浏览器跨域拉取元数据与连接 /mcp 需要） */
function setCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, MCP-Session-Id, Mcp-Session-Id, mcp-session-id, tenant-id, X-Requested-With',
  )
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, mcp-session-id')
}

/** 从请求提取调用方透传的鉴权（Bearer token + 可选 tenant-id） */
function parseAuth(req: IncomingMessage): AuthCtx {
  const h = (req.headers['authorization'] as string | undefined) || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : h || undefined
  const tenantId =
    (req.headers['tenant-id'] as string | undefined) ||
    (req.headers['x-tenant-id'] as string | undefined)
  return { token, tenantId }
}

/** 读取并解析 JSON 请求体（无 body 时返回 undefined） */
function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c as Buffer))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) return resolve(undefined)
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('invalid json body'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, obj: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(obj))
}

/**
 * 启动 streamableHttp 服务：
 * - GET  /.well-known/oauth-protected-resource  → 返回 AS 元数据
 * - GET  /healthz                                → 探活
 * - POST /mcp（无 session + 带 token + initialize）→ 建立 session 并连接
 * - POST /mcp（带 session）                        → 处理工具调用等
 * - GET  /mcp（带 session）                        → SSE 流
 * - DELETE /mcp（带 session）                      → 终止 session
 * - 无 token 访问 /mcp                            → 401 + WWW-Authenticate
 */
export function startHttpServer(): void {
  const server = createServer(async (req, res) => {
    setCors(res)

    // 预检
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end()
      return
    }

    try {
      const url = new URL(req.url || '/', 'http://localhost')
      const pathname = url.pathname

      if (req.method === 'GET' && pathname === '/.well-known/oauth-protected-resource') {
        return sendJson(res, 200, oauthProtectedResource())
      }
      if (req.method === 'GET' && pathname === '/healthz') {
        return res.writeHead(200).end('ok')
      }

      if (pathname === '/mcp') {
        const body = req.method === 'POST' ? ((await readBody(req)) as any) : undefined
        const sessionId = (req.headers['mcp-session-id'] ||
          req.headers['Mcp-Session-Id']) as string | undefined

        // 已有 session：直接复用 transport 处理
        if (sessionId && transports.has(sessionId)) {
          await transports.get(sessionId)!.handleRequest(req, res, body)
          return
        }

        // 首次 initialize 且携带 token → 建立 session
        if (req.method === 'POST' && body && body.method === 'initialize') {
          if (!req.headers['authorization']) {
            res.writeHead(401, {
              'WWW-Authenticate': wwwAuthenticateHeader(),
              'Content-Type': 'application/json',
            })
            return res.end(JSON.stringify({ error: 'unauthorized', error_description: 'Missing bearer token' }))
          }
          const t = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sid) => {
              transports.set(sid, t)
            },
          })
          const mcp = new McpServer(SERVER_INFO)
          registerTools(mcp, parseAuth(req))
          await mcp.connect(t)
          await t.handleRequest(req, res, body)
          return
        }

        // 其它情况：无 session 的 GET/DELETE，或非 initialize 的 POST
        return sendJson(res, 400, {
          jsonrpc: '2.0',
          error: { code: -32600, message: 'Bad Request: 缺少有效的 Mcp-Session-Id 或未携带鉴权' },
          id: null,
        })
      }

      return sendJson(res, 404, { error: 'not_found' })
    } catch (e: any) {
      if (!res.headersSent) {
        sendJson(res, 500, { error: e?.message || 'internal_error' })
      }
    }
  })

  server.listen(PORT, () => {
    console.error(`[mcp] streamableHttp 已启动: http://localhost:${PORT}/mcp`)
    console.error(`[mcp] 元数据: http://localhost:${PORT}/.well-known/oauth-protected-resource`)
  })
}
