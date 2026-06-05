## Plan

Fix the Cloud Run startup failure by making the API tolerate legacy `postgresql://` / `postgres://` database URLs while continuing to use the already-installed Psycopg 3 driver.

### Changes

1. **Normalize the SQLAlchemy database URL at config time**
   - In `pdf-server/app/core/config.py`, add a small helper that converts:
     - `postgresql://...` → `postgresql+psycopg://...`
     - `postgres://...` → `postgresql+psycopg://...`
   - Leave explicit driver URLs unchanged, especially `postgresql+psycopg://...`.

2. **Use the normalized URL for SQLAlchemy**
   - Keep `pdf-server/app/db/session.py` as-is if `settings.database_url` becomes normalized.
   - This prevents SQLAlchemy from defaulting to the `psycopg2` dialect, which is what caused:
     `ModuleNotFoundError: No module named 'psycopg2'`.

3. **Update deployment guidance**
   - Add a note to the GCP bootstrap/deploy docs/comments that `PDF_DATABASE_URL` may be pasted as a plain Supabase pooler URL, but the app normalizes it internally.
   - Keep recommending the transaction pooler on port `6543` for Cloud Run.

4. **Local verification**
   - Run a targeted Python import/config check with sample URLs to confirm SQLAlchemy selects the Psycopg 3 dialect and no longer imports `psycopg2`.

### Why this is the smallest safe fix

- The image already installs `psycopg[binary]`, not `psycopg2`.
- The failure shows SQLAlchemy is using its default `postgresql://` driver path, which imports `psycopg2`.
- Normalizing the URL avoids adding another DB driver and keeps the project aligned with the existing Python 3.12/Psycopg 3 stack.