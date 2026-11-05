import {buildInvoicePayload, requireValue} from './domain.mjs';
const SANDBOX = 'https://api-m.sandbox.paypal.com';
function reconcileError() {
  const error = new Error('The Sandbox draft outcome is unknown. Check the merchant Sandbox invoice list before any further attempt; do not retry or restart to bypass this hold.');
  error.code = 'PAYPAL_RECONCILE_REQUIRED';
  return error;
}
function cents(money) {
  if (money?.currency_code !== 'USD' || !/^\d+\.\d{2}$/.test(money?.value ?? '')) return null;
  const result = Number(money.value.replace('.',''));
  return Number.isSafeInteger(result) ? result : null;
}
function verifyDraft(invoice, selection, id) {
  if (invoice.id !== id || invoice.status !== 'DRAFT' || cents(invoice.amount) !== selection.totalCents) return false;
  if (!Array.isArray(invoice.items) || invoice.items.length !== selection.milestones.length) return false;
  const actual = invoice.items.map(i => JSON.stringify([i.name, Number(i.quantity), cents(i.unit_amount)])).sort();
  const expected = selection.milestones.map(m => JSON.stringify([m.title, 1, m.amountCents])).sort();
  return JSON.stringify(actual) === JSON.stringify(expected);
}
export function makePayPal({mode = 'fixture', clientId = '', clientSecret = '', merchantEmail = '', fetchImpl = fetch} = {}) {
  requireValue(['fixture', 'paypal-sandbox'].includes(mode), 'Only fixture or paypal-sandbox mode is supported.');
  const configured = Boolean(clientId && clientSecret && merchantEmail);
  const receipts = new Map();
  const inFlight = new Map();
  const uncertain = new Set();
  let tokenCache;
  async function api(url, options) {
    const result = await fetchImpl(url, {...options, redirect: 'error', signal: AbortSignal.timeout(20000)});
    if (!result.ok) throw new Error(`PayPal Sandbox returned HTTP ${result.status}. No payment was made.`);
    return result.json();
  }
  async function create(selection) {
    if (uncertain.has(selection.key)) throw reconcileError();
    if (receipts.has(selection.key)) return receipts.get(selection.key);
    if (inFlight.has(selection.key)) return inFlight.get(selection.key);
    const operation = (async () => {
      let result;
      if (mode === 'fixture') {
        result = {id: `LOCAL-${selection.key.slice(0,12)}`, mode, status: 'DRAFT', totalCents: selection.totalCents, currency: 'USD', source: 'local-fixture'};
      } else {
        requireValue(configured, 'PayPal Sandbox credentials and merchant email are not configured.');
        if (!tokenCache || tokenCache.expiresAt <= Date.now()) {
          const token = await api(`${SANDBOX}/v1/oauth2/token`, {method: 'POST', headers: {Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded'}, body: 'grant_type=client_credentials'});
          if (!token.access_token || !Number.isFinite(token.expires_in)) throw new Error('PayPal Sandbox returned an invalid token response.');
          tokenCache = {value: token.access_token, expiresAt: Date.now() + Math.max(0, token.expires_in - 60) * 1000};
        }
        try {
          const created = await api(`${SANDBOX}/v2/invoicing/invoices`, {method: 'POST', headers: {Authorization: `Bearer ${tokenCache.value}`, 'Content-Type': 'application/json', Prefer: 'return=representation', 'PayPal-Request-Id': selection.key}, body: JSON.stringify(buildInvoicePayload(selection, merchantEmail))});
          if (typeof created.id !== 'string' || !/^INV2-[A-Z0-9-]+$/.test(created.id)) throw reconcileError();
          const verified = await api(`${SANDBOX}/v2/invoicing/invoices/${created.id}`, {method:'GET',headers:{Authorization:`Bearer ${tokenCache.value}`}});
          if (!verifyDraft(verified, selection, created.id)) throw reconcileError();
          result = {id: verified.id, mode, status: 'DRAFT', totalCents: cents(verified.amount), currency: verified.amount.currency_code, source: 'paypal-sandbox'};
        } catch {
          // Request-id support is not documented for this endpoint. Never assume a retry is safe.
          uncertain.add(selection.key);
          throw reconcileError();
        }
      }
      receipts.set(selection.key, result);
      return result;
    })();
    inFlight.set(selection.key, operation);
    try {return await operation;} finally {inFlight.delete(selection.key);}
  }
  return {mode, configured, create};
}
