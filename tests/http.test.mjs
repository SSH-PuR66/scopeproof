import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../server.mjs';
import {makePayPal} from '../lib/paypal.mjs';
test('local HTTP review to fixture invoice, with required explicit selection',async()=>{
 const app=createApp({embedFn:async()=>[[1,0],[1,0]],provider:makePayPal()});
 app.listen(0,'127.0.0.1');await once(app,'listening');
 try {
  const base=`http://127.0.0.1:${app.address().port}`;
  const status=await(await fetch(`${base}/api/status`)).json();assert.equal(status.mode,'fixture');
  const post=(route,body,extra={})=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':status.csrf,...extra},body:JSON.stringify(body)});
  const input={milestones:[{id:'m1',title:'CSV importer',criterion:'Reject malformed dates',amountCents:25000}],evidence:[{id:'e1',text:'The importer rejects malformed dates.'}]};
  assert.equal((await post('/api/analyze',input,{'X-CSRF-Token':''})).status,403);
  assert.equal((await post('/api/analyze',input,{Origin:'https://example.org'})).status,403);
  const a=await(await post('/api/analyze',input)).json();assert.ok(a.analysisId);assert.equal(a.matches[0].similarity,1);
  assert.equal((await post('/api/invoices',{analysisId:a.analysisId,acceptedMilestoneIds:[],email:'buyer@example.com'})).status,400);
  const invoice=await(await post('/api/invoices',{analysisId:a.analysisId,acceptedMilestoneIds:['m1'],email:'buyer@example.com'})).json();
  assert.equal(invoice.totalCents,25000);assert.equal(invoice.source,'local-fixture');assert.equal(invoice.status,'DRAFT');
  assert.equal((await fetch(`${base}/.env`)).status,404);
 } finally {app.closeAllConnections();await new Promise(resolve=>app.close(resolve));}
});
