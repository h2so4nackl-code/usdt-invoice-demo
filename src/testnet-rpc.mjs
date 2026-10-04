import { spawn } from 'node:child_process';
import { ValidationError } from './ledger.mjs';

export const TESTNET = Object.freeze({ chainId: 11155111, network: 'eip155:11155111', token: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238', decimals: 6, symbol: 'USDC de test — nu USDt', requiredConfirmations: 3 });
export const READ_METHODS = Object.freeze(['eth_chainId','eth_blockNumber','eth_getCode','eth_call','eth_getTransactionReceipt','eth_getBlockByNumber']);
export function error(code, message) { return new ValidationError(code, message); }
export function address(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw error('ADDRESS','Adresă publică EVM invalidă.');
  return value.toLowerCase();
}
export function hash(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw error('HASH','Hash de tranzacție invalid.');
  return value.toLowerCase();
}
export function quantity(value) {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value) || value.length>66) throw error('RPC_DATA','Date RPC invalide.');
  return BigInt(value);
}

// This bridge is an optional Windows transport, not a system proxy. Endpoint/body travel only on stdin.
const powershellScript = `$ErrorActionPreference='Stop'; try { $job=[Console]::In.ReadToEnd()|ConvertFrom-Json; $reply=Invoke-WebRequest -Uri $job.url -Method Post -ContentType 'application/json' -Body $job.body -TimeoutSec 12 -MaximumRedirection 0; [Console]::Out.Write($reply.Content) } catch { [Console]::Out.Write('{}'); exit 1 }`;
export class ReadOnlyRpc {
  #url; #transport; #id=0;
  constructor({ url='https://ethereum-sepolia-rpc.publicnode.com', transport='fetch' } = {}) {
    let parsed;try{parsed=new URL(url);}catch{throw error('RPC_CONFIG','Configurația RPC este invalidă.');}
    if(parsed.protocol!=='https:' || parsed.username || parsed.password || !parsed.hostname || url.length>2048 || !['fetch','powershell'].includes(transport))throw error('RPC_CONFIG','RPC necesită HTTPS și transport permis, configurat exclusiv pe server.');
    this.#url=url;this.#transport=transport;
  }
  async request({ method, params=[] }) {
    if(!READ_METHODS.includes(method))throw error('RPC_WRITE_DENIED','Metodă RPC interzisă: numai citiri.');
    const id=++this.#id;const body=JSON.stringify({jsonrpc:'2.0',id,method,params});
    try{
      let raw;
      if(this.#transport==='powershell')raw=await new Promise((resolve,reject)=>{
        const child=spawn('pwsh.exe',['-NoProfile','-EncodedCommand',Buffer.from(powershellScript,'utf16le').toString('base64')],{windowsHide:true,stdio:['pipe','pipe','ignore']});
        let bytes=0;const parts=[];const timer=setTimeout(()=>{child.kill();reject(new Error('timeout'));},15000);
        child.on('error',()=>{clearTimeout(timer);reject(new Error('transport'));});
        child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>2_000_000){child.kill();reject(new Error('limit'));}else parts.push(chunk);});
        child.on('close',code=>{clearTimeout(timer);code===0?resolve(Buffer.concat(parts).toString('utf8')):reject(new Error('transport'));});
        child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({url:this.#url,body}));
      });
      else{
        const response=await fetch(this.#url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body,signal:AbortSignal.timeout(12000)});
        if(!response.ok)throw new Error('status');
        const reader=response.body.getReader();const parts=[];let size=0;
        while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000){await reader.cancel();throw new Error('limit');}parts.push(Buffer.from(value));}
        raw=Buffer.concat(parts).toString('utf8');
      }
      const result=JSON.parse(raw);
      if(result.jsonrpc!=='2.0'||result.id!==id||result.error||!Object.hasOwn(result,'result'))throw new Error('response');
      return result.result;
    }catch{throw error('RPC_UNAVAILABLE','Citirea RPC a eșuat. Datele și soldul nu au fost modificate. Endpointul și cheile sunt ascunse.');}
  }
}
