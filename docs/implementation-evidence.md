# Implementation evidence

Started 2026-09-06 23:43 Asia/Ho_Chi_Minh. Synthetic data only.

- Foundation: dedicated Git root verified; confidential PDF/DOCX inputs ignored.
- Node 24.20.0: `npm ci --ignore-scripts`, unit tests, and build passed. Commands run through `npm exec --yes --package=node@24.20.0 --` because the host default is Node 26.
- TDD: liveness failed with 404 before adding the controller, then passed. Configuration failed on missing defaults, then passed including real credential and lease/mode rejection.
- `opensrc path @nestjs/platform-express typeorm redis pdf-lib zod --cwd .` fetched pinned dependency source. Reviewed upload interception, explicit migrations, Redis offline queuing, and PDF structural/encryption defaults.
- Selected real model: `gemini-2.5-flash`, listed in [Google's model catalog](https://ai.google.dev/gemini-api/docs/models) on 2026-09-06. Live provider access has not been tested.

## Progress checkpoint — 2026-09-07

Checkpoint includes the document submission/status API, MySQL schema and repositories, lease/retry state operations, Redis provider gating, Gemini/vendor HTTP adapters, mock receipt persistence, and their current tests. The background processing loop, full mock service, and end-to-end demonstration are not yet complete. This is a progress snapshot, not a completed assessment submission.

Verification used Node 24.20.0 via `npm exec --yes --package=node@24.20.0 --`:

- `npm run typecheck` and `npm run build`: passed.
- `npm run test`: passed, 8 tests in 8 suites.
- `npm run test:integration`: passed, 7 tests in 5 suites against the isolated `medicon-test` MySQL/Redis services. Coverage includes API acceptance/replay/errors, schema, provider gating, receipt deduplication, exclusive claims, durable retries, deadline exhaustion and stale-lease recovery.
- `npm run lint`: failed because the configured `scripts` directory does not exist yet. Direct `npx --no-install eslint src test mock migrations` passed for all existing source/test directories; this does not make the configured lint command pass.
- `npm run test:e2e`: failed with no matching E2E tests. No pass-with-no-tests override was used.
- `docker compose -f compose.test.yaml config --quiet`: passed; `docker compose -f compose.test.yaml ps` confirmed both test services healthy. Integration tests exercised their connections and the API. The test Compose file uses upstream images without build definitions; no application image is available to build or verify yet.
- `openspec validate build-resilient-document-processing --strict --no-interactive` and `git diff --check`: passed.
- Git ignore checks confirmed `.env` and confidential PDF/DOCX inputs are excluded. A pattern scan of publishable files found no matching Gemini/GitHub/OpenAI keys or private-key headers; this is a limited scan, not a security audit.

No production behavior was changed during checkpoint preparation, and no new TDD red/green cycle is claimed. Live Gemini access, complete worker orchestration, application container startup/shutdown, and full E2E behavior remain unverified.
