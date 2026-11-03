import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import fs from 'node:fs';

const home = process.env.HOME;
const tok = JSON.parse(fs.readFileSync(home + '/.tks-edu/oauth-token.json', 'utf8'));
const token = tok.access_token;
console.log('token expires_in_ms:', tok.expires_at - Date.now());
console.log('token scope:', tok.scope);

const url = (process.env.EDU_MCP_URL || 'https://edu.tksai.com/app-api/mcp').replace(/\/+$/, '');
console.log('upstream url:', url);

const transport = new StreamableHTTPClientTransport(new URL(url), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: 'diag', version: '1.0.0' }, { capabilities: {} });

try {
  await client.connect(transport);
  console.log('CONNECT: ok');
  const res = await client.listTools();
  console.log('UPSTREAM TOOLS:', JSON.stringify(res.tools.map((t) => t.name)));
  try {
    const r2 = await client.callTool({ name: 'get_dict_options', arguments: { dictType: 'subjects' } });
    console.log('get_dict_options OK:', JSON.stringify(r2).slice(0, 600));
  } catch (e) {
    console.log('get_dict_options ERR:', e.message);
  }
} catch (e) {
  console.log('CONNECT ERR:', e.message);
}
