/**
 * 本地桥的 OAuth 2.1（PKCE，公共客户端）实现。
 *
 * 依据 WorkBuddy 开放平台「MCP Server 自带 OAuth 认证流程」规范：
 *   - 优先发现 ${apiBase}/.well-known/oauth-authorization-server（RFC 8414）；
 *   - 支持动态客户端注册 /oauth/register（RFC 7591，公共客户端，无 secret）；
 *   - 授权端点须支持 code_challenge_method=S256，校验 state 防 CSRF；
 *   - 回退回调使用本机回环地址 http://127.0.0.1:{port}/oauth/callback
 *     （官方要求的 workbuddy:// 私有协议回调仅 WorkBuddy 管理器可用，桥自实现时回退到回环）。
 *
 * 首次调用会打开浏览器登录，拿到 access_token 后缓存到本机 ~/.tks-edu/oauth-token.json，
 * 之后用于「本地文件上传」和「上游业务代理」的 Bearer 鉴权，不再需要手动填写 EDU_API_KEY。
 * 兼容：若设置了 EDU_API_KEY，则直接作为 Bearer 使用（跳过 OAuth）。
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { exec } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { URL } from 'node:url'

// 网关 /app-api 地址：优先 EDU_API_BASE，否则由 EDU_MCP_URL 推导（去掉末尾 /mcp）
export function apiBase(): string {
  const explicit = process.env.EDU_API_BASE
  if (explicit && explicit.trim()) {
    return explicit.replace(/\/+$/, '')
  }
  const mcp = (process.env.EDU_MCP_URL || 'https://edu.tksai.com/app-api/mcp')
    .replace(/\/mcp(\?.*)?$/i, '')
    .replace(/\/+$/, '')
  if (!mcp) {
    throw new Error('未配置 EDU_API_BASE 或 EDU_MCP_URL，无法确定业务网关节点')
  }
  return mcp
}

interface TokenSet {
  access_token: string
  token_type?: string
  refresh_token?: string
  expires_in?: number
  expires_at?: number // epoch ms
  scope?: string
}

interface CacheFile extends TokenSet {
  client_id?: string
}

interface AuthMetadata {
  authorization_endpoint: string
  token_endpoint: string
  registration_endpoint?: string
  scopes_supported?: string[]
}

const CACHE_DIR = path.join(os.homedir(), '.tks-edu')
const TOKEN_CACHE = path.join(CACHE_DIR, 'oauth-token.json')

function loadCache(): CacheFile | null {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_CACHE, 'utf8')) as CacheFile
  } catch {
    return null
  }
}

function saveCache(t: CacheFile): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    fs.writeFileSync(TOKEN_CACHE, JSON.stringify(t), { mode: 0o600 })
  } catch {
    /* 忽略缓存写入失败 */
  }
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function sha256Base64Url(s: string): string {
  return base64url(crypto.createHash('sha256').update(s).digest())
}

function finalize(t: TokenSet): TokenSet {
  if (t.expires_in && !t.expires_at) {
    t.expires_at = Date.now() + t.expires_in * 1000
  }
  return t
}

function defaultClientId(): string {
  return process.env.EDU_OAUTH_CLIENT_ID || 'tksai-edu-upload'
}

function scope(): string {
  // 注意：后端 OAuth2RegisterService 的 scope 支持集是 edu 业务权限
  // （works.read/files.upload/...），并不支持 OIDC 标准的 openid/profile。
  // 若传 openid profile 会因“请求∩支持集”为空而回退到全部业务权限（含 withdraw.write），
  // 既与确认页展示不一致，又过度授权。这里请求后端实际支持的最小必要权限。
  return process.env.EDU_OAUTH_SCOPE || 'files.upload'
}

async function discover(): Promise<AuthMetadata> {
  const authUrl = process.env.EDU_OAUTH_AUTH_URL
  const tokenUrl = process.env.EDU_OAUTH_TOKEN_URL
  if (authUrl && tokenUrl) {
    return { authorization_endpoint: authUrl, token_endpoint: tokenUrl }
  }
  // well-known 必须位于根域（RFC 8414 / RFC 9728），不在 /app-api 下，
  // 需由 nginx 单独转发 /.well-known/* 到后端，故这里用根域而非 apiBase()。
  const rootBase = (process.env.EDU_WELLKNOWN_BASE
    || apiBase().replace(/\/app-api\/?$/i, '')).replace(/\/+$/, '')
  const metaUrl = `${rootBase}/.well-known/oauth-authorization-server`
  try {
    const res = await fetch(metaUrl, { headers: { Accept: 'application/json' } })
    if (res.ok) {
      const j = (await res.json()) as Partial<AuthMetadata>
      if (j.authorization_endpoint && j.token_endpoint) {
        return j as AuthMetadata
      }
    }
  } catch {
    /* 忽略，走回退 */
  }
  // 回退：业务端点均在 /app-api/system/** 下（经网关可命中），务必带 /system。
  // registration_endpoint 也指向 /system，使 DCR 即便在 well-known 失败时仍可用。
  return {
    authorization_endpoint: `${apiBase()}/system/oauth/authorize`,
    token_endpoint: `${apiBase()}/system/oauth/token`,
    registration_endpoint: `${apiBase()}/system/oauth/register`,
  }
}

function openBrowser(url: string): void {
  const platform = process.platform
  const cmd =
    platform === 'darwin'
      ? `open "${url}"`
      : platform === 'win32'
        ? `cmd /c start "" "${url}"`
        : `xdg-open "${url}"`
  try {
    exec(cmd)
  } catch {
    console.error('[edu-upload] 无法自动打开浏览器，请手动访问：', url)
  }
}

// 动态客户端注册（RFC 7591）：公共客户端、无 secret。失败则返回 null 走固定 client_id。
async function registerClient(meta: AuthMetadata, redirectUri: string): Promise<string | null> {
  if (!meta.registration_endpoint) return null
  try {
    const res = await fetch(meta.registration_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: '智教坊',
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        scope: scope(),
      }),
    })
    if (!res.ok) return null
    const j = (await res.json()) as { client_id?: string }
    return j.client_id || null
  } catch {
    return null
  }
}

// 解析本次使用的 client_id：缓存 → 动态注册 → 环境变量 → 默认
async function resolveClientId(meta: AuthMetadata, redirectUri: string, cached?: string): Promise<string> {
  if (cached) return cached
  const registered = await registerClient(meta, redirectUri)
  if (registered) return registered
  return defaultClientId()
}

async function doLoopbackFlow(meta: AuthMetadata, cachedClientId: string | undefined): Promise<TokenSet> {
  const verifier = base64url(crypto.randomBytes(32))
  const challenge = sha256Base64Url(verifier)
  const state = randomUUID()

  const server = http.createServer()
  const codePromise = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close()
      reject(new Error('OAuth 登录超时（未收到回调，请重试）'))
    }, 5 * 60 * 1000)
    server.on('request', (req, res) => {
      const u = new URL(req.url || '/', 'http://127.0.0.1')
      if (u.pathname === '/oauth/callback') {
        const code = u.searchParams.get('code')
        const err = u.searchParams.get('error')
        const returnedState = u.searchParams.get('state')
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(
          '<!doctype html><meta charset="utf-8"><title>智教坊登录成功</title>' +
            '<h2>登录成功 ✅</h2><p>智教坊 MCP 连接器已获取授权，请返回对话框继续使用。</p>'
        )
        clearTimeout(timer)
        server.close()
        if (err) reject(new Error('OAuth 授权被拒绝: ' + err))
        else if (returnedState !== state) reject(new Error('OAuth state 校验失败（可能遭受 CSRF）'))
        else if (code) resolve(code)
        else reject(new Error('OAuth 回调缺少 code'))
      } else {
        res.writeHead(404)
        res.end()
      }
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
  const addr = server.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  const redirect = `http://127.0.0.1:${port}/oauth/callback`
  return await runFlow(meta, redirect, verifier, challenge, state, cachedClientId, codePromise)
}

async function runFlow(
  meta: AuthMetadata,
  redirect: string,
  verifier: string,
  challenge: string,
  state: string,
  cachedClientId: string | undefined,
  codePromise?: Promise<string>
): Promise<TokenSet> {
  const clientId = await resolveClientId(meta, redirect, cachedClientId)

  const authUrl = new URL(meta.authorization_endpoint)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirect)
  authUrl.searchParams.set('scope', scope())
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('code_challenge', challenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')

  console.error('[edu-upload] 正在打开浏览器完成智教坊登录授权…')
  openBrowser(authUrl.toString())

  const code = codePromise ? await codePromise : await waitForExternalCallback()

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirect,
    client_id: clientId,
    code_verifier: verifier,
  })
  const res = await fetch(meta.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  })
  const j = (await res.json().catch(() => ({}))) as TokenSet
  if (!res.ok || !j.access_token) {
    throw new Error('OAuth 令牌交换失败: ' + JSON.stringify(j))
  }
  const token = finalize(j)
  // 缓存 token 与本次使用的 client_id
  const cache: CacheFile = { ...token, client_id: clientId }
  saveCache(cache)
  return token
}

// 固定回调地址（EDU_OAUTH_REDIRECT）模式下 code 由外部提供；此处仅作占位，
// 默认走 loopback，本函数不会被触发。
async function waitForExternalCallback(): Promise<string> {
  throw new Error('未配置 loopback 回调，且未提供外部回调 code 获取方式')
}

async function refresh(meta: AuthMetadata, t: CacheFile): Promise<TokenSet> {
  if (!t.refresh_token) {
    throw new Error('无 refresh_token，无法静默刷新，请重新登录')
  }
  const clientId = t.client_id || defaultClientId()
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: t.refresh_token,
    client_id: clientId,
  })
  const sc = scope()
  if (sc) body.set('scope', sc)
  const res = await fetch(meta.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  })
  const j = (await res.json().catch(() => ({}))) as TokenSet
  if (!res.ok || !j.access_token) {
    throw new Error('OAuth 刷新失败: ' + JSON.stringify(j))
  }
  if (!j.refresh_token) j.refresh_token = t.refresh_token
  const updated: CacheFile = { ...j, client_id: clientId }
  return finalize(updated)
}

let metaPromise: Promise<AuthMetadata> | null = null
function getMeta(): Promise<AuthMetadata> {
  if (!metaPromise) metaPromise = discover()
  return metaPromise
}

/**
 * 读取由 WorkBuddy 云端托管并注入的环境变量令牌（auth_mode=server-side 模式）。
 * 文档未固定变量名，这里按常见约定尝试多个候选；若 WorkBuddy 实际注入的变量名不同，
 * 在此追加即可（或统一走本地 DCR 兜底）。
 */
function injectedToken(): string | undefined {
  const candidates = [
    process.env.EDU_OAUTH_TOKEN,
    process.env.MCP_OAUTH_TOKEN,
    process.env.WORKBUDDY_OAUTH_TOKEN,
    process.env.CODEBUDDY_OAUTH_TOKEN,
  ]
  for (const v of candidates) {
    if (v && v.trim() && !v.startsWith('${')) {
      return v.trim().replace(/^Bearer\s+/i, '')
    }
  }
  return undefined
}

/**
 * 返回 access_token（不含 Bearer 前缀）。
 * 优先级：EDU_API_KEY（手动密钥） > 注入令牌（WorkBuddy 云端托管） > 本地 OAuth（DCR + 浏览器登录，兜底）。
 */
export async function getAccessToken(): Promise<string> {
  const key = process.env.EDU_API_KEY
  if (key && key.trim()) {
    return key.startsWith('Bearer ') ? key.slice(7).trim() : key.trim()
  }
  const injected = injectedToken()
  if (injected) {
    return injected
  }
  // 兜底：本地动态客户端注册 + 浏览器登录（开发 / 非 WorkBuddy 托管场景）
  const meta = await getMeta()
  const cached = loadCache()
  if (cached && cached.access_token) {
    if (cached.expires_at && cached.expires_at - Date.now() > 60_000) {
      return cached.access_token
    }
    if (cached.refresh_token) {
      try {
        const t = await refresh(meta, cached)
        saveCache(t)
        return t.access_token
      } catch (e) {
        console.error('[edu-upload] token 刷新失败，将重新登录:', (e as Error).message)
      }
    }
  }
  return (await doLoopbackFlow(meta, cached?.client_id)).access_token
}

/** 返回上传 / 代理需要的鉴权头（Bearer + 可选 tenant-id）。 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken()
  const h: Record<string, string> = { Authorization: `Bearer ${token}` }
  const tenant = process.env.EDU_TENANT_ID
  if (tenant && tenant.trim()) h['tenant-id'] = tenant.trim()
  return h
}
