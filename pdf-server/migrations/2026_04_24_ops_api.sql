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
-- 3. job_events — per-stage instrumentation events for asset/job pipelines.
--    Created here (not by the ORM) because the worker writes to it on the
--    very first task; without this table, inspect_asset crashes immediately
--    and the upload UI hangs forever at "Reading page metadata…".
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_events (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id         VARCHAR(64)  NOT NULL,
    asset_id       VARCHAR(64),
    tenant_id      VARCHAR(64),
    app_id         VARCHAR(64),
    task_name      VARCHAR(128),
    queue_name     VARCHAR(64),
    worker_name    VARCHAR(128),
    stage          VARCHAR(64)  NOT NULL,
    status         VARCHAR(32)  NOT NULL,
    message        TEXT,
    started_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    finished_at    TIMESTAMPTZ,
    duration_ms    INTEGER,
    metadata_json  JSONB,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- If the table existed before this migration with an older shape, make sure
-- every column the ORM expects is present. ADD COLUMN IF NOT EXISTS is a no-op
-- when the column already exists, so this is safe to re-run.
ALTER TABLE job_events ADD COLUMN IF NOT EXISTS asset_id      VARCHAR(64);
ALTER TABLE job_events ADD COLUMN IF NOT EXISTS tenant_id     VARCHAR(64);
ALTER TABLE job_events ADD COLUMN IF NOT EXISTS app_id        VARCHAR(64);
ALTER TABLE job_events ADD COLUMN IF NOT EXISTS task_name     VARCHAR(128);
ALTER TABLE job_events ADD COLUMN IF NOT EXISTS queue_name    VARCHAR(64);
ALTER TABLE job_events ADD COLUMN IF NOT EXISTS worker_name   VARCHAR(128);
ALTER TABLE job_events ADD COLUMN IF NOT EXISTS message       TEXT;
ALTER TABLE job_events ADD COLUMN IF NOT EXISTS finished_at   TIMESTAMPTZ;
ALTER TABLE job_events ADD COLUMN IF NOT EXISTS duration_ms   INTEGER;
ALTER TABLE job_events ADD COLUMN IF NOT EXISTS metadata_json JSONB;
ALTER TABLE job_events ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS ix_job_events_job        ON job_events (job_id);
CREATE INDEX IF NOT EXISTS ix_job_events_asset      ON job_events (asset_id);
CREATE INDEX IF NOT EXISTS ix_job_events_tenant     ON job_events (tenant_id);
CREATE INDEX IF NOT EXISTS ix_job_events_app        ON job_events (app_id);
CREATE INDEX IF NOT EXISTS ix_job_events_task       ON job_events (task_name);
CREATE INDEX IF NOT EXISTS ix_job_events_queue      ON job_events (queue_name);
CREATE INDEX IF NOT EXISTS ix_job_events_stage      ON job_events (stage);
CREATE INDEX IF NOT EXISTS ix_job_events_status     ON job_events (status);
CREATE INDEX IF NOT EXISTS ix_job_events_started_at ON job_events (started_at DESC);


-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
