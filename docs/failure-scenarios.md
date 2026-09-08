# Failure scenarios and runbook

Run `npm run test:e2e` after starting `compose.test.yaml`. The tests exercise these scenarios using isolated MySQL/Redis and local HTTP fixtures. Standalone demo tooling is excluded from this PR at the user's request.

| Scenario | Expected terminal status | AI attempts | Vendor attempts | Receipts |
| --- | --- | --- | --- | --- |
| happy | COMPLETED | 1 | 1 | 1 |
| ai-429-then-success | COMPLETED | 3 | 1 | 1 |
| ai-429-exhausted | FAILED | 5 | 0 | 0 |
| ai-empty | FAILED | 2 | 0 | 0 |
| ai-invalid | FAILED | 2 | 0 | 0 |
| ai-slow | FAILED | 5 | 0 | 0 |
| vendor-503-then-success | COMPLETED | 1 | 3 | 1 |
| vendor-reset | COMPLETED | 1 | 2 | 1 |
| vendor-accept-then-drop | COMPLETED | 1 | 2 | 1 |
| vendor-503-exhausted | FAILED | 1 | 6 | 0 |
| vendor-invalid | FAILED, unconfirmed | 1 | 6 | 1 |

Attempts can increase if the local machine itself causes additional timeouts. Automated tests use isolated real MySQL/Redis plus deterministic HTTP fixtures to assert the exact expected behavior. Main-stack defaults stay at 60-second AI calls and 15-/30-minute stage budgets; tests shorten request timeouts and exercise deadline policy with an injected clock.

## Inspect safely

```sh
docker compose ps
docker compose logs --tail=100 worker api
docker compose exec -T mysql mysql -uroot -plocal-demo-root medicon -e "SELECT status,stage,COUNT(*) FROM document_jobs GROUP BY status,stage"
docker compose exec -T mysql mysql -uroot -plocal-demo-root medicon -e "SELECT id,stage,next_attempt_at FROM document_jobs WHERE status='RETRY_WAIT' ORDER BY next_attempt_at LIMIT 10"
docker compose exec -T mysql mysql -uroot -plocal-demo-root medicon -e "SELECT id,stage,last_error_code FROM document_jobs WHERE status='FAILED' ORDER BY updated_at DESC LIMIT 10"
docker compose exec -T mysql mysql -uroot -plocal-demo-root medicon -e "SELECT job_id,stage,attempt_number,outcome,error_code,duration_ms FROM job_attempts ORDER BY id DESC LIMIT 20"
```

These are public demo credentials only; use your approved secret-management method for a real environment. Avoid querying document BLOBs or extraction fields during ordinary diagnosis.

## Recovery

- **MySQL unavailable:** API acceptance returns 503. Restore connectivity and retry the same client key and original bytes. An ambiguous response may already have committed.
- **Redis unavailable:** readiness degrades and jobs defer five seconds without spending attempts. Restore Redis; eligible jobs resume within the original deadlines.
- **Worker interrupted:** restart it normally. Open attempts become abandoned after lease expiry, unless graceful cancellation already checkpointed them. Do not reset counters/deadlines.
- **Gemini rate limit:** inspect classified attempts and next-attempt times. Respect the provider delay; reduce configured throughput when needed. Do not manually force early retries.
- **Unusable/safety-rejected extraction:** the job stops safely. Review synthetic input and provider configuration; do not bypass safety or send invalid data downstream.
- **Vendor unconfirmed outcome:** reconcile with the vendor using the stored stable key. A failed response does not prove the remote side effect failed. Do not generate a fresh key to replay uncertain work.
- **Schema/application rollback:** stop workers first and use a schema-compatible image. Destructive rollback is deliberately disabled; use a tested backup or forward migration.

Ordinary container restart/recreation preserves named volumes. `docker compose down -v` is destructive and is not a runbook step.
