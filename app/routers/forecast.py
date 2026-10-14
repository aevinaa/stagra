
from datetime import datetime, timezone

import numpy as np
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Reading

router = APIRouter(prefix="/api/forecast", tags=["forecast"])

HISTORY_SIZE = 37       # Approximately 3 minutes at 5-second intervals
FORECAST_SECONDS = 60   # Predict 1 minute ahead
STALE_AFTER_SECONDS = 120


@router.get("/current")
def current_forecast(db: Session = Depends(get_db)):
    latest = db.scalars(
        select(Reading)
        .order_by(Reading.timestamp.desc(), Reading.id.desc())
        .limit(1)
    ).first()

    if latest is None:
        return {
            "status": "no_data",
            "message": "No sensor readings are available.",
        }

    rows = db.scalars(
        select(Reading)
        .where(
            Reading.experiment_id == latest.experiment_id,
            Reading.timestamp <= latest.timestamp,
        )
        .order_by(Reading.timestamp.desc(), Reading.id.desc())
        .limit(HISTORY_SIZE)
    ).all()

    rows = list(reversed(rows))
    now = datetime.now(timezone.utc)
    age_seconds = max(
        0.0, (now - latest.timestamp).total_seconds()
    )
    stale = age_seconds > STALE_AFTER_SECONDS

    result = {
        "status": "stale" if stale else "ok",
        "experiment_id": latest.experiment_id,
        "latest_reading_at": latest.timestamp.isoformat(),
        "data_age_seconds": round(age_seconds, 1),
        "forecast_horizon_seconds": FORECAST_SECONDS,
        "lookback_readings": len(rows),
        "target": "mq135_raw",
        "unit": "raw_sensor_units",
        "persistence_forecast": None,
        "linear_trend_forecast": None,
        "message": (
            "Historical or stale data; do not interpret as a live forecast."
            if stale else
            "Forecast of raw MQ135 response, not AQI or pollutant concentration."
        ),
    }

    if len(rows) < 10:
        result["status"] = "insufficient_history"
        result["message"] = (
            "At least 10 readings from the same experiment are required."
        )
        return result

    # Fit a straight line using actual elapsed seconds.
    latest_time = latest.timestamp
    x = np.array(
        [(r.timestamp - latest_time).total_seconds() for r in rows],
        dtype=float,
    )
    y = np.array([r.mq135_raw for r in rows], dtype=float)

    if not np.all(np.isfinite(x)) or not np.all(np.isfinite(y)):
        result["status"] = "invalid_data"
        result["message"] = "Sensor history contains invalid values."
        return result

    if np.ptp(x) <= 0:
        result["status"] = "insufficient_history"
        result["message"] = "Readings need distinct timestamps."
        return result

    slope, intercept = np.polyfit(x, y, 1)
    forecast_time = FORECAST_SECONDS

    result["persistence_forecast"] = round(float(y[-1]), 3)
    result["linear_trend_forecast"] = round(
        float(intercept + slope * forecast_time), 3
    )
    result["trend_per_minute"] = round(float(slope * 60), 3)

    return result
