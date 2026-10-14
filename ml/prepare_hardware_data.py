"""Adapt the ESP32 logger CSV to the project's strict ML input schema.

This adapter is intentionally separate from ml.preprocess so the existing strict
preprocessing API and its tests remain unchanged. Naive timestamps are interpreted
in the configured local timezone (default Asia/Kolkata), then written with an
explicit UTC offset. Unknown context is marked with documented placeholders; train
with `--sensor-only` so these placeholders are never model inputs.

Example:
  python -m ml.prepare_hardware_data --input data/raw/hardware.csv --output data/processed/hardware_ready.csv
  python -m ml.preprocess --input data/processed/hardware_ready.csv --output data/processed/clean_hardware.csv
"""
from __future__ import annotations

import argparse
from pathlib import Path
import sys

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
ALIASES = {
    "timestamp": ("timestamp", "datetime", "time"),
    "temperature_c": ("temperature_c", "air_temp_C", "air_temp_c", "temperature", "temp_c"),
    "humidity_percent": ("humidity_percent", "humidity_pct", "humidity", "relative_humidity"),
    "mq135_raw": ("mq135_raw", "MQ135 Value", "mq135_value", "mq135", "gas_value"),
    "probe_temp_C": ("probe_temp_C", "probe_temp_c", "probe_temperature_c"),
    "location": ("location", "session_label", "room", "place"),
    "experiment_id": ("experiment_id", "session_id", "experiment", "run_id"),
    "occupancy": ("occupancy", "people_count"),
    "ventilation": ("ventilation", "window", "window_state"),
    "fan": ("fan", "fan_state"),
    "ac": ("ac", "ac_state", "air_conditioner"),
}


def _column(df: pd.DataFrame, aliases: tuple[str, ...]):
    lookup = {str(c).strip().lower(): c for c in df.columns}
    for alias in aliases:
        if alias.lower() in lookup:
            return df[lookup[alias.lower()]]
    return None


def _timestamp(value, timezone_name: str):
    if pd.isna(value) or not str(value).strip():
        return pd.NaT
    try:
        ts = pd.Timestamp(value)
        if ts.tzinfo is None:
            ts = ts.tz_localize(timezone_name, ambiguous="NaT", nonexistent="NaT")
        return ts.tz_convert("UTC")
    except (ValueError, TypeError, OverflowError):
        return pd.NaT


def adapt_dataframe(raw: pd.DataFrame, timezone_name: str = "Asia/Kolkata"):
    """Return (canonical raw frame, notes). Context defaults are placeholders, not observations."""
    found = {name: _column(raw, aliases) for name, aliases in ALIASES.items()}
    required = ("timestamp", "temperature_c", "humidity_percent", "mq135_raw")
    missing = [name for name in required if found[name] is None]
    if missing:
        raise ValueError(f"Could not map required logger columns: {missing}. Available: {list(raw.columns)}")

    out = pd.DataFrame(index=raw.index)
    out["timestamp"] = found["timestamp"].map(lambda x: _timestamp(x, timezone_name))
    for name in ("temperature_c", "humidity_percent", "mq135_raw"):
        out[name] = pd.to_numeric(found[name], errors="coerce")

    notes = []
    location = found["location"]
    if location is None:
        out["location"] = "unknown_location"
        notes.append("No location/session label found; location set to unknown_location.")
    else:
        out["location"] = location.astype("string").str.strip().replace("", pd.NA).fillna("unknown_location")

    explicit_exp = found["experiment_id"]
    if explicit_exp is not None:
        out["experiment_id"] = explicit_exp.astype("string").str.strip().replace("", pd.NA)
    else:
        # Start a new experiment when the labelled session changes or there is a >30 s gap.
        gap = out["timestamp"].diff().dt.total_seconds().fillna(0).gt(30)
        changed = out["location"].ne(out["location"].shift()).fillna(True)
        starts = (gap | changed)
        if len(starts):
            starts.iloc[0] = True
        counts = starts.to_numpy(dtype=bool).astype("int64").cumsum()
        out["experiment_id"] = pd.Series(counts, index=out.index).map(
            lambda n: f"HW-{int(n):03d}"
        )
        notes.append("experiment_id derived from consecutive location/session blocks and gaps over 30 seconds.")

    # Preserve the probe temperature in this adapted file for inspection, but the core pipeline
    # deliberately ignores it unless a later experiment explicitly adds it as a feature.
    probe = found["probe_temp_C"]
    if probe is not None:
        out["probe_temp_C"] = pd.to_numeric(probe, errors="coerce")

    for name, placeholder in (("occupancy", 0), ("ventilation", "closed"), ("fan", "off"), ("ac", "")):
        col = found[name]
        if col is None:
            out[name] = placeholder
            notes.append(f"{name} was not recorded; filled with placeholder {placeholder!r}. Do not use context features for training.")
        else:
            out[name] = col
    out["occupancy"] = pd.to_numeric(out["occupancy"], errors="coerce")
    for name in ("ventilation", "fan", "ac"):
        out[name] = out[name].astype("string").str.strip().str.lower().replace("", pd.NA)
    # Keep canonical fields first, optional probe field after them.
    columns = ["timestamp", "temperature_c", "humidity_percent", "mq135_raw", "experiment_id", "location", "occupancy", "ventilation", "fan", "ac"]
    if "probe_temp_C" in out:
        columns.append("probe_temp_C")
    return out[columns], notes


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Map the raw ESP32 logger CSV to the project schema.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--timezone", default="Asia/Kolkata", help="timezone for timestamps without an offset (default: Asia/Kolkata)")
    args = parser.parse_args(argv)
    try:
        raw = pd.read_csv(args.input)
        adapted, notes = adapt_dataframe(raw, args.timezone)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        adapted.to_csv(args.output, index=False, date_format="%Y-%m-%dT%H:%M:%S%z")
    except (OSError, ValueError, pd.errors.ParserError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    print(f"rows: {len(adapted)}; experiments: {adapted['experiment_id'].nunique()}")
    print(f"wrote adapted CSV -> {args.output}")
    for note in notes:
        print(f"NOTE: {note}")
    if adapted["timestamp"].isna().any():
        print(f"WARNING: {int(adapted['timestamp'].isna().sum())} timestamps could not be parsed and will be dropped by preprocessing.")
    if adapted["experiment_id"].isna().any():
        print(f"WARNING: {int(adapted['experiment_id'].isna().sum())} rows have blank experiment_id and will be dropped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
