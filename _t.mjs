import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
const s = new McpServer({ name: 't', version: '1' }, { capabilities: { tools: {} } })
try {
  s.registerTool('foo', { title:'f', description:'d', inputSchema:{ type:'object', properties:{ path:{type:'string'} }, required:['path'] } }, async()=>({content:[{type:'text',text:'ok'}]}))
  console.log('REGISTER_OK')
} catch(e){ console.log('REGISTER_FAIL ->', e.message) }
