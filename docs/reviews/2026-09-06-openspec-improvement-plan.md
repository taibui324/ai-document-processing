# OpenSpec improvement plan

Reviewed the [architecture review](2026-09-06-document-processing-spec-review.md), all eight change artifacts, project configuration, and [AGENTS.md](../../AGENTS.md) against the assessment supplied in the conversation.

**Recommendation: retain the architecture and refine the existing contracts and acceptance tests.** The assessment does not require another service, broker, reconciliation subsystem, or API endpoint. The existing change covers its requirement groups; the improvements below make that coverage less ambiguous and easier to prove.

These are proposed revisions, not applied OpenSpec changes. Implementation remains pending: 32 unchecked tasks, no application test infrastructure.

## 1. Correct vendor outcome wording — highest priority

The original review is right: [design.md:119](/Users/taibui/Desktop/project/medicon/openspec/changes/build-resilient-document-processing/design.md:119) says “undelivered,” while the vendor spec already recognizes uncertain acceptance. Local FAILED does not establish that the vendor rejected or never received the payload.

**Proposed design/API wording:**

> Failed vendor-stage jobs retain their extraction. If a vendor attempt was recorded but no accepted receipt was checkpointed, report delivery as unconfirmed and warn that remote acceptance may have occurred. If no vendor attempt was recorded, report delivery as not attempted. A later error does not establish that an earlier attempt had no effect. Only a validated, persisted receipt confirms acceptance.

This conservative rule uses the existing attempt counter and receipt. A recorded attempt can precede the actual network call, so “unconfirmed” deliberately avoids claiming certainty in either direction. No extra database flag, delivery-state machine, or historical error classifier is necessary.

Update design sections 3, 4, 7, and 9; make the “Useful durable status” requirement in `document-jobs` match the vendor contract. Extend `vendor-delivery`'s unknown-outcome scenario to cover acceptance-response loss followed by exhaustion or a later permanent error.

**Existing tasks:** 2.4, 5.3, 6.3. **Evidence:** one vendor receipt, FAILED local status, preserved extraction, explicit uncertainty, no additional Gemini call. **Assessment alignment:** §§4.3–4.4, 5, 7, 9.

## 2. Make the remaining-lease bound explicit

The review identifies a real omission in [design.md:68](/Users/taibui/Desktop/project/medicon/openspec/changes/build-resilient-document-processing/design.md:68): a 60-second timeout is shorter than a fresh 90-second lease, but not necessarily a lease after gate or database delay.

**Proposed design wording:**

> At attempt start, bound request and body consumption by the minimum of the configured request timeout, remaining stage time, and remaining lease time minus a checkpoint allowance. Do not dispatch when that allowance leaves no request budget. Recheck elapsed time before dispatch. Reject every stale result using the existing stage/token/lease conditions. An attempt already durably recorded remains counted even if dispatch is subsequently abandoned.

Keep the clock source and checkpoint allowance in design/configuration details; the capability spec needs the observable remaining-lease guarantee. Avoid adding lease heartbeats. These checks reduce avoidable overlap; they cannot guarantee that a suspended process or remote provider immediately stops work.

Update design section 2, `durable-processing`'s bounded-attempt requirement, and `ai-extraction`'s timeout wording to refer to the common bounds.

**Existing tasks:** 1.3, 3.1–3.3, 6.3. **Evidence:** delay between claim and dispatch, shortened or suppressed request, no overwritten successor state, unchanged persisted budgets. **Assessment alignment:** §§5, 7, 9.

## 3. Separate pre-dispatch Redis failure from post-response Redis failure

The review is correct, but the proposed correction should also remove an attempt-accounting ambiguity. [design.md:155](/Users/taibui/Desktop/project/medicon/openspec/changes/build-resilient-document-processing/design.md:155) says Redis failure defers work without consuming an attempt. That is appropriate before dispatch; a call that already returned 429 has consumed an attempt.

**Proposed design wording:**

> When Redis gating fails before attempt recording, defer without consuming a network attempt. After a provider response, record the attempted call and its retry/failure decision in a fenced MySQL transaction independently of Redis availability. Persist the per-job Retry-After schedule before attempting the transient cooldown update. A failed Redis update does not replace the recorded provider classification, refund the attempt, or shorten its retry schedule. Workers continue to require a successful provider gate before further dispatch.

Update the failure sequence diagram to match that order. Bound Redis operations and disable offline queuing for gate commands so disconnected work is not silently queued for later execution. A local timeout still cannot undo a command already executed remotely. [Redis documents connection/command timeouts and offline queuing](https://redis.io/docs/latest/develop/clients/nodejs/produsage/).

Retain the documented limitation: MySQL and Redis are not one atomic transaction. A crash between checkpoint and cooldown publication can lose the shared cooldown while retaining the affected job's schedule. Do not turn transient coordination into a second durable workflow or claim that all possible 429/crash windows are eliminated.

Update design sections 6 and 8 and the `durable-processing` audit/outage requirements. Qualify shared-cooldown assertions to concern successful publication and later gate decisions; they cannot retroactively cancel calls already dispatched.

**Existing tasks:** 3.2, 3.4, 6.2–6.3. **Evidence:** 429 → Redis update failure → worker restart; one consumed attempt, persisted Retry-After, no early retry by that job, normal resumption when eligible. **Assessment alignment:** §§5–7, 9.

## 4. Persist the meaning of the unusable-output allowance

[ai-extraction/spec.md:26](/Users/taibui/Desktop/project/medicon/openspec/changes/build-resilient-document-processing/specs/ai-extraction/spec.md:26) and design section 5 should use one precise interpretation: at most two unusable-output responses within the five-attempt AI budget. Intervening transient errors and restarts do not reset that allowance.

**Proposed design choice:** derive the count from the existing durable `job_attempts` classifications, including the current result inside its checkpoint transaction. With at most five AI attempts, another mutable counter is unnecessary. Only recorded outcomes can be counted; a response lost before checkpoint remains an abandoned attempt under the existing total budget.

**Existing task:** 4.3, verified through 6.2–6.3. **Evidence:** invalid response → 429 → restart → invalid response produces AI_UNUSABLE_RESULT after three attempts and no vendor submission. **Assessment alignment:** §§5, 7, 9.

## 5. Bound simultaneous uploads, not only individual documents

The prior review's aggregate-resource point is worth retaining. Five-MiB file limits and five-second parser limits still allow many concurrent buffers and parser threads.

**Proposed contract:** after authentication and before multipart buffering, acquire a bounded per-process upload admission slot. If capacity is exhausted, return a safe 503 without accepting a job. Hold the slot through validation and persistence, releasing it on success, rejection, disconnect, or timeout. Document the chosen cap and its relationship to container memory. Existing status reads should not consume upload slots.

Extend design section 4 and `document-jobs`' resource-limit scenario. A simple admission counter is sufficient; do not add a distributed semaphore, waiting queue, or parser-pool framework.

**Existing tasks:** 2.2–2.3, 7.2. **Evidence:** excess concurrent submissions are rejected before buffering, accepted work remains durable, and permits recover after errors/disconnects. **Assessment alignment:** §§4.1, 7, 9.

## 6. Align tasks and evidence with repository TDD guidance

[AGENTS.md](../../AGENTS.md) now mandates red → green → refactor for implementation. [tasks.md:60](/Users/taibui/Desktop/project/medicon/openspec/changes/build-resilient-document-processing/tasks.md:60) only says tests accompany implementation. It does not prohibit TDD, but the task instructions should remove any suggestion of implementing entire phases before testing them.

**Proposed task preamble:**

> For every behavior task, first write and run a focused test that fails for the intended behavioral reason; implement the minimum passing behavior, then refactor and rerun affected checks. Record red/green evidence. Infrastructure and documentation use the executable/configuration or documentation checks required by AGENTS.md. Phase 6 assembles end-to-end evidence; it is not the first point at which tests are written.

Refine task 1.2 to establish the actual lint, build, unit, integration and E2E script contracts as their infrastructure becomes available. Task 8.3 should invoke those exact commands and include separate type checking if configured. Retain every existing mandatory final gate and keep all implementation checkboxes unchecked.

Make time-test boundaries explicit in design section 10 and `assessment-operability`: injected clock/randomness for pure retry-policy unit tests; real MySQL/Redis with shortened durations for lease, deadline, TTL and restart integration tests. Do not imply JavaScript fake timers advance database time.

The existing time allocations total eight hours including reserve. Keep that as an estimate, not a completeness guarantee. Execute each phase in small tested slices and run the full upload-to-receipt path as soon as the adapters and persistence are available. Fold these regressions into existing tasks rather than adding another implementation phase.

**Assessment alignment:** §§6, 9–11, 13–14; repository engineering instructions.

## Artifact-by-artifact revision map

All paths below are inside the existing change. No new capability is needed.

| Artifact | Recommended revision |
|---|---|
| `proposal.md` | Preserve intent, stack, five capabilities and exclusions. Add one sentence to Impact: “Recovery remains bounded by persisted budgets; missing vendor confirmation is reported as uncertain, and duplicate-effect protection depends on the vendor retaining idempotency receipts.” Keep timer mechanics and test cases out of the proposal. |
| `design.md` | Apply the six refinements above; align the failure sequence, API wording, retry accounting and evidence matrix. |
| `specs/document-jobs/spec.md` | Clarify unconfirmed versus not-attempted delivery and aggregate upload rejection; preserve existing routes, statuses and request idempotency. |
| `specs/durable-processing/spec.md` | Add remaining-lease bounds and post-response Redis-failure evidence; qualify shared cooldown around publication/dispatch. Preserve durable budgets and token fencing. |
| `specs/ai-extraction/spec.md` | Clarify two recorded unusable responses across mixed errors/restarts and common request bounds. |
| `specs/vendor-delivery/spec.md` | Strengthen unknown-outcome scenario with lost acceptance followed by exhaustion/permanent error. Preserve durable receipt/key replay. |
| `specs/assessment-operability/spec.md` | Make deterministic clock/real-store test boundaries explicit and require evidence for the added recovery cases. Keep implementation methodology details in tasks/AGENTS.md. |
| `tasks.md` | Add TDD preamble and extend existing verification clauses. Preserve the 32-task structure, required deliverables and unchecked implementation state. |

## Clarifications that do not justify more implementation

**Correlation:** use job ID as the durable cross-process correlation key, with HTTP correlation IDs scoped to requests. State this explicitly in design section 9 and the observability spec. The assessment permits correlation/job IDs; another stored correlation field is optional, not a missing requirement.

**Recovery after exhaustion:** document that Redis outages consume elapsed budgets, so retained work can become terminal. The optional manual retry endpoint remains deferred. Document inspection/reconciliation and the danger of a new-key resubmission after an uncertain vendor outcome; do not imply that recovery continues indefinitely.

**Queue architecture:** retain the MySQL queue. MySQL documents `SKIP LOCKED` for queue-like tables; the current short-transaction approach is consistent with that use. Switching to BullMQ would introduce different consistency work without closing these specific gaps. [MySQL locking reads](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html).

**Scope:** retain PDF-only input, the bounded invoice schema, one caller, two endpoints, separate API/worker entry points, local BLOB storage, deterministic mocks, and opt-in live Gemini evidence. Object storage, business-level invoice deduplication, multi-tenancy, circuit-breaker infrastructure and a metrics platform remain future production considerations.

## Verification and limits

`openspec validate build-resilient-document-processing --strict --no-interactive` passed for the current unchanged artifacts. This review checks requirements and cross-artifact coherence; it does not establish runtime behavior. No application tests, build, or lint were run because this is documentation-only review work and application infrastructure does not yet exist. The proposed scenarios are acceptance criteria, not executed tests.
