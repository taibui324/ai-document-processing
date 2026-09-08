# Assessment implementation audit

Reviewed PR #1 at `b1a4328eed742e9aad2fc7fbc4faac043f6ee10c` against the supplied sections 4–13. The PR is open. Local Gemini/configuration changes were uncommitted and continued changing during review, so they are not treated as part of the verified PR snapshot. No application code was changed by this audit.

## Verdict

The required implementation areas and deliverables are present, and the committed PR passes its 41 tests. This is strong coverage, but it is not evidence that every supported input or real Gemini configuration works. Resolve the vendor request-size mismatch before submission and reconcile the uncommitted Gemini changes with the documented model. Live provider compatibility remains an evidence gap in the submitted PR.

## Findings

### P2 — Valid extraction can be rejected by the included vendor

`src/integrations/invoice.ts:6` allows 100 items with 300-character descriptions. `mock/server.ts:23` accepts at most 65,536 request bytes. Character limits do not bound UTF-8 or JSON-escaped byte size to that value.

Reproduction used 100 synthetic descriptions containing 300 three-byte characters each. Zod accepted the invoice; the serialized submission was **95,024 bytes**. Sending it through `VendorClient` to the actual mock returned `VENDOR_HTTP_ERROR`, HTTP **413**, `retryable: false`. The workflow therefore fails vendor delivery for a supported extraction, although it correctly retains the AI result. The same schema and mock limit are in the PR.

Align the extraction and vendor request limits, accounting for serialization, then add a boundary regression through the real HTTP adapter. Keep request and response limits separate. Raising the bounded mock request limit to accommodate the maximum accepted schema or enforcing a compatible serialized-payload limit are both small fixes.

### P2 — Uncommitted Gemini option conflicts with the documented model

The local edit at `src/integrations/gemini.ts:21` always sends `thinkingConfig.thinkingLevel: 'minimal'`. README still instructs reviewers to select `gemini-2.5-flash`. Google's documentation for the **Generate Content API used here** states that Gemini 2.5 does not support `thinkingLevel`; it uses `thinkingBudget`. The current mock simply returns an invoice and does not validate this provider configuration, so passing tests cannot catch the incompatibility.

This change is **not in PR #1**. Do not publish it unchanged with the current README. Omit the optional thinking setting or deliberately pin/configure a compatible model, and make the fixture check the supported request contract. Source: [Google Generate Content thinking documentation](https://ai.google.dev/gemini-api/docs/generate-content/thinking).

### Evidence gap — Real Gemini compatibility is not established by the PR

The submitted README explicitly records that live Gemini access is unverified. The adapter and deterministic fixtures establish the HTTP/workflow boundary, but not provider acceptance of the generated schema, account access, or extraction from a real synthetic PDF. A local schema-conversion change appeared during this review and is also absent from the PR.

A live smoke is not explicitly mandatory in the supplied testing requirements; mocked external dependencies are allowed. Nevertheless, the real integration in section 4.2 should be demonstrably usable before claiming full submission readiness. Record a successful synthetic PDF → Gemini JSON → local validation check with model/date, or clearly retain this limitation. No paid/live provider call was performed in this audit.

## Requirement coverage

| Requirement | Evidence in the committed PR | Assessment |
| --- | --- | --- |
| 4.1 Submission, validation, unique ID, long-running processing | Guarded multipart controller; isolated bounded PDF parsing; atomic job/document insert; 202 and UUID; blocked-upstream acceptance test | Covered; PDF-only satisfies PDF and/or image |
| 4.2 Gemini structured extraction | Direct REST adapter; fixed instructions; derived invoice schema; local Zod validation; HTTP/Gemini tests | Implemented; live compatibility gap above |
| 4.3 Vendor delivery and duplicate protection | Separate persisted vendor stage; stable key; durable unique receipt/hash; concurrent replay/conflict and response-loss tests | Covered with request-size defect above; deduplication requires vendor cooperation |
| 4.4 Status and safe failures | GET with stage/attempts/times/result; terminal and retry codes; unconfirmed vendor delivery | Covered |
| 5: repeated 429 | Retry-After seconds/date parsing; jitter and attempt/deadline bounds; persisted retries; shared Redis cooldown/pacing; recovery/exhaustion tests | Covered |
| 5: empty/unusable response | Empty/missing/invalid/truncated output rejection; safety classification; at most two unusable results; zero vendor calls | Covered |
| 5: slow response beyond ordinary HTTP lifetime | Immediate asynchronous acceptance; bounded connection/body cancellation; stage deadlines; injected clock beyond 900 seconds; real shortened timeout tests | Covered without requiring a 15-minute review wait |
| 5: vendor outage | 503/reset retries; saved extraction; AI count remains one; stable delivery key; terminal uncertainty | Covered |
| 6: reproducible failures | Named native HTTP fixture scenarios exercised by `test/failures.e2e.ts`, recovery tests and HTTP tests | Covered; standalone demo tooling is optional and was excluded as requested |
| 7: responsibility boundaries | Controller, jobs repository, workflow/store, Gemini/vendor adapters, background executable | Covered |
| 7: persistent recovery/concurrency | MySQL jobs/BLOBs/audits; transactional claims; token/stage/lease fencing; expired attempts; restart tests | Covered |
| 7: configuration/secrets/uploads | Validated environment config; explicit modes/origins; redirect rejection; API key guard; upload limits; no matching real-secret patterns in tracked files | Covered for the documented synthetic single-caller scope |
| 7: logging/operations | JSON events with job/correlation IDs; safe public errors; readiness/liveness; worker heartbeat; shutdown; runbook | Covered; no claim of production certification |
| 7: schema/migrations | Explicit MySQL migration and indexes; synchronization disabled; one-shot Compose migration | Covered |
| 8: API contract | POST and GET routes; replay/conflict semantics; Swagger schemas | Covered; manual retry endpoint is optional |
| 9: tests | Unit, real MySQL/Redis integration, successful E2E, deterministic fault fixtures | Covered; boundary regression above is missing |
| 10: repository/runtime/docs | Three commits including the existing foundation and checkpoint; Dockerfile/Compose; migrations; README; Swagger; architecture plus normal/failure Mermaid diagrams; design/runbook | Present |
| 11: AI coding disclosure | README states Codex and opensrc use | Covered; personal understanding cannot be established by automated checks |
| 13: follow-up readiness | Architecture rationale, failure runbook, operational limits, focused tests | Materials present; candidate must still explain and modify the code unaided |

## Evaluation criteria

| Area | Weight | Review conclusion |
| --- | --- | --- |
| Architecture/system design | 20% | Appropriate durable asynchronous stages; database queue/BLOB scaling trade-offs documented |
| Resilience/failure handling | 25% | All four required families tested; retry budgets, fencing, cancellation, and uncertain delivery are explicit |
| Code quality/maintainability | 15% | Strict TypeScript and focused components; schema/transport compatibility needs correction; dense one-line methods could be easier to review |
| Testing | 15% | Real database/cache and HTTP fixtures provide useful evidence; green tests miss the valid-large-payload case and provider-option compatibility |
| Observability/security/operations | 10% | Safe structured logs, correlation, health, isolated parser and container limits are present; stronger SQL operation bounds and ingress concurrency controls are production improvements |
| Documentation/communication | 10% | Required artifacts are present; align the final model/configuration and prefer current verification evidence over historical checkpoints when presenting |
| Pragmatism | 5% | No unnecessary broker, generic workflow engine, frontend, or mandatory demo runner |

Weights are the assessment rubric, not awarded scores. No numerical grade is inferred from passing tests.

## Verification performed

- Created an isolated detached worktree at PR commit `b1a4328` using the already-installed locked dependencies. `lint`, `typecheck`, `build`, unit tests (**10**), integration tests (**9**), and E2E tests (**22**) all passed on Node **24.20.0**. MySQL/Redis were real isolated test services.
- An earlier snapshot of the local uncommitted checkout passed **42** tests; further schema edits appeared afterward. That result does not certify the later local state or change the PR's 41-test count.
- Reproduced the valid 95,024-byte vendor payload rejection using the compiled HTTP client and mock service.
- Main Compose configuration passed; API, worker, mock, MySQL and Redis were observed healthy. Container build/restart evidence from the prior implementation remains historical, not a newly repeated full container acceptance run in this audit.
- Strict OpenSpec validation and whitespace checks passed. These validate artifacts, not runtime completeness.
- Scanned 86 tracked files for common credential/private-key patterns and confidential PDF/DOCX/`.env` paths; no matches. Public synthetic local credentials are intentionally included. This bounded scan is not proof that every possible secret format is absent.

Suggested submission sequence: fix the payload boundary with a failing regression, reconcile the live-provider changes/model, rerun checks on the exact commit being submitted, and use this matrix plus the failure runbook to rehearse the technical review.
