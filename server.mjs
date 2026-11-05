import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomBytes, timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {analyze, InputError, invoiceSelection} from './lib/domain.mjs';
import {embed, aiStatus} from './lib/ai.mjs';
import {makePayPal} from './lib/paypal.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const assets = new Map([['/', ['index.html','text/html']], ['/app.js',['app.js','text/javascript']], ['/styles.css',['styles.css','text/css']]]);
export function createApp({embedFn = embed, provider = makePayPal({mode: process.env.PAYPAL_MODE || 'fixture', clientId: process.env.PAYPAL_CLIENT_ID, clientSecret: process.env.PAYPAL_CLIENT_SECRET, merchantEmail: process.env.PAYPAL_MERCHANT_EMAIL})} = {}) {
  const csrf = randomBytes(32).toString('hex');
  const analyses = new Map();
  let analyzing = false;
  const server = http.createServer(async (req, res) => {
    const send = (status, body) => {res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(JSON.stringify(body));};
    try {
      const expectedHost = `127.0.0.1:${server.address().port}`;
      if (req.headers.host !== expectedHost) return send(403, {error: 'Use the local 127.0.0.1 URL printed by the server.'});
      const pathname = new URL(req.url, `http://${expectedHost}`).pathname;
      if (req.method === 'GET' && pathname === '/api/status') return send(200, {csrf, mode:provider.mode, merchantConfigReady:provider.configured, ai:aiStatus()});
      if (req.method === 'GET' && assets.has(pathname)) {
        const [file, type] = assets.get(pathname);
        const data = await readFile(path.join(root,'public',file));
        res.writeHead(200, {'Content-Type':`${type}; charset=utf-8`,'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.end(data);return;
      }
      if (req.method !== 'POST' || !['/api/analyze','/api/invoices'].includes(pathname)) return send(404,{error:'Unknown route.'});
      const rawToken = req.headers['x-csrf-token'];
      if (typeof rawToken !== 'string' || !/^[a-f0-9]{64}$/.test(rawToken) || !timingSafeEqual(Buffer.from(rawToken), Buffer.from(csrf))) return send(403,{error:'Refresh the page before submitting.'});
      if (req.headers.origin && req.headers.origin !== `http://${expectedHost}`) return send(403,{error:'This endpoint accepts requests from its own local page only.'});
      if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') return send(415,{error:'Use application/json.'});
      let size=0; const chunks=[];
      for await (const chunk of req) {size += chunk.length;if(size>65536){send(413,{error:'Request too large.'});return;}chunks.push(chunk);}
      let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return send(400,{error:'Invalid JSON.'});}
      if (pathname === '/api/analyze') {
        if(analyzing) return send(429,{error:'An analysis is already running. Try again when it finishes.'});
        analyzing=true;
        try {
          const analysis=await analyze(body,embedFn);
          for(const [id,x] of analyses) if(Date.now()-Date.parse(x.createdAt)>3600000) analyses.delete(id);
          if(analyses.size>=30) analyses.delete(analyses.keys().next().value);
          analyses.set(analysis.analysisId,analysis);
          return send(200,{...analysis,ai:{...aiStatus(),mode:'semantic'}});
        }finally{analyzing=false;}
      }
      const analysis=analyses.get(body?.analysisId);
      if(analysis && Date.now()-Date.parse(analysis.createdAt)>3600000) analyses.delete(body.analysisId);
      const selection=invoiceSelection(analyses.get(body?.analysisId),body);
      return send(200,await provider.create(selection));
    } catch(error) {
      if(error instanceof InputError) return send(400,{error:error.message});
      if(error.code === 'PAYPAL_RECONCILE_REQUIRED') return send(409,{error:error.message,code:error.code,state:'UNKNOWN'});
      // Provider responses and credentials never reach logs or browser errors.
      return send(502,{error:'The local model or PayPal Sandbox operation did not complete. No payment was made. Check setup and retry.'});
    }
  });
  server.requestTimeout=30000;
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port=Number(process.env.PORT || 4317);
  if(!Number.isInteger(port)||port<1024||port>65535) throw new Error('PORT must be an integer from 1024 to 65535.');
  const server=createApp();
  server.listen(port,'127.0.0.1',()=>console.log(`ScopeProof: http://127.0.0.1:${port} — ${process.env.PAYPAL_MODE || 'fixture'} mode`));
  for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>process.exit(0)));
}
