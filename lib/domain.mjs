import {createHash, randomUUID} from 'node:crypto';

export class InputError extends Error {}
export function requireValue(ok, message) {
  if (!ok) throw new InputError(message);
}
const identifier = /^[A-Za-z0-9_-]{1,48}$/;
function boundedText(value, max, name) {
  requireValue(typeof value === 'string' && value.trim().length > 0 && value.length <= max, `${name} must contain 1–${max} characters.`);
  return value.trim();
}
function uniqueIds(items) {
  requireValue(new Set(items.map(x => x.id)).size === items.length, 'IDs must be unique within each list.');
}
export function validateAnalysis(body) {
  requireValue(body && typeof body === 'object', 'A JSON object is required.');
  requireValue(Array.isArray(body.milestones) && body.milestones.length >= 1 && body.milestones.length <= 12, 'Provide 1–12 milestones.');
  requireValue(Array.isArray(body.evidence) && body.evidence.length <= 24, 'Provide at most 24 evidence excerpts.');
  const milestones = body.milestones.map(m => {
    requireValue(m && typeof m.id === 'string' && identifier.test(m.id), 'Invalid milestone ID.');
    requireValue(Number.isSafeInteger(m.amountCents) && m.amountCents > 0 && m.amountCents <= 1000000, 'Each price must be 1–1,000,000 integer USD cents.');
    return {id: m.id, title: boundedText(m.title, 120, 'Title'), criterion: boundedText(m.criterion, 600, 'Criterion'), amountCents: m.amountCents};
  });
  const evidence = body.evidence.map(e => {
    requireValue(e && typeof e.id === 'string' && identifier.test(e.id), 'Invalid evidence ID.');
    return {id: e.id, text: boundedText(e.text, 1200, 'Evidence excerpt')};
  });
  uniqueIds(milestones); uniqueIds(evidence);
  return {milestones, evidence};
}

// A retrieval model finds relevant text. It does not verify whether a deliverable exists.
export async function analyze(input, embed) {
  const {milestones, evidence} = validateAnalysis(input);
  let vectors = [];
  if (evidence.length) {
    vectors = await embed([...milestones.map(m => m.criterion), ...evidence.map(e => e.text)]);
    requireValue(Array.isArray(vectors) && vectors.length === milestones.length + evidence.length, 'Model returned incomplete embeddings.');
    const dimension = vectors[0]?.length;
    requireValue(dimension > 0 && vectors.every(v => v.length === dimension && v.every(Number.isFinite)), 'Model returned invalid embeddings.');
  }
  const matches = milestones.map((m, i) => {
    const ranked = evidence.map((e, j) => ({...e, score: cosine(vectors[i], vectors[milestones.length + j])})).sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const caution = best && /\b(not|never|missing|pending|failed|incomplete|unimplemented)\b/i.test(best.text);
    return {
      milestoneId: m.id, evidenceId: best?.id ?? null, quote: best?.text ?? '',
      similarity: best ? Number(best.score.toFixed(4)) : null,
      signal: !best ? 'No evidence supplied' : caution ? 'Possible contradiction — read the excerpt' : 'Related excerpt — human review required'
    };
  });
  const sourceDigest = createHash('sha256').update(JSON.stringify({milestones, evidence})).digest('hex');
  return {analysisId: randomUUID(), sourceDigest, milestones, evidence, matches, createdAt: new Date().toISOString()};
}
export function cosine(a, b) {
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) {dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2;}
  requireValue(aa > 0 && bb > 0, 'Model returned a zero vector.');
  return Math.max(-1, Math.min(1, dot / Math.sqrt(aa * bb)));
}
export function invoiceSelection(analysis, body) {
  requireValue(analysis, 'Analysis expired or is unknown. Run the review again.');
  const ids = body.acceptedMilestoneIds;
  requireValue(Array.isArray(ids) && ids.length > 0, 'Select at least one milestone after reviewing its evidence.');
  requireValue(new Set(ids).size === ids.length, 'Duplicate milestone selection.');
  const byId = new Map(analysis.milestones.map(m => [m.id, m]));
  requireValue(ids.every(id => byId.has(id)), 'Selection contains an unknown milestone.');
  const email = boundedText(body.email, 254, 'Sandbox recipient email');
  requireValue(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Enter a valid sandbox recipient email.');
  const milestones = ids.map(id => byId.get(id));
  requireValue(milestones.every(m => analysis.matches.find(x => x.milestoneId === m.id)?.evidenceId), 'A selected milestone has no evidence.');
  const totalCents = milestones.reduce((s, m) => s + m.amountCents, 0);
  // Prices come from the reviewed server snapshot, never from the invoice request.
  const key = createHash('sha256').update(JSON.stringify({sourceDigest: analysis.sourceDigest, ids: [...ids].sort(), email})).digest('hex').slice(0,32);
  return {milestones, totalCents, email, key, sourceDigest: analysis.sourceDigest};
}
export function buildInvoicePayload(selection, merchantEmail) {
  return {
    detail: {currency_code: 'USD', reference: `ScopeProof-${selection.key.slice(0,12)}`, memo: `Evidence SHA256 ${selection.sourceDigest}`, note: 'Sandbox demonstration. Reviewed milestone draft; no payment has been received.', payment_term: {term_type: 'DUE_ON_RECEIPT'}},
    invoicer: {email_address: merchantEmail},
    primary_recipients: [{billing_info: {email_address: selection.email}}],
    items: selection.milestones.map(m => ({name: m.title, description: m.criterion, quantity: '1', unit_amount: {currency_code: 'USD', value: (m.amountCents / 100).toFixed(2)}})),
    configuration: {allow_tip: false, partial_payment: {allow_partial_payment: false}}
  };
}
