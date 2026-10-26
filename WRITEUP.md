# Write-up

## What I prioritised

The brief says to prefer a working ticket flow and real AI integration over nice-to-haves, so I
built in that order and let the UI stay plain.

**First, the thing that must never break.** An author filing a ticket is the one action the
business cannot afford to lose, so the ticket is saved and `201` returned *before* any AI work;
classification and drafting happen afterwards in Inngest. Remove the OpenAI key entirely and the
portal still works end to end: tickets are created, the queue shows "AI unavailable", and the admin
replies by hand.

**Second, AI an ops team would trust.** Triage uses Structured Outputs, so an invalid category is
impossible rather than something to repair. AI suggestions and human overrides live in separate
columns, so an override survives re-classification and the UI can show both. A ticket with no AI
result says "AI pending" or "AI unavailable" — never a fabricated "Medium" that looks like a
judgement nobody made.

**Third, cost discipline as a visible feature.** Only the knowledge-base sections a ticket needs
are sent, the description is truncated, output is capped, and regeneration is rate-limited. Every
run stores its token counts and the admin dashboard turns those into rupees: ₹0.46 for 15 tickets,
about **₹0.03 per ticket** — a number I would rather show than claim.

## Trade-offs

**SSE, not WebSockets.** Every live update goes one way, server to browser, and every user action
is already a REST call, so a two-way socket would be weight I never use plus a second auth path to
maintain. The stream carries only "ticket X changed" and the browser refetches over REST, so
permission checks stay in the endpoints that already do them. Cost: it is in-process, so it needs
`LISTEN/NOTIFY` before running more than one API instance.

**No RAG.** The knowledge base is six short sections. Embeddings and a vector database would have
been infrastructure in place of a lookup.

**Code-first API docs.** Each route is declared once, and that declaration registers the route,
validates the request, and produces the OpenAPI document. A hand-written YAML would have been
faster on day one and wrong by day three.

**No test suite.** The honest trade-off: in four days I chose working features and manual
verification against a running API, including the seven fixtures from the brief. I would not make
the same choice on a system people depend on.

**No outbox.** The Inngest event is sent after the commit, so a failed send leaves a ticket pending
until an admin retries. I had a recovery cron and removed it — for this scope it guarded a case the
manual retry already covers.

## In production

**First:** a test suite around the ticket lifecycle and the AI failure paths, and a shared store
(Redis or Postgres) for rate limits and the event bus so the API can scale past one instance. Then
a transactional outbox, so no ticket sits unclassified because one network call failed.

**Then the gaps a real desk would feel:** email notification, multi-admin assignment with
first-response targets, malware scanning on uploads, and CSRF tokens on mutating routes.

**For the AI, a real evaluation loop.** Today the dashboard shows average confidence, the override
rate, and drafts an admin flagged as poor — honest signals that cost the admin nothing, but not an
eval. I would turn the fixtures into a scored regression suite, run it on every prompt change, use
flagged drafts as the improvement dataset, then A/B a cheaper or larger model against that suite,
since the model is only an environment variable.

**One honest unknown.** The override rate is 0% on a small dataset, which tells me very little.
Real traffic, and whether admins actually press the flag button, is what would show whether the
drafts save time or merely look plausible.
