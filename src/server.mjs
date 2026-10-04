import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ledger, ValidationError } from './ledger.mjs';
import { TestnetStore } from './testnet-store.mjs';
import { WdkReadOnlyVerifier } from './wdk-readonly.mjs';
import { ReadOnlyRpc } from './testnet-rpc.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = new Map([['/', ['index.html','text/html; charset=utf-8']], ['/app.mjs',['app.mjs','text/javascript; charset=utf-8']], ['/styles.css',['styles.css','text/css; charset=utf-8']]]);
export function createApp({ storageFile = null, clock = Date.now, testnet = null } = {}) {
  const state = storageFile && existsSync(storageFile) ? JSON.parse(readFileSync(storageFile, 'utf8')) : undefined;
  const ledger = new Ledger({ state, clock, save: next => {
    if (!storageFile) return;
    mkdirSync(dirname(storageFile), { recursive: true });
    writeFileSync(`${storageFile}.tmp`, JSON.stringify(next, null, 2), { mode: 0o600 });
    renameSync(`${storageFile}.tmp`, storageFile);
  } });
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const json = (code, body) => { response.writeHead(code, {'Content-Type':'application/json; charset=utf-8'}); response.end(JSON.stringify(body)); };
    const port = server.address()?.port;
    const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!allowedHosts.includes(request.headers.host)) { json(403, { error: 'HOST', message: 'Acces permis doar prin adresa locală.' }); return; }
    const testnetRoutes=['/api/testnet/state','/api/testnet/export','/api/testnet/profile','/api/testnet/invoices','/api/testnet/verify','/api/testnet/refresh'];
    if(request.url.startsWith('/api/testnet/')&&!testnet){json(503,{error:'TESTNET_DISABLED',message:'Modul testnet necesită configurarea pe server a destinatarului public. Simularea rămâne disponibilă.'});return;}
    if(testnet&&request.method==='GET'&&request.url==='/api/testnet/state'){json(200,testnet.store.snapshot());return;}
    if(testnet&&request.method==='GET'&&request.url==='/api/testnet/export'){response.setHeader('Content-Disposition','attachment; filename="invoice-testnet-readonly.json"');json(200,{exportVersion:1,...testnet.store.snapshot()});return;}
    if (request.method === 'GET' && request.url === '/api/state') { json(200, ledger.snapshot()); return; }
    if (request.method === 'GET' && request.url === '/api/export') {
      response.setHeader('Content-Disposition', 'attachment; filename="usdt-invoice-simulation.json"');
      json(200, { exportVersion: 1, ...ledger.snapshot() }); return;
    }
    if (request.method === 'GET' && assets.has(request.url)) {
      const [file, type] = assets.get(request.url);
      response.writeHead(200, {'Content-Type':type}); response.end(readFileSync(resolve(root,'public',file))); return;
    }
    if (request.method !== 'POST' || !['/api/invoices','/api/observations',...testnetRoutes.filter(path=>!path.endsWith('/state')&&!path.endsWith('/export'))].includes(request.url)) { json(404, {error:'NOT_FOUND',message:'Resursă inexistentă.'}); return; }
    if (!allowedHosts.map(host => `http://${host}`).includes(request.headers.origin) || request.headers['content-type'] !== 'application/json') { json(403, {error:'ORIGIN',message:'Cerere locală JSON cu origine validă necesară.'}); return; }
    try {
      let size = 0; const chunks = [];
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 16384) { json(413, {error:'BODY_LIMIT',message:'Cerere prea mare.'}); return; }
        chunks.push(chunk);
      }
      let input;
      try {input = JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {json(400,{error:'JSON',message:'JSON invalid.'});return;}
      let result;
      if(request.url==='/api/testnet/invoices')result={invoiceId:testnet.store.createInvoice(input)};
      else if(request.url==='/api/testnet/verify')result=await testnet.store.verify(testnet.verifier,input);
      else if(request.url==='/api/testnet/refresh'||request.url==='/api/testnet/profile'){
        if(!input||Array.isArray(input)||Object.keys(input).length){json(400,{error:'FIELDS',message:'Nu se acceptă configurații RPC din interfață.'});return;}
        result=request.url.endsWith('/refresh')?await testnet.store.refresh(testnet.verifier):await testnet.verifier.profile();
      }else result=request.url === '/api/invoices' ? { invoiceId: ledger.createInvoice(input) } : ledger.observe(input);
      json(200, { ok:true, ...result });
    } catch (error) {
      if (error instanceof ValidationError) json(400, {error:error.code,message:error.message});
      else json(500, {error:'STORAGE',message:'Operația nu a fost salvată. Detaliile interne sunt ascunse.'});
    }
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000;
  server.on('close',()=>testnet?.store.close());
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if(existsSync(resolve(root,'.env')))process.loadEnvFile(resolve(root,'.env'));
  const port = Number(process.env.PORT ?? '4318');
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error('PORT invalid (1024–65535).');
  let testnet=null;
  try{
    if(process.env.WDK_RECIPIENT){
      const recipient=process.env.WDK_RECIPIENT;
      const rpc=new ReadOnlyRpc({url:process.env.WDK_RPC_URL,transport:process.env.WDK_RPC_TRANSPORT??'fetch'});
      testnet={store:new TestnetStore({file:resolve(root,'data','testnet.sqlite'),recipient}),verifier:new WdkReadOnlyVerifier({rpc,recipient})};
    }
  }catch{console.error('Configurația/stocarea testnet este invalidă. Nicio cheie sau adresă RPC nu este afișată.');process.exit(1);}
  const server = createApp({ storageFile: resolve(root, 'data', 'ledger.json'),testnet });
  server.on('error', () => { console.error('Serverul nu poate porni. Verifică dacă portul local este deja ocupat.'); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`SIMULARE implicită; WDK testnet read-only ${testnet?'configurat':'opțional/neconfigurat'}. Fără semnare sau fonduri reale. http://127.0.0.1:${port}`));
}
