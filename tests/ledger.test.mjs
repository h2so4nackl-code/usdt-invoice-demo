import test from 'node:test';
import assert from 'node:assert/strict';
import { Ledger, PROFILE, parseAmount, formatAmount } from '../src/ledger.mjs';
function setup(amount='100') {
  let now=Date.parse('2026-10-04T10:00:00.000Z');
  const ledger=new Ledger({clock:()=>now});
  const id=ledger.createInvoice({client:'Client sintetic',amount,expiresAt:'2026-10-04T11:00:00.000Z'});
  const pay=(overrides={})=>ledger.observe({invoiceId:id,transactionId:'sim-001',amount:'40',confirmations:3,network:PROFILE.network,token:PROFILE.token,recipient:PROFILE.recipient,...overrides});
  return {ledger,id,pay,invoice:()=>ledger.snapshot().invoices[0],advance:()=>{now+=3600001;}};
}
test('maximum 6 decimals and exact BigInt arithmetic',()=>{
  assert.equal(parseAmount('0.000001'),1n);
  assert.equal(parseAmount('999999999999999999.999999'),999999999999999999999999n);
  assert.equal(formatAmount(parseAmount('0.1')+parseAmount('0.2')),'0.300000');
});
for(const amount of ['0','-1','1.0000001','1e6',' 1','1 ','1,2','01','NaN','Infinity','.5','1.','1000000000000000000',1,null])test(`invalid amount ${String(amount)} rejected`,()=>assert.throws(()=>parseAmount(amount)));
test('new invoice pending and independent snapshot',()=>{const {ledger,invoice}=setup();assert.equal(invoice().status,'pending');ledger.snapshot().invoices[0].client='mutated';assert.equal(invoice().client,'Client sintetic');});
test('observed unconfirmed payment does not reduce remaining',()=>{const {pay,invoice}=setup();pay({confirmations:2});assert.equal(invoice().status,'confirming');assert.equal(invoice().remaining,'100.000000');assert.equal(invoice().pending,'40.000000');});
test('partial then fully paid with independent transactions',()=>{const {pay,invoice}=setup();pay();assert.equal(invoice().status,'partial');assert.equal(invoice().remaining,'60.000000');pay({transactionId:'sim-002',amount:'60'});assert.equal(invoice().status,'paid');});
test('overpayment tracked separately',()=>{const {pay,invoice}=setup();pay({amount:'125.123456'});assert.equal(invoice().remaining,'0.000000');assert.equal(invoice().excess,'25.123456');});
test('exact duplicate no amount or journal inflation',()=>{const {ledger,pay,invoice}=setup();pay();const before=ledger.snapshot();assert.deepEqual(pay(),{duplicate:true,updated:false});assert.deepEqual(ledger.snapshot(),before);assert.equal(invoice().confirmed,'40.000000');});
test('confirmation update replaces observation and never doubles amount',()=>{const {pay,invoice}=setup();pay({confirmations:0});pay({confirmations:3});pay({confirmations:8});assert.equal(invoice().confirmed,'40.000000');assert.equal(invoice().observations.length,1);});
test('confirmation decrease reverts paid to confirming and recalculates balance',()=>{const {pay,invoice}=setup('40');pay();assert.equal(invoice().status,'paid');pay({confirmations:2});assert.equal(invoice().status,'confirming');assert.equal(invoice().confirmed,'0.000000');assert.equal(invoice().remaining,'40.000000');});
test('reorg removes one credit preserving other confirmed payment',()=>{const {pay,invoice}=setup();pay();pay({transactionId:'sim-002',amount:'60'});pay({confirmations:0});assert.equal(invoice().status,'partial');assert.equal(invoice().remaining,'40.000000');assert.equal(invoice().pending,'40.000000');});
test('same transaction cannot change amount',()=>{const {pay,invoice}=setup();pay();assert.throws(()=>pay({amount:'41'}),{code:'TRANSACTION_CONFLICT'});assert.equal(invoice().confirmed,'40.000000');});
test('same transaction cannot be attributed to second invoice',()=>{const {ledger,pay}=setup();pay();const id=ledger.createInvoice({client:'Al doilea demo',amount:'40',expiresAt:'2026-10-04T11:00:00.000Z'});assert.throws(()=>pay({invoiceId:id}),{code:'TRANSACTION_CONFLICT'});});
for(const field of ['network','token','recipient'])test(`wrong ${field} rejected without mutation`,()=>{const {ledger,pay}=setup();const before=ledger.snapshot();assert.throws(()=>pay({[field]:'wrong'}),{code:`WRONG_${field.toUpperCase()}`});assert.deepEqual(ledger.snapshot(),before);});
for(const confirmations of [-1,1.5,'3',100001,NaN])test(`invalid confirmations ${confirmations}`,()=>assert.throws(()=>setup().pay({confirmations}),{code:'CONFIRMATIONS'}));
test('unknown invoice fails',()=>assert.throws(()=>setup().pay({invoiceId:'unknown'}),{code:'INVOICE_UNKNOWN'}));
test('unpaid expiry is recalculated from clock',()=>{const {advance,invoice}=setup();advance();assert.equal(invoice().status,'expired');});
test('paid remains paid after expiry; reorg then expires',()=>{const {advance,pay,invoice}=setup('40');pay();advance();assert.equal(invoice().status,'paid');pay({confirmations:0});assert.equal(invoice().status,'expired');});
test('late confirmed observation accounted; fully paid supersedes expiry',()=>{const {advance,pay,invoice}=setup('40');advance();pay();assert.equal(invoice().status,'paid');});
test('invalid expiry rejected',()=>{const {ledger}=setup();for(const expiresAt of ['bad','2026-10-03T11:00:00.000Z','2028-10-04T11:00:00.000Z','2026-02-30T11:00:00.000Z'])assert.throws(()=>ledger.createInvoice({client:'Demo',amount:'1',expiresAt}));});
test('unrecognized fields and accessor commands rejected before execution',()=>{const {ledger,pay}=setup();assert.throws(()=>pay({unknown:true}),{code:'FIELDS'});let called=false;const input={amount:'1',expiresAt:'2026-10-04T11:00:00.000Z',get client(){called=true;return 'bad';}};assert.throws(()=>ledger.createInvoice(input),{code:'FIELDS'});assert.equal(called,false);});
test('failed persistence does not commit or consume invoice number',()=>{let failed=true;const ledger=new Ledger({clock:()=>Date.parse('2026-10-04T10:00:00Z'),save:()=>{if(failed)throw new Error('disk');}});const input={client:'Demo',amount:'1',expiresAt:'2026-10-04T11:00:00.000Z'};assert.throws(()=>ledger.createInvoice(input));assert.equal(ledger.snapshot().invoices.length,0);failed=false;ledger.createInvoice(input);assert.equal(ledger.snapshot().invoices[0].number,'INV-0001');});
test('persisted state reload preserves sums and duplicates',()=>{let saved;const now=()=>Date.parse('2026-10-04T10:00:00Z');const ledger=new Ledger({clock:now,save:state=>{saved=state;}});const id=ledger.createInvoice({client:'Demo',amount:'1',expiresAt:'2026-10-04T11:00:00.000Z'});const payment={invoiceId:id,transactionId:'sim-1',amount:'1',confirmations:3,...PROFILE};delete payment.requiredConfirmations;ledger.observe(payment);const reloaded=new Ledger({clock:now,state:saved});assert.equal(reloaded.snapshot().invoices[0].status,'paid');assert.equal(reloaded.observe(payment).duplicate,true);});
test('stored duplicate and wrong profile fail closed',()=>{let saved;const ledger=new Ledger({clock:()=>Date.parse('2026-10-04T10:00:00Z'),save:s=>{saved=s;}});const id=ledger.createInvoice({client:'Demo',amount:'1',expiresAt:'2026-10-04T11:00:00.000Z'});ledger.observe({invoiceId:id,transactionId:'sim-1',amount:'1',confirmations:3,network:PROFILE.network,token:PROFILE.token,recipient:PROFILE.recipient});const wrong=structuredClone(saved);wrong.observations[0].token='real';assert.throws(()=>new Ledger({state:wrong}));saved.observations.push(saved.observations[0]);assert.throws(()=>new Ledger({state:saved}));});
