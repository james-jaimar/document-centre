-- =============================================================================
-- Document Centre — Ops & Control API migration (2026-04-24)
-- Idempotent. Safe to re-run.
-- Resync: forced 2026-04-24 to ensure file appears in GitHub.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ops_audit_log — append-only trail of every privileged ops action.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ops_audit_log (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id          VARCHAR(64),
    actor_email       VARCHAR(255),
    actor_role        VARCHAR(64),
    action            VARCHAR(64)  NOT NULL,
    target_type       VARCHAR(64),
    target_id         VARCHAR(255),
    tenant_id         VARCHAR(64),
    app_id            VARCHAR(64),
    status            VARCHAR(32)  NOT NULL DEFAULT 'ok',
    message           TEXT,
    request_payload   JSONB,
    response_payload  JSONB,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_ops_audit_actor    ON ops_audit_log (actor_id);
CREATE INDEX IF NOT EXISTS ix_ops_audit_action   ON ops_audit_log (action);
CREATE INDEX IF NOT EXISTS ix_ops_audit_target   ON ops_audit_log (target_id);
CREATE INDEX IF NOT EXISTS ix_ops_audit_tenant   ON ops_audit_log (tenant_id);
CREATE INDEX IF NOT EXISTS ix_ops_audit_status   ON ops_audit_log (status);
CREATE INDEX IF NOT EXISTS ix_ops_audit_created  ON ops_audit_log (created_at DESC);


-- ---------------------------------------------------------------------------
-- 2. ops_storage_snapshots — hourly rollup of object storage usage.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ops_storage_snapshots (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    captured_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    backend       VARCHAR(32)  NOT NULL DEFAULT 'unknown',
    bucket        VARCHAR(255) NOT NULL DEFAULT 'unknown',
    prefix        VARCHAR(255),
    object_count  BIGINT       NOT NULL DEFAULT 0,
    total_bytes   BIGINT       NOT NULL DEFAULT 0,
    breakdown     JSONB,
    duration_ms   INTEGER
);

CREATE INDEX IF NOT EXISTS ix_ops_snap_captured ON ops_storage_snapshots (captured_at DESC);
CREATE INDEX IF NOT EXISTS ix_ops_snap_backend  ON ops_storage_snapshots (backend);
CREATE INDEX IF NOT EXISTS ix_ops_snap_bucket   ON ops_storage_snapshots (bucket);


-- ---------------------------------------------------------------------------
-- 3. job_events — add tenant_id / app_id attribution columns.
-- ---------------------------------------------------------------------------
ALTER TABLE job_events ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64);
ALTER TABLE job_events ADD COLUMN IF NOT EXISTS app_id    VARCHAR(64);

CREATE INDEX IF NOT EXISTS ix_job_events_tenant ON job_events (tenant_id);
CREATE INDEX IF NOT EXISTS ix_job_events_app    ON job_events (app_id);


-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
