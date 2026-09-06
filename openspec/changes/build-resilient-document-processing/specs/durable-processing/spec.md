## Purpose

Preserve and resume document workflow stages through dependency failures and worker restarts while bounding retries and duplicate processing.

## ADDED Requirements

### Requirement: Restart recovery from durable stage checkpoints
Accepted work, retry eligibility, attempt counts, stage deadlines, and successful extraction SHALL survive application and worker restarts. Recovery SHALL resume the unfinished stage without resetting retry budgets or repeating a checkpointed extraction.

#### Scenario: Restart after AI checkpoint
- **WHEN** the worker stops after extraction is committed but before vendor submission completes
- **THEN** a restarted worker resumes vendor delivery with the persisted extraction and makes no additional Gemini call

#### Scenario: Restart during backoff
- **WHEN** the worker restarts before a scheduled retry is due
- **THEN** no attempt starts early and original counts and stage deadline remain in force

### Requirement: Exclusive claims and stale completion protection
Concurrent workers SHALL NOT actively claim the same unexpired job lease. Abandoned work SHALL become eligible after lease expiry. An expired or superseded worker SHALL NOT overwrite the current job state with a late result.

#### Scenario: Competing workers
- **WHEN** two workers attempt to claim the same due job
- **THEN** only one obtains the active claim and records a new attempt

#### Scenario: Late response after recovery
- **WHEN** a claim expires, another worker takes over, and the old worker receives a delayed response
- **THEN** the old response cannot overwrite the new checkpoint, retry schedule, or terminal state

### Requirement: Bounded attempts and stage deadlines
The workflow SHALL enforce persisted AI limits of five attempts and 15 minutes from first AI claim, and vendor limits of six attempts and 30 minutes from vendor readiness by default. Each request SHALL be cancellable and bounded by its stage's remaining time and request timeout. Provider-gate deferrals SHALL NOT consume network attempts but SHALL consume elapsed deadline time.

#### Scenario: Deadline exceeds fifteen minutes
- **WHEN** the test clock passes the AI stage deadline without a usable checkpoint
- **THEN** active requests are aborted, no new AI attempt starts, and the job becomes FAILED with a safe exhausted-deadline classification

#### Scenario: No workers available until after deadline
- **WHEN** a previously started stage is recovered after its deadline
- **THEN** recovery records terminal exhaustion without contacting the provider

### Requirement: Retry timing and storm prevention
Retryable errors SHALL schedule persisted exponential backoff with jitter. Valid `Retry-After` seconds or HTTP-date values SHALL be honored without retrying early; malformed values SHALL fall back to backoff. Provider-wide cooldown and paced starts SHALL coordinate across workers, with bounded local concurrency.

#### Scenario: Rate-limited jobs across workers
- **WHEN** one job receives 429 with Retry-After and other jobs target the same provider scope
- **THEN** subsequent outbound starts respect the shared cooldown and paced-start policy

#### Scenario: Retry-After exceeds remaining budget
- **WHEN** a valid Retry-After would delay the next attempt beyond the stage deadline
- **THEN** the job fails as exhausted rather than retrying earlier than the provider allows

### Requirement: Transient state loss does not lose jobs
Loss or unavailability of transient coordination state SHALL NOT delete accepted work, checkpoints, attempts, or individual retry schedules. During coordination outages, the service SHALL pause outbound attempts, expose degraded readiness, and resume eligible work on recovery subject to original deadlines.

#### Scenario: Redis outage and recovery
- **WHEN** Redis is unavailable and later restored
- **THEN** jobs remain durable, no unpaced outbound attempts occur during the outage, and unexpired jobs resume without resetting their budgets

### Requirement: Durable attempt audit
Every attempted external request SHALL have durable stage, attempt number, start time, and outcome metadata, including safe failure classification and retry time when applicable. Interrupted attempts SHALL be distinguishable from successful ones without retaining sensitive bodies.

#### Scenario: Worker dies during a request
- **WHEN** a worker is killed after recording an attempt but before recording its outcome
- **THEN** recovery identifies the abandoned attempt, counts it toward the budget, and safely resumes eligible work
