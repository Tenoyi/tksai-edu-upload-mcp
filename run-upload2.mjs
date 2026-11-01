#!/usr/bin/env node
/**
 * 智教坊上传脚本（手动捕获 code 版，绕过沙箱回环限制）
 *
 * 用法：
 *   步骤1（无参数）：  node run-upload2.mjs
 *        -> 生成 PKCE，把 verifier/state 存到 /tmp/tks-oauth.json，打印登录 URL 后退出。
 *        -> 用户在浏览器打开该 URL 登录，登录后浏览器会跳到 http://127.0.0.1:18765/callback?code=xxx&state=yyy
 *           （该地址打不开是正常的，只要从地址栏复制“完整 URL”即可）。
 *   步骤2（带回调 URL）： node run-upload2.mjs "<粘贴的回调URL>"
 *        -> 解析 code，换取令牌，上传封面/HTML，调用 create_work 创建作品。
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const API_BASE = 'https://edu.tksai.com/app-api'
const UPSTREAM = 'https://edu.tksai.com/app-api/mcp'
const CACHE_DIR = path.join(os.homedir(), '.tks-edu')
const TOKEN_CACHE = path.join(CACHE_DIR, 'oauth-token.json')
const OAUTH_STATE_FILE = '/tmp/tks-oauth.json'
const HTML_PATH = '/Users/zhaoyong/Desktop/高中化学/离子键如何形成.html'
const COVER_PATH = '/tmp/zhijiaofang-cover.png'

const WORK_NAME = '离子键如何形成'
const INTRODUCTION =
  '高中化学互动教学应用：通过动画与交互演示离子键的形成过程，帮助学生理解阴阳离子间的静电作用与离子化合物的形成。'

const CLIENT_ID = 'tks-ai-edu-upload'
const SCOPE = 'openid profile'
const AUTHZ_ENDPOINT = `${API_BASE}/oauth/authorize`
const TOKEN_ENDPOINT = `${API_BASE}/oauth/token`
const REDIRECT_URI = 'http://127.0.0.1:18765/callback'

const log = (...a) => console.error('[run]', ...a)

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function sha256Base64Url(s) {
  return base64url(crypto.createHash('sha256').update(s).digest())
}

// ---------- 步骤1：生成授权 URL ----------
function step1() {
  const verifier = base64url(crypto.randomBytes(32))
  const challenge = sha256Base64Url(verifier)
  const state = crypto.randomUUID()
  fs.writeFileSync(OAUTH_STATE_FILE, JSON.stringify({ verifier, state, redirectUri: REDIRECT_URI }))
  const u = new URL(AUTHZ_ENDPOINT)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', CLIENT_ID)
  u.searchParams.set('redirect_uri', REDIRECT_URI)
  u.searchParams.set('scope', SCOPE)
  u.searchParams.set('state', state)
  u.searchParams.set('code_challenge', challenge)
  u.searchParams.set('code_challenge_method', 'S256')
  console.log('\n========================================================')
  console.log('【步骤 1】请在浏览器中打开下面的地址并完成智教坊登录：')
  console.log('\n' + u.toString() + '\n')
  console.log('登录后浏览器会跳到 http://127.0.0.1:18765/callback?code=...&state=...')
  console.log('该页面“无法打开/连接”是正常的 —— 请直接从地址栏复制【完整 URL】，')
  console.log('然后把它发回给我（例如：http://127.0.0.1:18765/callback?code=abcd&state=...）。')
  console.log('========================================================\n')
}

// ---------- 步骤2：用 code 换 token 并上传 ----------
async function mcpRequest(token, method, params) {
  const res = await fetch(UPSTREAM, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const ct = res.headers.get('content-type') || ''
  let parsed
  if (ct.includes('text/event-stream')) {
    const raw = await res.text()
    const lines = raw.split('\n')
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].startsWith('data:')) {
        parsed = JSON.parse(lines[i].slice(5).trim())
        break
      }
    }
    if (!parsed) throw new Error('SSE 解析失败: ' + raw.slice(0, 500))
  } else {
    parsed = await res.json()
  }
  if (parsed.error) throw new Error('MCP 错误: ' + JSON.stringify(parsed.error))
  return parsed.result
}

const MIME = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
}
function mimeOf(p) {
  return MIME[path.extname(p).toLowerCase()] || 'application/octet-stream'
}
function buildMultipart(fields, fileBuffer, fileName) {
  const boundary = `----TKSFormBoundary${crypto.randomUUID().replace(/-/g, '')}`
  const chunks = []
  for (const [k, v] of Object.entries(fields))
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`))
  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mimeOf(fileName)}\r\n\r\n`
    )
  )
  chunks.push(fileBuffer)
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`))
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` }
}
async function multipartUpload(absPath, token, directory) {
  const buf = fs.readFileSync(absPath)
  const fileName = path.basename(absPath)
  const fields = directory ? { directory } : {}
  const { body, contentType } = buildMultipart(fields, buf, fileName)
  const res = await fetch(`${API_BASE}/infra/file/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
    body: new Uint8Array(body),
  })
  const json = await res.json().catch(() => ({}))
  if (json.code !== 0) throw new Error('上传失败: ' + (json.msg || res.status))
  log('上传成功:', fileName, '->', json.data)
  return json.data
}
function pickUnit(desc = '') {
  if (/单位[:：]?\s*分|换算为.{0,4}分|元\s*[×xX]\s*100/.test(desc)) return 'fen'
  if (/单位[:：]?\s*元/.test(desc)) return 'yuan'
  return 'unknown'
}

async function step2(callbackUrlRaw) {
  const raw = (callbackUrlRaw || '').trim().replace(/^["']|["']$/g, '')
  if (!raw) throw new Error('未提供回调 URL。请在步骤2把浏览器地址栏的完整 URL 作为参数传入。')
  let urlObj
  try {
    urlObj = new URL(raw)
  } catch {
    throw new Error('无法解析回调 URL: ' + raw)
  }
  const code = urlObj.searchParams.get('code')
  const returnedState = urlObj.searchParams.get('state')
  const err = urlObj.searchParams.get('error')
  if (err) throw new Error('授权被拒绝: ' + err)
  if (!code) throw new Error('回调 URL 中未找到 code 参数: ' + raw)

  const saved = JSON.parse(fs.readFileSync(OAUTH_STATE_FILE, 'utf8'))
  if (returnedState && returnedState !== saved.state)
    throw new Error('state 校验失败（可能遭受 CSRF），请重新从步骤1开始。')

  log('正在用授权码换取令牌…')
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: saved.redirectUri,
    client_id: CLIENT_ID,
    code_verifier: saved.verifier,
  })
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || !j.access_token) throw new Error('令牌交换失败: ' + JSON.stringify(j))
  const token = j.access_token
  if (j.expires_in && !j.expires_at) j.expires_at = Date.now() + j.expires_in * 1000
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    fs.writeFileSync(TOKEN_CACHE, JSON.stringify(j), { mode: 0o600 })
    log('令牌已缓存到', TOKEN_CACHE)
  } catch {}

  if (!fs.existsSync(HTML_PATH)) throw new Error('找不到 HTML 文件: ' + HTML_PATH)
  if (!fs.existsSync(COVER_PATH)) throw new Error('找不到封面图: ' + COVER_PATH)

  const coverUrl = await multipartUpload(COVER_PATH, token)
  const htmlUrl = await multipartUpload(HTML_PATH, token)

  log('读取上游工具列表（确认 create_work 价格单位）…')
  const listRes = await mcpRequest(token, 'tools/list', {})
  const tools = listRes.tools ?? []
  const cw = tools.find((t) => t.name === 'create_work')
  if (!cw) {
    console.error('ERROR: 上游无 create_work 工具。可用:', tools.map((t) => t.name).join(', '))
    process.exit(7)
  }
  const props = cw.inputSchema?.properties || {}
  const unitDesc = (props.costPrice?.description || '') + ' | ' + (props.price?.description || '')
  const unit = pickUnit(unitDesc)
  if (unit === 'unknown') {
    console.error('ERROR: 无法确认价格单位。')
    console.error('price.desc     =', props.price?.description)
    console.error('costPrice.desc =', props.costPrice?.description)
    process.exit(8)
  }
  const costPrice = unit === 'fen' ? 90 : 0.9
  log(`价格单位确认: ${unit === 'fen' ? '分（90=0.9元）' : '元（0.9）'}`)

  const args = {
    name: WORK_NAME,
    picUrl: coverUrl,
    previewUrl: htmlUrl,
    workType: 'app',
    contentType: 'html',
    price: 0, // 在线使用免费
    costPrice, // 下载 0.9 元
    visibilityScope: 1, // 完全公开
    introduction: INTRODUCTION,
  }
  log('正在创建教学作品 create_work…', JSON.stringify(args))
  const callRes = await mcpRequest(token, 'tools/call', { name: 'create_work', arguments: args })
  const text = callRes.content?.find((c) => c.type === 'text')?.text ?? ''
  console.log('\n=== create_work 结果 ===')
  console.log(text || JSON.stringify(callRes, null, 2))
  log('完成。')
}

// ---------- 入口 ----------
try {
  const arg = process.argv[2]
  if (!arg) {
    step1()
  } else {
    await step2(arg)
  }
} catch (e) {
  console.error('\n❌ 失败:', e.message)
  process.exit(1)
}
