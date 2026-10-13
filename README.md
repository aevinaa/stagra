# Indoor Air Quality Monitoring (backend)

FastAPI + SQLite backend that stores sensor readings from an ESP32.
ML (PyTorch) will live in `ml/` later.

## Run

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0
```

Interactive docs: http://localhost:8000/docs
Data is stored in `data/airq.db` (created on first start).

## Test

```bash
pytest
```

## Endpoints

| Method | Path | Status |
|---|---|---|
| POST | `/api/readings` | implemented |
| GET | `/api/current` | implemented |
| GET | `/api/history?experiment_id=&start=&end=&limit=` | implemented |
| GET | `/api/prediction` | not yet (waiting on ML contract) |
| GET | `/api/model-performance` | not yet |
| GET | `/api/recommendation` | not yet |

## Payload (POST /api/readings)

```json
{
  "timestamp": "2026-10-07T10:00:00Z",
  "temperature_c": 24.5,
  "humidity_percent": 55.0,
  "mq135_raw": 812,
  "experiment_id": "exp-1",
  "location": "lab",
  "occupancy": 2,
  "ventilation": "closed",
  "fan": "off",
  "ac": "on"
}
```

`ac` is optional. `ventilation` is `open`/`closed`; `fan` and `ac` are `on`/`off`.

## Notes

- `mq135_raw` is stored exactly as received. No ppm/AQI conversion until it is calibrated.
- Timestamps are stored and returned as UTC. A timestamp without a timezone is assumed to be UTC.
- `/api/history` returns oldest first, capped by `limit` (default 1000, max 10000).
