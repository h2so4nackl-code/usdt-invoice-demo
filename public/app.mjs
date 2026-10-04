const $ = selector => document.querySelector(selector);
const statuses = { pending:'În așteptare', confirming:'În confirmare', partial:'Parțială', paid:'Achitată', expired:'Expirată' };
const events = {INVOICE_CREATED:'Factură creată',PAYMENT_OBSERVED:'Plată simulată observată',CONFIRMATIONS_UPDATED:'Confirmări actualizate'};
let state; let selected; let paymentOpen = false; let busy = false;
const node = (tag, className, text) => {const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;};
const money = value => {const [whole,fraction] = value.split('.');return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g,' ')}${fraction==='000000'?',00':','+fraction.replace(/0+$/,'')}`;};
const units = value => BigInt(value.replace('.',''));
const fromUnits = value => `${value/1000000n}.${(value%1000000n).toString().padStart(6,'0')}`;
const date = value => new Intl.DateTimeFormat('ro-RO',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
function notify(message,error=false){$('#message').hidden=false;$('#message').className=error?'error':'';$('#message').textContent=message;}
async function post(path,body){const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.message??'Operația a eșuat.');return result;}
async function refresh(){const response=await fetch('/api/state');if(!response.ok)throw new Error('Serverul local nu este disponibil.');state=await response.json();if(!selected&&state.invoices.length)selected=state.invoices.at(-1).id;render();}
function render(){
  const invoices=state.invoices;
  $('#nav-count').textContent=String(invoices.length);$('#total-count').textContent=String(invoices.length);
  $('#total-paid').textContent=money(fromUnits(invoices.reduce((sum,item)=>sum+units(item.confirmed),0n)));
  $('#total-due').textContent=money(fromUnits(invoices.reduce((sum,item)=>sum+units(item.remaining),0n)));
  $('#paid-count').replaceChildren(document.createTextNode(`${invoices.filter(item=>item.status==='paid').length} `),node('small','',`/ ${invoices.length}`));
  const filter=$('#status-filter').value;const filtered=invoices.filter(item=>filter==='all'||item.status===filter);
  $('#list-count').textContent=`${filtered.length} facturi`;const list=$('#invoice-list');list.replaceChildren();
  if(!filtered.length){const empty=node('div','empty');empty.append(node('div','empty-icon','▤'),node('strong','',invoices.length?'Nicio factură în această stare':'Prima factură începe aici'),node('p','',invoices.length?'Alege o altă stare pentru a vedea facturile.':'Creează o factură pentru un client sintetic și simulează o plată.'));list.append(empty);}
  for(const invoice of [...filtered].reverse()){
    const row=node('button',`invoice-row${selected===invoice.id?' selected':''}`);row.type='button';row.setAttribute('aria-label',`${invoice.number} ${invoice.client}`);row.setAttribute('aria-pressed',String(selected===invoice.id));
    const meta=node('div');meta.append(node('span','invoice-meta',invoice.number),node('span','invoice-client',invoice.client),node('span','invoice-date',`Expiră ${date(invoice.expiresAt)}`));
    const sum=node('div','invoice-sum');sum.append(document.createTextNode(money(invoice.amount)+' '),node('small','','USDt'),node('br'),node('span',`badge ${invoice.status}`,statuses[invoice.status]));row.append(meta,sum);
    row.addEventListener('click',()=>{selected=invoice.id;paymentOpen=false;render();});list.append(row);
  }
  renderDetail(invoices.find(item=>item.id===selected));
  const journal=$('#journal-list');journal.replaceChildren();
  if(!state.journal.length)journal.append(node('li','','Nicio activitate încă. Datele rămân pe acest computer.'));
  for(const entry of [...state.journal].reverse().slice(0,40)){const invoice=invoices.find(item=>item.id===entry.invoiceId);const li=node('li');li.append(node('span','',`${events[entry.event]??entry.event} · ${invoice?.number??''}${entry.transactionId?' · '+entry.transactionId:''}${entry.event==='CONFIRMATIONS_UPDATED'?' · '+entry.previousConfirmations+' → '+entry.confirmations:''}`),node('time','',date(entry.timestamp)));journal.append(li);}
}
function renderDetail(invoice){
  const body=$('#detail-body');body.replaceChildren();$('#detail-title').textContent=invoice?invoice.number:'Selectează o factură';
  if(!invoice){body.append(node('div','empty-detail','Aici urmărești soldul, confirmările și observațiile de plată.'));return;}
  const client=node('p','detail-client',invoice.client+' · ');client.append(node('span',`badge ${invoice.status}`,statuses[invoice.status]));body.append(client);
  const balance=node('div','balance');balance.append(node('span','balance-label','CONFIRMAT'),node('strong','balance-number',money(invoice.confirmed)+' USDt'));
  const progress=node('progress','progress');progress.max=100;progress.value=Number(units(invoice.confirmed)*100n/units(invoice.amount));progress.setAttribute('aria-label','Progresul plății confirmate');balance.append(progress);
  const caption=node('div','balance-caption');caption.append(node('span','',`din ${money(invoice.amount)} USDt`),node('span','',`${Math.min(100,progress.value)}% achitat`));balance.append(caption);body.append(balance);
  const lines=node('div','amount-lines');for(const [label,value] of [['Rest de încasat',invoice.remaining],['În confirmare',invoice.pending],['Excedent confirmat',invoice.excess]]){const line=node('div','amount-line');line.append(node('span','',label),node('strong','',money(value)+' USDt'));lines.append(line);}body.append(lines);
  const toggle=node('button','button secondary observe-toggle',paymentOpen?'− Închide formularul':'＋ Observă o plată simulată');toggle.type='button';toggle.addEventListener('click',()=>{paymentOpen=!paymentOpen;renderDetail(invoice);});body.append(toggle);
  if(paymentOpen){
    const form=node('form','payment-form');form.setAttribute('aria-label','Observație de plată');
    for(const [label,name,type,value] of [['ID plată simulat','transactionId','text',''],['Sumă USDt','amount','text',''],['Confirmări simulate','confirmations','number','0']]){const field=node('label','',label);const input=node('input');input.name=name;input.type=type;input.value=value;input.required=true;if(name==='transactionId')input.placeholder='sim-plata-001';if(name==='amount'){input.inputMode='decimal';input.placeholder='Ex. 25.50';}if(name==='confirmations'){input.min='0';input.max='100000';input.step='1';}field.append(input);form.append(field);}
    form.append(node('p','profile-note',`${state.profile.token} · ${state.profile.network} · ${state.profile.recipient}\nPrag: ${state.profile.requiredConfirmations} confirmări. Numai observații simulate.`));const error=node('div','observation-error');error.setAttribute('role','alert');form.append(error);const submit=node('button','button primary','Înregistrează observația');submit.type='submit';form.append(submit);
    form.addEventListener('submit',async event=>{event.preventDefault();submit.disabled=true;busy=true;try{const data=new FormData(form);const result=await post('/api/observations',{invoiceId:invoice.id,transactionId:data.get('transactionId'),amount:data.get('amount'),confirmations:Number(data.get('confirmations')),network:state.profile.network,token:state.profile.token,recipient:state.profile.recipient});paymentOpen=false;await refresh();notify(result.duplicate?'Duplicat ignorat. Soldul nu a fost modificat.':result.updated?'Confirmări actualizate. Soldul a fost recalculat.':'Observație înregistrată. Plata este simulată.');}catch(problem){error.textContent=problem.message;}finally{submit.disabled=false;busy=false;}});body.append(form);
  }
  body.append(node('div','observation-head',`OBSERVAȚII DE PLATĂ · ${invoice.observations.length}`));
  if(!invoice.observations.length)body.append(node('p','profile-note','Nu există observații pentru această factură.'));
  for(const observation of invoice.observations){
    const item=node('div','observation');const top=node('div','observation-top');top.append(node('strong','',money(fromUnits(BigInt(observation.amountUnits)))+' USDt'),node('span','',observation.confirmations>=3?'Confirmată':'În confirmare'));item.append(top,node('div','observation-tx',observation.transactionId));
    const form=node('form','confirmation-form');const input=node('input');input.type='number';input.min='0';input.max='100000';input.step='1';input.required=true;input.value=String(observation.confirmations);input.setAttribute('aria-label',`Confirmări ${observation.transactionId}`);const submit=node('button','button secondary','Actualizează');submit.type='submit';form.append(input,submit);form.addEventListener('submit',async event=>{event.preventDefault();busy=true;submit.disabled=true;try{const result=await post('/api/observations',{invoiceId:invoice.id,transactionId:observation.transactionId,amount:fromUnits(BigInt(observation.amountUnits)),confirmations:Number(input.value),network:observation.network,token:observation.token,recipient:observation.recipient});await refresh();notify(result.duplicate?'Duplicat ignorat. Soldul nu a fost modificat.':'Confirmări actualizate. Soldul a fost recalculat.');}catch(error){notify(error.message,true);}finally{busy=false;submit.disabled=false;}});item.append(form);body.append(item);
  }
}
function localInputDate(value){const date=new Date(value);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}:${String(date.getSeconds()).padStart(2,'0')}`;}
$('#new-invoice').addEventListener('click',()=>{$('#invoice-form').reset();$('#invoice-form').elements.expiresAt.value=localInputDate(Date.now()+86400000);$('#form-error').textContent='';$('#invoice-dialog').showModal();});
for(const id of ['#close-dialog','#cancel-dialog'])$(id).addEventListener('click',()=>$('#invoice-dialog').close());
$('#invoice-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;const submit=form.querySelector('[type="submit"]');submit.disabled=true;busy=true;try{const result=await post('/api/invoices',{client:form.elements.client.value,amount:form.elements.amount.value,expiresAt:new Date(form.elements.expiresAt.value).toISOString()});selected=result.invoiceId;paymentOpen=false;$('#invoice-dialog').close();await refresh();notify('Factura a fost creată. Numai date sintetice, fără fonduri reale.');}catch(error){$('#form-error').textContent=error.message;}finally{submit.disabled=false;busy=false;}});
$('#status-filter').addEventListener('change',render);
refresh().catch(error=>notify(error.message,true));
setInterval(()=>{if(!busy&&!paymentOpen&&!$('#invoice-dialog').open&&!document.activeElement.closest('form'))refresh().catch(error=>notify(error.message,true));},2000);
