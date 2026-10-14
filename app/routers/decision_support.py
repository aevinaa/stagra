"""Prototype health-aware decision support based on the measurements actually stored.

This endpoint is deliberately separate from telemetry. It does not convert raw MQ135 values
into pollutant concentrations or claim to diagnose/quantify medical risk. The comfort score is a
transparent project heuristic, not a validated clinical or standards-compliant index.
"""

from datetime import datetime, timedelta, timezone
from statistics import median
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Reading

router = APIRouter(prefix="/api/decision-support", tags=["decision-support"])
SYNTHETIC_PREFIX = "SYNTH-"
MAX_READINGS = 360  # cap query size; enough for 30 minutes at 5-second sampling
DEFAULT_WINDOW_MINUTES = 30


class DecisionAlert(BaseModel):
    code: str
    severity: Literal["info", "caution"]
    title: str
    message: str


class DecisionSupportOut(BaseModel):
    assessmentStatus: Literal["no_data", "stale", "insufficient_history", "available", "synthetic_data"]
    generatedAt: datetime
    latestReadingAt: datetime | None
    dataAgeSeconds: float | None
    location: str | None
    experimentId: str | None
    isSynthetic: bool | None
    readingsAnalyzed: int
    windowMinutes: int
    indoorComfortIndex: int | None = Field(description="Prototype heuristic from temperature and humidity; not a validated medical score")
    comfortCategory: Literal["not_available", "comfortable", "mild_discomfort", "high_discomfort"]
    comfortFactors: list[str]
    comfortConditionDurationMinutes: float | None = Field(description="Duration of consecutive observed readings outside the project's comfort bands")
    respiratoryRiskIndex: float | None = Field(description="Unavailable unless calibrated pollutant measurements and a validated method are added")
    respiratoryRiskStatus: Literal["not_assessable_with_current_sensors"]
    exposureDurationMinutes: float | None = Field(description="Unavailable because current sensors do not measure calibrated pollutant exposure")
    mq135Trend: Literal["insufficient_history", "stable", "rising", "falling"]
    alerts: list[DecisionAlert]
    recommendations: list[str]
    limitations: list[str]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _is_synthetic(experiment_id: str) -> bool:
    return experiment_id.startswith(SYNTHETIC_PREFIX)


def _comfort_score(temperature_c: float, humidity_percent: float) -> tuple[int, str, list[str], bool]:
    """Return a simple, explainable project heuristic (not a health or compliance assessment)."""
    factors: list[str] = []
    temp_outside = temperature_c < 20.0 or temperature_c > 26.0
    humidity_outside = humidity_percent < 30.0 or humidity_percent > 60.0

    temp_penalty = max(20.0 - temperature_c, 0.0, temperature_c - 26.0) * 10.0
    humidity_penalty = max(30.0 - humidity_percent, 0.0, humidity_percent - 60.0) * 2.0
    score = max(0, min(100, round(100.0 - (temp_penalty + humidity_penalty) / 2.0)))

    if temperature_c < 20.0:
        factors.append("Temperature is below the project's 20–26 °C comfort band.")
    elif temperature_c > 26.0:
        factors.append("Temperature is above the project's 20–26 °C comfort band.")
    if humidity_percent < 30.0:
        factors.append("Relative humidity is below the project's 30–60% comfort band.")
    elif humidity_percent > 60.0:
        factors.append("Relative humidity is above the project's 30–60% comfort band.")

    category = "comfortable" if score >= 80 else "mild_discomfort" if score >= 60 else "high_discomfort"
    return score, category, factors, temp_outside or humidity_outside


def _mq_trend(rows: list[Reading]) -> Literal["insufficient_history", "stable", "rising", "falling"]:
    # Compare medians of two consecutive blocks, never an absolute MQ135 threshold.
    if len(rows) < 10:
        return "insufficient_history"
    previous = median(r.mq135_raw for r in rows[-10:-5])
    recent = median(r.mq135_raw for r in rows[-5:])
    if previous <= 0:
        return "rising" if recent > previous else "stable"
    relative_change = (recent - previous) / abs(previous)
    if relative_change >= 0.20:
        return "rising"
    if relative_change <= -0.20:
        return "falling"
    return "stable"


def _comfort_duration(rows: list[Reading], interval_seconds: float, window_start: datetime) -> float | None:
    """Estimate how long the current temperature/humidity comfort-band condition persisted."""
    if not rows:
        return None
    latest = rows[-1]
    _, _, _, latest_outside = _comfort_score(latest.temperature_c, latest.humidity_percent)
    if not latest_outside:
        return 0.0
    first = latest.timestamp
    for row in reversed(rows[:-1]):
        _, _, _, outside = _comfort_score(row.temperature_c, row.humidity_percent)
        if not outside:
            break
        first = row.timestamp
    # If the first returned row is already outside, only report the observed lower bound.
    start = max(first, window_start)
    return round(max(0.0, (latest.timestamp - start).total_seconds() / 60.0), 2)


@router.get("/current", response_model=DecisionSupportOut)
def current_decision_support(
    window_minutes: int = Query(DEFAULT_WINDOW_MINUTES, ge=5, le=180),
    db: Session = Depends(get_db),
):
    now = _utcnow()
    latest = db.scalars(select(Reading).order_by(Reading.timestamp.desc(), Reading.id.desc()).limit(1)).first()
    limitations = [
        "MQ135 is stored as an uncalibrated raw sensor response; it is not CO₂, VOC concentration, ppm, or AQI.",
        "The comfort index uses project-defined temperature/humidity bands and is not a validated medical or standards-compliant index.",
        "A respiratory-risk score and pollutant exposure duration cannot be calculated from the currently stored sensors; calibrated CO₂/PM/VOC measurements and a validated method are not available.",
    ]
    if latest is None:
        return DecisionSupportOut(
            assessmentStatus="no_data", generatedAt=now, latestReadingAt=None, dataAgeSeconds=None,
            location=None, experimentId=None, isSynthetic=None, readingsAnalyzed=0,
            windowMinutes=window_minutes, indoorComfortIndex=None, comfortCategory="not_available",
            comfortFactors=[], comfortConditionDurationMinutes=None, respiratoryRiskIndex=None,
            respiratoryRiskStatus="not_assessable_with_current_sensors", exposureDurationMinutes=None,
            mq135Trend="insufficient_history", alerts=[DecisionAlert(
                code="no_readings", severity="info", title="No readings available",
                message="No stored sensor readings are available yet.",
            )], recommendations=["Start the sensor data flow and retry once readings have been stored."],
            limitations=limitations,
        )

    age = (now - latest.timestamp).total_seconds()
    synthetic = _is_synthetic(latest.experiment_id)
    window_start = latest.timestamp - timedelta(minutes=window_minutes)
    # Only use the latest experiment and the requested recent window. Bound query size.
    rows = db.scalars(
        select(Reading)
        .where(Reading.experiment_id == latest.experiment_id, Reading.timestamp >= window_start, Reading.timestamp <= latest.timestamp)
        .order_by(Reading.timestamp.desc(), Reading.id.desc())
        .limit(MAX_READINGS)
    ).all()
    rows = list(reversed(rows))
    if not rows or rows[-1].id != latest.id:
        # Preserve the newest row even if its timestamp falls outside the analysis window.
        rows = [latest] if latest.timestamp <= now + timedelta(seconds=60) else []

    alerts: list[DecisionAlert] = []
    recommendations: list[str] = []
    if age < -60:
        status = "stale"
        alerts.append(DecisionAlert(code="clock_skew", severity="caution", title="Timestamp check needed", message="The newest reading is substantially ahead of server time; verify the device clock."))
        recommendations.append("Check the ESP32/server clock before interpreting this assessment.")
    elif age > 120:
        status = "stale"
        alerts.append(DecisionAlert(code="stale_data", severity="caution", title="Readings may be outdated", message=f"The newest stored reading is {round(age)} seconds old."))
        recommendations.append("Restore the sensor data flow and refresh the assessment before acting on it.")
    elif synthetic:
        status = "synthetic_data"
        alerts.append(DecisionAlert(code="synthetic_data", severity="info", title="Demonstration data", message="The newest experiment is marked synthetic; do not treat this as a real-room health assessment."))
        recommendations.append("Use a real hardware experiment before interpreting environmental recommendations.")
    elif len(rows) < 10:
        status = "insufficient_history"
        alerts.append(DecisionAlert(code="limited_history", severity="info", title="More readings needed", message="At least 10 readings from the latest experiment are needed for a short-term MQ135 trend."))
        recommendations.append("Collect more consecutive readings in the same experiment to assess trends.")
    else:
        status = "available"

    score, comfort_category, comfort_factors, outside_band = _comfort_score(latest.temperature_c, latest.humidity_percent)
    if comfort_factors:
        alerts.append(DecisionAlert(code="comfort_band", severity="caution", title="Indoor comfort condition outside project band", message=" ".join(comfort_factors)))
        if latest.humidity_percent > 60:
            recommendations.append("If practical and safe, improve ventilation or reduce indoor moisture, then recheck humidity.")
        elif latest.humidity_percent < 30:
            recommendations.append("Consider whether the room needs more moisture; recheck humidity after any change.")
        if latest.temperature_c > 26:
            recommendations.append("If practical, adjust the room temperature and recheck the reading.")
        elif latest.temperature_c < 20:
            recommendations.append("If practical, make the room warmer and recheck the reading.")
    else:
        recommendations.append("Temperature and humidity are within the project's configured comfort bands; continue monitoring.")

    trend = _mq_trend(rows) if len(rows) >= 10 else "insufficient_history"
    if trend == "rising":
        alerts.append(DecisionAlert(code="mq135_rising_trend", severity="caution", title="MQ135 response has risen", message="Recent raw MQ135 readings are at least 20% above the preceding short block. This is a relative sensor trend, not a pollutant concentration or AQI."))
        recommendations.append("Check for a possible new indoor source and inspect ventilation if safe; compare readings again after the conditions settle.")
    elif trend == "falling":
        alerts.append(DecisionAlert(code="mq135_falling_trend", severity="info", title="MQ135 response has fallen", message="Recent raw MQ135 readings are lower than the preceding short block; this alone does not prove that air quality improved."))
    elif trend == "stable":
        alerts.append(DecisionAlert(code="mq135_stable_trend", severity="info", title="MQ135 response is relatively stable", message="Recent raw MQ135 readings have not changed by the configured trend threshold. Stability does not mean the air is safe."))

    if status in ("available", "insufficient_history") and not recommendations:
        recommendations.append("Continue monitoring and investigate any persistent unusual readings.")
    interval = median([(b.timestamp - a.timestamp).total_seconds() for a, b in zip(rows, rows[1:]) if b.timestamp > a.timestamp]) if len(rows) > 1 else 5.0
    duration = _comfort_duration(rows, interval, window_start) if rows and outside_band else 0.0

    return DecisionSupportOut(
        assessmentStatus=status, generatedAt=now, latestReadingAt=latest.timestamp,
        dataAgeSeconds=round(max(0.0, age), 2), location=latest.location,
        experimentId=latest.experiment_id, isSynthetic=synthetic, readingsAnalyzed=len(rows),
        windowMinutes=window_minutes, indoorComfortIndex=score, comfortCategory=comfort_category,
        comfortFactors=comfort_factors, comfortConditionDurationMinutes=duration,
        respiratoryRiskIndex=None, respiratoryRiskStatus="not_assessable_with_current_sensors",
        exposureDurationMinutes=None, mq135Trend=trend, alerts=alerts,
        recommendations=list(dict.fromkeys(recommendations)), limitations=limitations,
    )
