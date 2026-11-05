import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(x => x[1]);

// This is a source-level DOM contract shim, not browser or layout validation.
// All API responses are synthetic; no model or payment service is contacted.
async function boot({invoiceFailure = false} = {}) {
  const elements = new Map(), all = [], calls = [];
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.listeners = {};
      this.attrs = {};
      this.className = '';
      this.value = '';
      this.disabled = false;
      this.checked = false;
      this.textContent = '';
      all.push(this);
      this.classList = {
        add: x => { this.className += ' ' + x; },
        remove: x => { this.className = this.className.split(' ').filter(y => y !== x).join(' '); },
        toggle: (x, on) => on ? this.classList.add(x) : this.classList.remove(x),
      };
    }
    set id(value) { this._id = value; elements.set(value, this); }
    get id() { return this._id; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(key, value) { this.attrs[key] = value; }
    removeAttribute(key) { delete this.attrs[key]; }
    addEventListener(key, value) { this.listeners[key] = value; }
    reportValidity() { return true; }
    focus() { this.focused = true; }
  }
  ids.forEach(id => { const element = new Element(); element.id = id; });
  const context = vm.createContext({
    document: {
      getElementById: id => elements.get(id),
      createElement: tag => new Element(tag),
      querySelectorAll: () => all.filter(e => e.name === 'accepted-milestone'),
    },
    Intl, URL, AbortController, setTimeout, clearTimeout, console,
    fetch: async (path, options) => {
      const body = options.body ? JSON.parse(options.body) : null;
      calls.push({path, body, options});
      let data;
      if (path === '/api/status') {
        data = {csrf:'fixture-csrf', mode:'fixture', ai:{modelId:'contract-test-model', ready:false}, merchantConfigReady:false};
      } else if (path === '/api/analyze') {
        data = {
          analysisId:'analysis-test',
          matches:body.milestones.map((milestone, index) => ({
            milestoneId:milestone.id, evidenceId:body.evidence[index].id,
            quote:body.evidence[index].text, similarity:0.82, signal:'related',
          })),
          ai:{modelId:'contract-test-model', mode:'semantic'},
        };
      } else if (path === '/api/invoices') {
        if (invoiceFailure) return {ok:false, status:409, json:async () => ({error:'Reconcile before retry', code:'PAYPAL_RECONCILE_REQUIRED', state:'UNKNOWN'})};
        data = {id:'fixture-test', mode:'fixture', status:'DRAFT', totalCents:18000, currency:'USD', source:'local-fixture'};
      } else throw new Error('Unexpected API path');
      return {ok:true, status:200, json:async () => data};
    },
  });
  const run = code => vm.runInContext(code, context);
  run(source);
  await new Promise(setImmediate);
  const analyze = () => run('analyze({preventDefault(){}})');
  const invoice = () => run('createInvoice({preventDefault(){}})');
  const acceptFirst = () => {
    const input = all.find(e => e.name === 'accepted-milestone');
    input.checked = true;
    input.listeners.change();
    elements.get('buyer-email').value = 'buyer@example.com';
  };
  return {elements, all, calls, run, analyze, invoice, acceptFirst};
}

function text(element) {
  return element.textContent + ' ' + element.children.map(child => typeof child === 'string' ? child : text(child)).join(' ');
}

test('static IDs, safe rendering API, and backend length limits', async () => {
  assert.equal(new Set(ids).size, ids.length);
  for (const [,id] of source.matchAll(/\$\('([^']+)'\)/g)) assert(ids.includes(id) || id.endsWith('-'), id);
  assert(!/innerHTML|insertAdjacentHTML|document\.write|eval\(/.test(source));
  const app = await boot();
  assert.equal(app.elements.get('criterion-parser').maxLength, 600);
  assert.equal(app.elements.get('evidence-parser-report').maxLength, 1200);
  assert.equal(app.calls.length, 1, 'Status must not start inference');
  assert.equal(app.calls[0].path, '/api/status');
  assert.equal(app.elements.get('analyze-button').disabled, false, 'Lazy loading must permit first analysis');
});

test('human selection, CSRF, exact total, double-click guard, fixture label and invalidation', async () => {
  const app = await boot();
  await app.analyze();
  assert.equal(app.elements.get('invoice-button').disabled, true);
  app.acceptFirst();
  assert.equal(app.elements.get('selected-total').textContent, '$180.00');
  assert.equal(app.elements.get('invoice-button').disabled, false);
  await Promise.all([app.invoice(), app.invoice()]);
  const sent = app.calls.filter(c => c.path === '/api/invoices');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].options.headers['X-CSRF-Token'], 'fixture-csrf');
  assert.deepEqual(sent[0].body.acceptedMilestoneIds, ['parser']);
  assert.equal(app.elements.get('invoice-button').disabled, true);
  assert(text(app.elements.get('invoice-result')).includes('Not a PayPal receipt'));
  app.run('invalidateReview()');
  assert.equal(app.elements.get('invoice-button').disabled, true);
  assert.equal(app.elements.get('selected-total').textContent, '$0.00');
});

test('one literal match per milestone with a bounded similarity value', async () => {
  const app = await boot();
  const payload = {milestones:[{id:'m1'},{id:'m2'}], evidence:[{id:'e',text:'actual evidence'}]};
  const valid = {analysisId:'x', matches:[
    {milestoneId:'m1', evidenceId:'e', quote:'actual', similarity:-1, signal:'x'},
    {milestoneId:'m2', evidenceId:'e', quote:'evidence', similarity:1, signal:'x'},
  ], ai:{mode:'semantic',modelId:'x'}};
  const check = data => app.run('validateAnalysis(' + JSON.stringify(data) + ',' + JSON.stringify(payload) + ')');
  assert.doesNotThrow(() => check(valid));
  const mutate = fn => { const candidate = structuredClone(valid); fn(candidate); assert.throws(() => check(candidate)); };
  mutate(c => { c.matches.pop(); });
  mutate(c => { c.matches.push({...c.matches[0]}); });
  mutate(c => { c.matches[1].milestoneId = 'm1'; });
  mutate(c => { c.matches[0].quote = ''; });
  mutate(c => { c.matches[0].quote = '   '; });
  mutate(c => { c.matches[0].quote = 'invented'; });
  mutate(c => { c.matches[0].similarity = 1.01; });
  mutate(c => { c.matches[0].similarity = -1.01; });
});

test('HTTP 409 reconciliation required locks retries even after analysis or refresh', async () => {
  const app = await boot({invoiceFailure:true});
  await app.analyze();
  app.acceptFirst();
  await app.invoice();
  assert.equal(app.elements.get('invoice-button').disabled, true);
  assert(text(app.elements.get('error-message')).includes('A draft may already exist'));
  await app.invoice();
  await app.run('refreshStatus()');
  await app.analyze();
  app.acceptFirst();
  await app.invoice();
  assert.equal(app.calls.filter(c => c.path === '/api/invoices').length, 1);
  assert.equal(app.elements.get('invoice-button').disabled, true);
});

test('only sandbox PayPal HTTPS links are rendered', async () => {
  const app = await boot();
  for (const url of ['javascript:alert(1)', 'https://www.paypal.com/invoice', 'https://sandbox.paypal.com.evil.test/', 'https://user:pass@sandbox.paypal.com/']) {
    assert.equal(app.run('sandboxHref(' + JSON.stringify(url) + ')'), null);
  }
  assert.equal(app.run("sandboxHref('https://www.sandbox.paypal.com/invoice')"), 'https://www.sandbox.paypal.com/invoice');
});

