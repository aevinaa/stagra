from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


def to_utc(dt: datetime) -> datetime:
    """Convert an aware datetime to UTC. Timezone-less input is rejected."""
    if dt.tzinfo is None or dt.utcoffset() is None:
        raise ValueError("timestamp must include a timezone (e.g. 'Z' or '+05:30')")
    return dt.astimezone(timezone.utc)


class ReadingCreate(BaseModel):
    # Strip surrounding whitespace so a blank experiment_id is rejected
    model_config = ConfigDict(str_strip_whitespace=True)

    # Hardware data
    timestamp: datetime
    temperature_c: float
    humidity_percent: float = Field(ge=0, le=100)
    mq135_raw: float = Field(ge=0)

    # Experiment context
    experiment_id: str = Field(min_length=1)  # required: every reading belongs to an experiment
    location: str = Field(min_length=1)
    occupancy: int = Field(ge=0)
    ventilation: Literal["open", "closed"]
    fan: Literal["on", "off"]
    ac: Literal["on", "off"] | None = None

    @field_validator("timestamp")
    @classmethod
    def _timestamp_to_utc(cls, v: datetime) -> datetime:
        return to_utc(v)


class ReadingOut(ReadingCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int