import test from 'node:test';
import assert from 'node:assert/strict';
import {makePayPal} from '../lib/paypal.mjs';
const selection={key:'a'.repeat(32),sourceDigest:'b'.repeat(64),email:'buyer@example.com',totalCents:12500,milestones:[{title:'CSV importer',criterion:'Malformed dates rejected',amountCents:12500}]};
test('fixture is labeled and cannot call PayPal',async()=>{
 const p=makePayPal({fetchImpl:()=>assert.fail('network')});
 const r=await p.create(selection);assert.equal(r.source,'local-fixture');assert.match(r.id,/^LOCAL-/);assert.equal(r.status,'DRAFT');
});
test('live payment mode is not supported',()=>assert.throws(()=>makePayPal({mode:'live'})));
test('sandbox credentials are required',async()=>{
 const p=makePayPal({mode:'paypal-sandbox',fetchImpl:()=>assert.fail('network')});
 await assert.rejects(p.create(selection),/not configured/);
});
test('simultaneous duplicate clicks create one sandbox draft and no send/payment call',async()=>{
 const calls=[];
 const p=makePayPal({mode:'paypal-sandbox',clientId:'test-id',clientSecret:'test-secret',merchantEmail:'merchant@example.com',fetchImpl:async(url,options)=>{
  calls.push({url,options});
  await new Promise(r=>setTimeout(r,5));
  return {ok:true,json:async()=>url.endsWith('/token')?{access_token:'test-token',expires_in:3600}:{id:'INV2-TEST',status:'DRAFT',amount:{currency_code:'USD',value:'125.00'},items:[{name:'CSV importer',quantity:'1',unit_amount:{currency_code:'USD',value:'125.00'}}]}};
 }});
 const [a,b]=await Promise.all([p.create(selection),p.create(selection)]);
 assert.deepEqual(a,b);assert.equal(calls.length,3);assert.equal((await p.create(selection)).id,a.id);assert.equal(calls.length,3);
 assert.equal(calls[1].url,'https://api-m.sandbox.paypal.com/v2/invoicing/invoices');
 assert.equal(calls[1].options.headers['PayPal-Request-Id'],selection.key);
 const payload=JSON.parse(calls[1].options.body);assert.equal(payload.items[0].unit_amount.value,'125.00');
});
test('provider failure is not converted to a successful receipt',async()=>{
 const p=makePayPal({mode:'paypal-sandbox',clientId:'x',clientSecret:'y',merchantEmail:'m@example.com',fetchImpl:async()=>({ok:false,status:500,json:async()=>({secret:'must not be logged'})})});
 await assert.rejects(p.create(selection),/HTTP 500/);
});
test('a response without a verified DRAFT status fails',async()=>{
 const p=makePayPal({mode:'paypal-sandbox',clientId:'x',clientSecret:'y',merchantEmail:'m@example.com',fetchImpl:async(url)=>({ok:true,json:async()=>url.endsWith('/token')?{access_token:'t',expires_in:3600}:{id:'unexpected',status:'PAID'}})});
 await assert.rejects(p.create(selection),e=>e.code==='PAYPAL_RECONCILE_REQUIRED');
});
test('ambiguous create blocks repeat calls, even if a new page tries again',async()=>{
 let writes=0;
 const p=makePayPal({mode:'paypal-sandbox',clientId:'x',clientSecret:'y',merchantEmail:'m@example.com',fetchImpl:async(url)=>{
  if(url.endsWith('/token'))return{ok:true,json:async()=>({access_token:'t',expires_in:3600})};
  writes++;throw new Error('response lost after provider may have created invoice');
 }});
 await assert.rejects(p.create(selection),e=>e.code==='PAYPAL_RECONCILE_REQUIRED');
 await assert.rejects(p.create(selection),e=>e.code==='PAYPAL_RECONCILE_REQUIRED');
 assert.equal(writes,1);
});
test('amount mismatch is unknown, not a receipt with a fabricated requested total',async()=>{
 const p=makePayPal({mode:'paypal-sandbox',clientId:'x',clientSecret:'y',merchantEmail:'m@example.com',fetchImpl:async(url)=>({ok:true,json:async()=>url.endsWith('/token')?{access_token:'t',expires_in:3600}:{id:'INV2-MISMATCH',status:'DRAFT',amount:{currency_code:'USD',value:'1.00'},items:[]}})});
 await assert.rejects(p.create(selection),e=>e.code==='PAYPAL_RECONCILE_REQUIRED');
});
