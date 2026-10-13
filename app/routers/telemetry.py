"""Read-only, dashboard-shaped endpoints for `frontend_final`.

    GET /api/telemetry/current   newest stored reading, with the dashboard's field names
    GET /api/telemetry/history   readings in chronological order, filtered and size-bounded
    GET /api/system/status       data-flow status derived from the stored readings

These are adapters over the existing `readings` table and `Reading` model. They never write,
never convert `mq135_raw` into anything else, never classify air quality and never invent a
value: an empty database yields explicit "no data" answers.

The three original routes in `app/routers/readings.py` are not touched and keep their
behaviour and response schemas.

How long histories are handled
------------------------------
`/api/telemetry/history` never returns more than `max_points` readings (default 1000, at most
10000, the same ceiling as `/api/history`). When more stored readings match the filters, ONE SQL
statement reduces them inside the database, so Python never loads more than `max_points` rows:

* the matching readings are put in time order and cut into groups of `groupSize` consecutive
  readings (`groupSize` is reported in `meta`);
* from every group the stored reading with the highest `mq135_raw` and the one with the lowest
  are kept, so peaks and dips survive; the first and the last matching reading are kept too.

Every returned point is an unmodified stored row with its real timestamp; nothing is averaged,
interpolated or written back. `meta` states whether this happened (`downsampled`, `method`,
`sourceCount`, `note`). The database is only read.
"""

import math
import os
from datetime import datetime, timedelta, timezone
from statistics import median
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Reading
from app.routers.readings import _utc_bound
from app.ui_schemas import (
    CurrentTelemetry,
    HistoryMeta,
    HistoryPoint,
    HistoryResponse,
    SystemStatusOut,
)

router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])
system_router = APIRouter(prefix="/api/system", tags=["system"])

# Mirrors ml.preprocess.SYNTHETIC_PREFIX (a test asserts they stay equal); the backend does not
# import the ml package.
SYNTHETIC_PREFIX = "SYNTH-"

RANGE_SECONDS = {"1h": 3600, "6h": 6 * 3600, "24h": 24 * 3600, "7d": 7 * 24 * 3600}
RangeName = Literal["1h", "6h", "24h", "7d"]
DEFAULT_RANGE = "24h"  # used only when no time bound and no experiment is given

DEFAULT_MAX_POINTS = 1000
MIN_MAX_POINTS = 4
MAX_MAX_POINTS = 10000

# System status. The real ESP32 interval is not assumed: it is inferred from stored timestamps.
STALE_ENV = "AIRQ_STALE_AFTER_SECONDS"  # optional override, in seconds (> 0)
DEFAULT_STALE_AFTER_SECONDS = 120.0  # used only when the interval cannot be inferred
MIN_STALE_AFTER_SECONDS = 30.0
STALE_INTERVAL_MULTIPLIER = 3.0  # a reading is stale after this many sampling intervals
INTERVAL_SAMPLE_SIZE = 20  # newest readings of the latest experiment used to infer the interval
FUTURE_TOLERANCE_SECONDS = 60.0  # newest timestamp further ahead than this = clock problem


def _utcnow() -> datetime:
    """Server clock (UTC). A separate function so tests can control it."""
    return datetime.now(timezone.utc)


def _is_synthetic(experiment_id: str) -> bool:
    return experiment_id.startswith(SYNTHETIC_PREFIX)


def _latest_reading(db: Session) -> Reading | None:
    # Same ordering as GET /api/current: newest timestamp, ties broken by the highest id.
    stmt = select(Reading).order_by(Reading.timestamp.desc(), Reading.id.desc()).limit(1)
    return db.scalars(stmt).first()


# ------------------------------------------------------------------ current
@router.get("/current", response_model=CurrentTelemetry)
def telemetry_current(db: Session = Depends(get_db)):
    reading = _latest_reading(db)
    if reading is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "no_readings", "message": "No readings stored yet"},
        )
    return CurrentTelemetry(
        temperature=reading.temperature_c,
        humidity=reading.humidity_percent,
        mq135=reading.mq135_raw,
        timestamp=reading.timestamp,
        occupancy=reading.occupancy,
        ventilation=reading.ventilation,
        fan=reading.fan,
        ac=reading.ac,
        occupancyInferred=False,
        ventilationInferred=False,
        experimentId=reading.experiment_id,
        location=reading.location,
        readingId=reading.id,
        isSynthetic=_is_synthetic(reading.experiment_id),
    )


# ------------------------------------------------------------------ history
def _history_rows(db: Session, experiment_id, lo, hi, max_points: int):
    """Chronological rows matching the filters, reduced inside SQLite to at most `max_points`.

    One statement, so the count used for grouping and the rows returned come from the same
    view of the table. Result columns: id, timestamp, temperature_c, humidity_percent,
    mq135_raw, experiment_id, rn (1-based position), cnt (number of matching readings).
    """
    conditions = []
    if experiment_id is not None:
        conditions.append(Reading.experiment_id == experiment_id)
    if lo is not None:
        conditions.append(Reading.timestamp >= lo)
    if hi is not None:
        conditions.append(Reading.timestamp <= hi)

    groups_wanted = (max_points - 2) // 2  # >= 1 because max_points >= MIN_MAX_POINTS

    numbered = (
        select(
            Reading.id.label("id"),
            Reading.timestamp.label("timestamp"),
            Reading.temperature_c.label("temperature_c"),
            Reading.humidity_percent.label("humidity_percent"),
            Reading.mq135_raw.label("mq135_raw"),
            Reading.experiment_id.label("experiment_id"),
            func.row_number().over(order_by=(Reading.timestamp, Reading.id)).label("rn"),
            func.count().over().label("cnt"),
        )
        .where(*conditions)
        .subquery("numbered")
    )
    # ceil(cnt / groups_wanted) consecutive readings per group. `.op("/", precedence=8)` renders a
    # plain SQL "/" (integer division in SQLite for integer operands) with the usual
    # multiply/divide precedence, so SQLAlchemy adds the parentheses. (Python's `//` would render
    # FLOOR(...), which not every SQLite build provides.)
    group_size = (numbered.c.cnt + (groups_wanted - 1)).op("/", precedence=8)(groups_wanted)
    grouped = select(
        numbered, (numbered.c.rn - 1).op("/", precedence=8)(group_size).label("grp")
    ).subquery("grouped")
    ranked = select(
        grouped,
        func.row_number()
        .over(partition_by=grouped.c.grp, order_by=(grouped.c.mq135_raw.desc(), grouped.c.rn))
        .label("hi_rank"),
        func.row_number()
        .over(partition_by=grouped.c.grp, order_by=(grouped.c.mq135_raw.asc(), grouped.c.rn))
        .label("lo_rank"),
    ).subquery("ranked")

    stmt = (
        select(
            ranked.c.id,
            ranked.c.timestamp,
            ranked.c.temperature_c,
            ranked.c.humidity_percent,
            ranked.c.mq135_raw,
            ranked.c.experiment_id,
            ranked.c.rn,
            ranked.c.cnt,
        )
        .where(
            or_(
                ranked.c.cnt <= max_points,  # small enough: keep everything
                ranked.c.hi_rank == 1,  # highest mq135 in its group
                ranked.c.lo_rank == 1,  # lowest mq135 in its group
                ranked.c.rn == 1,  # first matching reading
                ranked.c.rn == ranked.c.cnt,  # last matching reading
            )
        )
        .order_by(ranked.c.rn)
        .limit(max_points)  # hard bound; by construction never reached
    )
    return db.execute(stmt).all()


@router.get("/history", response_model=HistoryResponse)
def telemetry_history(
    range_: RangeName | None = Query(
        None, alias="range", description="relative window: 1h, 6h, 24h or 7d (see `anchor`)"
    ),
    anchor: Literal["now", "latest"] | None = Query(
        None,
        description="what `range` counts back from: the server clock ('now', the default) or the "
        "newest stored reading that matches the experiment filter ('latest')",
    ),
    start: datetime | None = Query(None, description="explicit lower bound; must carry a timezone"),
    end: datetime | None = Query(None, description="explicit upper bound; must carry a timezone"),
    experiment_id: str | None = None,
    max_points: int = Query(DEFAULT_MAX_POINTS, ge=MIN_MAX_POINTS, le=MAX_MAX_POINTS),
    db: Session = Depends(get_db),
):
    """Readings in ascending time order.

    Window: `range` (relative) OR `start`/`end` (explicit), not both. With neither: the whole
    experiment if `experiment_id` is given, otherwise the last 24 hours. All bounds are inclusive.
    """
    experiment = None
    if experiment_id is not None:
        experiment = experiment_id.strip()
        if not experiment:
            raise HTTPException(status_code=422, detail="'experiment_id' must not be blank")

    explicit = start is not None or end is not None
    if explicit and range_ is not None:
        raise HTTPException(status_code=422, detail="use either 'range' or 'start'/'end', not both")
    if anchor is not None and (explicit or range_ is None):
        raise HTTPException(status_code=422, detail="'anchor' only applies together with 'range'")

    lo = _utc_bound(start, "start")
    hi = _utc_bound(end, "end")
    if lo is not None and hi is not None and lo > hi:
        raise HTTPException(status_code=422, detail="'start' must not be after 'end'")

    range_label = None
    anchor_used = None
    if not explicit:
        range_label = range_ or (DEFAULT_RANGE if experiment is None else None)
    if range_label is not None:
        anchor_used = anchor or "now"
        if anchor_used == "now":
            hi = _utcnow()
        else:
            newest = select(func.max(Reading.timestamp))
            if experiment is not None:
                newest = newest.where(Reading.experiment_id == experiment)
            hi = db.scalar(newest)
        if hi is not None:
            lo = hi - timedelta(seconds=RANGE_SECONDS[range_label])

    if range_label is not None and hi is None:
        rows = []  # anchor='latest' on an empty selection: nothing to count back from
    else:
        rows = _history_rows(db, experiment, lo, hi, max_points)

    source_count = int(rows[0].cnt) if rows else 0
    downsampled = source_count > max_points
    group_size = None
    if downsampled:
        groups_wanted = (max_points - 2) // 2
        group_size = -(-source_count // groups_wanted)  # ceil

    if downsampled:
        note = (
            f"Showing {len(rows)} of {source_count} stored readings. Readings were split into groups of "
            f"{group_size} consecutive readings; from each group the readings with the highest and lowest "
            "mq135 are kept, plus the first and last reading. Every point is an unmodified stored "
            "reading; nothing is averaged or interpolated, and stored data is not changed."
        )
    else:
        note = f"All {source_count} matching stored readings are shown; nothing was reduced."

    points = [
        HistoryPoint(
            timestamp=r.timestamp,
            temperature=r.temperature_c,
            humidity=r.humidity_percent,
            mq135=r.mq135_raw,
            experimentId=r.experiment_id,
            isSynthetic=_is_synthetic(r.experiment_id),
        )
        for r in rows
    ]
    return HistoryResponse(
        readings=points,
        meta=HistoryMeta(
            count=len(points),
            sourceCount=source_count,
            maxPoints=max_points,
            downsampled=downsampled,
            method="min_max_per_group" if downsampled else "none",
            groupSize=group_size,
            note=note,
            experimentId=experiment,
            range=range_label,
            anchor=anchor_used,
            windowStart=lo,
            windowEnd=hi,
        ),
    )


# ------------------------------------------------------------------ system status
def _infer_interval_seconds(db: Session, experiment_id: str) -> float | None:
    """Median positive spacing of the newest readings of one experiment; None if unknown."""
    stamps = db.scalars(
        select(Reading.timestamp)
        .where(Reading.experiment_id == experiment_id)
        .order_by(Reading.timestamp.desc(), Reading.id.desc())
        .limit(INTERVAL_SAMPLE_SIZE)
    ).all()
    stamps.reverse()
    deltas = [(b - a).total_seconds() for a, b in zip(stamps, stamps[1:]) if b > a]
    return round(median(deltas), 3) if deltas else None


def _stale_after(interval: float | None) -> tuple[float, str]:
    raw = os.getenv(STALE_ENV)
    if raw is not None and raw.strip() != "":
        try:
            value = float(raw)
        except ValueError:
            value = math.nan
        if not math.isfinite(value) or value <= 0:
            raise HTTPException(
                status_code=500,
                detail=f"{STALE_ENV} must be a positive number of seconds, got {raw!r}",
            )
        return value, "env"
    if interval is not None:
        return max(MIN_STALE_AFTER_SECONDS, STALE_INTERVAL_MULTIPLIER * interval), "inferred_interval"
    return DEFAULT_STALE_AFTER_SECONDS, "default"


@system_router.get("/status", response_model=SystemStatusOut)
def system_status(db: Session = Depends(get_db)):
    now = _utcnow()
    latest = _latest_reading(db)
    interval = _infer_interval_seconds(db, latest.experiment_id) if latest is not None else None
    stale_after, stale_source = _stale_after(interval)

    if latest is None:
        return SystemStatusOut(
            dataStatus="no_data",
            esp32Connected=False,
            lastPacketTime=None,
            lastReadingAgeSeconds=None,
            staleAfterSeconds=stale_after,
            staleAfterSource=stale_source,
            samplingIntervalSeconds=None,
            room=None,
            latestExperimentId=None,
            latestExperimentIsSynthetic=None,
            serverTime=now,
        )

    age = (now - latest.timestamp).total_seconds()
    if age < -FUTURE_TOLERANCE_SECONDS:
        data_status = "clock_skew"  # newest timestamp is in the future: device or server clock is off
    elif age > stale_after:
        data_status = "stale"
    else:
        data_status = "receiving"
    return SystemStatusOut(
        dataStatus=data_status,
        esp32Connected=data_status == "receiving",
        lastPacketTime=latest.timestamp,
        lastReadingAgeSeconds=age if age >= 0 or data_status == "clock_skew" else 0.0,
        staleAfterSeconds=stale_after,
        staleAfterSource=stale_source,
        samplingIntervalSeconds=interval,
        room=latest.location,
        latestExperimentId=latest.experiment_id,
        latestExperimentIsSynthetic=_is_synthetic(latest.experiment_id),
        serverTime=now,
    )