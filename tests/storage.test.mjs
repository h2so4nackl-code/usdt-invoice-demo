import test from 'node:test';
import assert from 'node:assert/strict';
import { Ledger, emptyState } from '../src/ledger.mjs';
test('stored amount must be string, never an imprecise JSON number',()=>{
  let saved;const ledger=new Ledger({clock:()=>Date.parse('2026-10-04T10:00:00Z'),save:value=>{saved=value;}});
  ledger.createInvoice({client:'Client Demo',amount:'1',expiresAt:'2026-10-04T11:00:00.000Z'});
  saved.invoices[0].amountUnits=1000000;
  assert.throws(()=>new Ledger({state:saved}),{code:'STORAGE'});
});
test('journal capacity blocks new invoices without discarding audit trail',()=>{
  const state=emptyState();state.journal=Array.from({length:10000},(_,index)=>({id:String(index),timestamp:'2026-10-04T10:00:00.000Z',event:'SYNTHETIC_TEST'}));
  const ledger=new Ledger({state,clock:()=>Date.parse('2026-10-04T10:00:00Z')});
  assert.throws(()=>ledger.createInvoice({client:'Demo',amount:'1',expiresAt:'2026-10-04T11:00:00.000Z'}),{code:'CAPACITY'});
  assert.equal(ledger.snapshot().invoices.length,0);
  assert.equal(ledger.snapshot().journal.length,10000);
});
