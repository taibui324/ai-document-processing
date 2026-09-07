PR scope update: the user requested exclusion of standalone demo tooling. Task 6.4 and the standalone-demo portions of sections 8–9 were verified locally but are intentionally omitted from this PR. Automated fault/recovery tests and their mock services remain included. The original checklist below records implementation history.

## 1. Runtime and repository foundation - 45 minutes

- [x] 1.1 Establish a dedicated Git repository rooted at `medicon` (the current directory is inside a broader parent worktree); preserve all existing inputs and parent changes, ignore confidential source documents/temp files/secrets, and verify `git rev-parse --show-toplevel` points to this service before making scoped commits.
- [x] 1.2 Scaffold the minimal NestJS application with API/worker entry points, strict TypeScript, pinned Node/package versions, and the dependencies justified in `design.md`; verify `npm ci`, `npm run build`, and an initial unit test succeed.
- [x] 1.3 Add validated environment configuration and `.env.example`, explicit mock/real AI modes, and a selected supported Gemini model for real mode; verify missing real-mode credentials and invalid timeout/lease combinations fail startup while mock mode starts without credentials.
- [x] 1.4 Add a multi-stage Dockerfile, Compose MySQL/Redis named volumes, separate API/worker commands, mock dependency service, health checks, and one-shot migration service; verify `docker compose config` and image build. Record a meaningful foundation commit.

## 2. Schema and asynchronous API - 50 minutes

- [x] 2.1 Implement `document_jobs`, separate bounded document BLOBs, attempt audit, and demo vendor receipt migrations with unique keys and due/lease indexes; verify migrations against a fresh MySQL 8 database, repeat migration safely, and confirm schema synchronization is disabled.
- [x] 2.2 Implement API credential validation before upload parsing, bounded multipart handling, MIME/signature/structural/page checks and isolated parser timeout; verify valid PDF acceptance plus missing, disguised, encrypted, oversized, excessive-page and timed-out parser cases.
- [x] 2.3 Atomically insert document/job and implement keyed submission with `202`, exact replay `200`, and conflicting bytes `409`; verify concurrent identical submissions create one job, unavailable MySQL yields 503, and a blocked upstream never delays the acceptance response.
- [x] 2.4 Implement durable GET status/result, validated IDs, safe errors, correlation IDs, and Swagger response contracts; verify unauthorized, unknown, malformed, retrying, completed, and failed-vendor responses. Record an API/persistence commit.

## 3. Durable workflow and retry policy - 85 minutes

- [x] 3.1 Implement bounded worker polling with transactional due-job claims, stage-specific deadlines, 90-second leases and token-fenced updates; verify two workers cannot claim the same live lease using real MySQL.
- [x] 3.2 Implement atomic attempt-start and success/retry/failure checkpoints, expired lease recovery, abandoned-attempt accounting and stale-result rejection; verify crash/late-result tests preserve the latest state and original budgets.
- [x] 3.3 Implement the single retry policy: capped exponential jitter, both Retry-After formats, permanent/transient classification, attempt caps, request cancellation, remaining-time bounds and deadline sweep; verify injected-clock/random tests cover invalid/past/long headers and more than 900 seconds without real waiting.
- [x] 3.4 Implement Redis provider cooldown extension and atomic paced starts, bounded Redis calls, and five-second durable deferral on Redis failure; verify shared pacing across two workers, no consumed attempt on gate deferral, and recovery/deadline behavior while Redis is unavailable.
- [x] 3.5 Implement graceful shutdown and worker heartbeat; verify shutdown stops new claims and recovered work resumes after aborted requests or expired leases. Record a durable-workflow commit.

## 4. Gemini extraction boundary - 60 minutes

- [x] 4.1 Implement the versioned invoice schema with decimal-string money, bounded fields/items and real-date validation; derive a Gemini-compatible JSON schema and verify valid, missing, malformed, out-of-range, impossible-date and unexpected-field cases.
- [x] 4.2 Implement direct Gemini REST PDF extraction through a bounded native-fetch boundary with schema settings, fixed instructions, safe error mapping, no nested retries and full request/body cancellation; verify against local HTTP fixtures including an open response body and oversized response.
- [x] 4.3 Implement empty/missing/invalid/truncated output rejection, one unusable-output retry, terminal safety/client errors, and atomic extraction checkpoint; verify the vendor is never called with invalid output and secrets/raw text do not appear in errors.
- [x] 4.4 Add mock Gemini modes for happy extraction, two 429s then success, all-429 exhaustion, empty/invalid payload and slow response; verify each through the actual HTTP adapter. Record a Gemini integration commit; document any live synthetic smoke separately if credentials are available.

## 5. Vendor delivery and deduplication - 50 minutes

- [x] 5.1 Implement delivery of the checkpointed payload with the persisted stable key, 15-second bounded request/body read, response validation and separate vendor retry budget; verify vendor failure preserves extraction and does not increment AI calls.
- [x] 5.2 Implement mock vendor durable receipt insert/replay/conflict behavior using its unique key and canonical payload hash; verify identical concurrent requests return one receipt and changed payload returns 409.
- [x] 5.3 Add vendor 503, connection reset, invalid acknowledgement and accept-then-drop-response modes; verify recovery, exhausted/unknown status, and one accepted receipt after retry and mock restart. Record a vendor delivery commit.

## 6. Integrated assessment evidence - 70 minutes

- [x] 6.1 Add `test:integration` and `test:e2e` scripts with isolated real MySQL/Redis test state and deterministic external HTTP mocks; verify the successful upload-to-receipt workflow, GET result, and request replay.
- [x] 6.2 Exercise all four required failure families with both recovery and exhaustion where applicable; verify Retry-After timestamps, invalid-output non-delivery, shortened actual abort behavior, and vendor retry without repeated extraction.
- [x] 6.3 Add restart/fault tests at accepted job, active AI, committed extraction, and remote-accepted/local-uncommitted delivery; verify durable recovery, stale-lease protection, persisted budgets and exactly one mock receipt.
- [x] 6.4 Add a bounded `npm run demo -- <scenario>` script and fast-demo profile with per-job mock counters; verify every named scenario prints safe status/attempt/receipt evidence without credentials or a 15-minute wait. Record a tests/demonstrations commit.

## 7. Operational and security completion - 50 minutes

- [x] 7.1 Complete structured log fields and classified public errors; verify captured logs/responses never contain test credentials, document bytes, filenames, extracted fields or raw provider error bodies.
- [x] 7.2 Finish readiness/liveness and worker health checks, fixed outbound origins, redirect rejection, mock-mode guardrails, container resource limits and least-privilege app DB credentials; verify degraded dependencies and unauthorized/hostile input behavior.
- [x] 7.3 Exercise a clean Compose startup, one-shot migrations, ordinary restart with named volumes, and shutdown while processing; verify jobs/receipts survive and no migration races occur. Record an operations/security commit.

## 8. Reviewer handoff and final gate - 40 minutes

- [x] 8.1 Write README setup/run/API/test/demo commands, configuration defaults, tested model/real-versus-mock evidence, synthetic-data restriction and AI coding-tool disclosure; verify each command from a clean local setup.
- [x] 8.2 Publish editable Mermaid architecture and normal/failure sequence diagrams in `docs/architecture.md`, plus concise timeout/retry/idempotency/queue rationale, production limits and failure runbook; verify diagrams render and every requirement in the design evidence matrix has a working artifact or test.
- [x] 8.3 Run `npm run build`, lint, unit tests, integration tests, E2E tests, Compose validation, all failure demonstrations, `git diff --check`, and `openspec validate build-resilient-document-processing --strict`; record actual results and disclose any required gate not completed. Mark checkboxes only after their evidence passes.
- [x] 8.4 Verify Git history contains logical implementation increments and no credentials, confidential assessment input or real medical documents; produce the final documentation commit and concise handoff identifying delivered files, validation and limitations.

## 9. Time-box and completion policy - 30-minute reserve

- [x] 9.1 Use the remaining 30 minutes for failed mandatory gates or cross-stage integration defects; verify the final scope still satisfies every assessment requirement and report actual effort. The phase allocations total 7.5 hours plus this reserve, an 8-hour target rather than a delivery guarantee.

Tests accompany implementation in each phase; phase 6 verifies the complete workflow. No frontend, manual replay endpoint, object storage service, broker, deployment platform, or advanced metrics stack is required. If the time box is exceeded, report unfinished mandatory evidence explicitly; do not substitute documentation for required working behavior.
