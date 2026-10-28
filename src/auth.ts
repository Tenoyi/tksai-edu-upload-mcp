// MCP 域与后端授权服务器（AS）元数据。
// 设计要点（见改造方案）：AS 放在 Java 后端域，MCP 域只提供 oauth-protected-resource 指向它。

const MCP_BASE = (process.env.MCP_BASE_URL || 'https://mcp.tksai.com').replace(/\/+$/, '')
const AUTH_SERVER = process.env.MCP_AUTH_SERVER || 'https://api.tksai.com'

/** /.well-known/oauth-protected-resource 返回内容 */
export function oauthProtectedResource(): Record<string, unknown> {
  return {
    resource: MCP_BASE,
    authorization_servers: [AUTH_SERVER],
    scopes_supported: ['works.read', 'works.write', 'profile'],
  }
}

/** 无 token 访问 /mcp 时返回的 WWW-Authenticate 头值（指向 protected-resource 元数据） */
export function wwwAuthenticateHeader(): string {
  return `Bearer resource_metadata="${MCP_BASE}/.well-known/oauth-protected-resource"`
}
