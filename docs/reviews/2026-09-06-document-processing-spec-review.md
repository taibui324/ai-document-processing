# Document-processing spec review

Reviewed on 2026-09-06 against the assessment requirements supplied in the conversation. Scope: proposal, design, tasks, and all five capability specifications under `openspec/changes/build-resilient-document-processing`.

**Architectural verdict: keep this architecture; resolve the delivery-status contradiction and tighten two recovery contracts before implementation.** All assessment requirement groups have planned coverage. The strongest decisions are atomic acceptance, independent AI/vendor checkpoints, one retry owner, fenced worker leases, and vendor-backed idempotency. The main delivery risk is implementing and proving the custom scheduler within the chosen eight-hour target.

This is a specification review. The workspace has no application, migrations, Docker setup, or runnable application tests yet. All 32 implementation tasks are unchecked. OpenSpec strict validation passes; that establishes artifact validity, not working resilience. Existing specification files were not changed.

## Findings, in priority order

### 1. P1 — Failed delivery must not be reported as definitely undelivered

Evidence: [design.md:119](/Users/taibui/Desktop/project/medicon/openspec/changes/build-resilient-document-processing/design.md:119) labels extraction after vendor-stage failure as “undelivered.” This conflicts with the explicit uncertain-outcome contract in [vendor-delivery/spec.md:40](/Users/taibui/Desktop/project/medicon/openspec/changes/build-resilient-document-processing/specs/vendor-delivery/spec.md:40) and the warning in design line 221.

**Failure:** the vendor commits its receipt, its response is lost, and subsequent attempts exhaust their budget. The job is locally FAILED, but the vendor has accepted it. “Undelivered” can prompt an operator to submit a new job with a new key, creating the very duplicate this design is intended to prevent.

**Smallest correction:** use “delivery unconfirmed” whenever any attempt may have reached the vendor without a validated receipt. Reserve a definite non-delivery description for cases where it is established. Keep the existing FAILED lifecycle state; another workflow state or reconciliation service is unnecessary for this assessment. Preserve uncertainty across later failures rather than deriving it only from the last HTTP error.

**Acceptance evidence:** accept-then-drop followed by exhausted retries must return FAILED, preserve extraction, report that remote acceptance may have occurred, and retain exactly one vendor receipt. A subsequent definitive error must not erase earlier uncertainty.

### 2. P2 — Bound calls by the remaining lease, not only its configured duration

Evidence: [design.md:68](/Users/taibui/Desktop/project/medicon/openspec/changes/build-resilient-document-processing/design.md:68) acquires a 90-second lease before gate checking and attempt recording. Line 72 relies on a 60-second request timeout being shorter than the lease. The start condition requires only that the lease remains unexpired.

**Failure:** gate/DB delay or a process pause consumes 40 seconds after claim. A fresh 60-second request can then run beyond the remaining 50-second lease. Another worker can reclaim the job while the first request is still active. Fencing already protects local state, and vendor idempotency protects vendor effects, but avoidable repeated AI work and discarded successful results remain possible.

**Smallest correction:** at attempt start, compute the effective timeout as the minimum of configured request timeout, remaining stage time, and remaining lease time minus a checkpoint allowance. If insufficient lease time remains, release/reclaim without contacting the provider. Continue rejecting stale writes. This reduces avoidable overlap; process suspension and remote processing still prevent an absolute no-overlap guarantee.

**Acceptance evidence:** delay a worker between claim and dispatch until its lease is nearly expired; verify it does not start a full-duration call and cannot overwrite a later owner's result. Add this to the existing two-worker test rather than introducing a heartbeat subsystem.

### 3. P2 — Define what happens when Redis fails after a provider response

Evidence: the failure sequence at [design.md:202](/Users/taibui/Desktop/project/medicon/openspec/changes/build-resilient-document-processing/design.md:202) updates Redis before recording the 429 result and retry schedule in MySQL. [tasks.md:20](/Users/taibui/Desktop/project/medicon/openspec/changes/build-resilient-document-processing/tasks.md:20) requires bounded Redis calls, but the result-handling path does not explicitly say that a failed cooldown write must still checkpoint the provider result.

**Failure:** Gemini returns 429 with a long Retry-After, then Redis becomes unavailable. If the failed cooldown update exits result handling, the known rate limit and due time are not persisted. Recovery sees an abandoned attempt and can lose the provider's requested delay. This is an underspecified path, not a confirmed implementation bug.

**Smallest correction:** guarantee that a Redis write failure cannot bypass the fenced MySQL transaction recording the attempt, classification, and next eligible time. On coordination failure, pause dispatch under the existing policy. Specify bounded connection/command waits and avoid obsolete gate commands being replayed after reconnect. Redis documents offline command queuing by default and an option to disable it. [Redis production guidance](https://redis.io/docs/latest/develop/clients/nodejs/produsage/).

Do not add an outbox solely for transient cooldowns. The existing acknowledgment that a Redis flush can lose a shared cooldown is a reasonable limitation. This finding concerns retaining the known per-job outcome when MySQL is still available.

**Acceptance evidence:** inject Redis failure specifically after receiving 429; verify the attempt and Retry-After schedule survive restart, outbound work pauses during the outage, and the same job cannot retry early when Redis returns.

## Requirement coverage

“Covered” below means specified, not implemented or tested.

| Assessment area | Review |
|---|---|
| Required stack | Covered: NestJS/TypeScript, MySQL 8, Redis, direct Gemini, Docker/Compose. Additional libraries have stated purposes. |
| Document submission | Covered: PDF-only is allowed; durable 202, validation, unique ID, keyed replay, bounded parsing. |
| Gemini extraction | Covered: versioned schema, local validation, classified unusable responses, explicit real/mock modes. |
| Vendor integration | Covered: independent retry stage and stable key; fix finding 1's status contradiction. |
| Status and safe errors | Covered: lifecycle, stage, attempts, retry time, safe errors and retained results. |
| Repeated Gemini 429 | Covered: backoff/jitter, both Retry-After forms, budgets, pacing and persistence; tighten finding 3. |
| Empty/invalid AI response | Covered: reject before vendor submission, one bounded unusable-output retry, audit. |
| More than 15 minutes without a usable response | Covered: immediate asynchronous acceptance, 60-second cancellable attempts, 15-minute stage ceiling, compressed-time tests. |
| Vendor connection/5xx failures | Covered: checkpoint survives, retries never repeat successful AI extraction, terminal visibility. |
| Restart and concurrency | Covered: MySQL queue, durable attempt accounting, leases, stale-write rejection; tighten finding 2. |
| Tests and demonstrations | Covered in tasks: unit tests, real MySQL/Redis integration, happy E2E, deterministic HTTP failures, restart/response-loss tests. |
| Deliverables and follow-up review | Covered in tasks: repository/history, migrations, Compose, OpenAPI, README, diagrams, design note, failure commands and AI-tool disclosure. |

## Decisions worth keeping

**MySQL as the durable queue is defensible here.** It avoids a second durable job store and the database-to-broker enqueue gap. MySQL explicitly identifies queue-like tables as a use case for `SKIP LOCKED`. Keep transactions short and external I/O outside them, as already specified. A broker is a future response to measured needs, not an assessment requirement. [MySQL locking reads](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html).

**A separate worker process is enough.** One NestJS codebase/image with separate API and worker entry points provides the needed execution separation. More services would not improve the required demonstration.

**Bounded document BLOBs are a reasonable local trade-off.** Atomic document/job storage makes restart behavior easier to prove. The spec already explains the object-storage and retention boundary for a larger deployment.

**The duplicate guarantee is correctly conditional.** Stable keys plus durable vendor receipts handle response loss. A local “sent” flag would not. Different client idempotency keys deliberately create different jobs; this is request replay protection, not business-level invoice deduplication.

**The timeout interpretation is sound.** The requirement does not demand keeping one Gemini connection open for 15 minutes. Short attempts and a total stage ceiling satisfy it. Five 60-second timeouts can exhaust the attempt budget before 15 minutes; describe the latter as a ceiling, not a promise to keep trying that long. Local cancellation also does not prove Gemini stopped remote processing or billing.

**Local schema validation remains necessary.** Gemini supports a subset of JSON Schema, and structured formatting does not establish semantic correctness. Pin the selected endpoint/model contract and test schema conversion, as the current tasks already require. [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output).

## Small clarifications for implementation

- **Unusable-output allowance survives mixed errors and restarts.** Specify whether it is derived from the attempt audit or stored as a counter. Test invalid output → 429 → restart → invalid output; the invalid-output allowance must not reset.
- **Correlation survives asynchronous handoff.** Logging requires correlation IDs, but the minimum job schema does not include one. Persist the acceptance correlation ID if end-to-end correlation is intended; otherwise explicitly make job ID the durable correlation key and HTTP correlation IDs request-scoped.
- **Keep database-time tests honest.** Fake JavaScript time does not advance MySQL time or Redis TTLs. Use injected timestamps for pure policy tests and shortened configured durations for real persistence/lease/gate tests. The current division between fake-clock unit tests and compressed integration tests is appropriate; make the boundary explicit.
- **Bound aggregate upload work.** Per-file caps and parser timeouts do not bound the number of concurrent buffers/parser threads. Use a small concurrent-upload/parser limit with safe overload rejection; a custom worker-pool framework is unnecessary.
- **Document the recovery window.** Redis outage preserves data but still consumes deadlines; a sufficiently long outage leaves terminal failures. With manual retry intentionally omitted, recovery after that point is an operator limitation, not automatic eventual delivery. Keep the limitation and warn against resubmitting uncertain vendor outcomes under new keys.

## Implementation priority and validation

The planned phase allocations total 450 minutes plus 30 minutes reserve. That is an aggressive target for a new service with a custom scheduler, parser isolation, two external adapters, real-database fault tests, and documentation. Treat the times as planning assumptions rather than evidence of feasibility.

Build one complete durable happy path early, then prove the four required failure families and response-loss idempotency before polishing secondary operational features. Keep the existing scope exclusions: no frontend, broker, generic workflow engine, multi-tenant identity platform, or automatic replay endpoint. Do not weaken the existing security boundaries or omit required tests to meet the clock.

Validation performed: `openspec validate build-resilient-document-processing --strict --no-interactive` passed. All eight change Markdown artifacts were reviewed. Official MySQL, Gemini, and Redis documentation was checked for the integration assumptions discussed above. Application runtime, live Gemini behavior, rendered diagrams, and automated application tests were not verified because their implementation artifacts do not yet exist.
