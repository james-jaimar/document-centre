## Goal
Make the `pdf-api` Cloud Run revision boot successfully on `PORT=8080`.

## Confirmed from the pasted GitHub log
The workflow now reaches `Deploy pdf-api (HTTP)`, so the earlier Secret Manager/IAM gate is past. The current failure is Cloud Run rejecting the new revision because the container never starts listening on `PORT=8080` within the startup window.

## Likely code-level issue found
`pdf-server/app/web/routes.py` imports `app.tasks.cloudprinter_tasks` during FastAPI startup. That module imports `requests`, but `pdf-server/requirements.txt` does not include `requests`. In the Cloud Run image this can crash uvicorn before it binds to port 8080.

## Implementation plan
1. Update `pdf-server/requirements.txt`
   - Add a pinned `requests` dependency, matching the existing pinned dependency style.

2. Add a local/import smoke check to the deploy workflow before building/deploying
   - Add a lightweight step that catches Python import/startup dependency errors before waiting several minutes for Cloud Run revision creation to fail.
   - Keep it scoped to `pdf-server` startup only.

3. Improve deployment diagnostics
   - Add `--startup-probe`/startup timeout settings only if the app is legitimately slow after import issues are fixed.
   - Do not mask real import crashes by only extending timeout.

4. Update `.lovable/plan.md`
   - Record the new failure stage and recovery path: Cloud Run container startup, not IAM/secrets.

## Validation after implementation
- Push/rerun workflow.
- Expected progression: build succeeds, deploy creates a healthy revision, summary prints Cloud Run URL.
- Then verify: `curl -fsS "$URL/health"` returns `200` with `status: ok`.