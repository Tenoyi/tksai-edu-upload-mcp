/**
 * 发布脚本：把当前包发布到 npmjs.com（https://registry.npmjs.org/）。
 *
 * 影响 `npx` 用户，是 GitHub Releases / WorkBuddy 的「源头版本号」。
 *
 * 用法：
 *   node scripts/publish-npm.mjs                         # 默认 patch 自增并发布
 *   node scripts/publish-npm.mjs --bump minor            # 自增 minor（功能更新）
 *   node scripts/publish-npm.mjs --bump major            # 自增 major（破坏性更新）
 *   node scripts/publish-npm.mjs --no-bump               # 不改动版本号直接发布（已手动改好 version 时）
 *   node scripts/publish-npm.mjs --bump patch --dry-run  # 只打印将执行的命令，不真正执行
 *
 * 也可通过 package.json 快捷命令调用：
 *   npm run publish:npm                       # 等价默认 patch
 *   npm run publish:npm -- --bump minor
 *
 * 发布流程：
 *   1. 检查 npm 登录态（未登录会提示先 `npm login`）；
 *   2. 自增版本号（patch/minor/major，--no-bump 跳过）；
 *   3. `npm publish`（prepublishOnly 会自动 tsc 重建 dist/ 再上传）；
 *   4. `npm view` 复核已发布版本。
 *
 * 发布内容含 `dist/` 下全部文件、`package.json`、`README.md`（npm 自动携带）。
 * `npx` 用户稍等 npm CDN 同步（几分钟）后即自动拿到新版本，无需手动升级。
 *
 * 何时需要执行：桥接逻辑（src/index.ts）或依赖变动时必须发；仅改后端工具或文档 → 无需发版。
 */
import { execSync } from 'node:child_process'

const args = process.argv.slice(2)

const getOpt = (name, fallback) => {
  const i = args.indexOf(name)
  return i > -1 && args[i + 1] !== undefined ? args[i + 1] : fallback
}
const hasFlag = (name) => args.includes(name)

const bump = getOpt('--bump', 'patch')
const noBump = hasFlag('--no-bump')
const dryRun = hasFlag('--dry-run')
const pkgName = '@tks-ai/edu-upload-mcp'

function run(cmd) {
  if (dryRun) {
    console.log(`[publish:npm] (dry-run) 将执行: ${cmd}`)
    return
  }
  console.log(`[publish:npm] 执行: ${cmd}`)
  execSync(cmd, { stdio: 'inherit' })
}

// 1. 校验登录态
try {
  const whoami = execSync('npm whoami', { encoding: 'utf8' }).trim()
  console.log(`[publish:npm] 已登录 npm: ${whoami}`)
} catch {
  console.error('[publish:npm] 未登录 npm，请先执行 `npm login` 再发布。')
  process.exit(1)
}

// 2. 自增版本号
if (!noBump) {
  if (!['patch', 'minor', 'major'].includes(bump)) {
    console.error(`[publish:npm] 非法 --bump 值: ${bump}（可选 patch/minor/major）`)
    process.exit(1)
  }
  run(`npm version ${bump} --no-git-tag-version`)
}

// 3. 发布（prepublishOnly 会自动构建 dist/）
run('npm publish')

// 4. 复核
try {
  const version = execSync(`npm view ${pkgName} version`, { encoding: 'utf8' }).trim()
  console.log(`[publish:npm] 已发布 ${pkgName}@${version}（稍等 npm CDN 同步几分钟）`)
} catch {
  console.warn('[publish:npm] 无法获取远端版本，请稍后手动 `npm view ' + pkgName + ' version` 复核。')
}
