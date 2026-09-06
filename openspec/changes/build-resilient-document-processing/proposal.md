## Why

Build the small, production-oriented document workflow required by the MediConCen assessment: accept a document, extract structured data with Gemini, and submit it to a vendor without losing work during rate limits, timeouts, outages, or restarts. The implementation should be explainable and demonstrable within the assessment's approximately 6-8 hour time box.

Source: `Application Architect Technical Assessment.pdf`, pages 1-6, particularly sections 2, 4-10, 12, and 14. This change is the implementation plan; application code and runtime verification are subsequent work.

## What Changes

- Add a NestJS/TypeScript API accepting a PDF and returning a durable job ID with HTTP 202, plus a status/result endpoint.
- Persist documents, stage checkpoints, retry schedules, and attempt metadata in MySQL 8; process them in a separate worker entry point from the same application image.
- Integrate the direct Gemini REST API with structured output, local schema validation, cancellable timeouts, and classified failures.
- Submit validated results to an HTTP vendor adapter with a stable idempotency key and a durable mock vendor receipt.
- Use Redis for transient provider cooldowns and request pacing; MySQL remains the durable work queue and source of truth.
- Demonstrate all four required dependency failures through deterministic HTTP mocks and automated tests, including compressed-time timeout tests.
- Deliver Compose, migrations, Swagger/OpenAPI, README, architecture and sequence diagrams, design trade-offs, and AI-tool disclosure.

Chosen defaults, not assessment mandates: PDF-only input up to 5 MiB / 20 pages; Node.js 24 LTS; NestJS 11; TypeORM/mysql2; Zod; a MySQL-backed worker; one shared-secret API caller; synthetic demo data. Exact dependency patches and a supported Gemini model are pinned and verified during implementation.

## Capabilities

### New Capabilities

- `document-jobs`: validated, authenticated submission; request idempotency; durable status and safe result access.
- `durable-processing`: persisted stage scheduling, leases, retry budgets, restart recovery, and Redis-backed request pacing.
- `ai-extraction`: Gemini document extraction, schema validation, and safe handling of rate limits, unusable output, and slow responses.
- `vendor-delivery`: independently retryable delivery of checkpointed results with vendor-side duplicate protection.
- `assessment-operability`: deterministic demonstrations, tests, logs, deployment configuration, and reviewer documentation.

### Modified Capabilities

None. This is a new service with no existing application capabilities.

## Impact

New application paths will include `src/`, `test/`, `migrations/`, `mock/`, Docker files, and reviewer documentation. Public routes will be `POST /api/v1/document-jobs` and `GET /api/v1/document-jobs/{jobId}`. External calls are limited to configured Gemini and vendor destinations. MySQL and Redis run locally in Compose.

No frontend, insurance adjudication, agent framework, Kubernetes, multi-tenant identity system, or optional manual retry endpoint is needed for this assessment. Production expansion points and the vendor idempotency assumption are documented explicitly in the design.
