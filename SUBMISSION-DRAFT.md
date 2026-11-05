# ScopeProof — review draft, not submitted

## Tagline
Match the evidence. Review the milestone. Draft the invoice.

## Inspiration
Freelance work often ends with an awkward handoff: a list of promised features, scattered delivery notes, and an invoice that does not explain what was accepted. An AI summary can make that worse if it sounds certain while missing a failed test or an unfinished item. ScopeProof puts the original evidence beside the decision and keeps the invoice tied to the reviewed scope.

## What it does
You enter milestone criteria, prices and short delivery excerpts. A local embedding model retrieves relevant excerpts. The application displays the original wording and warns about simple explicit negatives. Nothing is accepted automatically. After you review and select milestones, the server can create and read back a PayPal Sandbox draft for those exact line items.

The default demonstration mode uses clearly marked local invoice fixtures; it does not create a PayPal resource. A real Sandbox integration check passed on November 5, 2026: actual local inference, OAuth 200, one draft creation 201, and read-back 200 with verified items and USD 1.00 total. The draft was not sent or paid. The sanitized receipt is in `receipts/sandbox-check.json`.

A separate recorded Edge walkthrough used actual local matching, selected only the synthetic parser milestone, and displayed a PayPal Sandbox draft with DRAFT status and USD 180.00 total. Editing its criterion then cleared the review and selection while leaving the existing draft unchanged. This UI observation does not independently capture provider HTTP statuses; those belong to the separate one-dollar check. Neither draft represents revenue. A public YouTube URL for the functioning demonstration is still required before this entry is complete.

## How we built it
Node.js serves a small plain-JavaScript application. Transformers.js runs a pinned, quantized MiniLM model locally. Monetary amounts stay in integer cents. A source digest binds the selected prices and evidence to the draft. The PayPal adapter reads the created draft back and checks the returned amount, currency, line items and status. Ambiguous responses produce an unknown state rather than an invented receipt.

Development used AI assistance, executable tests and an independent implementation review. No user work history, customer impact or business revenue is inferred from this prototype.

## A result that changed the design
An actual model run gave a similarity of 0.9687 to a statement that negated the requested behavior. Similarity was useful for finding the relevant excerpt, but insufficient for accepting the work. The final workflow makes that distinction visible and reserves acceptance for a person.

## Current limitations
The three-milestone UI is a prototype. Contradiction detection is only a word heuristic. Review and deduplication state are not durable across server restarts. The recorded Edge scenario covered analysis, human selection, the displayed Sandbox draft result and invalidation after an edit. Full keyboard and screen-reader accessibility remain unverified. A hosted demonstration and public video remain absent; local setup instructions are in the repository.

Public source repository: https://github.com/SSH-PuR66/scopeproof (MIT). This publication does not constitute a contest entry.

## Demonstration plan — under three minutes
1. Show three synthetic milestones: a supported parser delivery, unfinished receipt export and missing accessibility review.
2. Run real local semantic matching and inspect the original excerpts.
3. Explain why a high similarity score can still mean unfinished work.
4. Select only a milestone supported by the demonstrated evidence.
5. With configured sandbox credentials, create one Sandbox draft and show its returned DRAFT status, total and source, with the draft identifier and recipient redacted. Do not record fixture output as a real API response.
6. End with the actual tests and limitations. Record functioning UI footage; this outline is not a video.

## Unresolved entry fields
Participant eligibility and required attestations; public YouTube video URL and functioning visual demonstration. No fields should be represented as complete without evidence.
