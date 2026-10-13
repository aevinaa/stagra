from datetime import datetime, timezone

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import TypeDecorator

from app.database import Base


class UTCDateTime(TypeDecorator):
    """Timezone-aware datetimes in, timezone-aware (UTC) datetimes out.

    SQLite has no timezone support, so values are stored as naive UTC and
    re-attached to UTC when read back. Naive datetimes are refused, never
    guessed.
    """

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Refusing to store a timezone-less datetime")
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc)


class Reading(Base):
    __tablename__ = "readings"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Hardware data from the ESP32
    timestamp: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    temperature_c: Mapped[float]  # DS18B20
    humidity_percent: Mapped[float]  # DHT11
    mq135_raw: Mapped[float]  # raw MQ135 value, deliberately NOT converted

    # Experiment context
    experiment_id: Mapped[str] = mapped_column(String, index=True, nullable=False)
    location: Mapped[str] = mapped_column(String)
    occupancy: Mapped[int]
    ventilation: Mapped[str] = mapped_column(String)  # "open" / "closed"
    fan: Mapped[str] = mapped_column(String)  # "on" / "off"
    ac: Mapped[str | None] = mapped_column(String, nullable=True)  # "on" / "off", optional