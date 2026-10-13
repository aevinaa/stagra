from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Reading
from app.schemas import ReadingCreate, ReadingOut, to_utc

router = APIRouter(prefix="/api", tags=["readings"])


def _utc_bound(value: datetime | None, name: str) -> datetime | None:
    """Query-string time bounds must carry an explicit timezone too."""
    if value is None:
        return None
    try:
        return to_utc(value)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail=f"'{name}' must include a timezone (e.g. 'Z' or '%2B05:30' in a URL)",
        )


@router.post("/readings", response_model=ReadingOut, status_code=201)
def create_reading(payload: ReadingCreate, db: Session = Depends(get_db)):
    reading = Reading(**payload.model_dump())
    db.add(reading)
    db.commit()
    db.refresh(reading)
    return reading


@router.get("/current", response_model=ReadingOut)
def get_current(db: Session = Depends(get_db)):
    stmt = select(Reading).order_by(Reading.timestamp.desc(), Reading.id.desc()).limit(1)
    reading = db.scalars(stmt).first()
    if reading is None:
        raise HTTPException(status_code=404, detail="No readings stored yet")
    return reading


@router.get("/history", response_model=list[ReadingOut])
def get_history(
    experiment_id: str | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
    limit: int = Query(1000, ge=1, le=10000),
    db: Session = Depends(get_db),
):
    start_utc = _utc_bound(start, "start")
    end_utc = _utc_bound(end, "end")

    stmt = select(Reading)
    if experiment_id is not None:
        stmt = stmt.where(Reading.experiment_id == experiment_id.strip())
    if start_utc is not None:
        stmt = stmt.where(Reading.timestamp >= start_utc)
    if end_utc is not None:
        stmt = stmt.where(Reading.timestamp <= end_utc)

    # Newest first; `limit` keeps the most recent N matching readings
    stmt = stmt.order_by(Reading.timestamp.desc(), Reading.id.desc()).limit(limit)
    return db.scalars(stmt).all()