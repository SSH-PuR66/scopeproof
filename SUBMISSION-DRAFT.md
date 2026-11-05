# ScopeProof — review draft, not submitted

## Tagline
Match the evidence. Review the milestone. Draft the invoice.

## Inspiration
Freelance work often ends with an awkward handoff: a list of promised features, scattered delivery notes, and an invoice that does not explain what was accepted. An AI summary can make that worse if it sounds certain while missing a failed test or an unfinished item. ScopeProof puts the original evidence beside the decision and keeps the invoice tied to the reviewed scope.

## What it does
You enter milestone criteria, prices and short delivery excerpts. A local embedding model retrieves relevant excerpts. The application displays the original wording and warns about simple explicit negatives. Nothing is accepted automatically. After you review and select milestones, the server can create and read back a PayPal Sandbox draft for those exact line items.

The default demonstration mode uses clearly marked local invoice fixtures; it does not create a PayPal resource. The actual Sandbox adapter is implemented but its live sandbox round trip is not yet verified. This draft must not be submitted as a fully integrated demonstration until that check is complete.

## How we built it
Node.js serves a small plain-JavaScript application. Transformers.js runs a pinned, quantized MiniLM model locally. Monetary amounts stay in integer cents. A source digest binds the selected prices and evidence to the draft. The PayPal adapter reads the created draft back and checks the returned amount, currency, line items and status. Ambiguous responses produce an unknown state rather than an invented receipt.

Development used AI assistance, executable tests and an independent implementation review. No user work history, customer impact or business revenue is inferred from this prototype.

## A result that changed the design
An actual model run gave a similarity of 0.9687 to a statement that negated the requested behavior. Similarity was useful for finding the relevant excerpt, but insufficient for accepting the work. The final workflow makes that distinction visible and reserves acceptance for a person.

## Current limitations
The three-milestone UI is a prototype. Contradiction detection is only a word heuristic. Review and deduplication state are not durable across server restarts. No end-to-end Sandbox receipt, visual/accessibility validation, hosted demonstration or video is claimed yet.

Public source repository: https://github.com/SSH-PuR66/scopeproof (MIT). This publication does not constitute a contest entry.

## Demonstration plan — under three minutes
1. Show three synthetic milestones: a supported parser delivery, unfinished receipt export and missing accessibility review.
2. Run real local semantic matching and inspect the original excerpts.
3. Explain why a high similarity score can still mean unfinished work.
4. Select only a milestone supported by the demonstrated evidence.
5. With configured sandbox credentials, create a draft and show its verified Sandbox ID and total. Do not record fixture output as a real API response.
6. End with the actual tests and limitations. Record functioning UI footage; this outline is not a video.

## Unresolved entry fields
Participant eligibility and required attestations; public YouTube video URL; actual Sandbox validation receipt. No fields should be represented as complete without evidence.
