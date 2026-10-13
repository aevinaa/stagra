from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False)

    def override_get_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)  # no "with": skips lifespan so the real DB isn't created
    app.dependency_overrides.clear()


def payload(**overrides):
    base = {
        "timestamp": "2026-10-07T10:00:00Z",
        "temperature_c": 24.5,
        "humidity_percent": 55.0,
        "mq135_raw": 812,
        "experiment_id": "exp-1",
        "location": "lab",
        "occupancy": 2,
        "ventilation": "closed",
        "fan": "off",
    }
    base.update(overrides)
    return base


def parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def test_create_reading(client):
    r = client.post("/api/readings", json=payload())
    assert r.status_code == 201
    body = r.json()
    assert body["id"] == 1
    assert body["mq135_raw"] == 812  # stored raw, unconverted
    assert body["ac"] is None


def test_ac_is_optional_and_validated(client):
    assert client.post("/api/readings", json=payload(ac="on")).json()["ac"] == "on"
    assert client.post("/api/readings", json=payload(ac="maybe")).status_code == 422


def test_invalid_values_rejected(client):
    assert client.post("/api/readings", json=payload(ventilation="ajar")).status_code == 422
    assert client.post("/api/readings", json=payload(fan="auto")).status_code == 422
    assert client.post("/api/readings", json=payload(humidity_percent=140)).status_code == 422
    bad = payload()
    del bad["mq135_raw"]
    assert client.post("/api/readings", json=bad).status_code == 422


def test_timezone_less_timestamp_rejected(client):
    r = client.post("/api/readings", json=payload(timestamp="2026-10-07T10:00:00"))
    assert r.status_code == 422
    assert client.get("/api/current").status_code == 404  # nothing was stored


def test_timestamp_with_offset_is_stored_as_aware_utc(client):
    r = client.post("/api/readings", json=payload(timestamp="2026-10-07T15:30:00+05:30"))
    assert r.status_code == 201
    stored = parse(r.json()["timestamp"])
    assert stored.tzinfo is not None
    assert stored == parse("2026-10-07T10:00:00Z")
    # still aware after a round trip through the database
    current = parse(client.get("/api/current").json()["timestamp"])
    assert current.tzinfo is not None
    assert current == parse("2026-10-07T10:00:00Z")


def test_experiment_id_required_and_not_blank(client):
    missing = payload()
    del missing["experiment_id"]
    assert client.post("/api/readings", json=missing).status_code == 422
    assert client.post("/api/readings", json=payload(experiment_id="")).status_code == 422
    assert client.post("/api/readings", json=payload(experiment_id="   ")).status_code == 422
    r = client.post("/api/readings", json=payload(experiment_id="  exp-9 "))
    assert r.status_code == 201
    assert r.json()["experiment_id"] == "exp-9"


def test_current_empty_then_latest(client):
    assert client.get("/api/current").status_code == 404
    client.post("/api/readings", json=payload(timestamp="2026-10-07T10:00:00Z"))
    client.post("/api/readings", json=payload(timestamp="2026-10-07T10:05:00Z", mq135_raw=900))
    r = client.get("/api/current")
    assert r.status_code == 200
    assert r.json()["mq135_raw"] == 900


def test_history_newest_first_and_limit(client):
    for minute in (0, 10, 5):  # inserted out of order on purpose
        client.post("/api/readings", json=payload(timestamp=f"2026-10-07T10:{minute:02d}:00Z"))
    rows = client.get("/api/history").json()
    times = [parse(r["timestamp"]) for r in rows]
    assert times == sorted(times, reverse=True)
    assert len(rows) == 3

    newest_two = client.get("/api/history", params={"limit": 2}).json()
    assert [parse(r["timestamp"]).minute for r in newest_two] == [10, 5]
    assert client.get("/api/history", params={"limit": 0}).status_code == 422


def test_history_filters(client):
    client.post("/api/readings", json=payload(timestamp="2026-10-07T10:00:00Z", experiment_id="a"))
    client.post("/api/readings", json=payload(timestamp="2026-10-07T10:05:00Z", experiment_id="a"))
    client.post("/api/readings", json=payload(timestamp="2026-10-07T10:10:00Z", experiment_id="b"))

    assert len(client.get("/api/history").json()) == 3
    assert len(client.get("/api/history", params={"experiment_id": "a"}).json()) == 2
    r = client.get("/api/history", params={"start": "2026-10-07T10:03:00Z"})
    assert len(r.json()) == 2
    r = client.get("/api/history", params={"end": "2026-10-07T10:03:00Z"})
    assert len(r.json()) == 1
    # offset-style bound: 15:33+05:30 == 10:03Z
    r = client.get("/api/history", params={"start": "2026-10-07T15:33:00+05:30"})
    assert len(r.json()) == 2


def test_history_rejects_timezone_less_bounds(client):
    assert client.get("/api/history", params={"start": "2026-10-07T10:00:00"}).status_code == 422
    assert client.get("/api/history", params={"end": "2026-10-07T10:00:00"}).status_code == 422