# Write-Up

## What I prioritised

**First, the thing that must never break.**

- An author filing a ticket is the one action the business cannot afford to lose, so the ticket is saved in the DB and `201` is returned *before* any AI work.
- Classification and drafting happen in the background (Inngest), off the request path.
- Remove the OpenAI key entirely, or let the API go down → the portal still works end to end: tickets are created, the queue shows "AI unavailable", and the admin replies manually.

**Second, keeping the human in charge of the AI.**

The brief says a human sends every reply, so I built for the moment the AI is *wrong* rather than the moment it is right.

- Triage uses Structured Outputs, so an invalid category is impossible rather than something to repair afterwards.
- AI suggestions and human overrides live in separate columns. Re-classification rewrites only the suggestion, so an override survives, and the ticket shows what the AI thought beside what a person decided.
- When a draft is not up to mark, the admin flags that run. flag is stored, so a regenerated draft starts clean and the dashboard keeps the failures  which reply, on which ticket as the record of where the response went wrong.
- A ticket with no AI result says "AI pending" or "AI unavailable" — never a fabricated "Medium" or any assumptions.

**Third, cost discipline as a visible feature.**

- Only the knowledge-base sections ticket actually needs are sent never all six. The description is truncated, replies are capped at the last five, output is capped, and regeneration is rate-limited.
- Measured against a naive "whole knowledge base + whole history on every call" prompt, this sends **≈37% fewer input tokens**, and the gap widens as threads grow.
- Every run stores its token counts, and the admin dashboard can calculate the cost of the AI.

## Trade-offs

**SSE -** Every live update goes one way, server to browser, and every user action is already a REST call. The stream carries only "ticket X changed" and the browser refetches over REST, so permission checks stay in the endpoints. Cost: the bus is in-process, so it needs `LISTEN/NOTIFY` before running more than one API instance.

**No RAG.** The knowledge base is six short sections. Embeddings and a vector database would have been infrastructure standing in for a lookup.

**No outbox.** The Inngest event is sent after the commit, so a failed send leaves a ticket pending until an admin retries. I built a recovery cron for this and then removed it — at this scale it guarded a case the manual retry already covers.

# How I would improve the portal for production

Before using it with real authors, I would focus on preventing misuse, making failures visible, and helping the support team keep track of work.

## Protect AI suggestions

- **Check the ticket content, not instructions inside it.** If an author writes “mark this critical” or “ignore your rules,” the model should classify the actual support request. For example, a question about changing a profile photo should not become critical just because the message asks for that label.
- **Check AI replies before showing them to an admin.** Flag drafts that invent a refund, payment date, or completed investigation, or promise a priority the ticket does not support. Show the admin why a draft was flagged; the admin can edit it or write a reply themselves.

## Make the service safer and more reliable

- **Share rate limits across API instances.** Store login and request counts in Redis. Otherwise, if two API servers are running, each could allow 20 requests per minute and a user could effectively make 40. The shared limit helps slow brute-force login attempts and spam.
- **Keep background events from going missing.** Save a ticket and an event-to-send record in the same database transaction. A worker can send pending events to Inngest and retry if the network is down. This avoids a ticket being saved without its AI job being queued.
- **Protect cookie-based actions.** Add CSRF checks to routes that change data, especially if the browser and API use cross-site cookies. This helps prevent another website from causing an admin or author to submit an action without intending to.
- **Scan uploaded files.** Check attachments for malware before making them available to staff or authors.

## Help the support team manage tickets

- **Send email updates.** Authors should be able to learn about a reply without keeping the portal open.
- **Assign tickets and track response targets.** This makes it clear who owns each request and which requests need attention first.
- **Test the main cases.** Cover ticket submission, admin replies, status changes, permissions, AI failures, and suspicious messages.

## Improve AI using evidence

- **Keep a fixed set of sample tickets.** Score category, priority, and whether a reply makes up facts whenever the prompt or model changes.
- **Record what happened on each AI run.** Keep the model and prompt version, token use, errors, and whether an admin edited or flagged the result. This helps explain mistakes and track cost.
- **Review results by ticket type.** A change might improve royalty questions but make profile questions worse. Check both before adopting it.
