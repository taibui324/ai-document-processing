# Document pipeline validation — 2026-09-07

## Outcome

The reviewer-reproducible mock-mode pipeline passes end to end. A PDF submission returned `202`, remained durably queryable as `RECEIVED` while the worker was paused, then reached `COMPLETED` after one successful Gemini-adapter attempt and one successful vendor attempt. The final API response contained a locally validated invoice and the receipt persisted by the vendor mock.

Live Gemini success is not confirmed. The configured credential could list models (`200`), but one worker generation attempt returned `403` and a later minimal generation probe returned `503 UNAVAILABLE`. The system classified the worker failure safely and did not call the vendor.

## Before / after evidence

Synthetic job: `c3772ac5-2ac5-479d-97c7-8d0164acfbd9`

| Boundary | Observed evidence |
| --- | --- |
| Submission | HTTP `202`; unique job ID and status URL returned |
| Before worker processing | `RECEIVED`, stage `AI`, AI attempts `0`, vendor attempts `0` |
| Structured extraction | Invoice `SYNTHETIC-001`, date `2024-02-29`, total `12.50`, currency `HKD`, one validated item |
| Vendor submission | One `VENDOR` attempt with `SUCCEEDED`; one durable mock receipt |
| After processing | `COMPLETED`, AI attempts `1`, vendor attempts `1`, delivery `accepted` |

Generated visual evidence:

- `.tmp/before-after-validation/output/before-before-2026-09-07T16-08-17.png`
- `.tmp/before-after-validation/output/after-after-2026-09-07T16-08-17.png`

The images were generated locally with `@vercel/before-and-after`; they were not uploaded.

## Requirement coverage

| Requirement | Evidence |
| --- | --- |
| Accept and validate a document | Live synthetic PDF submission plus API integration tests for missing, malformed, oversized, conflicting, and unauthorized requests |
| Track long-running work | Immediate `202`, durable UUID job, separate worker, and status polling |
| Send PDF for structured extraction | Happy-path E2E crosses the HTTP Gemini adapter; unit coverage verifies inline PDF data, fixed instructions, JSON schema, and local validation |
| Submit extraction to vendor | Happy-path E2E crosses the HTTP vendor adapter and persists exactly one matching receipt |
| Safe status and failures | Status endpoint exposes lifecycle, attempts, safe codes, extraction, delivery state, and receipt without raw provider bodies or secrets |

## Required failure scenarios

The focused E2E run passed all 10 fault cases plus the happy path (`11/11`):

- Gemini 429 then success and retry exhaustion, including persisted attempts and `Retry-After` handling.
- Gemini empty and schema-invalid output, with no vendor delivery.
- Gemini slow response using a shortened deterministic timeout, with bounded failure and no vendor delivery.
- Vendor 503 then success and exhaustion, connection reset, invalid acknowledgement, and accepted-response loss.
- Vendor retries reused the persisted extraction and stable idempotency key; successful/ambiguous delivery produced at most one receipt.

## Commands and results

```text
docker compose build api worker mock-dependencies migrate                       PASS
docker compose up -d --wait                                                    PASS; all services healthy
npm exec --yes --package=node@24.20.0 -- npm test                              PASS; 12/12
npm exec --yes --package=node@24.20.0 -- npm run test:integration -- \
  --runTestsByPath test/api.integration.ts test/receipts.integration.ts         PASS; 3/3
npm exec --yes --package=node@24.20.0 -- npm run test:e2e -- \
  --runTestsByPath test/workflow.e2e.ts test/failures.e2e.ts                    PASS; 11/11
```

The original real-mode Compose configuration was restored after deterministic testing. No credentials or document bytes were written to this report or the visual evidence.
