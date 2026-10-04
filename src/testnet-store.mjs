import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseAmount,formatAmount } from './ledger.mjs';
import { TESTNET,address,error,hash } from './testnet-rpc.mjs';

export class TestnetStore {
  #db; #profile; #clock; #queue=Promise.resolve();
  constructor({file=':memory:',recipient,clock=Date.now}){
    this.#profile={...TESTNET,recipient:address(recipient),readOnly:true};this.#clock=clock;
    if(file!==':memory:')mkdirSync(dirname(file),{recursive:true});
    this.#db=new DatabaseSync(file);
    this.#db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS profile(id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS invoices(id TEXT PRIMARY KEY, number TEXT UNIQUE, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events(key TEXT PRIMARY KEY, invoiceId TEXT NOT NULL REFERENCES invoices(id), transactionHash TEXT NOT NULL, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS journal(id INTEGER PRIMARY KEY, payload TEXT NOT NULL);');
    const saved=this.#db.prepare('SELECT payload FROM profile WHERE id=1').get();
    if(saved&&saved.payload!==JSON.stringify(this.#profile)){this.#db.close();throw error('PROFILE_STORAGE','Stocarea testnet aparține altui profil.');}
    if(!saved)this.#db.prepare('INSERT INTO profile VALUES(1,?)').run(JSON.stringify(this.#profile));
  }
  close(){this.#db.close();}
  #transaction(action){this.#db.exec('BEGIN IMMEDIATE');try{const result=action();this.#db.exec('COMMIT');return result;}catch(problem){this.#db.exec('ROLLBACK');throw problem;}}
  #journal(event,detail){if(this.#db.prepare('SELECT COUNT(*) AS n FROM journal').get().n>=10000)throw error('CAPACITY','Limita jurnalului testnet a fost atinsă.');this.#db.prepare('INSERT INTO journal(payload) VALUES(?)').run(JSON.stringify({event,timestamp:new Date(this.#clock()).toISOString(),...detail}));}
  createInvoice(input){
    if(!input||Object.keys(input).sort().join(',')!=='amount,client,expiresAt,validFrom'||typeof input.client!=='string'||!input.client.trim()||input.client.length>100||/[\u0000-\u001f]/.test(input.client))throw error('INVOICE','Factură testnet invalidă.');
    const amountUnits=parseAmount(input.amount).toString();
    for(const key of ['validFrom','expiresAt'])if(typeof input[key]!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input[key])||!Number.isFinite(Date.parse(input[key]))||new Date(input[key]).toISOString()!==input[key])throw error('EXPIRY','Interval testnet invalid.');
    if(Date.parse(input.expiresAt)<=Date.parse(input.validFrom))throw error('EXPIRY','Sfârșitul trebuie să fie după începutul intervalului.');
    return this.#transaction(()=>{
      const count=this.#db.prepare('SELECT COUNT(*) AS n FROM invoices').get().n;if(count>=500)throw error('CAPACITY','Limita facturilor testnet a fost atinsă.');
      const invoice={id:randomUUID(),number:`TEST-${String(count+1).padStart(4,'0')}`,client:input.client.trim(),amountUnits,validFrom:input.validFrom,expiresAt:input.expiresAt,createdAt:new Date(this.#clock()).toISOString()};
      this.#db.prepare('INSERT INTO invoices VALUES(?,?,?)').run(invoice.id,invoice.number,JSON.stringify(invoice));
      this.#journal('INVOICE_CREATED',{invoiceId:invoice.id,invoiceNumber:invoice.number});return invoice.id;
    });
  }
  verify(verifier,input){
    const operation=this.#queue.then(()=>this.#verify(verifier,input));
    this.#queue=operation.catch(()=>{});return operation;
  }
  async #verify(verifier,input){
    if(!input||Object.keys(input).sort().join(',')!=='invoiceId,logIndex,transactionHash'||typeof input.invoiceId!=='string'||!Number.isSafeInteger(input.logIndex)||input.logIndex<0||input.logIndex>1000000)throw error('COMMAND','Alege explicit factura, hash-ul și logIndex.');
    hash(input.transactionHash);
    if(!this.#db.prepare('SELECT id FROM invoices WHERE id=?').get(input.invoiceId))throw error('INVOICE_UNKNOWN','Factura testnet nu există.');
    const result=await verifier.inspect(input.transactionHash);
    return this.#apply(result,input);
  }
  #apply(result,input){
    if(result.profile.chainId!==this.#profile.chainId||result.profile.token!==this.#profile.token||address(result.profile.recipient)!==this.#profile.recipient)throw error('PROFILE','Profil de verificare invalid.');
    const selected=result.events.find(event=>event.logIndex===input.logIndex);
    const previous=this.#db.prepare('SELECT * FROM events WHERE transactionHash=?').all(result.transactionHash);
    if(!selected&&!previous.length)throw error('EVENT_UNAVAILABLE','Receipt eșuat/lipsă sau niciun Transfer valid pentru token, destinatar și logIndex.');
    return this.#transaction(()=>{
      // An event key stays reserved to its first explicitly chosen invoice even after a reorganization.
      if(selected){const owner=this.#db.prepare('SELECT invoiceId FROM events WHERE key=?').get(selected.key);if(owner&&owner.invoiceId!==input.invoiceId)throw error('DUPLICATE_ASSIGNMENT','Evenimentul aparține deja altei facturi.');}
      let changed=false;
      for(const row of previous){
        const old=JSON.parse(row.payload);const current=result.events.find(event=>event.key===row.key);
        const next=current?{...current,canonical:true}:{...old,canonical:false,confirmations:0};
        if(JSON.stringify(old)!==JSON.stringify(next)){this.#db.prepare('UPDATE events SET payload=? WHERE key=?').run(JSON.stringify(next),row.key);this.#journal(current?'CONFIRMATIONS_UPDATED':'CREDIT_REVOKED',{invoiceId:row.invoiceId,key:row.key,reason:result.state,previousConfirmations:old.confirmations,confirmations:next.confirmations});changed=true;}
      }
      if(selected&&!this.#db.prepare('SELECT key FROM events WHERE key=?').get(selected.key)){
        if(this.#db.prepare('SELECT COUNT(*) AS n FROM events').get().n>=2000)throw error('CAPACITY','Limita evenimentelor testnet a fost atinsă.');
        const payload={...selected,canonical:true};this.#db.prepare('INSERT INTO events VALUES(?,?,?,?)').run(selected.key,input.invoiceId,result.transactionHash,JSON.stringify(payload));this.#journal('PAYMENT_VERIFIED',{invoiceId:input.invoiceId,key:selected.key});changed=true;
      }
      return {ok:true,duplicate:!changed,state:result.state,creditRevoked:!selected,wdk:result.profile};
    });
  }
  async refresh(verifier){
    const rows=this.#db.prepare('SELECT transactionHash,invoiceId,payload FROM events GROUP BY transactionHash').all();
    if(rows.length>20)throw error('CAPACITY','Reverifică individual: maximum 20 tranzacții per refresh.');
    let verified=0;for(const row of rows){await this.verify(verifier,{invoiceId:row.invoiceId,transactionHash:row.transactionHash,logIndex:JSON.parse(row.payload).logIndex});verified++;}return {ok:true,verified};
  }
  snapshot(){
    return this.#transaction(()=>{
      const rows=this.#db.prepare('SELECT * FROM events ORDER BY rowid').all();
      const observations=rows.map(row=>({...JSON.parse(row.payload),invoiceId:row.invoiceId,transactionId:row.key}));
      const invoices=this.#db.prepare('SELECT payload FROM invoices ORDER BY rowid').all().map(row=>{
        const invoice=JSON.parse(row.payload);const own=observations.filter(event=>event.invoiceId===invoice.id);
        const eligible=own.filter(event=>event.canonical&&Date.parse(event.blockTimestamp)>=Date.parse(invoice.validFrom)&&Date.parse(event.blockTimestamp)<Date.parse(invoice.expiresAt));
        const confirmed=eligible.filter(event=>event.confirmations>=TESTNET.requiredConfirmations).reduce((sum,event)=>sum+BigInt(event.amountUnits),0n);
        const total=eligible.reduce((sum,event)=>sum+BigInt(event.amountUnits),0n);const amount=BigInt(invoice.amountUnits);
        return {...invoice,amount:formatAmount(amount),confirmed:formatAmount(confirmed),pending:formatAmount(total-confirmed),remaining:formatAmount(amount>confirmed?amount-confirmed:0n),excess:formatAmount(confirmed>amount?confirmed-amount:0n),status:confirmed>=amount?'paid':this.#clock()>=Date.parse(invoice.expiresAt)?'expired':confirmed>0n?'partial':total>0n?'confirming':'pending',observations:own.map(event=>({...event,eligible:eligible.some(item=>item.key===event.key)}))};
      });
      const journal=this.#db.prepare('SELECT payload FROM journal ORDER BY id').all().map(row=>JSON.parse(row.payload));
      return {schemaVersion:1,mode:'testnet',simulation:false,readOnly:true,profile:{...this.#profile,asset:TESTNET.symbol},invoices,observations,journal,generatedAt:new Date(this.#clock()).toISOString()};
    });
  }
}
