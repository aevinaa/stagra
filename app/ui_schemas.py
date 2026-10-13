"""Response models for the read-only, dashboard-shaped endpoints (`app/routers/telemetry.py`).

Field names follow `frontend_final/src/types/index.ts` (temperature, humidity, mq135, ...),
not the database column names. These models are separate from `app/schemas.py`, which keeps
describing `POST /api/readings`, `GET /api/current` and `GET /api/history` unchanged.

What is deliberately NOT here:
* No air-quality level (Low / Moderate / High). Nothing in the project defines a validated
  threshold for the raw MQ135 value, so none is invented. `mq135` is the stored raw value.
* No predictions and no model results.
* No sensor-health, MCU-name or sensor-list fields: the backend has no data to derive them from.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class CurrentTelemetry(BaseModel):
    """The most recent stored reading, with dashboard field names. Values are unmodified."""

    temperature: float = Field(description="degrees Celsius (DS18B20), as stored")
    humidity: float = Field(description="percent relative humidity (DHT11), as stored")
    mq135: float = Field(description="raw MQ135 sensor value, uncalibrated: not ppm, CO2 or AQI")
    timestamp: datetime = Field(description="UTC, timezone-aware")

    # Experiment context, recorded when the reading was ingested (never inferred here).
    occupancy: int = Field(description="people count as recorded")
    ventilation: Literal["open", "closed"]
    fan: Literal["on", "off"]
    ac: Literal["on", "off"] | None = None
    occupancyInferred: bool = False
    ventilationInferred: bool = False

    experimentId: str
    location: str
    readingId: int
    isSynthetic: bool = Field(
        description="True when experimentId starts with 'SYNTH-' (the project's synthetic-data label)"
    )


class HistoryPoint(BaseModel):
    """One stored reading. History never contains averaged or invented values."""

    timestamp: datetime = Field(description="UTC, timezone-aware, exactly as stored")
    temperature: float
    humidity: float
    mq135: float = Field(description="raw MQ135 sensor value, uncalibrated")
    experimentId: str
    isSynthetic: bool


class HistoryMeta(BaseModel):
    """What the query matched and how the result was reduced, so a chart can say so."""

    order: Literal["ascending"] = "ascending"
    count: int = Field(description="number of readings returned")
    sourceCount: int = Field(description="number of stored readings that matched the filters")
    maxPoints: int
    downsampled: bool
    method: Literal["none", "min_max_per_group"]
    groupSize: int | None = Field(
        default=None, description="consecutive stored readings per group when downsampled"
    )
    note: str
    experimentId: str | None = None
    range: str | None = Field(default=None, description="the relative range that was asked for, if any")
    anchor: Literal["now", "latest"] | None = Field(
        default=None, description="what a relative range counts back from (only when range is used)"
    )
    windowStart: datetime | None = Field(default=None, description="UTC lower bound used; null = none")
    windowEnd: datetime | None = Field(default=None, description="UTC upper bound used; null = none")


class HistoryResponse(BaseModel):
    readings: list[HistoryPoint]
    meta: HistoryMeta


class SystemStatusOut(BaseModel):
    """Data-flow status derived ONLY from the stored readings and the server clock."""

    dataStatus: Literal["no_data", "receiving", "stale", "clock_skew"]
    esp32Connected: bool = Field(
        description="True only when dataStatus is 'receiving', i.e. a reading with a plausible "
        "timestamp was stored recently. It is not a verified device link."
    )
    lastPacketTime: datetime | None = Field(description="timestamp of the newest stored reading; null if none")
    lastReadingAgeSeconds: float | None = Field(
        description="server time minus lastPacketTime, in seconds (0 if within the small clock tolerance)"
    )
    staleAfterSeconds: float
    staleAfterSource: Literal["env", "inferred_interval", "default"]
    samplingIntervalSeconds: float | None = Field(
        description="median spacing of the newest readings of the latest experiment; null if it cannot be inferred"
    )
    room: str | None = Field(description="location of the newest reading")
    latestExperimentId: str | None
    latestExperimentIsSynthetic: bool | None
    serverTime: datetime