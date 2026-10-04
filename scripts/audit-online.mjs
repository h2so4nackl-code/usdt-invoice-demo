// Project-only bridge for npm audit when Node outbound TLS is unavailable.
// Accept only the documented advisory POST; never forward credentials or arbitrary URLs.
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
if (!process.env.npm_execpath) throw new Error('Run through npm run audit:online');
mkdirSync('.npm-downloads', { recursive: true });
mkdirSync('evidence/integration', { recursive: true });
let requests = 0;
const server = createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/-/npm/v1/security/advisories/bulk') { res.writeHead(404); res.end('{}'); return; }
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    chunks.push(chunk); size += chunk.length;
    if (size > 1048576) { res.writeHead(413); res.end('{}'); return; }
  }
  try {
    const compressed = Buffer.concat(chunks);
    const body = (req.headers['content-encoding'] === 'gzip' ? gunzipSync(compressed, { maxOutputLength: 1048576 }) : compressed).toString('utf8');
    const data = JSON.parse(body);
    if (!Object.entries(data).every(([name, versions]) => /^(@[a-z0-9-]+\/)?[a-z0-9._-]+$/.test(name) && Array.isArray(versions) && versions.every(v => typeof v === 'string' && /^[0-9a-zA-Z.+-]+$/.test(v)))) throw new Error('Invalid advisory body');
    const id = requests++;
    const input = resolve('.npm-downloads', `audit-body-${id}.json`);
    const output = resolve('.npm-downloads', `audit-response-${id}.json`);
    writeFileSync(input, body);
    const quote = value => `'${value.replaceAll("'", "''")}'`;
    const command = `$ErrorActionPreference='Stop'; Invoke-WebRequest -Method Post -Uri 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk' -ContentType 'application/json' -InFile ${quote(input)} -OutFile ${quote(output)} -TimeoutSec 30 -MaximumRedirection 0`;
    const result = spawnSync('pwsh.exe', ['-NoProfile', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], { encoding: 'utf8', timeout: 40000 });
    if (result.status !== 0) throw new Error('Advisory transport unavailable');
    const bytes = readFileSync(output);
    JSON.parse(bytes);
    writeFileSync(`evidence/integration/advisory-bulk-${id}.json`, bytes);
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(bytes);
  } catch { res.writeHead(503); res.end('{}'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  for (const [label, prefix] of [['root', '.']]) {
    const args = [process.env.npm_execpath, 'audit', '--prefix', prefix, '--json', '--registry', `http://127.0.0.1:${server.address().port}`, '--fetch-retries=0', '--fetch-timeout=45000'];
    const result = await new Promise(resolve => {
      const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = ''; let stderr = '';
      child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
      child.on('close', code => resolve({ code, stdout, stderr }));
    });
    writeFileSync(`evidence/integration/npm-audit-${label}.json`, result.stdout);
    writeFileSync(`evidence/integration/npm-audit-${label}.txt`, result.stderr);
    console.log(`${label} npm audit exit ${result.code}`);
    if (result.code !== 0) process.exitCode = 1;
  }
} finally { await new Promise(resolve => server.close(resolve)); }
