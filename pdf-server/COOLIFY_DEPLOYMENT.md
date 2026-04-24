# Coolify deployment (Supabase + Redis only)

This repo is meant to be deployed in Coolify as **two Applications plus one Redis service**:

1. **API app** from this GitHub repo
2. **Worker app** from this same GitHub repo
3. **Redis service** managed by Coolify

Do **not** use Git-backed Docker Compose deployment for production here.

## Why

- Supabase already provides Postgres and Storage
- Coolify was failing on the Git-backed Docker Compose path
- Two simple Dockerfile apps are easier to reason about and redeploy

## What you create in Coolify

### A. Redis service
Create a Redis service in Coolify first.

Use its internal URL for these env vars in both apps:

- `REDIS_URL`
- `CELERY_BROKER_URL`
- `CELERY_RESULT_BACKEND`

A typical value will look like:

```text
redis://redis:6379/0
```

or whatever Coolify shows for your Redis service.

### B. API application
Create a new **Application** from your GitHub repo.

- Build Pack: **Dockerfile**
- Dockerfile path: `./Dockerfile`
- Start command override: `/app/scripts/start-api.sh`
- Public port: `8000`
- Attach your API domain / FQDN here

### C. Worker application
Create a second **Application** from the same GitHub repo.

- Build Pack: **Dockerfile**
- Dockerfile path: `./Dockerfile`
- Start command override: `/app/scripts/start-worker.sh`
- No public domain needed

## Environment variables to set on BOTH apps

Copy from `.env.example` and fill in:

- `APP_ENV=production`
- `APP_DEBUG=false`
- `SECRET_KEY=...`
- `DATABASE_URL=...` (Supabase Postgres)
- `REDIS_URL=...`
- `CELERY_BROKER_URL=...`
- `CELERY_RESULT_BACKEND=...`
- `SUPABASE_URL=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`
- `SUPABASE_STORAGE_BUCKET=documents`
- `STORAGE_MODE=supabase`
- `ADMIN_USERNAME=...`
- `ADMIN_PASSWORD=...`

## Environment variables only needed on API

Usually the same env set can exist on both apps. That is the easiest path.

## Supabase setup

1. Create the `documents` bucket in Supabase Storage
2. Run `supabase/migrations/001_init.sql` in Supabase SQL Editor
3. Use your Supabase Postgres connection string in `DATABASE_URL`

## First checks after deploy

### API
- `/health`
- `/docs`
- `/admin`

### Worker
Queue a job from the API and confirm it moves from `queued` to `running` to `done`.

## If jobs stay queued forever

That means one of these is wrong:

- worker app is not running
- Redis URL is wrong
- Celery broker/backend env vars are wrong

## If files fail to download or upload

That usually means one of these is wrong:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`
- bucket does not exist
