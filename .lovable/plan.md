## Plan

1. **Make the smoke test print the real startup failure**
   - Update `.github/workflows/pdf-server-deploy.yml` so the container boot smoke test waits briefly after an early exit before failing.
   - Ensure it always prints full container logs before returning `Container exited before /health became ready`.
   - This should show the Python traceback instead of only `[entrypoint] starting role=api port=8080`.

2. **Fix the likely import-time task mismatch**
   - In `pdf-server/app/web/routes.py`, correct the task imports to match the actual files present under `pdf-server/app/tasks/`:
     - `document_tasks.py`
     - `operation_tasks.py`
     - `production_tasks.py`
     - `cloudprinter_tasks.py`
   - The current imports reference `app.tasks.operation_tasks` and `app.tasks.production_tasks`, but `app/worker.py` still includes `app.tasks.ops_tasks`; this split should be consistent so the API and Celery image boot paths do not fail differently.

3. **Remove API startup dependency on Celery worker modules where safe**
   - Keep route behaviour the same, but avoid importing every heavy Celery task module at FastAPI startup if possible.
   - Prefer importing task objects lazily inside the route handlers that enqueue them, or centralise safe task access in a small helper.
   - This keeps `/health` able to boot even when worker-only dependencies or optional runtime settings are not needed by the HTTP service.

4. **Patch any concrete startup error revealed by logs**
   - If the improved smoke-test logs reveal a specific missing dependency/module/config value, patch that directly.
   - Do not infer a root cause from the generic connection reset; use the actual container traceback.

5. **Update `.lovable/plan.md`**
   - Record this new failure stage: the local container boot smoke test fails before deploy.
   - Add the expected diagnostic output: full `docker logs` from the failed smoke-test container.
   - Update exit criteria so the next rerun must show `/health` passing locally before Cloud Run deploy starts.