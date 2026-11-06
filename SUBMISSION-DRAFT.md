# ScopeProof — review draft, not submitted

## Tagline
Match the evidence. Review the milestone. Draft the invoice.

Public demonstration: https://youtu.be/LAmobU_wShs (2:18, English captions, synthetic examples).

Public source and local setup: https://github.com/SSH-PuR66/scopeproof (MIT).

## Inspiration
Freelance handoffs connect three things that often live apart: promised milestones, delivery evidence and an invoice. An AI summary can obscure an unfinished item if it sounds more certain than the source. ScopeProof keeps the original excerpt beside the human decision and ties the invoice draft to that reviewed scope.

## What it does
Enter milestone criteria, prices and delivery excerpts. A local embedding model retrieves relevant excerpts; the interface displays their original wording, similarity and simple explicit-negation warnings. The reviewer chooses which milestones to include. The server creates and reads back a PayPal Sandbox invoice draft for that selection. Editing the inputs invalidates the review without altering an existing draft.

The default fixture mode is explicitly simulated. Configured Sandbox mode uses the real PayPal Invoicing API. Drafts are not sent, and the app does not capture payments or transfer money. A review checkbox is the operator's decision, not client acceptance.

## How I built it
Node.js 22.9+ serves a plain-JavaScript interface. Transformers.js runs a pinned, quantized MiniLM model locally on the CPU. Amounts stay in integer USD cents, and a source digest binds evidence and prices to the reviewed snapshot. The PayPal adapter checks the returned status, currency, amount and line items. Ambiguous create/read-back results are held as UNKNOWN, blocking a blind retry in that process.

Development used AI assistance, executable tests and independent implementation review. The repository documents local setup and includes a sanitized Sandbox receipt; credentials and model weights are not included.

## Challenges I ran into
A real inference check scored “does not reject malformed dates” at 0.9687 against “rejects malformed dates.” High similarity could retrieve exactly the evidence that disproves completion. Keeping source text visible, adding a limited negation warning and requiring human selection became central to the workflow. Handling ambiguous PayPal responses also required preserving uncertainty instead of returning an invented success.

## Accomplishments
A separate USD 1.00 API test completed actual local inference, OAuth 200, draft creation 201 and read-back 200, verifying the expected line item and DRAFT status. Its sanitized receipt is in `receipts/sandbox-check.json`.

The public 2:18 video shows real local analysis, selection of one synthetic parser milestone, a displayed PayPal Sandbox DRAFT for USD 180.00, and selection resetting after a criterion edit while the existing draft remains unchanged. Provider HTTP statuses were not independently captured for this UI scenario; they belong to the separate USD 1.00 test. Neither draft is revenue.

## What I learned
Semantic relevance and completed work are different claims. AI helps locate the excerpt; the reviewer needs the original wording and an explicit decision. The invoice must reflect the reviewed data, and an uncertain provider response must remain uncertain until reconciled.

## What's next
Validate the workflow with freelancers, add durable review and reconciliation storage, and complete keyboard and screen-reader testing before considering production use. The current three-milestone UI is a prototype. Negation detection is a small English word heuristic, model input can be truncated, and duplicate prevention does not survive a restart. There is no hosted application; the repository provides local setup. No customer adoption, time savings, award or revenue is claimed.

## Built with
JavaScript, Node.js, HTML, CSS, Hugging Face Transformers.js, Xenova/all-MiniLM-L6-v2, PayPal Invoicing API, PayPal Sandbox.

## Entry status — not part of the project story
The video and source repository are public. Hackathon registration is confirmed; project submission is not. This document contains prepared project text, not a submission receipt or an organizer's eligibility decision. Final submission requires completing and checking the actual Devpost form.
