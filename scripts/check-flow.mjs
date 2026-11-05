import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdir, writeFile} from 'node:fs/promises';
import {createApp} from '../server.mjs';
import {makePayPal} from '../lib/paypal.mjs';
const app=createApp({provider:makePayPal({mode:'fixture'})});
app.listen(0,'127.0.0.1');await once(app,'listening');
try {
 const base=`http://127.0.0.1:${app.address().port}`;
 const assetResults=[];
 for(const path of ['/','/app.js','/styles.css']) {
  const r=await fetch(base+path);assert.equal(r.status,200);const content=await r.text();assert.ok(content.length>100);assetResults.push({path,status:r.status,bytes:Buffer.byteLength(content)});
 }
 const status=await(await fetch(base+'/api/status')).json();
 const post=async(route,body)=>{
  const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':status.csrf},body:JSON.stringify(body)});
  const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;
 };
 const input={milestones:[{id:'parser',title:'CSV parser',criterion:'The CSV importer rejects malformed dates.',amountCents:18000},{id:'receipt',title:'Receipt export',criterion:'The app exports JSON receipts with source hashes.',amountCents:12000}],evidence:[{id:'parser-test',text:'The CSV importer rejects malformed dates.'},{id:'receipt-note',text:'JSON receipt export is not implemented. Source hashes are missing.'}]};
 const review=await post('/api/analyze',input);
 assert.equal(review.ai.mode,'semantic');assert.equal(review.ai.ready,true);
 assert.equal(review.matches[0].evidenceId,'parser-test');
 assert.match(review.matches[1].signal,/contradiction/);
 const request={analysisId:review.analysisId,acceptedMilestoneIds:['parser'],email:'synthetic-buyer@example.com'};
 const draft=await post('/api/invoices',request);
 assert.equal(draft.totalCents,18000);assert.equal(draft.source,'local-fixture');assert.equal(draft.status,'DRAFT');
 const repeat=await post('/api/invoices',request);assert.deepEqual(repeat,draft);
 const receipt={status:'PASS',checkedAt:new Date().toISOString(),assets:assetResults,model:review.ai,matches:review.matches,draft,repeatSameDraft:true,modelInference:'actual local CPU model',paypalCalls:'none; local fixture',notChecked:['rendered UI','keyboard or screen reader','real PayPal Sandbox','submission','award','payout']};
 await mkdir('receipts',{recursive:true});await writeFile('receipts/flow-check.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
}finally{app.closeAllConnections();await new Promise(resolve=>app.close(resolve));}
