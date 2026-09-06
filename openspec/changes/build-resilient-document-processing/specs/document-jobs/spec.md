## Purpose

Accept supported documents durably and let an authenticated caller track processing without waiting for external services.

## ADDED Requirements

### Requirement: Durable asynchronous submission
The service SHALL accept a valid document through `POST /api/v1/document-jobs`, persist its contents and job atomically, and return HTTP 202 with a unique job ID, status URL, and creation time before AI or vendor processing finishes.

#### Scenario: Upstream is blocked
- **WHEN** a caller submits a valid PDF while Gemini is deliberately held open
- **THEN** the API returns 202 before Gemini completes and the accepted job remains retrievable after an application restart

#### Scenario: Acceptance cannot commit
- **WHEN** durable storage is unavailable during submission
- **THEN** the API returns a safe 503 response and does not claim the job was accepted

### Requirement: Validate and bound document input
The service SHALL accept exactly one unencrypted, structurally valid PDF of at most 5 MiB and 1-20 pages, with bounded upload/parsing time. It SHALL reject unsupported types with 415, oversized content with 413, and missing, malformed, encrypted, or excessive-page input with 400 before outbound processing.

#### Scenario: Invalid or disguised upload
- **WHEN** a caller submits empty content, a non-PDF renamed as PDF, an encrypted PDF, or a structurally invalid document
- **THEN** the service rejects it and makes no Gemini or vendor call

#### Scenario: Resource limits exceeded
- **WHEN** document bytes, page count, or parsing time exceed configured limits
- **THEN** processing is rejected with a safe error and resource use is bounded

### Requirement: Authenticated access
Submission and status routes SHALL require a valid configured API credential. Responses and logs SHALL exclude credentials, raw document bytes, and internal exception details. Uploads SHALL NOT be publicly downloadable.

#### Scenario: Unauthorized caller
- **WHEN** a caller omits or supplies an invalid API credential
- **THEN** the service returns 401 without parsing a submitted document or returning a stored result

### Requirement: Request idempotency
Submission SHALL require an `Idempotency-Key`. Reusing the same key and document bytes SHALL return the original job ID with HTTP 200; changing bytes under the same key SHALL return 409. Concurrent identical requests SHALL create only one job.

#### Scenario: Acceptance response is lost
- **WHEN** a caller repeats the original key and document after an acceptance response is lost
- **THEN** the caller receives the existing job and no second workflow is created

#### Scenario: Concurrent or conflicting requests
- **WHEN** identical keyed requests arrive concurrently, or a key is reused for different content
- **THEN** identical requests converge on one durable job and conflicting content is rejected with 409

### Requirement: Useful durable status
`GET /api/v1/document-jobs/{jobId}` SHALL return status, current stage, attempt counts, timestamps, scheduled retry time, and a safe classified error when present. Completed jobs SHALL include validated extraction and vendor receipt; failed vendor-stage jobs SHALL preserve extraction and label delivery as unconfirmed or unsuccessful. Unknown jobs SHALL return 404 and malformed IDs SHALL return 400.

#### Scenario: Waiting for a retry
- **WHEN** a retryable dependency failure has been recorded
- **THEN** status identifies the affected stage, next attempt time, attempt count, safe reason, and that automatic retry is scheduled

#### Scenario: Terminal failure
- **WHEN** a stage permanently fails or exhausts its budget
- **THEN** status is FAILED, automatic retry is false, and the response exposes no upstream body, secret, or stack trace
