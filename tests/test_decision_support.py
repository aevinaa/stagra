from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import Reading
from app.routers import decision_support

NOW = datetime(2026, 10, 13, 12, 0, tzinfo=timezone.utc)


@pytest.fixture
def env(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False)

    def override_get_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    monkeypatch.setattr(decision_support, "_utcnow", lambda: NOW)
    yield TestClient(app), Session
    app.dependency_overrides.clear()
    engine.dispose()


def add(session_factory, rows):
    with session_factory() as db:
        db.add_all(rows)
        db.commit()


def row(ts, mq=300.0, temp=24.0, humidity=45.0, experiment="real-1", location="room"):
    return Reading(
        timestamp=ts, temperature_c=temp, humidity_percent=humidity, mq135_raw=mq,
        experiment_id=experiment, location=location, occupancy=1,
        ventilation="closed", fan="off", ac=None,
    )


def test_empty_database_returns_explicit_no_data(env):
    client, _ = env
    response = client.get("/api/decision-support/current")
    assert response.status_code == 200
    body = response.json()
    assert body["assessmentStatus"] == "no_data"
    assert body["indoorComfortIndex"] is None
    assert body["respiratoryRiskIndex"] is None
    assert body["exposureDurationMinutes"] is None
    assert body["mq135Trend"] == "insufficient_history"


def test_comfort_and_trend_assessment_uses_only_latest_experiment(env):
    client, Session = env
    start = NOW - timedelta(minutes=2)
    rows = [row(start + timedelta(seconds=10 * i), mq=200 + i * 12, temp=29.0, humidity=68.0) for i in range(12)]
    rows += [row(NOW - timedelta(hours=2), mq=900, temp=22, humidity=45, experiment="old")]
    add(Session, rows)
    response = client.get("/api/decision-support/current")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["assessmentStatus"] == "available"
    assert body["experimentId"] == "real-1"
    assert body["readingsAnalyzed"] == 12
    assert body["indoorComfortIndex"] < 100
    assert body["comfortCategory"] in {"mild_discomfort", "high_discomfort"}
    assert body["mq135Trend"] == "rising"
    assert body["respiratoryRiskIndex"] is None
    assert body["exposureDurationMinutes"] is None
    assert any(a["code"] == "mq135_rising_trend" for a in body["alerts"])
    assert any("ventilation" in r.lower() for r in body["recommendations"])


def test_stale_data_is_flagged(env):
    client, Session = env
    add(Session, [row(NOW - timedelta(minutes=10))])
    body = client.get("/api/decision-support/current").json()
    assert body["assessmentStatus"] == "stale"
    assert any(a["code"] == "stale_data" for a in body["alerts"])


def test_synthetic_data_is_not_presented_as_real_room_assessment(env):
    client, Session = env
    add(Session, [row(NOW - timedelta(seconds=5), experiment="SYNTH-demo")])
    body = client.get("/api/decision-support/current").json()
    assert body["assessmentStatus"] == "synthetic_data"
    assert body["isSynthetic"] is True


def test_stable_raw_mq135_does_not_claim_air_is_safe(env):
    client, Session = env
    start = NOW - timedelta(minutes=2)
    add(Session, [row(start + timedelta(seconds=10 * i), mq=300.0) for i in range(12)])
    body = client.get("/api/decision-support/current").json()
    assert body["mq135Trend"] == "stable"
    assert "does not mean the air is safe" in str(body["alerts"]).lower()
    assert body["respiratoryRiskStatus"] == "not_assessable_with_current_sensors"


def test_window_minutes_is_validated(env):
    client, _ = env
    assert client.get("/api/decision-support/current?window_minutes=2").status_code == 422
    assert client.get("/api/decision-support/current?window_minutes=181").status_code == 422
