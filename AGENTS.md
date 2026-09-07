# Engineering and verification instructions

## Stack and scope

- Backend: NestJS on Node.js with TypeScript.
- Database: MySQL 8.
- Cache and transient state: Redis where appropriate.
- AI: Google Gemini through the direct Gemini API or Vertex AI.
- Containers: Docker and Docker Compose.

Read relevant requirements, OpenSpec artifacts, existing code, and repository guidance before editing. Trace callers and dependencies before fixing a bug. Reuse existing patterns and installed libraries. Add supporting libraries only for a concrete requirement; explain why existing tools are insufficient. Keep changes focused and avoid speculative infrastructure.

If `.ay/` exists, use its tracking files as the coordination source of truth. Do not create AY state unless the user requests an AY workflow.

## Implementation workflow: Ponytail + TDD

Use Ponytail at **full** intensity and test-driven development (TDD) together for every implementation task unless the user explicitly overrides them. Load the available Ponytail and TDD skills when provided by the environment; otherwise follow the rules below. These are working practices, not background processes.

### Ponytail: smallest correct change

- Understand the affected flow and callers before editing; fix the root cause.
- Prefer reuse, standard library features, native platform features, and installed dependencies before writing custom code or adding libraries.
- Avoid speculative abstractions, scaffolding, and unrelated changes. Implement the smallest change that satisfies the requirements.
- Never simplify away validation, security, error handling, edge cases, or required tests. TDD remains mandatory even for small behavior changes.
- Mark deliberate limitations with a `ponytail:` comment explaining the ceiling and when to upgrade.

### TDD: red, green, refactor

1. **Red:** Before changing production behavior, write one focused test for the next requirement or bug reproduction. Run it and confirm it fails for the expected behavioral reason, not a setup, import, or syntax error.
2. **Green:** Write the minimum production code needed to pass that test, then rerun it.
3. **Refactor:** Simplify while preserving behavior, then rerun affected tests.
4. Repeat in small increments for remaining requirements and relevant edge cases. Do not write the entire implementation first and add tests afterward.

Use the existing test runner and test public behavior rather than implementation details. For behavior-preserving refactors, establish passing coverage before editing and add characterization tests where coverage is missing. For documentation-only work, use the documentation checks below; for infrastructure changes, use an executable configuration or integration check appropriate to the change. Report unavailable test infrastructure as a blocker to verification, never as a passing TDD cycle.

## Required checks before completion

For application code, dependency, configuration, or infrastructure changes:

1. Inspect `package.json`, the lockfile, CI configuration, and container configuration. Use the repository's package manager, pinned runtime, and actual scripts.
2. Run lint in check mode. If a lint command fixes files, inspect its edits and rerun affected checks.
3. Run TypeScript type checking when it is separate from the build, then run the production build.
4. Run relevant unit tests and affected integration/end-to-end tests in non-watch mode. Run the full existing test suite before declaring the change complete.
5. Add or update regression tests for changed behavior and applicable edge cases below. A bug fix must have a check that fails without the fix and passes with it.
6. For Docker/Compose changes, validate Compose configuration, build affected images, and verify startup, health checks, and an affected request using an isolated test environment.
7. Fix failures caused by the change and rerun the affected checks. Report pre-existing failures separately; do not silently skip or weaken checks to obtain a passing result.

Use the root `package.json` scripts: `lint`, `typecheck`, `build`, `test`, `test:integration`, and `test:e2e`. Start the isolated test services as documented in README before integration/E2E checks. Never claim a missing or unexecuted check passed.

For documentation-only edits, check accuracy, links, and formatting; application tests, build, and lint are unnecessary unless executable behavior is affected.

## Edge cases to verify when relevant

### NestJS / TypeScript / API

- Validate untrusted input at entry points: missing, null, empty, malformed, oversized, out-of-range, and unexpected fields; reject invalid enum values and unsafe coercion.
- Verify authentication, authorization, and resource ownership, including cross-user access and expired or invalid credentials.
- Cover not-found responses, duplicate requests, pagination boundaries, concurrent updates, and consistent HTTP error responses.
- Await asynchronous operations, propagate failures correctly, and avoid exposing stack traces or secrets in client errors.
- Check dates/time zones and numeric precision where relevant; preserve precision for MySQL BIGINT and DECIMAL values.

### MySQL 8

- Use parameterized queries or safe ORM bindings; test uniqueness, foreign keys, nullability, and applicable length constraints.
- Verify transaction rollback and concurrency behavior for multi-step writes, including duplicate creation and retry/idempotency behavior where needed.
- Test schema changes against MySQL 8 with both an empty schema and representative existing data. Check data preservation and the documented recovery procedure.
- Exercise database unavailability and connection failures. Use an isolated test database; do not run tests or migrations against production.

### Redis

- Test cache hits, misses, expiration, invalidation after writes, malformed cached data, and key isolation between users or tenants.
- Verify behavior during Redis timeouts or outages. Optional caching may fall back to the database; security or correctness state must follow an explicit failure policy.
- For Redis-backed counters, locks, or idempotency, verify atomic operations, TTLs, and concurrent requests as applicable.

### Google Gemini / Vertex AI

- Mock external AI calls in routine automated tests; exercise success, empty responses, malformed structured output, blocked responses, timeouts, rate limits, and provider errors.
- Validate model output before using or persisting it. Treat prompts and model output as untrusted data; model output must not bypass authorization or trigger unchecked actions.
- Bound request duration and retries; retry only appropriate transient failures and respect provider retry guidance. Prevent unbounded cost or duplicate side effects.
- Keep API keys, service account credentials, and sensitive prompt/response data out of source control, logs, and test fixtures.
- Make live integration checks opt-in and report them separately. Mocked tests do not prove live provider access works.

### Docker / Docker Compose

- Check required environment variables, service hostnames, readiness/health checks, startup dependency handling, and persistent storage behavior.
- Verify the production image starts with its required runtime dependencies and no baked-in secrets.
- Test graceful shutdown and resource cleanup when lifecycle handling changes.
- Use isolated test services and volumes. Never delete user data or production volumes to make a check pass.

## Completion report

State what changed, the exact verification commands run and their results, and edge cases covered. For behavior changes, include the observed TDD red and green results. Clearly identify checks that were skipped, blocked, missing, or failed, with the reason. Do not say "all checks passed" unless every applicable required check actually ran and passed.
