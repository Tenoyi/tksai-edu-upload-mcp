import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  uploadFile,
  uploadFolder,
  createWork,
  updateWork,
  getWork,
  listMyWorks,
  listPurchasedWorks,
  getWorkRights,
  listOrders,
  getOrderCount,
  getOrderDetail,
  getRevenue,
  getWalletBalance,
  listWithdrawals,
  createWithdraw,
  listTempWorks,
  getWorkData,
  saveWorkData,
  type AuthCtx,
} from './eduClient.js'

const PAGE = z.object({
  pageNo: z.number().int().min(1).default(1).describe('页码，从 1 开始'),
  pageSize: z.number().int().min(1).max(20).default(10).describe('每页条数，最大 20（防止上下文膨胀）'),
})

/** 统一把后端返回结果序列化为工具文本 */
function ok(result: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
}

/**
 * 注册全部 MCP 工具。
 *
 * auth 来自当前连接上下文：
 * - stdio 模式：环境变量 EDU_API_KEY（与 tenant-id）
 * - streamableHttp 模式：调用方在 /mcp 请求里透传的 Bearer（OAuth token 或 tksai_ API Key）+ tenant-id
 * 工具内部据此向后端 /app-api 发起鉴权调用。
 */
export function registerTools(server: McpServer, auth: AuthCtx): void {
  // ============ 上传 ============
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
    async ({ localPath, directory }) => ok(await uploadFile(localPath, directory, auth)),
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
    async ({ localDir, directory }) => ok(await uploadFolder(localDir, directory, auth)),
  )

  // ============ 作品（SPU）读写 ============
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
    async (args) => ok(await createWork(args, auth)),
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
    async (args) => ok(await updateWork(args, auth)),
  )

  server.registerTool(
    'get_work',
    {
      title: '获取作品明细',
      description: '按 spuId 获取教学作品(SPU)明细（公开端点，含名称/简介/价格/封面/内容 URL 等）。',
      inputSchema: { spuId: z.number().describe('作品编号') },
    },
    async ({ spuId }) => ok(await getWork(spuId, auth)),
  )

  server.registerTool(
    'list_my_works',
    {
      title: '我的作品列表（分页）',
      description: '分页获取当前创作者的教学作品列表（后端按登录用户过滤）。金额单位：分。',
      inputSchema: PAGE,
    },
    async ({ pageNo, pageSize }) => ok(await listMyWorks({ pageNo, pageSize }, auth)),
  )

  // ============ 订单 / 权益 ============
  server.registerTool(
    'list_purchased_works',
    {
      title: '已购作品列表（分页）',
      description: '分页获取当前用户已购买的教学作品。',
      inputSchema: PAGE,
    },
    async ({ pageNo, pageSize }) => ok(await listPurchasedWorks({ pageNo, pageSize }, auth)),
  )

  server.registerTool(
    'get_work_rights',
    {
      title: '作品权益',
      description:
        '获取某作品的权益统计：在线使用/下载 的 已付(usePaid/downloadPaid) 与 已购数量(useAmount/downloadAmount)。',
      inputSchema: { spuId: z.number().describe('作品编号') },
    },
    async ({ spuId }) => ok(await getWorkRights(spuId, auth)),
  )

  server.registerTool(
    'list_orders',
    {
      title: '订单列表（分页）',
      description: '分页获取当前用户的交易订单。status 可选（订单状态过滤）。金额单位：分。',
      inputSchema: {
        ...PAGE.shape,
        status: z.number().optional().describe('订单状态：0待付款 10待发货 20待收货 30待评价 40已完成 50已退款'),
      },
    },
    async ({ pageNo, pageSize, status }) => ok(await listOrders({ pageNo, pageSize, status }, auth)),
  )

  server.registerTool(
    'get_order_count',
    {
      title: '订单数量统计',
      description:
        '返回各状态订单数量：all / unpaid / undelivered / unreceived / uncommented / completed / refund / afterSale。',
      inputSchema: {},
    },
    async () => ok(await getOrderCount(auth)),
  )

  server.registerTool(
    'get_order_detail',
    {
      title: '订单明细',
      description: '按订单 id 获取交易订单明细。sync 可选，true 时同步支付状态。',
      inputSchema: {
        id: z.number().describe('订单编号'),
        sync: z.boolean().optional().describe('是否同步支付状态（仅支付类订单有效）'),
      },
    },
    async ({ id, sync }) => ok(await getOrderDetail(id, sync, auth)),
  )

  // ============ 收益 / 钱包 / 提现 ============
  server.registerTool(
    'get_revenue',
    {
      title: '收益概览',
      description:
        '创作者收益统计：totalRevenue(累计) / todayRevenue(今日) / monthRevenue(本月) / orderCount / trend(趋势) / details(明细)。金额单位：分。',
      inputSchema: {},
    },
    async () => ok(await getRevenue(auth)),
  )

  server.registerTool(
    'get_wallet_balance',
    {
      title: '钱包余额',
      description: '获取可提现钱包余额，单位：分。',
      inputSchema: {},
    },
    async () => ok(await getWalletBalance(auth)),
  )

  server.registerTool(
    'list_withdrawals',
    {
      title: '提现记录（分页）',
      description: '分页获取当前用户的收益提现记录。',
      inputSchema: PAGE,
    },
    async ({ pageNo, pageSize }) => ok(await listWithdrawals({ pageNo, pageSize }, auth)),
  )

  server.registerTool(
    'create_withdraw',
    {
      title: '创建提现（高风险）',
      description:
        '⚠️ 高风险写操作：会发起一笔真实收益提现。执行前必须向用户复述 type/price/账号 并等待其明确确认；price 单位：分。\n' +
        'type：1=微信 2=支付宝 3=银行卡；price：提现金额（分，≥1）；userName/userAccount/qrCodeUrl 按 type 选填。',
      inputSchema: {
        type: z.number().int().min(1).max(3).describe('提现类型：1=微信 2=支付宝 3=银行卡'),
        price: z.number().int().min(1).describe('提现金额，单位：分，≥1'),
        userName: z.string().optional().describe('提现姓名（银行卡/实名建议填）'),
        userAccount: z.string().optional().describe('提现账号'),
        qrCodeUrl: z.string().optional().describe('收款码图片 URL'),
      },
    },
    async (args) => ok(await createWithdraw(args, auth)),
  )

  // ============ 临时分享 / 作品数据 ============
  server.registerTool(
    'list_temp_works',
    {
      title: '我的临时分享链接（分页）',
      description: '分页获取当前用户创建的临时分享链接（含访问次数/有效期等）。',
      inputSchema: PAGE,
    },
    async ({ pageNo, pageSize }) => ok(await listTempWorks({ pageNo, pageSize }, auth)),
  )

  server.registerTool(
    'get_work_data',
    {
      title: '读取作品数据',
      description: '按 spuId + ownerKey 读取作品内 localStorage 数据（用于作品跨端持久化）。',
      inputSchema: {
        spuId: z.number().describe('作品编号'),
        ownerKey: z.string().describe('数据归属键（如用户标识）'),
      },
    },
    async ({ spuId, ownerKey }) => ok(await getWorkData(spuId, ownerKey, auth)),
  )

  server.registerTool(
    'save_work_data',
    {
      title: '保存作品数据',
      description: '保存作品内 localStorage 数据（存在则更新，不存在则创建）。storageKey 为存储键，data 为字符串值。',
      inputSchema: {
        spuId: z.number().describe('作品编号'),
        ownerKey: z.string().describe('数据归属键'),
        storageKey: z.string().describe('存储键'),
        data: z.string().describe('数据值（字符串，可放 JSON）'),
      },
    },
    async (args) => ok(await saveWorkData(args, auth)),
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
        '5. 工具：upload_file / upload_folder / create_work / update_work / get_work / list_my_works / list_purchased_works / get_work_rights / list_orders / get_order_count / get_order_detail / get_revenue / get_wallet_balance / list_withdrawals / create_withdraw（高风险）/ list_temp_works / get_work_data / save_work_data。\n' +
        '6. WorkBuddy 接入：env 必须用 ${VAR} 占位符（EDU_API_BASE / EDU_API_KEY），真实值在 WorkBuddy 密钥管理中填，禁止写进配置。\n' +
        '7. 鉴权方式：Server 自动以 Authorization: Bearer <EDU_API_KEY> 调用后端，不要在配置里写 X-Api-Key 请求头（后端不认，会 401）。\n' +
        '8. 远程模式（streamableHttp）：MCP_TRANSPORT=http 启动，客户端在连接 /mcp 时携带 Authorization: Bearer <OAuth token 或 tksai_ API Key>，缺 token 返回 401 并提示 /.well-known/oauth-protected-resource。'
      return { content: [{ type: 'text', text }] }
    },
  )
}
