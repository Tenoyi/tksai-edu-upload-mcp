# 打包与发布脚本

本目录收录 `@tks-ai/edu-upload-mcp` 的三种分发产物的打包 / 发布脚本，三者互不自动同步、需分别执行、且版本号保持一致（见下文）。

| 脚本 | 用途 | 产物 |
|---|---|---|
| `build-binary.mjs` | 用 Bun 编译各平台免安装可执行文件 | `release/` 下 4 个二进制（GitHub Releases 分发） |
| `publish-npm.mjs` | 发布到 npmjs.com | npm 上的 `@tks-ai/edu-upload-mcp`（npx 分发） |
| `pack-workbuddy.py` | 把连接器目录压缩为 zip | `workbuddy/tksai-edu-upload-connector.zip`（WorkBuddy 市场分发） |

> 统一约定：三处使用**同一版本号**（如改动后 bump 到 `2.0.1`）。GitHub tag 沿用不带 `v` 前缀的历史命名。

---

## 1. 打包二进制（build-binary.mjs）

把 MCP Server 编译为各平台单文件可执行程序，小白无需安装 Node.js，MCP 配置的 `command` 直接指向二进制即可。

```bash
# 打包全部 4 个平台到 release/
node scripts/build-binary.mjs

# 只打当前平台（本地验证用）
node scripts/build-binary.mjs --target macos-arm64

# 多平台（逗号分隔）
node scripts/build-binary.mjs --target macos-arm64,win-x64

# 等价快捷命令（package.json）
npm run build:bin
npm run build:bin -- --target macos-arm64
```

产物（`release/`，约 400MB，已被 .gitignore 忽略，勿提交仓库）：

| 平台 | 文件 |
|---|---|
| macOS arm64 | `tksai-edu-upload-mcp-macos-arm64` |
| macOS x64 | `tksai-edu-upload-mcp-macos-x64` |
| Windows x64 | `tksai-edu-upload-mcp-win-x64.exe` |
| Linux x64 | `tksai-edu-upload-mcp-linux-x64` |

前置：本机已安装 `bun`（devDependency，随 `npm install` 安装）。

打包后到 GitHub 建 Release 并上传这 4 个文件：

- Web：打开 `https://github.com/Tenoyi/tksai-edu-upload-mcp/releases` → Draft a new release → Tag 填 `2.0.x`（与 npm 版本一致）→ 把 `release/` 下 4 个文件作为 assets 上传 → Publish。
- CLI（需 `brew install gh` 并 `gh auth login`）：`gh release create 2.0.x release/* --title "2.0.x"`。

> 发布后务必把顶层 `README.md`「方式三」下载表格里的链接版本号（写死处）改成新 tag，否则新用户会下载到旧版二进制。

---

## 2. 发布 npmjs.com（publish-npm.mjs）

影响 `npx` 用户，是其它分发渠道的「源头版本号」。

```bash
# 默认 patch 自增并发布
node scripts/publish-npm.mjs

# 自增 minor / major
node scripts/publish-npm.mjs --bump minor
node scripts/publish-npm.mjs --bump major

# 已手动改好 version，直接发布（不改动版本号）
node scripts/publish-npm.mjs --no-bump

# 只打印将执行的命令，不真正执行
node scripts/publish-npm.mjs --bump patch --dry-run

# 等价快捷命令（package.json）
npm run publish:npm
npm run publish:npm -- --bump minor
```

脚本流程：校验 `npm whoami` 登录态 →（可选）自增版本号 → `npm publish`（prepublishOnly 自动 `tsc` 重建 dist）→ `npm view` 复核。

发布内容仅含 `dist/index.js`、`package.json`、`README.md`（npm 自动携带）。`npx` 用户稍等 npm CDN 同步几分钟即自动拿到新版本。

---

## 3. 打包 WorkBuddy zip（pack-workbuddy.py）

把连接器目录压缩为 zip，供上传到 WorkBuddy 开放平台连接器市场。

```bash
# 产出 workbuddy/tksai-edu-upload-connector.zip
python3 scripts/pack-workbuddy.py

# 等价快捷命令（package.json）
npm run pack:workbuddy
```

> 打包前先把 `workbuddy/connector/connector-meta.json` 的 `version` 改为本次版本号，使市场版本与 npm 对齐。

随后登录 WorkBuddy 开放平台后台 → 连接器市场 → 上传/更新对应连接器，审核通过后上架。

提交前自检：包内结构与文件齐全、无 `._` 冗余条目；`mcp.json` 指向 `https://edu.tksai.com/app-api/mcp`（HTTPS、各仅一个 server）；两个 `connector-meta.json` 的 `version` 与本次 npm 版本一致。

---

## 推荐发布顺序（保证三端一致）

1. 改 Java 后端工具 → 部署后端（桥接与连接器自动同步，无需重发）；
2. 若涉及桥接逻辑：`npm run publish:npm`（或手动 `npm version patch --no-git-tag-version` + `npm publish`）→ 得到版本号（如 `2.0.1`）；
3. `node scripts/build-binary.mjs` → GitHub 建 `2.0.1` Release，上传 4 个二进制；
4. 把 `workbuddy/connector/connector-meta.json` 的 `version` 改为 `2.0.1` → `python3 scripts/pack-workbuddy.py` → 上传 WorkBuddy；
5. 更新顶层 `README.md`「方式三」下载表格链接版本号为 `2.0.1`。

按此顺序，`npx` 用户、下载版用户、市场用户三者拿到的逻辑完全一致，且都以 Java 后端为准。
