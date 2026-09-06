## Purpose

Deliver checkpointed extraction results independently of AI processing and prevent duplicate effects when the vendor supports durable idempotency.

## ADDED Requirements

### Requirement: Independent downstream recovery
Vendor connection failures, timeouts, 429, 408, and 5xx responses SHALL use bounded vendor-stage retries. Successful extraction SHALL remain persisted and SHALL NOT be repeated solely because delivery fails.

#### Scenario: Vendor outage clears
- **WHEN** a vendor returns repeated 503 responses or connection failures before recovering within budget
- **THEN** the job eventually completes with the original extraction and exactly one successful AI stage

#### Scenario: Vendor outage exhausts budget
- **WHEN** vendor attempts or elapsed time are exhausted
- **THEN** the job fails at the vendor stage, preserves extraction, and exposes a safe delivery status

### Requirement: Stable vendor idempotency
Every delivery attempt for a job SHALL reuse the same persisted idempotency key and normalized extraction payload. The mock vendor SHALL durably bind that key to a payload hash and receipt, returning the original receipt on exact replay and 409 on conflicting content.

#### Scenario: Acceptance response lost
- **WHEN** the vendor commits acceptance and closes the connection before returning its receipt
- **THEN** a retry with the same key completes using the original receipt and the vendor stores only one accepted submission

#### Scenario: Vendor and worker restart
- **WHEN** the mock vendor and worker restart after remote acceptance but before local completion
- **THEN** delivery recovery returns the persisted receipt without a second accepted submission

#### Scenario: Key reused with changed payload
- **WHEN** a delivery key arrives with a different payload
- **THEN** the vendor returns 409 and the workflow records a terminal conflict instead of treating it as success

### Requirement: Completion requires a valid acknowledgement
A job SHALL become COMPLETED only after a validated accepted receipt is durably stored. An HTTP 2xx with empty, malformed, or unexpected acknowledgement SHALL be treated as uncertain delivery and retried under the same key within the vendor budget.

#### Scenario: Invalid success response
- **WHEN** the vendor returns HTTP 200 without a usable accepted receipt
- **THEN** the job does not become COMPLETED and any retry keeps the original delivery key

### Requirement: Duplicate guarantee is conditional on the vendor contract
Documentation SHALL state that delivery is at least once and duplicate effects are prevented by cooperating vendor idempotency. Terminal uncertain outcomes SHALL state that remote acceptance may have occurred. A non-idempotent vendor SHALL require reconciliation rather than a claimed exactly-once guarantee.

#### Scenario: Unknown final outcome
- **WHEN** all attempts end without a confirmed receipt after requests may have reached the vendor
- **THEN** status reports an unconfirmed remote outcome and documentation explains the reconciliation boundary
