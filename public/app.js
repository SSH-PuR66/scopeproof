'use strict';

const $ = id => document.getElementById(id);
const state = {
  status: null, analysis: null, accepted: new Set(), milestones: [], evidence: [],
  loadingStatus: false, analyzing: false, invoicing: false,
  createdAnalysisId: null, invoiceUncertain: false,
};
const examples = {
  milestones: [
    {id:'parser', title:'Deliver the web parser', criterion:'Deliver a CSV parser that rejects malformed input, with passing tests for at least 20 invalid rows.', amountCents:18000},
    {id:'receipts', title:'Export verifiable receipts', criterion:'Export a JSON receipt with source hashes and a replay command; verify a clean replay of the saved receipt.', amountCents:12000},
    {id:'accessibility', title:'Complete the accessibility review', criterion:'Document keyboard navigation and screen-reader results for the main workflow, with no unresolved blocking issues.', amountCents:9000},
  ],
  evidence: [
    {id:'parser-report', title:'Parser test report', text:'The CSV parser is implemented. The latest run passed 20 malformed-row rejection tests and 4 valid-row controls. The report records the test inputs and outcomes.'},
    {id:'receipt-note', title:'Receipt implementation note', text:'JSON receipt export is not implemented. Source hashes are missing, and no clean replay has been performed. This milestone remains unfinished.'},
    {id:'handoff-note', title:'General handoff note', text:'The demo uses synthetic records. The handoff contains the parser report and the unfinished receipt note. No keyboard-navigation or screen-reader review results are included.'},
  ],
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function money(cents) {
  return new Intl.NumberFormat('en-US', {style:'currency', currency:'USD'}).format(cents / 100);
}
function info(message) { $('status-message').textContent = message; }
function clearError() { $('error-message').textContent = ''; $('error-message').classList.add('hidden'); }
function error(message) { $('error-message').textContent = message; $('error-message').classList.remove('hidden'); }
function isBusy() { return state.loadingStatus || state.analyzing || state.invoicing; }

function renderInputs() {
  examples.milestones.forEach((item, index) => {
    const card = element('article', 'input-card');
    const heading = element('div', 'input-card-heading');
    heading.append(element('span', 'index-label', String(index + 1).padStart(2, '0')), element('h4', '', item.title));
    const label = element('label', 'criterion-label', 'Acceptance criterion');
    label.htmlFor = 'criterion-' + item.id;
    const input = element('textarea');
    input.id = label.htmlFor;
    input.value = item.criterion;
    input.required = true;
    input.maxLength = 600;
    input.rows = 3;
    const row = element('div', 'amount-row');
    const amountLabel = element('label', '', 'Milestone amount · USD');
    amountLabel.htmlFor = 'amount-' + item.id;
    const amountWrap = element('div', 'money-input');
    const currency = element('span', '', '$');
    currency.setAttribute('aria-hidden', 'true');
    const amount = element('input');
    amount.id = amountLabel.htmlFor;
    amount.type = 'text';
    amount.inputMode = 'decimal';
    amount.pattern = '[0-9]+([.][0-9]{1,2})?';
    amount.required = true;
    amount.maxLength = 9;
    amount.value = (item.amountCents / 100).toFixed(2);
    amount.setAttribute('aria-label', item.title + ' amount in US dollars');
    amountWrap.append(currency, amount);
    row.append(amountLabel, amountWrap);
    card.append(heading, label, input, row);
    $('milestone-inputs').append(card);
  });
  examples.evidence.forEach((item, index) => {
    const card = element('article', 'input-card');
    const heading = element('div', 'input-card-heading');
    heading.append(element('span', 'index-label', 'E' + (index + 1)), element('h4', '', item.title));
    const label = element('label', 'sr-only', item.title + ' evidence text');
    label.htmlFor = 'evidence-' + item.id;
    const input = element('textarea', 'evidence-text');
    input.id = label.htmlFor;
    input.value = item.text;
    input.required = true;
    input.maxLength = 1200;
    input.rows = 4;
    card.append(heading, label, input);
    $('evidence-inputs').append(card);
  });
}

function invalidateReview() {
  if (!state.analysis) return;
  state.analysis = null;
  state.accepted.clear();
  $('review-results').replaceChildren();
  $('review-results').classList.add('hidden');
  $('review-empty').classList.remove('hidden');
  $('analysis-provenance').classList.add('hidden');
  $('review-state').textContent = 'Inputs changed';
  info('Inputs changed. Run a new analysis before accepting milestones. Existing drafts are not changed by these edits.');
  updateControls();
}

function collectInputs() {
  const milestones = examples.milestones.map(item => {
    const criterion = $('criterion-' + item.id).value.trim();
    const amountText = $('amount-' + item.id).value.trim();
    if (!criterion) throw new Error('Every milestone needs an acceptance criterion.');
    if (!/^\d+(?:\.\d{1,2})?$/.test(amountText)) throw new Error('Enter amounts as dollars with at most two decimal places.');
    const [dollars, fraction = ''] = amountText.split('.');
    const amountCents = Number(dollars) * 100 + Number(fraction.padEnd(2, '0'));
    if (!Number.isSafeInteger(amountCents) || amountCents < 1 || amountCents > 1000000) throw new Error('Each milestone amount must be between $0.01 and $10,000.00.');
    return {id:item.id, title:item.title, criterion, amountCents};
  });
  const evidence = examples.evidence.map(item => ({id:item.id, text:$('evidence-' + item.id).value.trim()}));
  if (evidence.some(item => !item.text)) throw new Error('Each evidence field must contain text.');
  return {milestones, evidence};
}

async function request(path, body, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const options = {method:body === undefined ? 'GET' : 'POST', credentials:'same-origin', cache:'no-store', signal:controller.signal, headers:{Accept:'application/json'}};
    if (body !== undefined) {
      if (!state.status?.csrf) throw new Error('The session token is unavailable. Refresh the connection.');
      options.headers['Content-Type'] = 'application/json';
      options.headers['X-CSRF-Token'] = state.status.csrf;
      options.body = JSON.stringify(body);
    }
    const response = await fetch(path, options);
    let data;
    try { data = await response.json(); }
    catch {
      const failure = new Error('The server returned an unreadable response.');
      failure.unknownOutcome = body !== undefined;
      throw failure;
    }
    if (!response.ok) {
      const message = typeof data?.error === 'string' ? data.error : typeof data?.error?.message === 'string' ? data.error.message : typeof data?.message === 'string' ? data.message : 'Request failed (HTTP ' + response.status + ').';
      const failure = new Error(message.slice(0, 1200));
      failure.unknownOutcome = response.status >= 500 || data?.code === 'PAYPAL_RECONCILE_REQUIRED' || data?.error?.code === 'PAYPAL_RECONCILE_REQUIRED' || data?.state === 'UNKNOWN';
      throw failure;
    }
    return data;
  } catch (failure) {
    if (failure.name === 'AbortError') {
      const timeoutError = new Error('The request timed out. The server may still be working.');
      timeoutError.unknownOutcome = body !== undefined;
      throw timeoutError;
    }
    if (failure instanceof TypeError) failure.unknownOutcome = body !== undefined;
    throw failure;
  } finally { clearTimeout(timeout); }
}

async function refreshStatus() {
  if (isBusy()) return;
  state.loadingStatus = true;
  clearError();
  updateControls();
  try {
    const data = await request('/api/status');
    if (!data || !['fixture','paypal-sandbox'].includes(data.mode) || typeof data.csrf !== 'string' || !data.csrf || typeof data.ai?.modelId !== 'string' || typeof data.ai?.ready !== 'boolean' || typeof data.merchantConfigReady !== 'boolean') throw new Error('The API status response is incomplete. No analysis or invoice action was enabled.');
    if (state.status && (state.status.csrf !== data.csrf || state.status.mode !== data.mode)) invalidateReview();
    state.status = data;
    $('mode-badge').textContent = data.mode === 'fixture' ? 'Fixture mode' : 'PayPal Sandbox';
    $('mode-badge').className = 'badge ' + (data.mode === 'fixture' ? 'fixture' : 'sandbox');
    $('environment').textContent = data.mode === 'fixture' ? 'Local fixture · simulated invoice' : 'PayPal Sandbox · test invoices';
    $('model-name').textContent = data.ai.modelId + (data.ai.ready ? ' · ready' : ' · loads on first analysis');
    $('merchant-status').textContent = data.merchantConfigReady ? 'Configured' : data.mode === 'fixture' ? 'Not required for fixture' : 'Not configured';
    $('session-note').textContent = data.ai.ready ? 'Model reported ready. Analysis runs only when requested.' : 'First analysis may download and initialize the pinned model. This status check does not run it.';
    $('connection-dot').className = 'status-dot ready';
    $('invoice-environment-note').textContent = data.mode === 'fixture' ? 'Fixture mode produces a local simulated draft. It is not a PayPal receipt or PayPal API result.' : 'PayPal Sandbox creates test drafts. Sandbox amounts are not real funds.';
    info(data.mode === 'fixture' ? 'Connected in fixture mode. Invoice output will be simulated; no PayPal invoice is created.' : 'Connected to PayPal Sandbox. Review evidence before creating a test draft.');
  } catch (failure) {
    state.status = null;
    $('mode-badge').textContent = 'Unavailable';
    $('mode-badge').className = 'badge neutral';
    $('environment').textContent = 'Connection not verified';
    $('connection-dot').className = 'status-dot failed';
    $('session-note').textContent = 'The API could not be verified. Refresh the connection to retry.';
    error(failure.message || 'Could not reach the API.');
  } finally { state.loadingStatus = false; updateControls(); }
}

function validateAnalysis(data, payload) {
  if (typeof data?.analysisId !== 'string' || !data.analysisId || !Array.isArray(data.matches) || data.ai?.mode !== 'semantic' || typeof data.ai.modelId !== 'string') throw new Error('The analysis response is incomplete. No milestones were accepted.');
  const milestones = new Set(payload.milestones.map(item => item.id));
  const evidence = new Map(payload.evidence.map(item => [item.id, item.text]));
  if (data.matches.length !== milestones.size) throw new Error('The analysis must return exactly one match for every milestone.');
  const seen = new Set();
  for (const match of data.matches) {
    if (!milestones.has(match.milestoneId) || seen.has(match.milestoneId) || !evidence.has(match.evidenceId) || typeof match.quote !== 'string' || !match.quote.trim() || !Number.isFinite(match.similarity) || match.similarity < -1 || match.similarity > 1 || typeof match.signal !== 'string') throw new Error('The analysis returned an invalid or repeated evidence match.');
    seen.add(match.milestoneId);
    if (!evidence.get(match.evidenceId).includes(match.quote)) throw new Error('An analysis quote does not occur in its source evidence. Review was not enabled.');
  }
}

async function analyze(event) {
  event.preventDefault();
  if (isBusy() || !state.status) return;
  if (!$('analysis-form').reportValidity()) return;
  let payload;
  clearError();
  try { payload = collectInputs(); }
  catch (failure) { error(failure.message); return; }
  invalidateReview();
  state.analyzing = true;
  updateControls();
  $('analysis-form').setAttribute('aria-busy', 'true');
  info(state.status.ai.ready ? 'Matching the supplied evidence. Nothing is accepted automatically.' : 'Loading the pinned model and matching evidence. The first analysis can take several minutes.');
  try {
    const data = await request('/api/analyze', payload, 240000);
    validateAnalysis(data, payload);
    state.analysis = data;
    state.milestones = payload.milestones;
    state.evidence = payload.evidence;
    state.accepted.clear();
    state.status.ai.ready = true;
    $('model-name').textContent = data.ai.modelId + ' · used for this analysis';
    $('session-note').textContent = 'Semantic analysis returned successfully. Similarity does not certify completion.';
    renderReview();
    info('Evidence matched. Read the quoted passages and acceptance criteria, then make your own decision for each milestone.');
  } catch (failure) {
    state.analysis = null;
    error(failure.message || 'Analysis failed. No milestones were accepted.');
    info('Analysis did not complete successfully. No invoice has been requested.');
  } finally {
    state.analyzing = false;
    $('analysis-form').removeAttribute('aria-busy');
    updateControls();
  }
}

function renderReview() {
  $('review-results').replaceChildren();
  for (const milestone of state.milestones) {
    const card = element('article', 'review-card');
    const body = element('div', 'review-card-body');
    const titleRow = element('div', 'review-title-row');
    titleRow.append(element('h3', '', milestone.title), element('span', 'review-amount', money(milestone.amountCents)));
    body.append(titleRow, element('p', 'review-criterion', milestone.criterion));
    const matches = state.analysis.matches.filter(match => match.milestoneId === milestone.id);
    if (!matches.length) body.append(element('p', 'no-match', 'No matching passage was returned. Evidence of completion is not established.'));
    for (const match of matches) {
      const block = element('div', 'match');
      const meta = element('div', 'match-meta');
      meta.append(element('span', 'match-score', 'Similarity ' + match.similarity.toFixed(3)), element('span', 'match-signal', '· ' + match.signal));
      block.append(meta, element('blockquote', '', match.quote || 'No quoted passage returned.'), element('p', 'source-label', 'Evidence: ' + match.evidenceId + ' · Similarity is not completion.'));
      body.append(block);
    }
    const label = element('label', 'accept-label');
    const checkbox = element('input');
    checkbox.type = 'checkbox';
    checkbox.value = milestone.id;
    checkbox.name = 'accepted-milestone';
    const text = element('span', '', 'I reviewed and accept this milestone');
    text.append(element('small', '', 'My decision, not an automatic model approval.'));
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.accepted.add(milestone.id); else state.accepted.delete(milestone.id);
      card.classList.toggle('accepted', checkbox.checked);
      updateControls();
    });
    label.append(checkbox, text);
    card.append(body, label);
    $('review-results').append(card);
  }
  $('review-empty').classList.add('hidden');
  $('review-results').classList.remove('hidden');
  $('review-state').textContent = 'Human review required';
  $('analysis-provenance').textContent = 'Analysis ' + state.analysis.analysisId + ' · ' + state.analysis.ai.modelId + ' · semantic mode · values and quotes supplied by the API.';
  $('analysis-provenance').classList.remove('hidden');
}

function updateControls() {
  const busy = isBusy();
  $('refresh-status').disabled = busy;
  $('inputs-fieldset').disabled = state.analyzing || state.invoicing;
  $('analyze-button').disabled = busy || !state.status;
  $('analyze-button-label').textContent = state.analyzing ? 'Analyzing evidence…' : 'Analyze evidence';
  document.querySelectorAll('input[name="accepted-milestone"]').forEach(input => { input.disabled = state.analyzing || state.invoicing; });
  const total = state.milestones.filter(item => state.accepted.has(item.id)).reduce((sum, item) => sum + item.amountCents, 0);
  $('selected-total').textContent = money(total);
  $('selected-count').textContent = state.accepted.size + ' of 3 accepted';
  let blocker = '';
  if (state.invoiceUncertain) blocker = 'The previous draft request had an uncertain outcome. Check the server or sandbox before retrying; no automatic retry is allowed.';
  else if (!state.status) blocker = 'Connect to the API before creating a draft.';
  else if (!state.analysis || !state.accepted.size) blocker = 'Analyze evidence and accept at least one milestone.';
  else if (state.createdAnalysisId === state.analysis.analysisId) blocker = 'A draft was already created for this analysis. Re-analyze for a new review; existing drafts are unchanged.';
  else if (state.status.mode === 'paypal-sandbox' && !state.status.merchantConfigReady) blocker = 'PayPal Sandbox merchant configuration is missing.';
  else blocker = state.status.mode === 'fixture' ? 'This creates a local fixture only, not a PayPal invoice.' : 'This creates an unsent PayPal Sandbox draft.';
  const blocked = state.invoiceUncertain || !state.status || !state.analysis || !state.accepted.size || state.createdAnalysisId === state.analysis?.analysisId || (state.status?.mode === 'paypal-sandbox' && !state.status.merchantConfigReady);
  $('invoice-button').disabled = busy || blocked;
  $('buyer-email').disabled = state.invoicing;
  $('invoice-button-label').textContent = state.invoicing ? 'Creating draft…' : state.status?.mode === 'fixture' ? 'Create fixture draft' : 'Create draft invoice';
  $('invoice-blocker').textContent = blocker;
}

function sandboxHref(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol === 'https:' && !url.username && !url.password && (host === 'sandbox.paypal.com' || host.endsWith('.sandbox.paypal.com'))) return url.href;
  } catch { /* An untrusted link is simply not rendered. */ }
  return null;
}

function renderInvoice(data) {
  const result = $('invoice-result');
  result.replaceChildren();
  const fixture = data.source === 'local-fixture';
  result.append(element('span', 'badge ' + (fixture ? 'fixture' : 'sandbox'), fixture ? 'LOCAL FIXTURE · SIMULATED' : 'PAYPAL SANDBOX · TEST ONLY'));
  const title = element('h3', '', fixture ? 'Fixture draft prepared.' : 'Sandbox draft prepared.');
  title.id = 'draft-title';
  result.append(title);
  result.append(element('p', fixture ? 'fixture-warning' : '', fixture ? 'Not a PayPal receipt. No PayPal invoice was created. This local fixture is not evidence of a payment or external API call.' : 'Draft only. This is not proof of payment or completed delivery. No invoice was sent and no money was transferred.'));
  const list = element('dl');
  for (const [label, value] of [['Draft ID', data.id], ['Status', data.status], ['Total', money(data.totalCents) + ' USD'], ['Source', data.source]]) {
    const row = element('div');
    row.append(element('dt', '', label), element('dd', '', value));
    list.append(row);
  }
  result.append(list);
  const href = fixture ? null : sandboxHref(data.href);
  if (href) {
    const link = element('a', '', 'Open the sandbox draft ↗');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    result.append(link);
  }
  result.append(element('p', '', 'Later edits in ScopeProof do not update or delete this draft.'));
  result.classList.remove('hidden');
  result.focus();
}

async function createInvoice(event) {
  event.preventDefault();
  if (isBusy() || $('invoice-button').disabled || !state.analysis || !state.accepted.size) return;
  if (!$('invoice-form').reportValidity()) return;
  clearError();
  const analysisId = state.analysis.analysisId;
  const acceptedMilestoneIds = [...state.accepted].sort();
  const expectedTotal = state.milestones.filter(item => state.accepted.has(item.id)).reduce((sum, item) => sum + item.amountCents, 0);
  state.invoicing = true;
  updateControls();
  $('invoice-form').setAttribute('aria-busy', 'true');
  info('Creating an unsent draft for the selected milestones. No payment operation is requested.');
  try {
    const data = await request('/api/invoices', {analysisId, acceptedMilestoneIds, email:$('buyer-email').value.trim()}, 60000);
    const expectedSource = state.status.mode === 'fixture' ? 'local-fixture' : 'paypal-sandbox';
    if (typeof data?.id !== 'string' || !data.id || data.mode !== state.status.mode || data.source !== expectedSource || data.status !== 'DRAFT' || data.currency !== 'USD' || !Number.isSafeInteger(data.totalCents) || data.totalCents !== expectedTotal) {
      state.invoiceUncertain = true;
      throw new Error('The invoice response did not match the requested draft. Check the server or sandbox before retrying.');
    }
    state.createdAnalysisId = analysisId;
    renderInvoice(data);
    info(data.source === 'local-fixture' ? 'Local fixture draft created. It is not a PayPal receipt and no PayPal API success is claimed.' : 'PayPal Sandbox draft created. Nothing was sent or paid.');
  } catch (failure) {
    if (failure.unknownOutcome) state.invoiceUncertain = true;
    error((failure.message || 'Draft creation failed.') + (state.invoiceUncertain ? ' A draft may already exist; repeated creation is blocked in this session.' : ' No successful draft was confirmed.'));
  } finally {
    state.invoicing = false;
    $('invoice-form').removeAttribute('aria-busy');
    updateControls();
  }
}

renderInputs();
$('analysis-form').addEventListener('submit', analyze);
$('inputs-fieldset').addEventListener('input', invalidateReview);
$('invoice-form').addEventListener('submit', createInvoice);
$('refresh-status').addEventListener('click', refreshStatus);
updateControls();
refreshStatus();

