import { writeFileSync,mkdirSync } from 'node:fs';
import { ReadOnlyRpc } from '../src/testnet-rpc.mjs';
import { WdkReadOnlyVerifier } from '../src/wdk-readonly.mjs';
import { TestnetStore } from '../src/testnet-store.mjs';
import { formatAmount } from '../src/ledger.mjs';

const transactionHash='0x995f95f890140017d7c8a99c32a9eb275f64a68695fe9fff0eab974e5fdb685a';
const recipient='0xe969a25b358325cd9db8fbdfc68e19f6b1709fcd';
const logIndex=4;
mkdirSync('evidence/wdk',{recursive:true});
let store;
try{
  const rpc=new ReadOnlyRpc({url:process.env.WDK_RPC_URL,transport:process.env.WDK_RPC_TRANSPORT??'fetch'});
  const verifier=new WdkReadOnlyVerifier({rpc,recipient});
  const inspected=await verifier.inspect(transactionHash);
  const event=inspected.events.find(item=>item.logIndex===logIndex);
  if(!event)throw new Error('no matching event');
  store=new TestnetStore({recipient});
  const time=Date.parse(event.blockTimestamp);
  const invoiceId=store.createInvoice({client:'Demonstrație istorică — adresă publică terță',amount:formatAmount(BigInt(event.amountUnits)),validFrom:new Date(time-1000).toISOString(),expiresAt:new Date(time+3600000).toISOString()});
  await store.verify(verifier,{invoiceId,transactionHash,logIndex});
  await store.verify(verifier,{invoiceId,transactionHash,logIndex});
  const invoice=store.snapshot().invoices[0];
  if(invoice.confirmed!==formatAmount(BigInt(event.amountUnits))||invoice.observations.length!==1||invoice.status!=='paid')throw new Error('reconciliation mismatch');
  const evidence={status:'PASS',checkedAt:new Date().toISOString(),source:'Existing public Sepolia transfer; read only, no ownership or historical invoice claim',explorer:`https://eth-sepolia.blockscout.com/tx/${transactionHash}`,profile:inspected.profile,event,invoice,mainnet:false,signatures:0,broadcasts:0,realFunds:0};
  writeFileSync('evidence/wdk/live.json',JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({status:'PASS',transactionHash,logIndex,chainId:inspected.profile.chainId,blockTimestamp:event.blockTimestamp,confirmations:event.confirmations,amountUnits:event.amountUnits,wdk:inspected.profile.wdkVersion}));
}catch{
  writeFileSync('evidence/wdk/live.json',JSON.stringify({status:'BLOCKED',checkedAt:new Date().toISOString(),reason:'RPC unavailable or historical public event cannot be verified. No fabricated data.',mainnet:false,signatures:0,broadcasts:0}));
  console.error('TESTNET LIVE BLOCKED: verificarea RPC/evenimentului public a eșuat; detaliile și endpointul sunt ascunse.');process.exitCode=1;
}finally{store?.close();}
