from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.ops_service import ops_service

ops_router = APIRouter(prefix="/ops", tags=["ops"])


@ops_router.get("/health")
def ops_health():
    return ops_service.health()


@ops_router.get("/queues")
def ops_queues():
    return ops_service.queues()


@ops_router.get("/workers")
def ops_workers():
    return ops_service.workers()


@ops_router.get("/jobs")
def ops_jobs(limit: int = Query(default=100, ge=1, le=1000), db: Session = Depends(get_db)):
    return ops_service.jobs(db, limit=limit)


@ops_router.get("/jobs/{job_id}")
def ops_job(job_id: str, db: Session = Depends(get_db)):
    return ops_service.job(db, job_id=job_id)


@ops_router.get("/assets/{asset_id}/pipeline")
def ops_asset_pipeline(asset_id: str, db: Session = Depends(get_db)):
    return ops_service.asset_pipeline(db, asset_id=asset_id)


@ops_router.get("/metrics/stages")
def ops_metrics_stages(hours: int = Query(default=24, ge=1, le=720), db: Session = Depends(get_db)):
    return ops_service.stage_metrics(db, hours=hours)
