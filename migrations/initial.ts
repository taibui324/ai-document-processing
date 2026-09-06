import { MigrationInterface, QueryRunner } from 'typeorm';
export class Initial1788710000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS document_jobs (
      id CHAR(36) PRIMARY KEY, correlation_id CHAR(36) NOT NULL,
      idempotency_key_hash CHAR(64) NOT NULL UNIQUE, document_sha256 CHAR(64) NOT NULL,
      mime_type VARCHAR(40) NOT NULL, size_bytes INT UNSIGNED NOT NULL,
      status ENUM('RECEIVED','AI_PROCESSING','VENDOR_PENDING','VENDOR_SUBMITTING','RETRY_WAIT','COMPLETED','FAILED') NOT NULL DEFAULT 'RECEIVED',
      stage ENUM('AI','VENDOR') NOT NULL DEFAULT 'AI', next_attempt_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      lease_token CHAR(36), lease_expires_at DATETIME(3),
      ai_attempts INT UNSIGNED NOT NULL DEFAULT 0, vendor_attempts INT UNSIGNED NOT NULL DEFAULT 0,
      unusable_results INT UNSIGNED NOT NULL DEFAULT 0, ai_deadline DATETIME(3), vendor_deadline DATETIME(3),
      extraction_json JSON, schema_version VARCHAR(20), model_id VARCHAR(100),
      vendor_idempotency_key VARCHAR(100) NOT NULL UNIQUE, vendor_receipt_id VARCHAR(100), last_error_code VARCHAR(80),
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), completed_at DATETIME(3),
      INDEX due_jobs(status, next_attempt_at), INDEX expired_leases(status, lease_expires_at),
      CHECK(size_bytes > 0 AND size_bytes <= 5242880)
    ) ENGINE=InnoDB`);
    await q.query(`CREATE TABLE IF NOT EXISTS documents (
      job_id CHAR(36) PRIMARY KEY, content MEDIUMBLOB NOT NULL,
      FOREIGN KEY(job_id) REFERENCES document_jobs(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    await q.query(`CREATE TABLE IF NOT EXISTS job_attempts (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, job_id CHAR(36) NOT NULL, stage ENUM('AI','VENDOR') NOT NULL,
      attempt_number INT UNSIGNED NOT NULL, outcome ENUM('STARTED','SUCCEEDED','RETRY','FAILED','ABANDONED') NOT NULL,
      error_code VARCHAR(80), http_status SMALLINT UNSIGNED, started_at DATETIME(3) NOT NULL, ended_at DATETIME(3), duration_ms INT UNSIGNED,
      next_attempt_at DATETIME(3), UNIQUE(job_id, stage, attempt_number),
      FOREIGN KEY(job_id) REFERENCES document_jobs(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    await q.query(`CREATE TABLE IF NOT EXISTS mock_vendor_receipts (
      idempotency_key VARCHAR(128) PRIMARY KEY, payload_hash CHAR(64) NOT NULL, receipt_id CHAR(36) NOT NULL UNIQUE,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB`);
  }
  async down(): Promise<void> { throw new Error('Destructive rollback is disabled; restore a tested backup or apply a forward migration.'); }
}
