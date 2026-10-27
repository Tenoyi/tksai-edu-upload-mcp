import fs from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'

// 后端连接配置（环境变量）
const API_BASE = (process.env.EDU_API_BASE || '').replace(/\/+$/, '')
// API Key：由用户在「个人中心 → API Key 管理」创建，明文仅在首次展示
const API_KEY = process.env.EDU_API_KEY || ''
// 终端类型：H5 = 20（与前端一致，后端用于统计/限流，无业务强约束）
const TERMINAL = process.env.EDU_TERMINAL || '20'

/** 组装鉴权请求头；注意：预签名直传 URL 不需要这些头（签名在 URL 内） */
function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { terminal: TERMINAL, ...extra }
  if (API_KEY) h['Authorization'] = `Bearer ${API_KEY}`
  return h
}

function full(urlPath: string): string {
  if (!API_BASE) {
    throw new Error('缺少环境变量 EDU_API_BASE（例如 https://your-domain/app-api）')
  }
  return `${API_BASE}${urlPath}`
}

/** 统一解析 yudao 风格响应 { code, data, msg } */
async function parse<T = unknown>(resp: Response): Promise<T> {
  let json: any
  try {
    json = await resp.json()
  } catch {
    throw new Error(`响应解析失败: HTTP ${resp.status}`)
  }
  if (json.code !== 0) {
    throw new Error(json.msg || `请求失败 (code=${json.code})`)
  }
  return json.data as T
}

export interface UploadFileResult {
  url: string
}

/**
 * 上传单个文件：复用前端 edu.js 的 /infra/file/upload（multipart）端点。
 * directory 可选，用于后端归类。
 */
export async function uploadFile(localPath: string, directory?: string): Promise<UploadFileResult> {
  const buf = fs.readFileSync(localPath)
  const name = path.basename(localPath)
  const form = new FormData()
  form.append('file', new Blob([buf], { type: 'application/octet-stream' }), name)
  if (directory) form.append('directory', directory)
  const resp = await fetch(full('/infra/file/upload'), {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  })
  const url = await parse<string>(resp)
  return { url }
}

export interface PresignedFolder {
  uploadUrl: string
  url: string
  path: string
}

export interface UploadFolderResult {
  indexUrl: string
  rootUrl: string
  fileCount: number
  files: string[]
}

/** 将目录打包为 zip（保留相对路径），返回 buffer 与文件清单 */
async function zipDir(dir: string): Promise<{ buf: Uint8Array; files: string[] }> {
  const zip = new JSZip()
  const files: string[] = []
  const walk = (cur: string, rel: string) => {
    for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
      const abs = path.join(cur, e.name)
      const r = rel ? path.join(rel, e.name) : e.name
      if (e.isDirectory()) walk(abs, r)
      else {
        zip.file(r, fs.readFileSync(abs))
        files.push(r)
      }
    }
  }
  walk(dir, '')
  const buf = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  return { buf, files }
}

/**
 * 上传文件夹（教学应用）：必须含 index.html。
 * 复用 /infra/file/presigned-url-folder 获取预签名 URL，将 zip 以 PUT 直传，
 * 返回首页 URL(indexUrl = rootUrl?index.html) 与根 URL(rootUrl)。
 */
export async function uploadFolder(localDir: string, directory?: string): Promise<UploadFolderResult> {
  if (!fs.existsSync(path.join(localDir, 'index.html'))) {
    throw new Error('文件夹必须包含 index.html')
  }
  const name = path.basename(localDir)
  const qs = new URLSearchParams({ name })
  if (directory) qs.set('directory', directory)
  const presignedResp = await fetch(`${full('/infra/file/presigned-url-folder')}?${qs.toString()}`, {
    method: 'GET',
    headers: authHeaders(),
  })
  const presigned = await parse<PresignedFolder>(presignedResp)

  const { buf, files } = await zipDir(localDir)
  // TS 5.5 下 Uint8Array<ArrayBufferLike> 不兼容 BodyInit，复制到 ArrayBuffer 支撑的视图
  const view = new Uint8Array(buf.byteLength)
  view.set(buf)
  // 预签名直传：仅带 Content-Type，不带鉴权头（签名已在 URL 内）
  const put = await fetch(presigned.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/zip' },
    body: view,
  })
  if (!put.ok) {
    throw new Error(`文件夹上传失败: HTTP ${put.status}`)
  }

  const rootUrl = presigned.url
  const indexUrl = `${rootUrl}?index.html`
  return { indexUrl, rootUrl, fileCount: files.length, files }
}

/** 创建教学作品(SPU)，复用 /product/spu/create */
export async function createWork(data: Record<string, unknown>): Promise<unknown> {
  const resp = await fetch(full('/product/spu/create'), {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  })
  return parse(resp)
}

/** 更新教学作品(SPU)，复用 /product/spu/update */
export async function updateWork(data: Record<string, unknown>): Promise<unknown> {
  const resp = await fetch(full('/product/spu/update'), {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  })
  return parse(resp)
}
