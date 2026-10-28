import fs from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'

// 后端连接配置（环境变量，stdio 模式兜底；streamableHttp 模式优先使用调用方透传的 token）
const API_BASE = (process.env.EDU_API_BASE || '').replace(/\/+$/, '')
// API Key：stdio 模式下由环境变量提供（用户在「个人中心 → API Key 管理」创建，明文仅首次展示）
const API_KEY = process.env.EDU_API_KEY || ''
// 终端类型：H5 = 20（与前端一致，后端用于统计/限流，无业务强约束）
const TERMINAL = process.env.EDU_TERMINAL || '20'

/** 透传的鉴权上下文：来自调用方 Bearer（streamableHttp 模式）或环境变量（stdio 模式） */
export interface AuthCtx {
  token?: string
  tenantId?: string
}

/** 组装鉴权请求头；优先使用调用方透传的 token，回退到环境变量（stdio）。预签名直传 URL 不需要这些头（签名在 URL 内） */
function authHeaders(auth?: AuthCtx, extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { terminal: TERMINAL, ...extra }
  const token = auth?.token || API_KEY
  if (token) h['Authorization'] = `Bearer ${token}`
  if (auth?.tenantId) h['tenant-id'] = auth.tenantId
  return h
}

function full(urlPath: string): string {
  if (!API_BASE) {
    throw new Error('缺少后端地址：请设置 EDU_API_BASE（如 https://your-domain/app-api）或在 streamableHttp 模式下由调用方透传 Authorization')
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

/** GET + query 参数（自动跳过空值），返回 data */
async function apiGet<T = unknown>(urlPath: string, params: Record<string, unknown>, auth?: AuthCtx): Promise<T> {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  }
  const url = qs.toString() ? `${full(urlPath)}?${qs.toString()}` : full(urlPath)
  const resp = await fetch(url, { method: 'GET', headers: authHeaders(auth) })
  return parse<T>(resp)
}

/** POST + JSON body，返回 data */
async function apiPost<T = unknown>(urlPath: string, body: unknown, auth?: AuthCtx): Promise<T> {
  const resp = await fetch(full(urlPath), {
    method: 'POST',
    headers: authHeaders(auth, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
  return parse<T>(resp)
}

// ==================== 上传 ====================

export interface UploadFileResult {
  url: string
}

/**
 * 上传单个文件：复用 /infra/file/upload（multipart）。directory 可选，用于后端归类。
 */
export async function uploadFile(
  localPath: string,
  directory?: string,
  auth?: AuthCtx,
): Promise<UploadFileResult> {
  const buf = fs.readFileSync(localPath)
  const name = path.basename(localPath)
  const form = new FormData()
  form.append('file', new Blob([buf], { type: 'application/octet-stream' }), name)
  if (directory) form.append('directory', directory)
  const resp = await fetch(full('/infra/file/upload'), {
    method: 'POST',
    headers: authHeaders(auth),
    body: form,
  })
  const url = await parse<string>(resp)
  return { url }
}

interface PresignedFolder {
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
export async function uploadFolder(
  localDir: string,
  directory?: string,
  auth?: AuthCtx,
): Promise<UploadFolderResult> {
  if (!fs.existsSync(path.join(localDir, 'index.html'))) {
    throw new Error('文件夹必须包含 index.html')
  }
  const name = path.basename(localDir)
  const qs = new URLSearchParams({ name })
  if (directory) qs.set('directory', directory)
  const presignedResp = await fetch(`${full('/infra/file/presigned-url-folder')}?${qs.toString()}`, {
    method: 'GET',
    headers: authHeaders(auth),
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

// ==================== 作品（SPU）读写 ====================

/** 创建教学作品(SPU)，复用 /product/spu/create */
export async function createWork(
  data: Record<string, unknown>,
  auth?: AuthCtx,
): Promise<unknown> {
  return apiPost('/product/spu/create', data, auth)
}

/** 更新教学作品(SPU)，复用 /product/spu/update */
export async function updateWork(
  data: Record<string, unknown>,
  auth?: AuthCtx,
): Promise<unknown> {
  return apiPost('/product/spu/update', data, auth)
}

/** 获取作品明细，复用 /product/spu/get-detail */
export async function getWork(spuId: number, auth?: AuthCtx): Promise<unknown> {
  return apiGet('/product/spu/get-detail', { id: spuId }, auth)
}

/** 我的作品分页（后端按登录用户强制过滤），复用 /product/spu/page?mine=true */
export async function listMyWorks(
  params: { pageNo?: number; pageSize?: number },
  auth?: AuthCtx,
): Promise<unknown> {
  return apiGet('/product/spu/page', { mine: true, ...params }, auth)
}

// ==================== 订单 / 权益 ====================

/** 已购作品分页，复用 /edu/order/purchased-works */
export async function listPurchasedWorks(
  params: { pageNo?: number; pageSize?: number },
  auth?: AuthCtx,
): Promise<unknown> {
  return apiGet('/edu/order/purchased-works', params, auth)
}

/** 作品权益（在线使用/下载 的 已付/已购 数量与金额），复用 /edu/order/rights */
export async function getWorkRights(spuId: number, auth?: AuthCtx): Promise<unknown> {
  return apiGet('/edu/order/rights', { spuId }, auth)
}

/** 订单分页，复用 /trade/order/page（status 可选过滤） */
export async function listOrders(
  params: { pageNo?: number; pageSize?: number; status?: number },
  auth?: AuthCtx,
): Promise<unknown> {
  return apiGet('/trade/order/page', params, auth)
}

/** 订单数量统计（全部/待付款/待发货/待收货/待评价/已完成/已退款/售后），复用 /trade/order/get-count */
export async function getOrderCount(auth?: AuthCtx): Promise<unknown> {
  return apiGet('/trade/order/get-count', {}, auth)
}

/** 订单明细，复用 /trade/order/get-detail（sync 可选，是否同步支付状态） */
export async function getOrderDetail(
  id: number,
  sync?: boolean,
  auth?: AuthCtx,
): Promise<unknown> {
  return apiGet('/trade/order/get-detail', { id, sync }, auth)
}

// ==================== 收益 / 钱包 / 提现 ====================

/** 创作者收益统计（累计/今日/本月、趋势、明细），复用 /edu/statistics/revenue（金额单位：分） */
export async function getRevenue(auth?: AuthCtx): Promise<unknown> {
  return apiGet('/edu/statistics/revenue', {}, auth)
}

/** 钱包余额（可提现金额，单位：分），复用 /edu/order/wallet-balance */
export async function getWalletBalance(auth?: AuthCtx): Promise<unknown> {
  return apiGet('/edu/order/wallet-balance', {}, auth)
}

/** 提现记录分页，复用 /trade/edu-revenue-withdraw/page */
export async function listWithdrawals(
  params: { pageNo?: number; pageSize?: number },
  auth?: AuthCtx,
): Promise<unknown> {
  return apiGet('/trade/edu-revenue-withdraw/page', params, auth)
}

/** 创建提现（高风险写操作，金额单位：分），复用 /trade/edu-revenue-withdraw/create */
export async function createWithdraw(
  data: {
    type: number
    price: number
    userName?: string
    userAccount?: string
    qrCodeUrl?: string
  },
  auth?: AuthCtx,
): Promise<unknown> {
  return apiPost('/trade/edu-revenue-withdraw/create', data, auth)
}

// ==================== 临时分享链接 / 作品数据 ====================

/** 我的临时分享链接分页，复用 /edu/temp-link/my-page */
export async function listTempWorks(
  params: { pageNo?: number; pageSize?: number },
  auth?: AuthCtx,
): Promise<unknown> {
  return apiGet('/edu/temp-link/my-page', params, auth)
}

/** 读取作品 localStorage 数据（按 spuId + ownerKey），复用 /edu/work-data/get */
export async function getWorkData(
  spuId: number,
  ownerKey: string,
  auth?: AuthCtx,
): Promise<unknown> {
  return apiGet('/edu/work-data/get', { spuId, ownerKey }, auth)
}

/** 保存作品 localStorage 数据（存在则更新，不存在则创建），复用 /edu/work-data/save */
export async function saveWorkData(
  data: { spuId: number; ownerKey: string; storageKey: string; data: string },
  auth?: AuthCtx,
): Promise<unknown> {
  return apiPost('/edu/work-data/save', data, auth)
}
