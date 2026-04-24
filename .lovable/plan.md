# Fix: defensive job_events migration

Wrap step 3 of `pdf-server/migrations/2026_04_24_ops_api.sql` in a `DO $$` block that checks for the `job_events` table before altering it. Skips gracefully with a NOTICE if absent. No other files affected.

After approval, the user runs:
```bash
cd ~/document-centre/pdf-server && git pull
sudo cp migrations/2026_04_24_ops_api.sql /opt/document-centre-api/migrations/
sudo psql "$DATABASE_URL" -f /opt/document-centre-api/migrations/2026_04_24_ops_api.sql
sudo systemctl restart document-centre-api document-centre-worker document-centre-beat
```
