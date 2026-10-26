/**
 * 免安装打包脚本：用 Bun 把 MCP Server 编译为各平台独立可执行文件（小白无需安装 Node.js）。
 *
 * 用法：
 *   npm run build          # 先 tsc 编译
 *   npm run build:bin      # 打包全部平台
 *   npm run build:bin -- --target macos-arm64   # 只打当前平台（本地验证用）
 *
 * 产物在 release/ 下（约 90-116MB/个，内嵌 Bun 运行时，单文件免安装）。
 * 注意：产物不放 dist/——dist/ 是 npm 包内容（仅 JS），二进制只走 GitHub Releases，
 * 否则会把 400MB+ 二进制塞进 npm 包，拖慢所有 npx 用户。
 *   tks-ai-edu-upload-mcp-macos-arm64   (Apple Silicon：M1/M2/M3/M4)
 *   tks-ai-edu-upload-mcp-macos-x64     (Intel 芯片 Mac)
 *   tks-ai-edu-upload-mcp-win-x64.exe   (Windows)
 *   tks-ai-edu-upload-mcp-linux-x64     (Linux)
 *
 * 小白使用时，MCP 配置中的 command 直接指向对应二进制（无需 npx / Node）：
 *   { "type": "stdio", "command": "/path/to/tks-ai-edu-upload-mcp-macos-arm64",
 *     "env": { "EDU_API_BASE": "...", "EDU_API_KEY": "..." } }
 *
 * 说明：曾用 pkg 打包，但其预编译底座不含所需 Node 版本、源码编译在新版
 * macOS SDK 下必失败（Node 18 的 zlib 与系统头冲突），故改用 Bun。
 * Bun 一条命令跨平台产出，无需任何外部底座下载。
 */
import { execSync } from 'node:child_process'
import { mkdirSync, existsSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))
const outDir = join(root, 'release')

// Bun 编译目标（跨平台交叉编译，无需目标平台工具链）
const TARGETS = {
  'macos-arm64': 'bun-darwin-arm64',
  'macos-x64': 'bun-darwin-x64',
  'win-x64': 'bun-windows-x64',
  'linux-x64': 'bun-linux-x64',
}
const OUTPUTS = {
  'macos-arm64': 'tks-ai-edu-upload-mcp-macos-arm64',
  'macos-x64': 'tks-ai-edu-upload-mcp-macos-x64',
  'win-x64': 'tks-ai-edu-upload-mcp-win-x64.exe',
  'linux-x64': 'tks-ai-edu-upload-mcp-linux-x64',
}

// 解析 --target 参数（可多选逗号分隔，缺省为全部）
const args = process.argv.slice(2)
const targetIdx = args.indexOf('--target')
const selected = targetIdx > -1 ? args[targetIdx + 1].split(',') : Object.keys(TARGETS)

if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

for (const name of selected) {
  const target = TARGETS[name]
  if (!target) {
    console.error(`[build:bin] 未知平台: ${name}，可选: ${Object.keys(TARGETS).join(', ')}`)
    process.exit(1)
  }
  const output = join(outDir, OUTPUTS[name])
  console.log(`[build:bin] ${name} (${target}) -> ${output}`)
  execSync(`./node_modules/.bin/bun build --compile --target=${target} ./dist/index.js --outfile ${output}`, {
    stdio: 'inherit',
    cwd: root,
  })
}
console.log('[build:bin] 完成')
