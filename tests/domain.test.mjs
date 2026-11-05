import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze, validateAnalysis, invoiceSelection, buildInvoicePayload, cosine} from '../lib/domain.mjs';
const input=()=>({milestones:[{id:'a',title:'CSV importer',criterion:'CSV import rejects malformed dates',amountCents:12500},{id:'b',title:'Keyboard access',criterion:'All controls can be reached by keyboard',amountCents:7500}],evidence:[{id:'e1',text:'CSV import rejects malformed dates in 12 fixtures.'},{id:'e2',text:'Keyboard support is not implemented.'}]});
const embeddings=async()=>[[1,0],[0,1],[1,0],[0,1]];
test('retrieves exact source excerpts without converting similarity into completion',async()=>{
 const a=await analyze(input(),embeddings);
 assert.equal(a.matches[0].evidenceId,'e1'); assert.equal(a.matches[0].similarity,1);
 assert.match(a.matches[0].signal,/human review/);
 assert.equal(a.matches[1].evidenceId,'e2'); assert.match(a.matches[1].signal,/contradiction/);
 assert.equal(a.matches[1].quote,input().evidence[1].text); assert.equal(a.matches[1].complete,undefined);
});
test('empty evidence does not invoke a model or permit billing',async()=>{
 const a=await analyze({...input(),evidence:[]},async()=>assert.fail('model should not run'));
 assert.equal(a.matches[0].evidenceId,null);
 assert.throws(()=>invoiceSelection(a,{acceptedMilestoneIds:['a'],email:'buyer@example.com'}),/no evidence/);
});
test('invoice uses only explicitly selected prices in the server snapshot',async()=>{
 const a=await analyze(input(),embeddings);
 const s=invoiceSelection(a,{acceptedMilestoneIds:['a'],email:'buyer@example.com',amountCents:1});
 assert.equal(s.totalCents,12500);
 const p=buildInvoicePayload(s,'merchant@example.com');
 assert.equal(p.items.length,1);assert.equal(p.items[0].unit_amount.value,'125.00');
 assert.equal(p.primary_recipients[0].billing_info.email_address,'buyer@example.com');
 assert.ok(p.detail.memo.includes(a.sourceDigest));
});
test('empty, duplicated and foreign selections fail before provider calls',async()=>{
 const a=await analyze(input(),embeddings);
 for(const ids of [[],['a','a'],['x']]) assert.throws(()=>invoiceSelection(a,{acceptedMilestoneIds:ids,email:'buyer@example.com'}));
 assert.throws(()=>invoiceSelection(a,{acceptedMilestoneIds:['a'],email:'not-an-email'}));
});
test('money validation rejects fractions, negative, zero and excessive amounts',()=>{
 for(const value of [0,-1,1.5,1000001,NaN,'250']) {const i=input();i.milestones[0].amountCents=value;assert.throws(()=>validateAnalysis(i));}
});
test('source IDs and excerpts are bounded',()=>{
 const i=input();i.evidence[1].id='e1';assert.throws(()=>validateAnalysis(i));
 i.evidence[1].id='e2';i.evidence[1].text='x'.repeat(1201);assert.throws(()=>validateAnalysis(i));
});
test('invalid model outputs fail closed',async()=>{
 await assert.rejects(analyze(input(),async()=>[[1,0]]));
 await assert.rejects(analyze(input(),async()=>[[1,0],[1,0],[1,0],[NaN,0]]));
 assert.throws(()=>cosine([0,0],[1,0]));
});
test('reordering selection keeps the idempotency key',async()=>{
 const a=await analyze(input(),embeddings);
 assert.equal(invoiceSelection(a,{acceptedMilestoneIds:['a','b'],email:'buyer@example.com'}).key,invoiceSelection(a,{acceptedMilestoneIds:['b','a'],email:'buyer@example.com'}).key);
});
test('re-analyzing the same source does not create a new invoice key',async()=>{
 const a=await analyze(input(),embeddings), b=await analyze(input(),embeddings);
 assert.notEqual(a.analysisId,b.analysisId);
 const request={acceptedMilestoneIds:['a'],email:'buyer@example.com'};
 assert.equal(invoiceSelection(a,request).key,invoiceSelection(b,request).key);
});
