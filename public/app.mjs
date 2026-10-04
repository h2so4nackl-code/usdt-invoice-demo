const $ = selector => document.querySelector(selector);
const statuses = { pending:'În așteptare', confirming:'În confirmare', partial:'Parțială', paid:'Achitată', expired:'Expirată' };
const events = {INVOICE_CREATED:'Factură creată',PAYMENT_OBSERVED:'Plată simulată observată',CONFIRMATIONS_UPDATED:'Confirmări actualizate',PAYMENT_VERIFIED:'Eveniment testnet verificat',CREDIT_REVOKED:'Credit retras după reverificare'};
let state; let selected; let paymentOpen = false; let busy = false; let mode='simulation'; let testnetReady=false;
const asset=()=>mode==='testnet'?'USDC test':'USDt';
function setBusy(value){busy=value;$('#mode-select').disabled=value;$('#new-invoice').disabled=value||(mode==='testnet'&&!testnetReady);$('#wdk-profile').disabled=value;$('#wdk-refresh').disabled=value;}
const node = (tag, className, text) => {const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;};
const money = value => {const [whole,fraction] = value.split('.');return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g,' ')}${fraction==='000000'?',00':','+fraction.replace(/0+$/,'')}`;};
const units = value => BigInt(value.replace('.',''));
const fromUnits = value => `${value/1000000n}.${(value%1000000n).toString().padStart(6,'0')}`;
const date = value => new Intl.DateTimeFormat('ro-RO',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
function notify(message,error=false){$('#message').hidden=false;$('#message').className=error?'error':'';$('#message').textContent=message;}
async function post(path,body){const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.message??'Operația a eșuat.');return result;}
async function refresh(){const requestedMode=mode;const response=await fetch(mode==='testnet'?'/api/testnet/state':'/api/state');if(!response.ok){const problem=await response.json();throw new Error(problem.message??'Serverul local nu este disponibil.');}const next=await response.json();if(requestedMode!==mode)return;state=next;testnetReady=mode==='testnet';if(!selected&&state.invoices.length)selected=state.invoices.at(-1).id;render();}
function render(){
  const invoices=state.invoices;
  document.title=mode==='testnet'?'USDt Invoice Demo · WDK testnet read-only':'USDt Invoice Demo · Facturi simulate';
  document.querySelector('.title-row p').textContent=mode==='testnet'?'Asociază explicit evenimente ERC-20 de test cu facturi locale. Numai citire.':'Emite facturi și urmărește fiecare plată simulată, până la confirmare.';
  document.querySelector('.metrics article:nth-child(2) > small').textContent=mode==='testnet'?'Cel puțin 3 confirmări Sepolia':'Cel puțin 3 confirmări simulate';
  const amountLabel=document.querySelector('#invoice-form input[name=amount]').closest('label');amountLabel.firstChild.textContent=mode==='testnet'?'Sumă USDC de test':'Sumă USDt';
  document.querySelector('#invoice-dialog .eyebrow').textContent=mode==='testnet'?'FACTURĂ LOCALĂ TESTNET':'FACTURĂ SIMULATĂ';
  for(const el of document.querySelectorAll('.metric em'))el.textContent=asset();
  document.querySelector('footer').lastElementChild.textContent=mode==='testnet'?'WDK real · Sepolia · fără semnare sau fonduri reale.':'Doar simulare. Fără conexiuni la blockchain.';
  $('#nav-count').textContent=String(invoices.length);$('#total-count').textContent=String(invoices.length);
  $('#total-paid').textContent=money(fromUnits(invoices.reduce((sum,item)=>sum+units(item.confirmed),0n)));
  $('#total-due').textContent=money(fromUnits(invoices.reduce((sum,item)=>sum+units(item.remaining),0n)));
  $('#paid-count').replaceChildren(document.createTextNode(`${invoices.filter(item=>item.status==='paid').length} `),node('small','',`/ ${invoices.length}`));
  const filter=$('#status-filter').value;const filtered=invoices.filter(item=>filter==='all'||item.status===filter);
  $('#list-count').textContent=`${filtered.length} facturi`;const list=$('#invoice-list');list.replaceChildren();
  if(!filtered.length){const empty=node('div','empty');empty.append(node('div','empty-icon','▤'),node('strong','',invoices.length?'Nicio factură în această stare':'Prima factură începe aici'),node('p','',invoices.length?'Alege o altă stare pentru a vedea facturile.':(mode==='testnet'?'Creează o factură locală și selectează explicit un hash și logIndex.':'Creează o factură pentru un client sintetic și simulează o plată.')));list.append(empty);}
  for(const invoice of [...filtered].reverse()){
    const row=node('button',`invoice-row${selected===invoice.id?' selected':''}`);row.type='button';row.setAttribute('aria-label',`${invoice.number} ${invoice.client}`);row.setAttribute('aria-pressed',String(selected===invoice.id));
    const meta=node('div');meta.append(node('span','invoice-meta',invoice.number),node('span','invoice-client',invoice.client),node('span','invoice-date',`Expiră ${date(invoice.expiresAt)}`));
    const sum=node('div','invoice-sum');sum.append(document.createTextNode(money(invoice.amount)+' '),node('small','',asset()),node('br'),node('span',`badge ${invoice.status}`,statuses[invoice.status]));row.append(meta,sum);
    row.addEventListener('click',()=>{selected=invoice.id;paymentOpen=false;render();});list.append(row);
  }
  renderDetail(invoices.find(item=>item.id===selected));
  const journal=$('#journal-list');journal.replaceChildren();
  if(!state.journal.length)journal.append(node('li','','Nicio activitate încă. Datele rămân pe acest computer.'));
    for(const entry of [...state.journal].reverse().slice(0,40)){const invoice=invoices.find(item=>item.id===entry.invoiceId);const li=node('li');li.append(node('span','',`${events[entry.event]??entry.event} · ${invoice?.number??''}${entry.transactionId?' · '+entry.transactionId:''}${entry.event==='CONFIRMATIONS_UPDATED'&&Number.isInteger(entry.previousConfirmations)&&Number.isInteger(entry.confirmations)?' · '+entry.previousConfirmations+' → '+entry.confirmations:''}`),node('time','',date(entry.timestamp)));journal.append(li);}
}
function renderDetail(invoice){
  const body=$('#detail-body');body.replaceChildren();$('#detail-title').textContent=invoice?invoice.number:'Selectează o factură';
  if(!invoice){body.append(node('div','empty-detail','Aici urmărești soldul, confirmările și observațiile de plată.'));return;}
  const client=node('p','detail-client',invoice.client+' · ');client.append(node('span',`badge ${invoice.status}`,statuses[invoice.status]));body.append(client);
  const balance=node('div','balance');balance.append(node('span','balance-label','CONFIRMAT'),node('strong','balance-number',money(invoice.confirmed)+' '+asset()));
  const progress=node('progress','progress');progress.max=100;progress.value=Number(units(invoice.confirmed)*100n/units(invoice.amount));progress.setAttribute('aria-label','Progresul plății confirmate');balance.append(progress);
  const caption=node('div','balance-caption');caption.append(node('span','',`din ${money(invoice.amount)} ${asset()}`),node('span','',`${Math.min(100,progress.value)}% achitat`));balance.append(caption);body.append(balance);
  const lines=node('div','amount-lines');for(const [label,value] of [['Rest de încasat',invoice.remaining],['În confirmare',invoice.pending],['Excedent confirmat',invoice.excess]]){const line=node('div','amount-line');line.append(node('span','',label),node('strong','',money(value)+' '+asset()));lines.append(line);}body.append(lines);
  if(mode==='testnet'){renderTestnetControls(body,invoice);return;}
  const toggle=node('button','button secondary observe-toggle',paymentOpen?'− Închide formularul':'＋ Observă o plată simulată');toggle.type='button';toggle.addEventListener('click',()=>{paymentOpen=!paymentOpen;renderDetail(invoice);});body.append(toggle);
  if(paymentOpen){
    const form=node('form','payment-form');form.setAttribute('aria-label','Observație de plată');
    for(const [label,name,type,value] of [['ID plată simulat','transactionId','text',''],['Sumă USDt','amount','text',''],['Confirmări simulate','confirmations','number','0']]){const field=node('label','',label);const input=node('input');input.name=name;input.type=type;input.value=value;input.required=true;if(name==='transactionId')input.placeholder='sim-plata-001';if(name==='amount'){input.inputMode='decimal';input.placeholder='Ex. 25.50';}if(name==='confirmations'){input.min='0';input.max='100000';input.step='1';}field.append(input);form.append(field);}
    form.append(node('p','profile-note',`${state.profile.token} · ${state.profile.network} · ${state.profile.recipient}\nPrag: ${state.profile.requiredConfirmations} confirmări. Numai observații simulate.`));const error=node('div','observation-error');error.setAttribute('role','alert');form.append(error);const submit=node('button','button primary','Înregistrează observația');submit.type='submit';form.append(submit);
    form.addEventListener('submit',async event=>{event.preventDefault();submit.disabled=true;setBusy(true);try{const data=new FormData(form);const result=await post('/api/observations',{invoiceId:invoice.id,transactionId:data.get('transactionId'),amount:data.get('amount'),confirmations:Number(data.get('confirmations')),network:state.profile.network,token:state.profile.token,recipient:state.profile.recipient});paymentOpen=false;await refresh();notify(result.duplicate?'Duplicat ignorat. Soldul nu a fost modificat.':result.updated?'Confirmări actualizate. Soldul a fost recalculat.':'Observație înregistrată. Plata este simulată.');}catch(problem){error.textContent=problem.message;}finally{submit.disabled=false;setBusy(false);}});body.append(form);
  }
  body.append(node('div','observation-head',`OBSERVAȚII DE PLATĂ · ${invoice.observations.length}`));
  if(!invoice.observations.length)body.append(node('p','profile-note','Nu există observații pentru această factură.'));
  for(const observation of invoice.observations){
    const item=node('div','observation');const top=node('div','observation-top');top.append(node('strong','',money(fromUnits(BigInt(observation.amountUnits)))+' '+asset()),node('span','',observation.confirmations>=3?'Confirmată':'În confirmare'));item.append(top,node('div','observation-tx',observation.transactionId));
    const form=node('form','confirmation-form');const input=node('input');input.type='number';input.min='0';input.max='100000';input.step='1';input.required=true;input.value=String(observation.confirmations);input.setAttribute('aria-label',`Confirmări ${observation.transactionId}`);const submit=node('button','button secondary','Actualizează');submit.type='submit';form.append(input,submit);form.addEventListener('submit',async event=>{event.preventDefault();setBusy(true);submit.disabled=true;try{const result=await post('/api/observations',{invoiceId:invoice.id,transactionId:observation.transactionId,amount:fromUnits(BigInt(observation.amountUnits)),confirmations:Number(input.value),network:observation.network,token:observation.token,recipient:observation.recipient});await refresh();notify(result.duplicate?'Duplicat ignorat. Soldul nu a fost modificat.':'Confirmări actualizate. Soldul a fost recalculat.');}catch(error){notify(error.message,true);}finally{setBusy(false);submit.disabled=false;}});item.append(form);body.append(item);
  }
}
function localInputDate(value){const date=new Date(value);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}:${String(date.getSeconds()).padStart(2,'0')}`;}
function renderTestnetControls(body,invoice){
  body.append(node('p','profile-note','Credit numai dacă timestamp-ul blocului este în intervalul explicit al facturii. Soldul este ultima verificare reușită; folosește reverificarea pentru reorganizări.'));
  const form=node('form','payment-form');form.setAttribute('aria-label','Verificare tranzacție testnet');
  for(const [label,name,type] of [['Hash tranzacție Sepolia','transactionHash','text'],['LogIndex explicit','logIndex','number']]){
    const field=node('label','',label);const input=node('input');input.name=name;input.type=type;input.required=true;if(type==='number'){input.min='0';input.max='1000000';input.value='0';}else input.placeholder='0x… 64 caractere hex';field.append(input);form.append(field);
  }
  const submit=node('button','button primary','Verifică și asociază evenimentul');submit.type='submit';form.append(submit);
  form.addEventListener('submit',async event=>{
    event.preventDefault();setBusy(true);submit.disabled=true;
    try{const data=new FormData(form);const result=await post('/api/testnet/verify',{invoiceId:invoice.id,transactionHash:data.get('transactionHash'),logIndex:Number(data.get('logIndex'))});await refresh();notify(result.creditRevoked?'Credit retras: evenimentul nu mai este canonic.':result.duplicate?'Duplicat verificat. Creditul nu a fost dublat.':'Eveniment ERC-20 verificat prin RPC; WDK read-only validat.');}
    catch(problem){notify(problem.message,true);}finally{setBusy(false);submit.disabled=false;}
  });body.append(form);
  body.append(node('div','observation-head',`EVENIMENTE ASOCIATE · ${invoice.observations.length}`));
  for(const observation of invoice.observations){
    const entry=node('div','testnet-observation');entry.append(node('strong','',`${money(fromUnits(BigInt(observation.amountUnits)))} USDC test`),node('div','',`${observation.confirmations} confirmări · ${observation.canonical?(observation.eligible?'În interval':'În afara intervalului'):'Credit retras'}`),node('div','observation-tx',observation.key),node('div','',`Bloc: ${observation.blockNumber} · ${date(observation.blockTimestamp)}`));body.append(entry);
  }
}
$('#mode-select').addEventListener('change',async()=>{
  if(busy){$('#mode-select').value=mode;return;}
  mode=$('#mode-select').value;selected=null;paymentOpen=false;testnetReady=false;
  $('#message').hidden=true;$('#wdk-panel').hidden=mode!=='testnet';$('#valid-from-label').hidden=mode!=='testnet';$('#historical-note').hidden=mode!=='testnet';$('#invoice-form').elements.validFrom.required=mode==='testnet';
  $('#mode-banner').className=mode==='testnet'?'simulation testnet-banner':'simulation';$('#mode-banner').textContent=mode==='testnet'?'WDK · TESTNET · READ-ONLY — USDC de test, nu USDt. Fără semnare sau fonduri reale.':'SIMULARE LOCALĂ · Date sintetice · Fără fonduri reale';
  $('#export').href=mode==='testnet'?'/api/testnet/export':'/api/export';$('#export').download=mode==='testnet'?'invoice-testnet-readonly.json':'usdt-invoice-simulation.json';
  state={invoices:[],journal:[],profile:{}};render();$('#new-invoice').disabled=mode==='testnet';
  try{await refresh();$('#new-invoice').disabled=false;}catch(problem){notify(problem.message,true);}
});
for(const [selector,path] of [['#wdk-profile','/api/testnet/profile'],['#wdk-refresh','/api/testnet/refresh']])$(selector).addEventListener('click',async()=>{
  if(busy)return;
  if(!testnetReady){notify('Configurează modul testnet pe server înainte de citire.',true);return;}
  setBusy(true);$(selector).disabled=true;
  try{const result=await post(path,{});if(path.endsWith('/profile'))$('#wdk-result').textContent=`WDK ${result.wdkVersion} · ${result.wdkAddress} · sold token: ${money(fromUnits(BigInt(result.balanceUnits)))} USDC test · decimals ${result.decimals}`;else notify(`${result.verified} tranzacții reverificate. Soldurile au fost recalculate.`);await refresh();}catch(problem){notify(problem.message,true);}finally{setBusy(false);$(selector).disabled=false;}
});
$('#new-invoice').addEventListener('click',()=>{$('#invoice-form').reset();$('#invoice-form').elements.expiresAt.value=localInputDate(Date.now()+86400000);$('#invoice-form').elements.validFrom.value=localInputDate(Date.now());$('#form-error').textContent='';$('#invoice-dialog').showModal();});
for(const id of ['#close-dialog','#cancel-dialog'])$(id).addEventListener('click',()=>$('#invoice-dialog').close());
$('#invoice-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;const submit=form.querySelector('[type="submit"]');submit.disabled=true;setBusy(true);try{const payload={client:form.elements.client.value,amount:form.elements.amount.value,expiresAt:new Date(form.elements.expiresAt.value).toISOString()};if(mode==='testnet')payload.validFrom=new Date(form.elements.validFrom.value).toISOString();const result=await post(mode==='testnet'?'/api/testnet/invoices':'/api/invoices',payload);selected=result.invoiceId;paymentOpen=false;$('#invoice-dialog').close();await refresh();notify(mode==='testnet'?'Factură testnet creată separat. Asocierea unui eveniment este explicită.':'Factura a fost creată. Numai date sintetice, fără fonduri reale.');}catch(error){$('#form-error').textContent=error.message;}finally{submit.disabled=false;setBusy(false);}});
$('#status-filter').addEventListener('change',render);
refresh().catch(error=>notify(error.message,true));
setInterval(()=>{if(!busy&&!paymentOpen&&!$('#invoice-dialog').open&&!document.activeElement.closest('form'))refresh().catch(error=>notify(error.message,true));},2000);
