## Purpose

Extract bounded, structured invoice data from documents through Gemini and classify unreliable or unusable provider responses safely.

## ADDED Requirements

### Requirement: Real Gemini integration with validated structured output
Real mode SHALL send the PDF and versioned extraction schema to Gemini. The result SHALL be locally validated before persistence as a successful extraction or transmission to a vendor. The sample schema SHALL include document type, number, date, decimal-string total, supported currency, and bounded line items.

#### Scenario: Usable invoice
- **WHEN** Gemini returns a complete, valid result for the invoice schema
- **THEN** normalized data, schema version, and model identifier are checkpointed before the vendor stage becomes eligible

### Requirement: Recover from Gemini rate limits
Gemini 429 responses SHALL be classified as retryable, recorded, and scheduled according to shared cooldown, Retry-After, attempt limits, and elapsed budget rather than discarding the job immediately.

#### Scenario: Rate limit clears
- **WHEN** Gemini returns two 429 responses followed by a valid extraction within the budget
- **THEN** the job proceeds to vendor delivery and all three attempts are visible in the audit

#### Scenario: Rate limit persists
- **WHEN** Gemini continues to return 429 until an attempt or time budget is exhausted
- **THEN** the job becomes FAILED with a safe rate-limit/exhaustion reason and no vendor submission

### Requirement: Unusable responses are not successful extraction
Empty text, missing candidate content, malformed JSON, schema violations, and incomplete generations SHALL be rejected. Unusable output SHALL receive at most one additional attempt within the overall AI budget. Safety refusals and permanent authentication/client errors SHALL fail without automatic retry.

#### Scenario: HTTP success with invalid content
- **WHEN** Gemini returns HTTP 200 with empty, missing, malformed, or schema-invalid content twice
- **THEN** the job fails as AI_UNUSABLE_RESULT and the vendor receives nothing

#### Scenario: Blocked response
- **WHEN** Gemini reports a safety refusal
- **THEN** the service reports a safe terminal classification without attempting to bypass the refusal

### Requirement: Slow requests release resources
AI calls SHALL default to a 60-second timeout, bounded by the remaining stage budget, covering connection and body consumption. Timeout SHALL cancel local request work and use the common bounded retry policy. Late responses SHALL NOT change a failed or recovered job.

#### Scenario: Provider never finishes
- **WHEN** the mock keeps the connection or response body open beyond a shortened test timeout
- **THEN** the request is aborted, the worker slot becomes available, and the already accepted caller is not blocked

### Requirement: Documents and model responses remain untrusted
Extraction SHALL use fixed instructions and schema-only data handling without document-triggered tools, executable output, or caller-chosen outbound URLs. Sensitive failed responses SHALL NOT appear in logs or status errors.

#### Scenario: Embedded hostile instructions
- **WHEN** a document or provider result contains instructions to reveal secrets, call another URL, or execute code
- **THEN** it cannot trigger those actions and only a validated extraction can proceed
