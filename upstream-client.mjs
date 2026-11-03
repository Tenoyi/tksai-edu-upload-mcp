// Direct Streamable-HTTP MCP client to the 智教坊 upstream (bypass the stdio bridge).
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { readFileSync } from 'node:fs';

const UPSTREAM = process.env.EDU_MCP_URL || 'https://edu.tksai.com/app-api/mcp';
const tokFile = '/Users/zhaoyong/.tks-edu/oauth-token.json';
const token = JSON.parse(readFileSync(tokFile)).access_token;
const transport = new StreamableHTTPClientTransport(new URL(UPSTREAM), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: 'workbuddy-upstream', version: '1.0' }, { capabilities: {} });
await client.connect(transport);

const method = process.argv[2];
const arg = process.argv[3];
let res;
if (method === 'tools/list') {
  res = await client.listTools();
  const names = (res.tools || []).map((t) => ({ name: t.name, desc: (t.description || '').slice(0, 60) }));
  console.log(JSON.stringify(names, null, 2));
} else if (method === 'tools/call') {
  const req = JSON.parse(arg);
  res = await client.callTool({ name: req.name, arguments: req.arguments || {} });
  console.log(JSON.stringify(res, null, 2));
} else {
  throw new Error('unknown method ' + method);
}
await client.close();
