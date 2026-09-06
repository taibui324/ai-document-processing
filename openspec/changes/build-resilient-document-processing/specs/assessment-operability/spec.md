## Purpose

Make the document-processing assessment reproducible, observable, and reviewable with deterministic failures and clear operational documentation.

## ADDED Requirements

### Requirement: Required stack and local execution
The submission SHALL use NestJS, Node.js/TypeScript, MySQL 8, Redis for transient coordination, Gemini, and Docker/Compose. It SHALL include explicit migrations, startup configuration validation, health checks, durable local volumes, and a mock mode runnable without external credentials.

#### Scenario: Clean reviewer setup
- **WHEN** a reviewer follows documented setup instructions with Docker and no Gemini credentials
- **THEN** migrations run, services become healthy, and a synthetic document completes using explicit mock mode

### Requirement: Deterministic failure demonstrations
Reviewers SHALL be able to reproduce repeated Gemini 429s with recovery and exhaustion, empty/invalid AI payloads, slow AI without waiting 15 minutes, and vendor connection/5xx failure. Demonstrations SHALL include accept-then-drop-response duplicate protection. Fault controls SHALL be disabled outside explicit local/test mode.

#### Scenario: Required failure suite
- **WHEN** documented failure commands run
- **THEN** each scenario reports bounded completion/failure, expected attempts and safe status, without depending on live external failure or long waits

### Requirement: Automated business and integration coverage
The repository SHALL include unit tests for retry/deadline/state logic and extraction validation, tests for all required failures, and at least one integration/E2E successful workflow. Database recovery/concurrency tests SHALL use MySQL 8 and transient coordination tests SHALL use Redis.

#### Scenario: Deterministic happy path
- **WHEN** the E2E suite submits a synthetic PDF to the API with real local persistence and mocked external HTTP services
- **THEN** it observes a completed job, persisted extraction, and one vendor receipt

#### Scenario: Recovery evidence
- **WHEN** tests interrupt processing at acceptance, active AI, committed extraction, and uncertain vendor acceptance
- **THEN** accepted work is recovered within its original budgets and checkpointed extraction/deduplicated delivery are preserved

### Requirement: Safe correlation and operational visibility
The service SHALL record structured logs and durable attempt information with job/correlation IDs, stage, duration, classification, and retry scheduling. It SHALL distinguish liveness from dependency readiness and SHALL NOT log documents, extracted values, secrets, or raw upstream responses.

#### Scenario: Sensitive failure payload
- **WHEN** an upstream error body contains a test secret or synthetic personal data
- **THEN** serialized logs and caller-visible errors omit that content while preserving safe diagnostic classification

### Requirement: Complete reviewer documentation
The submission SHALL include source in a Git repository with meaningful incremental history; README setup/run/test instructions and AI-tool disclosure; API documentation; architecture diagram; normal and failure/retry sequence diagrams; concise design rationale; failure reproduction instructions; and production trade-offs. Documentation SHALL distinguish tested mock behavior from any actual Gemini verification.

#### Scenario: Follow-up technical review
- **WHEN** a reviewer follows the README and architecture links
- **THEN** they can run the workflow, reproduce each required failure, trace retry/idempotency decisions, and identify deliberate scope limits without undocumented setup
