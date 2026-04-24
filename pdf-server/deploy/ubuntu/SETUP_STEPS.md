# Ubuntu native setup

1. SSH into the VPS as a sudo user.
2. Install the Ubuntu packages:
   - `sudo bash scripts/install-ubuntu.sh`
3. Copy the repo into `/opt/document-centre-api`.
4. In `/opt/document-centre-api`, copy `.env.example` to `.env` and fill it in.
5. Run:
   - `sudo bash scripts/bootstrap-app.sh`
6. Install systemd units:
   - `sudo cp deploy/systemd/document-centre-api.service /etc/systemd/system/`
   - `sudo cp deploy/systemd/document-centre-worker.service /etc/systemd/system/`
7. Reload systemd and start services:
   - `sudo systemctl daemon-reload`
   - `sudo systemctl enable --now document-centre-api document-centre-worker`
8. Install Nginx site:
   - `sudo cp deploy/nginx/document-centre-api.conf /etc/nginx/sites-available/document-centre-api.conf`
   - edit `server_name`
   - `sudo ln -s /etc/nginx/sites-available/document-centre-api.conf /etc/nginx/sites-enabled/document-centre-api.conf`
   - `sudo nginx -t && sudo systemctl reload nginx`
9. Point your domain/subdomain at the VPS.
10. Add SSL with Certbot when DNS is live.
11. Run the SQL in `supabase/migrations/001_init.sql` inside Supabase.
12. Check:
    - `curl http://127.0.0.1:8000/health`
    - `sudo systemctl status document-centre-api`
    - `sudo systemctl status document-centre-worker`
