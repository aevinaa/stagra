import pandas as pd
import pytest

from ml.prepare_hardware_data import adapt_dataframe


def test_maps_current_logger_names_and_localizes_naive_time_to_utc():
    raw = pd.DataFrame({
        "timestamp": ["2026-10-13T18:43:38", "2026-10-13T18:43:43"],
        "air_temp_C": [24.2, 24.3],
        "humidity_pct": [44.0, 44.1],
        "probe_temp_C": [23.5, 23.6],
        "mq135_raw": [718, 710],
        "session_label": ["bedroom", "bedroom"],
    })
    out, notes = adapt_dataframe(raw)
    assert out.loc[0, "timestamp"] == pd.Timestamp("2026-10-13T13:13:38Z")
    assert out["temperature_c"].tolist() == [24.2, 24.3]
    assert out["humidity_percent"].tolist() == [44.0, 44.1]
    assert out["mq135_raw"].tolist() == [718, 710]
    assert out["location"].tolist() == ["bedroom", "bedroom"]
    assert out["experiment_id"].nunique() == 1
    assert "probe_temp_C" in out
    assert any("occupancy was not recorded" in note for note in notes)


def test_new_location_block_starts_new_experiment():
    raw = pd.DataFrame({
        "timestamp": ["2026-01-01T10:00:00Z", "2026-01-01T10:00:05Z", "2026-01-01T10:00:10Z"],
        "air_temp_C": [24, 24, 24], "humidity_pct": [50, 50, 50],
        "mq135_raw": [300, 301, 302], "session_label": ["bedroom", "bedroom", "kitchen"],
    })
    out, _ = adapt_dataframe(raw)
    assert out["experiment_id"].nunique() == 2
    assert out["location"].tolist() == ["bedroom", "bedroom", "kitchen"]


def test_missing_required_sensor_column_is_a_clear_error():
    with pytest.raises(ValueError, match="Could not map required logger columns"):
        adapt_dataframe(pd.DataFrame({"timestamp": ["2026-01-01T10:00:00Z"]}))
