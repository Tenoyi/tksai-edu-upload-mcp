#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { apiBase, getAccessToken, getAuthHeaders } from './oauth.js'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// apiBase() / getAuthHeaders() / getAccessToken() 见 ./oauth.ts（OAuth 2.1 PKCE 或 EDU_API_KEY 兜底）

function randomDir(): string {
  const rand = randomUUID().replace(/-/g, '').slice(0, 10)
  return rand
}

// WebPage/PLAT/yyyy/MM/dd/rand
function buildContentDirectory(): string {
  const now = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `WebPage/PLAT/${now.getFullYear()}/${p(now.getMonth() + 1)}/${p(now.getDate())}/${randomDir()}`
}

// cover/yyyy/MM/dd/rand
function buildCoverDirectory(): string {
  const now = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `cover/${now.getFullYear()}/${p(now.getMonth() + 1)}/${p(now.getDate())}/${randomDir()}`
}

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.zip': 'application/zip',
}

function mimeOf(p: string): string {
  return MIME[path.extname(p).toLowerCase()] || 'application/octet-stream'
}

function buildMultipart(fields: Record<string, string>, fileBuffer: Buffer, fileName: string): { body: Buffer; contentType: string } {
  const boundary = `----TKSFormBoundary${randomUUID().replace(/-/g, '')}`
  const chunks: Buffer[] = []
  for (const [k, v] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`))
  }
  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mimeOf(fileName)}\r\n\r\n`
    )
  )
  chunks.push(fileBuffer)
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`))
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` }
}

// 递归遍历目录，返回 { abs, rel } 列表；跳过隐藏文件、node_modules、.git
function walkDir(dir: string, base: string = dir, skip = new Set(['node_modules', '.git'])): { abs: string; rel: string }[] {
  const out: { abs: string; rel: string }[] = []
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.') || skip.has(ent.name)) continue
    const abs = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      out.push(...walkDir(abs, base, skip))
    } else if (ent.isFile()) {
      out.push({ abs, rel: path.relative(base, abs).split(path.sep).join('/') })
    }
  }
  return out
}

interface UploadResult {
  code: number
  msg?: string
  data?: string
  [k: string]: unknown
}

async function multipartUpload(absPath: string, directory?: string): Promise<string> {
  const buf = fs.readFileSync(absPath)
  const fileName = path.basename(absPath)
  const fields: Record<string, string> = {}
  if (directory) fields.directory = directory
  const { body, contentType } = buildMultipart(fields, buf, fileName)
  const res = await fetch(`${apiBase()}/infra/file/upload`, {
    method: 'POST',
    headers: { ...(await getAuthHeaders()), 'Content-Type': contentType },
    body: new Uint8Array(body),
  })
  const json = (await res.json()) as UploadResult
  if (json.code !== 0) {
    throw new Error(`上传失败: ${json.msg || res.status}`)
  }
  return json.data as string
}

async function presignedFolderUpload(entries: { abs: string; rel: string }[], folderKey: string): Promise<{ path: string; url: string }[]> {
  const results: { path: string; url: string }[] = []
  // 并发控制（与前端一致，CONCURRENCY = 5）
  const CONCURRENCY = 5
  let cursor = 0
  const worker = async () => {
    while (cursor < entries.length) {
      const i = cursor++
      const { abs, rel } = entries[i]
      const qs = new URLSearchParams({ name: rel, directory: folderKey })
      const pres = await fetch(`${apiBase()}/infra/file/presigned-url-folder?${qs}`, { headers: await getAuthHeaders() })
      const pj = (await pres.json()) as UploadResult & { data?: { uploadUrl: string; url: string; path: string } }
      if (pj.code !== 0 || !pj.data?.uploadUrl) {
        throw new Error(`获取预签名失败: ${pj.msg || pres.status}`)
      }
      const buf = fs.readFileSync(abs)
      const isHtml = /\.html?$/i.test(rel)
      const headers: Record<string, string> = { 'Content-Type': isHtml ? 'text/html' : mimeOf(abs) }
      if (isHtml) headers['Content-Disposition'] = 'inline'
      const putRes = await fetch(pj.data.uploadUrl, { method: 'PUT', headers, body: new Uint8Array(buf) })
      if (!putRes.ok) {
        throw new Error(`直传失败: ${putRes.status}`)
      }
      results.push({ path: rel, url: pj.data.url })
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return results
}

// 计算静态站点根地址：优先 index.html，否则取首文件 URL 去掉文件名
function computeRootUrl(items: { path: string; url: string }[]): { rootUrl: string; indexUrl?: string } {
  const indexEntry = items.find((r) => /(^|\/)index\.html?$/i.test(r.path))
  const first = items[0]
  if (!first) return { rootUrl: '' }
  const rootUrl = (indexEntry ? indexEntry.url : first.url).replace(/\/[^/]*$/, '/')
  return { rootUrl, indexUrl: indexEntry?.url }
}

// ============ 本地工具实现 ============

async function handleUploadFile(args: { path: string; directory?: string }) {
  const target = args.path
  if (!fs.existsSync(target)) {
    throw new Error(`文件或目录不存在: ${target}`)
  }
  const baseDir = args.directory || buildContentDirectory()
  if (fs.statSync(target).isFile()) {
    const url = await multipartUpload(target, baseDir)
    return { url }
  }
  // 目录：递归上传每个文件，保留相对目录结构
  const files = walkDir(target)
  const urls: string[] = []
  let indexUrl: string | undefined
  let rootUrl = ''
  for (const f of files) {
    const dirPrefix = path.dirname(f.rel) === '.' ? baseDir : `${baseDir}/${path.dirname(f.rel)}`
    const url = await multipartUpload(f.abs, dirPrefix)
    urls.push(url)
    if (/(^|\/)index\.html?$/i.test(f.rel)) indexUrl = url
  }
  if (indexUrl) rootUrl = indexUrl.replace(/\/[^/]*$/, '/')
  else if (urls[0]) rootUrl = urls[0].replace(/\/[^/]*$/, '/')
  return { urls, indexUrl, rootUrl }
}

async function handleUploadFolder(args: { path: string; directory?: string }) {
  const target = args.path
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    throw new Error(`目录不存在或不是目录: ${target}`)
  }
  let folderKey: string
  if (args.directory) {
    folderKey = args.directory.endsWith('/') ? args.directory : `${args.directory}/${Date.now().toString(36)}${randomDir()}`
  } else {
    folderKey = `${buildContentDirectory()}/${Date.now().toString(36)}${randomDir()}`
  }
  const entries = walkDir(target)
  const items = await presignedFolderUpload(entries, folderKey)
  const { rootUrl, indexUrl } = computeRootUrl(items)
  return { rootUrl, indexUrl, data: indexUrl || rootUrl, files: items.map((i) => i.url) }
}

async function handleUploadCover(args: { path: string }) {
  const target = args.path
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    throw new Error(`封面文件不存在: ${target}`)
  }
  const url = await multipartUpload(target, buildCoverDirectory())
  return { url }
}

const LOCAL_TOOLS: Record<string, { schema: { title: string; description: string; inputSchema: z.ZodTypeAny }; run: (args: any) => Promise<unknown> }> = {
  upload_file: {
    schema: {
      title: 'upload_file',
      description:
        '上传本地文件（或整个目录）到教学应用平台对象存储，返回可访问的文件直链。单文件返回 { url }；目录递归上传每个文件并保留相对目录结构，返回 { urls, indexUrl?, rootUrl? }。由 MCP 桥直接读取客户端本机文件，免去用户手动上传。',
      inputSchema: z.object({
        path: z.string().describe('本地文件或目录的绝对路径。'),
        directory: z.string().optional().describe('可选。OSS 目录前缀，默认 WebPage/PLAT/yyyy/MM/dd/随机。'),
      }),
    },
    run: handleUploadFile,
  },
  upload_folder: {
    schema: {
      title: 'upload_folder',
      description:
        '批量上传整个本地目录（HTML 静态站点、PPT 导出目录等）到对象存储，使用 OSS 预签名直传，完整保留目录内相对路径与文件名，返回站点根地址（index.html）与文件清单。适合需要相对引用的静态站点。',
      inputSchema: z.object({
        path: z.string().describe('本地目录的绝对路径。'),
        directory: z.string().optional().describe('可选。OSS 目录前缀，默认 WebPage/PLAT/yyyy/MM/dd/随机。'),
      }),
    },
    run: handleUploadFolder,
  },
  upload_cover: {
    schema: {
      title: 'upload_cover',
      description: '上传作品封面图（本地图片文件）到对象存储，返回封面 URL，用于 create_work / update_work 的 picUrl。',
      inputSchema: z.object({
        path: z.string().describe('本地封面图片的绝对路径。'),
      }),
    },
    run: handleUploadCover,
  },
}

// ============ 上游代理（create_work / update_work / get_api_key_help 等） ============

const UPSTREAM_URL = (process.env.EDU_MCP_URL || 'https://edu.tksai.com/app-api/mcp').replace(/\/$/, '')

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// 通过 Streamable HTTP 连接到上游 MCP 服务，复用其已实现的 create_work / update_work / get_api_key_help 等工具
let upstreamClient: Client | null = null

async function getUpstream(): Promise<Client> {
  if (upstreamClient) return upstreamClient
  const transport = new StreamableHTTPClientTransport(new URL(UPSTREAM_URL), {
    requestInit: { headers: { Authorization: `Bearer ${await getAccessToken()}` } },
  })
  const client = new Client({ name: 'tks-edu-upload-bridge', version: '2.0.3' }, { capabilities: {} })
  await client.connect(transport)
  upstreamClient = client
  return client
}

async function callUpstream(method: string, params: any): Promise<any> {
  const client = await getUpstream()
  const run = async () => {
    if (method === 'tools/list') {
      const res: any = await client.listTools()
      return { result: { tools: res.tools ?? [] } }
    }
    if (method === 'tools/call') {
      const res: any = await client.callTool({ name: params.name, arguments: params.arguments ?? {} })
      return { result: res }
    }
    throw new Error(`不支持的上游方法：${method}`)
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await run()
    } catch (err: any) {
      if (attempt === 3) throw err
      upstreamClient = null
      await sleep(300 * attempt)
    }
  }
  throw new Error('unreachable')
}

// ============ 注册工具 ============

const server = new McpServer({ name: 'tks-edu-upload', version: '2.0.6' }, { capabilities: { tools: {} } })

async function registerTools() {
  // 先注册本地上传工具（不依赖上游，立即可用）
  for (const [name, def] of Object.entries(LOCAL_TOOLS)) {
    server.registerTool(name, def.schema as any, async (args: any) => {
      try {
        const data = await def.run(args)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }], isError: false }
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `上传失败: ${err?.message || err}` }], isError: true }
      }
    })
  }
  // 再拉取上游工具清单（首次会触发 OAuth 浏览器登录），失败也不影响本地上传
  try {
    const list = await callUpstream('tools/list', {})
    const upstreamTools: any[] = list?.result?.tools || []
    for (const tool of upstreamTools) {
      if (tool.name === 'upload_file' || tool.name === 'upload_folder') continue
      const { title, description, inputSchema: upstreamSchema } = tool
      server.registerTool(tool.name, {
        title,
        description: upstreamSchema
          ? `${description}\n\n参数（JSON Schema）：\n${JSON.stringify(upstreamSchema, null, 2)}`
          : description,
        // 上游工具的 schema 是 JSON Schema，而 SDK 1.22 的 registerTool 仅接受 zod；
        // 用 passthrough 占位以透传参数，避免注册/调用失败。
        inputSchema: z.object({}).passthrough(),
      }, async (args: any) => {
        const res = await callUpstream('tools/call', { name: tool.name, arguments: args })
        return res?.result ?? res
      })
    }
  } catch (e) {
    console.error('[edu-upload] 上游工具拉取失败（可能尚未完成登录），仅本地上传工具可用：', (e as Error).message)
  }
}

async function main() {
  // MCP 要求工具的 request handler / capabilities 必须在 server.connect() 之前注册，
  // 否则 SDK 会拒绝并在客户端调用 tools/list、tools/call 时返回 -32601 Method not found。
  // 因此先完成工具注册（含上游工具拉取，可能触发 OAuth 浏览器登录，含 5 分钟超时保护），再建立 stdio 连接。
  await registerTools()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[edu-upload] MCP 桥已启动（OAuth 2.1 / EDU_API_KEY 鉴权）：本地上传工具 upload_file / upload_folder / upload_cover，其余工具转发至上游。')
}

main().catch((err) => {
  console.error('[edu-upload] 启动失败:', err)
  process.exit(1)
})
