import fs from 'node:fs';
const home = process.env.HOME;
const tok = JSON.parse(fs.readFileSync(home + '/.tks-edu/oauth-token.json', 'utf8'));
const token = tok.access_token;
const base = (process.env.EDU_API_BASE || 'https://edu.tksai.com/app-api').replace(/\/+$/, '');

async function getDict(type) {
  const url = `${base}/system/dict-data/type?type=${encodeURIComponent(type)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  console.log(`[${type}] status=${res.status}`);
  const txt = await res.text();
  console.log(txt.slice(0, 800));
}

await getDict('subjects');
