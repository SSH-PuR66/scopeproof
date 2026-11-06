# ScopeProof

**Turn delivery evidence into a reviewed invoice draft.** A local-first prototype for the 2026 PayPal AI Hackathon, prepared for Sergio Rodriguez. AI-assisted implementation; no award, client acceptance, or live payment is claimed.

Source repository: [SSH-PuR66/scopeproof](https://github.com/SSH-PuR66/scopeproof), published under MIT. Repository publication is not a hackathon entry or an award.

Public demonstration: [ScopeProof — evidence to invoice, with human review](https://youtu.be/LAmobU_wShs) (2:18, English captions, synthetic examples). Published materials alone are not proof of contest submission or an award.

Contest status, November 6, 2026: [ScopeProof on Devpost](https://devpost.com/software/scopeproof-1hl2ep) is **submitted** to PayPal AI Hackathon, confirmed by Devpost's project page and submission-confirmation email. Award and payment are not confirmed.

ScopeProof ranks supplied evidence excerpts against each milestone using a real MiniLM embedding model on your CPU. It displays the original text, similarity and a simple contradiction warning. You decide which milestones to include. The server builds a PayPal Sandbox invoice only from the reviewed snapshot and your explicit selection, then reads the invoice back to verify status, line items and amount.

## Run

Requirements: Node.js 22.9.0 or newer, npm, and internet for initial dependency/model downloads.

```powershell
npm ci
npm test
npm run check:ai
npm start
```

Open `http://127.0.0.1:4317`. The server binds only to this local address. Stop with Ctrl+C. It is not a service or scheduled task.

The first analysis downloads the pinned public model into `.cache/`. Subsequent inference runs locally; input excerpts are not sent to a model API. The current implementation accepts 1–12 milestones and up to 24 excerpts through the API; the UI provides three editable example milestones. Examples are synthetic, not client results. Close the server to clear its in-memory review state.

## Two integration modes

The default `fixture` mode exercises the review-to-draft flow without any PayPal requests. Every invoice is prominently labeled simulated, has a `LOCAL-` ID, and is **not a PayPal receipt**. The AI still runs the actual model.

For PayPal Sandbox, copy `.env.example` to `.env`, set `PAYPAL_MODE=paypal-sandbox`, and supply credentials for your own sandbox application plus its merchant email. Use a sandbox recipient account in the UI. Restart the app. Never commit `.env` or publish secrets; judges can configure their own sandbox app. Only the fixed `api-m.sandbox.paypal.com` host is supported. There is no production mode, invoice-send endpoint, payment capture, refund, or bank transfer.

A real Sandbox round trip was verified on November 5, 2026: OAuth returned 200, one draft creation returned 201, and its read-back returned 200. The checked draft remained `DRAFT`, with the expected line item and USD 1.00 total. Actual local MiniLM inference ran in the same check. See the [sanitized integration receipt](receipts/sandbox-check.json), which identifies the tested source commit. The invoice was not sent or paid. This verifies that configured Sandbox account and test case, not every account or production deployment.

A separate [public Edge walkthrough](https://youtu.be/LAmobU_wShs) shows real analysis, selection of the synthetic parser milestone, and a `paypal-sandbox` result with `DRAFT` status and USD 180.00 total. A later criterion edit cleared the selection and invalidated the review without changing the existing draft. Provider HTTP statuses were not independently captured for that UI scenario; the one-dollar API receipt is separate evidence. No money moved in either case.

## What the AI can and cannot establish

The model retrieves relevant language, not truth or completion. In our real inference check, “does not reject malformed dates” scored 0.9687 against “rejects malformed dates.” The app flags the explicit negation and requires a human decision. Other contradictions can escape the small English word heuristic. Scores are not calibrated probabilities. The model may truncate long excerpts, and this app does not run uploaded code or verify external artifacts.

No milestone is automatically accepted. An accepted checkbox is the operator's local decision, not a client's signature or a legal acceptance record. This is not escrow or payment protection.

## Failure handling

Prices use integer USD cents from the server-side review snapshot. Changes to inputs invalidate the UI review. Duplicate selections and unknown milestones fail. Duplicate requests for the same source, recipient and selected IDs share an in-process result.

If a Sandbox create/read-back result is ambiguous, that key is held as `UNKNOWN` and cannot be retried in that server process. Check the merchant's Sandbox invoice list before further attempts. Do not restart to bypass the hold. State is currently in memory: there is **no cross-restart exactly-once guarantee** or durable invoice ledger. Production deployment would require durable reconciliation and access controls; it is outside this prototype.

## Verification and entry status

- `npm test`: executable domain, HTTP and mocked PayPal checks.
- `npm run check:ai`: actual pinned MiniLM inference, exact-source retrieval and a negation counterexample; writes `receipts/ai-check.json`.
- The recorded Edge scenario covers the demonstrated analysis, selection, Sandbox draft result and input-edit invalidation. It does not establish complete keyboard or screen-reader accessibility, which remain unverified.
- A real Sandbox API create/read-back has passed in the separate one-dollar case; provider request counts and statuses are not independently established by the UI recording.
- The public functioning demonstration video is available, and Devpost has confirmed project submission. Participant confirmations remain self-reports, not an organizer eligibility or award decision. No award or payment is confirmed, and no credentials are included.

## Sources and licenses

Application code: MIT, see `LICENSE`. Transformers.js 3.8.1: Apache-2.0. Model: [Xenova/all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2), Apache-2.0, revision `751bff37182d3f1213fa05d7196b954e230abad9`. Model weights and dependencies are downloaded separately, not redistributed in the source bundle; retain their notices.

- [PayPal Invoicing API](https://developer.paypal.com/api/invoicing/v2/invoices-create)
- [Transformers.js Node inference](https://huggingface.co/docs/transformers.js/tutorials/node)
- [Hackathon rules](https://paypalaihackathon.devpost.com/rules)

This project has no affiliation with or endorsement by PayPal, Hugging Face or Devpost.
