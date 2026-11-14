#!/usr/bin/env node
/**
 * 智教坊上传执行脚本（自包含 OAuth + SDK-free 版）
 * 直接对接 edu.tksai.com：
 *   OAuth 2.1(PKCE) 浏览器登录 -> 上传封面/HTML -> tools/list 取真实 schema
 *   -> create_work 创建教学作品（在线免费 price=0，下载 0.9 元 costPrice）
 * 全程不依赖 @modelcontextprotocol/sdk（用 fetch 直连 StreamableHTTP JSON-RPC）。
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import http from 'node:http'
import path from 'node:path'
import { exec } from 'node:child_process'

const API_BASE = 'https://edu.tksai.com/app-api'
const UPSTREAM = 'https://edu.tksai.com/app-api/mcp'
const CACHE_DIR = path.join(os.homedir(), '.tks-edu')
const TOKEN_CACHE = path.join(CACHE_DIR, 'oauth-token.json')
const HTML_PATH = '/Users/zhaoyong/Desktop/高中化学/离子键如何形成.html'
const COVER_PATH = '/tmp/zhijiaofang-cover.png'

const WORK_NAME = '离子键如何形成'
const INTRODUCTION =
  '高中化学互动教学应用：通过动画与交互演示离子键的形成过程，帮助学生理解阴阳离子间的静电作用与离子化合物的形成。'

const CLIENT_ID = 'tks-ai-edu-upload'
const SCOPE = 'openid profile'
const AUTHZ_ENDPOINT = `${API_BASE}/oauth/authorize`
const TOKEN_ENDPOINT = `${API_BASE}/oauth/token`

const log = (...a) => console.error('[run]', ...a)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 授权成功回调页：渐变卡片 + 成功徽标 + 5 秒环形倒计时，结束后尝试自动关闭窗口
function successPageHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>智教坊授权成功</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    padding: 24px; color: #1f2937; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",
      "PingFang SC", "Microsoft YaHei", sans-serif;
    background: linear-gradient(135deg, #5b6cff 0%, #8a5bff 50%, #c15bff 100%);
  }
  .card {
    width: 100%; max-width: 420px; background: #fff; border-radius: 20px;
    padding: 44px 32px 32px; text-align: center;
    box-shadow: 0 20px 60px rgba(40, 20, 80, .25);
    animation: pop .5s cubic-bezier(.18, .89, .32, 1.28);
  }
  @keyframes pop { from { opacity: 0; transform: translateY(16px) scale(.96); } to { opacity: 1; transform: none; } }
  .badge {
    width: 76px; height: 76px; margin: 0 auto 18px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, #5b6cff, #8a5bff);
    box-shadow: 0 10px 24px rgba(91, 108, 255, .45);
    animation: pulse 1.8s ease-in-out infinite;
  }
  @keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
  .badge svg { width: 40px; height: 40px; stroke: #fff; stroke-width: 3; fill: none;
    stroke-linecap: round; stroke-linejoin: round; }
  h2 { margin: 0 0 8px; font-size: 22px; font-weight: 700; }
  p { margin: 0 0 6px; color: #6b7280; font-size: 14px; line-height: 1.6; }
  .ring {
    position: relative; margin: 24px auto 14px; width: 56px; height: 56px; border-radius: 50%;
    background: conic-gradient(#5b6cff calc(var(--p) * 1%), #eceaff 0);
    display: flex; align-items: center; justify-content: center;
  }
  .ring::before { content: ""; position: absolute; width: 44px; height: 44px; border-radius: 50%; background: #fff; }
  .ring span { position: relative; font-weight: 700; font-size: 18px; color: #5b6cff; }
  .count { font-size: 13px; color: #9ca3af; }
  .count b { color: #5b6cff; }
</style>
</head>
<body>
  <div class="card">
    <div class="badge"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></div>
    <h2>授权成功 🎉</h2>
    <p>智教坊 MCP 连接器已获取授权</p>
    <p>请返回对话框继续使用</p>
    <div class="ring" id="ring"><span id="num">5</span></div>
    <div class="count"><b id="num2">5</b> 秒后此页面将自动关闭</div>
  </div>
<script>
  (function () {
    var n = 5;
    var ring = document.getElementById('ring');
    var num = document.getElementById('num');
    var num2 = document.getElementById('num2');
    var count = document.querySelector('.count');
    function render() {
      ring.style.setProperty('--p', (n / 5) * 100);
      num.textContent = n;
      num2.textContent = n;
    }
    render();
    var t = setInterval(function () {
      n--;
      if (n <= 0) {
        render();
        clearInterval(t);
        if (window.close) { try { window.close(); } catch (e) {} }
        count.innerHTML = '可手动关闭此页面 <b>✕</b>';
        return;
      }
      render();
    }, 1000);
  })();
</script>
</body>
</html>`
}

// ---------- auth ----------
function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function sha256Base64Url(s) {
  return base64url(crypto.createHash('sha256').update(s).digest())
}
function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_CACHE, 'utf8'))
  } catch {
    return null
  }
}
function saveCache(t) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    fs.writeFileSync(TOKEN_CACHE, JSON.stringify(t), { mode: 0o600 })
    log('令牌已缓存到', TOKEN_CACHE)
  } catch (e) {
    log('缓存令牌失败（不影响本次上传）:', e.message)
  }
}
function openBrowser(url) {
  try {
    exec(`open "${url}"`)
  } catch {
    console.error('无法自动打开浏览器，请手动访问：', url)
  }
}

async function doAuth() {
  const verifier = base64url(crypto.randomBytes(32))
  const challenge = sha256Base64Url(verifier)
  const state = crypto.randomUUID()
  const server = http.createServer()
  const codePromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close()
      reject(new Error('OAuth 登录超时（9 分钟），请重试并在浏览器完成授权'))
    }, 9 * 60 * 1000)
    server.on('request', (req, res) => {
      const u = new URL(req.url || '/', 'http://127.0.0.1')
      if (u.pathname === '/callback') {
        const code = u.searchParams.get('code')
        const err = u.searchParams.get('error')
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(successPageHtml())
        clearTimeout(timer)
        server.close()
        if (err) reject(new Error('OAuth 授权被拒绝: ' + err))
        else if (u.searchParams.get('state') !== state) reject(new Error('OAuth state 校验失败'))
        else if (code) resolve(code)
        else reject(new Error('OAuth 回调缺少 code'))
      } else {
        res.writeHead(404)
        res.end()
      }
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r()))
  const port = server.address().port
  const redirect = `http://127.0.0.1:${port}/callback`

  const authUrl = new URL(AUTHZ_ENDPOINT)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', redirect)
  authUrl.searchParams.set('scope', SCOPE)
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('code_challenge', challenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')

  console.error('\n=================================================')
  console.error('[oauth] 请在浏览器中完成智教坊登录授权…')
  console.error('[oauth] 若浏览器未自动打开，请手动访问以下地址：')
  console.error(authUrl.toString())
  console.error('=================================================\n')
  openBrowser(authUrl.toString())

  const code = await codePromise
  log('已收到授权码，正在换取令牌…')
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirect,
    client_id: CLIENT_ID,
    code_verifier: verifier,
  })
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || !j.access_token) throw new Error('OAuth 令牌交换失败: ' + JSON.stringify(j))
  const t = j
  if (t.expires_in && !t.expires_at) t.expires_at = Date.now() + t.expires_in * 1000
  saveCache(t)
  return t.access_token
}

async function getToken() {
  const t = loadCache()
  if (t && t.access_token && (!t.expires_at || t.expires_at - Date.now() > 120000)) {
    log('复用已缓存的访问令牌')
    return t.access_token
  }
  return await doAuth()
}

// ---------- MCP JSON-RPC (StreamableHTTP) ----------
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
    if (!parsed) throw new Error('SSE 响应解析失败: ' + raw.slice(0, 500))
  } else {
    parsed = await res.json()
  }
  if (parsed.error) throw new Error('MCP 错误: ' + JSON.stringify(parsed.error))
  return parsed.result
}

// ---------- file upload ----------
const MIME = {
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

// ---------- main ----------
try {
  if (!fs.existsSync(HTML_PATH)) throw new Error('找不到 HTML 文件: ' + HTML_PATH)
  if (!fs.existsSync(COVER_PATH)) throw new Error('找不到封面图: ' + COVER_PATH)

  const token = await getToken()
  log('已获取访问令牌，开始上传…')

  const coverUrl = await multipartUpload(COVER_PATH, token)
  const htmlUrl = await multipartUpload(HTML_PATH, token)

  log('正在读取上游工具列表（确认 create_work 价格单位）…')
  const listRes = await mcpRequest(token, 'tools/list', {})
  const tools = listRes.tools ?? []
  const cw = tools.find((t) => t.name === 'create_work')
  if (!cw) {
    console.error('ERROR: 上游无 create_work 工具。可用工具:', tools.map((t) => t.name).join(', '))
    process.exit(7)
  }
  const props = cw.inputSchema?.properties || {}
  const unitDesc =
    (props.costPrice?.description || '') + ' | ' + (props.price?.description || '')
  const unit = pickUnit(unitDesc)
  if (unit === 'unknown') {
    console.error('ERROR: 无法从 create_work schema 确认价格单位。')
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
} catch (e) {
  console.error('\n❌ 上传失败:', e.message)
  process.exit(1)
}
