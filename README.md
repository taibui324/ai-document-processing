# Resilient document processing

NestJS API and a separate Node.js worker accept a synthetic PDF, extract a validated invoice through Gemini, and deliver it to a cooperating vendor. MySQL owns jobs, documents, attempts, and checkpoints. Redis only coordinates provider starts.

Use synthetic documents only. This demonstration does not adjudicate insurance, authorize payments, or claim suitability for real patient information.

## Start locally

Prerequisites: Docker with Compose v2, Node **24.20.0**, and npm 11. The runtime image also pins Node 24.20.0. On this workspace the host defaults to Node 26; use `nvm use` when available, or prefix npm commands with `npm exec --yes --package=node@24.20.0 --`.

```sh
npm ci --ignore-scripts
npm run build
docker compose build
docker compose up -d --wait
```

No Gemini credentials are required in the default explicit mock mode. The included credentials are public local-demo values, not production secrets. The API is bound to loopback; MySQL and Redis have no published ports in the main stack. Optional configuration: copy `.env.example` to `.env` and change values before starting.

- API: http://localhost:3000
- Swagger UI: http://localhost:3000/docs
- OpenAPI JSON: http://localhost:3000/docs-json
- Liveness/readiness: `/health/live` and `/health/ready`
- Worker health: port 3001 inside its container; readiness checks recent successful polling and Redis connectivity.

One migration container runs before the application services. API and worker never synchronize or migrate the schema automatically. The app DB user has DML permissions but no DDL privileges; the mock user has SELECT/INSERT permissions. Migration credentials remain separate.

```sh
docker compose ps
docker compose logs --tail=50 api worker
docker compose restart api worker
docker compose stop
```

An ordinary restart or `docker compose down` preserves named volumes. Do not add `-v` as a recovery step.

## Submit and inspect

Generate a small synthetic invoice, then submit it:

```sh
node dist/scripts/fixture.js
curl -i http://localhost:3000/api/v1/document-jobs \
  -H 'X-API-Key: local-synthetic-api-secret' \
  -H 'Idempotency-Key: synthetic-example-1' \
  -F 'document=@.tmp/invoice.pdf;type=application/pdf'
```

New submissions return **202** with `jobId`, `status`, `statusUrl`, and `createdAt`, plus a Location header. Use the returned UUID:

```sh
curl http://localhost:3000/api/v1/document-jobs/REPLACE_WITH_JOB_ID \
  -H 'X-API-Key: local-synthetic-api-secret'
```

Repeat the same key **and original file bytes** for a 200 replay. Regenerating a PDF may change its bytes. Different bytes under the same key return 409. Both routes require the API key. Optional `X-Correlation-Id` must be a UUID; one is generated when absent.

Exactly one unencrypted PDF is accepted: 5 MiB maximum, 1–20 pages, MIME/signature/structural validation, isolated parsing with a five-second cap, and bounded upload time. Invalid requests return classified safe errors: 400, 401, 404, 408, 409, 413, 415, or 503.

GET returns durable stage, attempts, timestamps, retry eligibility, and a safe error. Completed jobs include extraction and receipt. Failed vendor jobs retain extraction and explicitly report unconfirmed delivery: remote acceptance may already have happened.

## Tests and failure scenarios

Tests use a **separate** Compose project/database on ports 13316 and 16379, with local HTTP fixtures. Do not point tests at production. Run suites sequentially; recovery tests manipulate eligibility inside their isolated test database.

```sh
docker compose -f compose.test.yaml up -d --wait
npm run lint
npm run typecheck
npm run build
npm test -- --runInBand
npm run test:integration
npm run test:e2e
```

E2E automatically builds the executable worker. Tests cover real MySQL locking and lease fencing, restart checkpoints, native-fetch cancellation, Redis network loss, safe logs, and the required failure families. No SQLite substitute or live provider access is used.

The automated E2E suite exercises the named fault scenarios using bounded test timeouts. See [expected results and recovery instructions](docs/failure-scenarios.md). Stop test services without removing data:

```sh
docker compose -f compose.test.yaml stop
```

## Defaults and real Gemini

| Setting | Default |
| --- | --- |
| Worker polling / concurrency / lease | 1 second / 2 / 90 seconds |
| AI timeout / attempts / stage budget | 60 seconds / 5 / 15 minutes from first claim |
| Vendor timeout / attempts / stage budget | 15 seconds / 6 / 30 minutes from extraction checkpoint |
| Backoff | Full jitter, 2-second base; AI cap 60 seconds, vendor cap 120 seconds |
| Provider pacing / Redis command bound | One start/second/provider / 500 ms |
| Redis outage deferral | 5 seconds; consumes deadline time, no attempt |
| Unusable AI output | At most two unusable responses within overall attempt/budget limits |
| Response limits | Gemini 1 MiB; vendor 64 KiB |
| Upload / PDF parse limits | 10 seconds / 5 seconds |

All numeric configuration, mode, secrets, model ID, origins, and lease/timeout compatibility are validated at startup. See [configuration](src/config.ts) and [.env.example](.env.example). Automated tests use explicit mock mode and local HTTP fixtures.

The real adapter uses direct Gemini REST, inline PDF, fixed extraction instructions, a derived JSON schema, local Zod validation, and native fetch with no nested retries. Selected model: `gemini-2.5-flash`, listed in [Google's model catalog](https://ai.google.dev/gemini-api/docs/models) when checked on 2026-09-06. **Live Gemini access has not been verified.** Mock evidence establishes workflow behavior, not extraction accuracy or model entitlement.

For an optional live synthetic smoke, configure `AI_MODE=real`, `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-2.5-flash`, `GEMINI_BASE_URL=https://generativelanguage.googleapis.com`, and an approved **HTTPS** `VENDOR_BASE_URL` with its `VENDOR_SECRET`. Keep credentials only in untracked environment configuration. Confirm the vendor's durable idempotency contract first. Never silently fall back to mock on a real-provider failure. This Compose file remains a local demonstration, not a production deployment template.

## Design and evidence

[Architecture, diagrams, trade-offs, and evidence map](docs/architecture.md) · [Implementation and verification record](docs/implementation-evidence.md)

Supporting libraries are limited to NestJS/Swagger (HTTP and API contracts), TypeORM/mysql2 (migrations and transactions), Redis client (coordination), Zod (validation/schema derivation), and pdf-lib (bounded structural checks and synthetic fixtures). HTTP, hashing, UUIDs, cancellation, worker isolation, and process handling use Node's standard library. Jest/Supertest are test-only.

Codex assisted with the implementation, tests, and documentation, using Ponytail's minimal-change approach and TDD red–green cycles. `opensrc` fetched the pinned dependency source for implementation checks. No confidential assessment PDF, unrelated DOCX, uploaded document, or credential file belongs in Git.
