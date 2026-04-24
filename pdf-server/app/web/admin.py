from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlalchemy import text
from sqlalchemy.orm import Session
import secrets

from app.core.config import settings
from app.db.session import get_db

admin_router = APIRouter()
security = HTTPBasic()


def admin_auth(credentials: HTTPBasicCredentials = Depends(security)) -> str:
    correct_user = secrets.compare_digest(credentials.username, settings.admin_username)
    correct_pass = secrets.compare_digest(credentials.password, settings.admin_password)
    if not (correct_user and correct_pass):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return credentials.username


@admin_router.get("/admin", response_class=HTMLResponse)
def admin_dashboard(
    request: Request,
    status: str | None = None,
    operation: str | None = None,
    db: Session = Depends(get_db),
    _: str = Depends(admin_auth),
):
    jobs_sql = "select * from jobs"
    params: dict = {}
    clauses = []

    if status:
        clauses.append("status=:status")
        params["status"] = status
    if operation:
        clauses.append("operation=:operation")
        params["operation"] = operation

    if clauses:
        jobs_sql += " where " + " and ".join(clauses)

    jobs_sql += " order by created_at desc limit 100"

    jobs = db.execute(text(jobs_sql), params).mappings().all()
    assets = db.execute(text("select * from assets order by created_at desc limit 50")).mappings().all()
    derived_files = db.execute(text("select * from derived_files order by created_at desc limit 100")).mappings().all()

    status_value = status or ""
    operation_value = operation or ""

    html = f"""
    <html>
    <head>
      <title>Document Centre Admin</title>
      <style>
        body {{ font-family: Arial, sans-serif; margin: 24px; }}
        table {{ border-collapse: collapse; width: 100%; margin-bottom: 24px; font-size: 14px; }}
        th, td {{ border: 1px solid #ddd; padding: 8px; vertical-align: top; }}
        th {{ background: #f5f5f5; text-align: left; }}
        code {{ font-size: 12px; }}
        .actions form {{ display:inline-block; margin-right:6px; }}
        .filters {{ margin-bottom: 20px; padding: 12px; background: #fafafa; border: 1px solid #ddd; }}
      </style>
    </head>
    <body>
      <h1>Document Centre Admin</h1>

      <div class="filters">
        <form method="get" action="/admin">
          <label>Status:
            <input type="text" name="status" value="{status_value}" />
          </label>
          <label style="margin-left: 12px;">Operation:
            <input type="text" name="operation" value="{operation_value}" />
          </label>
          <button type="submit">Filter</button>
          <a href="/admin" style="margin-left: 12px;">Clear</a>
        </form>
      </div>

      <h2>Jobs</h2>
      <table>
        <tr>
          <th>ID</th>
          <th>Operation</th>
          <th>Status</th>
          <th>Asset ID</th>
          <th>Queue</th>
          <th>Error</th>
          <th>Result</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
    """

    for job in jobs:
        html += f"""
        <tr>
          <td><code>{job['id']}</code></td>
          <td>{job['operation']}</td>
          <td>{job['status']}</td>
          <td><code>{job.get('asset_id') or ''}</code></td>
          <td>{job['queue']}</td>
          <td><code>{(job.get('error') or '')[:300]}</code></td>
          <td><code>{str(job.get('result') or '')[:300]}</code></td>
          <td>{job.get('created_at') or ''}</td>
          <td class="actions">
            <form method="post" action="/admin/jobs/{job['id']}/retry"><button type="submit">Retry</button></form>
            <form method="post" action="/admin/jobs/{job['id']}/cancel"><button type="submit">Cancel</button></form>
            <form method="post" action="/admin/jobs/{job['id']}/delete" onsubmit="return confirm('Delete this job?');"><button type="submit">Delete</button></form>
          </td>
        </tr>
        """

    html += """
      </table>

      <h2>Assets</h2>
      <table>
        <tr>
          <th>ID</th>
          <th>Filename</th>
          <th>Status</th>
          <th>Pages</th>
          <th>Source</th>
          <th>Normalized</th>
          <th>Preview</th>
          <th>Thumbnail</th>
        </tr>
    """

    for asset in assets:
        html += f"""
        <tr>
          <td><code>{asset['id']}</code></td>
          <td>{asset['original_filename']}</td>
          <td>{asset['status']}</td>
          <td>{asset.get('page_count') or ''}</td>
          <td><code>{asset.get('source_storage_path') or ''}</code></td>
          <td><code>{asset.get('normalized_storage_path') or ''}</code></td>
          <td><code>{asset.get('preview_storage_path') or ''}</code></td>
          <td><code>{asset.get('thumbnail_storage_path') or ''}</code></td>
        </tr>
        """

    html += """
      </table>

      <h2>Derived Files</h2>
      <table>
        <tr>
          <th>ID</th>
          <th>Asset ID</th>
          <th>Job ID</th>
          <th>Kind</th>
          <th>Path</th>
          <th>Page</th>
          <th>Created</th>
        </tr>
    """

    for item in derived_files:
        html += f"""
        <tr>
          <td><code>{item['id']}</code></td>
          <td><code>{item.get('asset_id') or ''}</code></td>
          <td><code>{item.get('job_id') or ''}</code></td>
          <td>{item['kind']}</td>
          <td><code>{item['storage_path']}</code></td>
          <td>{item.get('page') or ''}</td>
          <td>{item.get('created_at') or ''}</td>
        </tr>
        """

    html += """
      </table>
    </body>
    </html>
    """

    return HTMLResponse(content=html)


@admin_router.post("/admin/jobs/{job_id}/delete")
def delete_job(job_id: str, db: Session = Depends(get_db), _: str = Depends(admin_auth)):
    db.execute(text("delete from jobs where id=:id"), {"id": job_id})
    db.commit()
    return RedirectResponse(url="/admin", status_code=303)


@admin_router.post("/admin/jobs/{job_id}/retry")
def retry_job(job_id: str, db: Session = Depends(get_db), _: str = Depends(admin_auth)):
    db.execute(
        text("update jobs set status='pending', error=null, started_at=null, finished_at=null where id=:id"),
        {"id": job_id},
    )
    db.commit()
    return RedirectResponse(url="/admin", status_code=303)


@admin_router.post("/admin/jobs/{job_id}/cancel")
def cancel_job(job_id: str, db: Session = Depends(get_db), _: str = Depends(admin_auth)):
    db.execute(text("update jobs set status='cancelled', finished_at=now() where id=:id"), {"id": job_id})
    db.commit()
    return RedirectResponse(url="/admin", status_code=303)
