"""Load, validate and clean the sensor CSV.

Input columns (same as the planned real dataset):
    timestamp, temperature_c, humidity_percent, mq135_raw, experiment_id,
    location, occupancy, ventilation, fan, ac

What it does, in order:
  1. Reads every column as text and parses it itself (nothing is guessed).
  2. Timestamps must be ISO 8601 WITH a timezone. Timezone-less or unparseable
     timestamps drop the row; they are never assumed to be UTC.
  3. Sensor values outside the plausible range (e.g. DS18B20 -127 / 85) or not
     numeric become missing. mq135_raw stays a raw value (never converted).
  4. Rows with an invalid context value (experiment_id, location, occupancy,
     ventilation, fan, ac) are dropped. `ac` may be blank (= not recorded).
  5. Sorts by experiment_id, timestamp and removes duplicate (experiment, time) rows.
  6. Puts each experiment on a regular time grid. Missing sensor values in a
     run of at most MAX_GAP_SAMPLES samples are linearly interpolated and
     flagged in `was_imputed`; longer gaps are left out (rows dropped).

Run from the project root:
    python -m ml.preprocess
    python -m ml.preprocess --input data/synthetic/SYNTHETIC_test_readings.csv
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT = ROOT / "data" / "synthetic" / "SYNTHETIC_test_readings.csv"
PROCESSED_DIR = ROOT / "data" / "processed"

COLUMNS = [
    "timestamp",
    "temperature_c",
    "humidity_percent",
    "mq135_raw",
    "experiment_id",
    "location",
    "occupancy",
    "ventilation",
    "fan",
    "ac",
]
SENSOR_COLUMNS = ["temperature_c", "humidity_percent", "mq135_raw"]
CAT_COLUMNS = ["location", "ventilation", "fan", "ac"]
CLEAN_COLUMNS = COLUMNS + ["was_imputed"]

# Plausible indoor ranges. Anything outside is treated as a sensor fault:
# -127 = DS18B20 disconnected, 85 = DS18B20 power-on reset, 4095 = 12-bit ADC max.
VALID_RANGES = {
    "temperature_c": (0.0, 50.0),
    "humidity_percent": (0.0, 100.0),
    "mq135_raw": (0.0, 4095.0),
}
VENTILATION_VALUES = ["open", "closed"]
ON_OFF_VALUES = ["on", "off"]
MAX_GAP_SAMPLES = 5
SYNTHETIC_PREFIX = "SYNTH-"

# ISO 8601 time part followed by Z or a UTC offset, e.g. ...T10:00:00Z, ...+05:30
_TZ_PATTERN = r"[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:[Zz]|[+-]\d{2}(?::?\d{2})?)$"


@dataclass
class PreprocessReport:
    rows_in: int = 0
    rows_out: int = 0
    experiments: int = 0
    interval_seconds: int = 0
    dropped_rows: dict = field(default_factory=dict)
    missing_values: dict = field(default_factory=dict)
    invalid_values: dict = field(default_factory=dict)
    duplicates_removed: int = 0
    gap_rows_created: int = 0
    values_imputed: int = 0
    rows_dropped_unfillable: int = 0
    ignored_columns: list = field(default_factory=list)
    synthetic_experiments: int = 0

    def summary(self) -> str:
        lines = []
        if self.synthetic_experiments:
            lines += [
                "!" * 72,
                f"SYNTHETIC data detected ({self.synthetic_experiments} experiment(s) with "
                f"'{SYNTHETIC_PREFIX}' ids): for pipeline testing only, not a research dataset.",
                "!" * 72,
            ]
        lines += [
            f"rows in / out            : {self.rows_in} / {self.rows_out}",
            f"experiments              : {self.experiments}",
            f"sampling interval        : {self.interval_seconds} s",
            f"rows dropped (invalid)   : {sum(self.dropped_rows.values())} {self.dropped_rows or ''}".rstrip(),
            f"missing values           : {self.missing_values}",
            f"invalid -> missing       : {self.invalid_values}",
            f"duplicates removed       : {self.duplicates_removed}",
            f"grid rows created (gaps) : {self.gap_rows_created}",
            f"values interpolated      : {self.values_imputed}",
            f"grid rows left out       : {self.rows_dropped_unfillable} (gaps longer than "
            f"{MAX_GAP_SAMPLES} samples or unfillable)",
        ]
        if self.ignored_columns:
            lines.append(f"ignored extra columns    : {self.ignored_columns}")
        return "\n".join(lines)


# ---------------------------------------------------------------- helpers
def _b(x):
    """Boolean Series without missing values."""
    return x.fillna(False).astype(bool)


def _text(series):
    """Stripped text; blank becomes missing."""
    s = series.astype("string").str.strip()
    return s.mask(_b(s.eq("")), pd.NA)


def _blank(series):
    s = series.astype("string").str.strip()
    return _b(s.isna() | s.eq(""))


def _parse_timestamps(series):
    """Return (UTC timestamps, has_timezone). Timezone-less values become NaT."""
    s = series.astype("string").str.strip()
    has_tz = _b(s.str.contains(_TZ_PATTERN, regex=True, na=False))
    parsed = pd.to_datetime(s.where(has_tz), utc=True, errors="coerce", format="ISO8601")
    return parsed, has_tz


def infer_interval_seconds(df) -> int:
    """Median time step between consecutive rows of the same experiment."""
    diffs = df.groupby("experiment_id")["timestamp"].diff().dropna().dt.total_seconds()
    diffs = diffs[diffs > 0]
    if diffs.empty:
        raise ValueError("Cannot infer the sampling interval; pass interval_seconds explicitly")
    return max(1, int(round(diffs.median())))


def load_csv(path) -> pd.DataFrame:
    """Read the raw CSV with every column as text (parsing happens in preprocess)."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Input file not found: {path}")
    return pd.read_csv(path, dtype=str, keep_default_na=False)


def load_clean_csv(path) -> pd.DataFrame:
    """Read a CSV written by this module; timestamps must carry a timezone."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Input file not found: {path}")
    df = pd.read_csv(path, dtype={c: str for c in ["experiment_id", "location", "ventilation", "fan", "ac"]})
    missing = [c for c in COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")
    ts, has_tz = _parse_timestamps(df["timestamp"])
    if not has_tz.all() or ts.isna().any():
        raise ValueError("Timestamps must be ISO 8601 with a timezone; run `python -m ml.preprocess` first")
    df["timestamp"] = ts
    return df


# ---------------------------------------------------------------- core
def preprocess(df, interval_seconds=None, max_gap_samples=MAX_GAP_SAMPLES):
    """Clean a raw readings DataFrame. Returns (clean_df, PreprocessReport)."""
    missing_cols = [c for c in COLUMNS if c not in df.columns]
    if missing_cols:
        raise ValueError(f"Missing required columns: {missing_cols}")
    report = PreprocessReport(
        rows_in=len(df),
        ignored_columns=[c for c in df.columns if c not in COLUMNS],
    )
    df = df[COLUMNS].reset_index(drop=True)

    # ---- parse and validate types
    out = pd.DataFrame(index=df.index)
    out["timestamp"], has_tz = _parse_timestamps(df["timestamp"])
    out["experiment_id"] = _text(df["experiment_id"])
    out["location"] = _text(df["location"])
    occupancy = pd.to_numeric(df["occupancy"], errors="coerce")
    out["occupancy"] = occupancy
    out["ventilation"] = _text(df["ventilation"]).str.lower()
    out["fan"] = _text(df["fan"]).str.lower()
    out["ac"] = _text(df["ac"]).str.lower()  # blank = not recorded (valid)

    for col in SENSOR_COLUMNS:
        lo, hi = VALID_RANGES[col]
        blank = _blank(df[col])
        number = pd.to_numeric(df[col], errors="coerce")
        in_range = _b(number.between(lo, hi))
        not_numeric = ~blank & number.isna()
        report.missing_values[col] = int(blank.sum())
        report.invalid_values[col] = int((not_numeric | (number.notna() & ~in_range)).sum())
        out[col] = number.where(in_range)

    # ---- drop rows whose identifying/context fields are invalid (first reason wins)
    checks = [
        ("timestamp_without_timezone", ~has_tz),
        ("unparseable_timestamp", has_tz & out["timestamp"].isna()),
        ("missing_experiment_id", out["experiment_id"].isna()),
        ("missing_location", out["location"].isna()),
        ("invalid_occupancy", occupancy.isna() | (occupancy < 0) | (occupancy % 1 != 0)),
        ("invalid_ventilation", ~out["ventilation"].isin(VENTILATION_VALUES)),
        ("invalid_fan", ~out["fan"].isin(ON_OFF_VALUES)),
        ("invalid_ac", out["ac"].notna() & ~out["ac"].isin(ON_OFF_VALUES)),
    ]
    reason = pd.Series(pd.NA, index=df.index, dtype="object")
    for name, bad in checks:
        reason = reason.mask(reason.isna() & _b(bad), name)
    report.dropped_rows = {k: int(v) for k, v in reason.dropna().value_counts().items()}
    data = out[reason.isna()]

    # ---- sort, remove duplicate (experiment, timestamp) rows
    data = data.sort_values(["experiment_id", "timestamp"], kind="stable")
    duplicated = data.duplicated(["experiment_id", "timestamp"], keep="first")
    report.duplicates_removed = int(duplicated.sum())
    data = data[~duplicated]
    if data.empty:
        raise ValueError("No valid rows left after validation\n" + report.summary())

    # ---- regular time grid per experiment, fill short gaps
    interval = int(interval_seconds) if interval_seconds else infer_interval_seconds(data)
    report.interval_seconds = interval
    frames = [
        _regularize(exp_id, group, interval, max_gap_samples, report)
        for exp_id, group in data.groupby("experiment_id", sort=True)
    ]
    clean = pd.concat(frames, ignore_index=True)
    if clean.empty:
        raise ValueError("No usable rows left after filling/removing gaps\n" + report.summary())

    for col in ["experiment_id", "location", "ventilation", "fan", "ac"]:
        clean[col] = clean[col].astype(object)
    clean = clean[CLEAN_COLUMNS]
    report.rows_out = len(clean)
    report.experiments = int(clean["experiment_id"].nunique())
    report.synthetic_experiments = int(
        clean.drop_duplicates("experiment_id")["experiment_id"].str.startswith(SYNTHETIC_PREFIX).sum()
    )
    return clean, report


def _regularize(exp_id, group, interval, max_gap, report):
    rule = f"{interval}s"
    bins = group["timestamp"].dt.floor(rule)  # readings in the same bin are merged
    full = pd.date_range(bins.min(), bins.max(), freq=rule)

    sensors = group.groupby(bins)[SENSOR_COLUMNS].mean()
    report.gap_rows_created += len(full) - len(sensors)
    sensors = sensors.reindex(full)
    occupancy = group.groupby(bins)["occupancy"].last().reindex(full).ffill(limit=max_gap)
    cats = group.groupby(bins)[CAT_COLUMNS].last().reindex(full).ffill(limit=max_gap)

    # Interpolate a missing run only if the WHOLE run is <= max_gap samples long.
    was_imputed = pd.Series(False, index=full)
    for col in SENSOR_COLUMNS:
        s = sensors[col]
        na = s.isna()
        run_id = (na != na.shift(fill_value=False)).cumsum()
        run_len = na.groupby(run_id).transform("sum")
        fillable = na & (run_len <= max_gap)
        interpolated = s.interpolate(method="time", limit_area="inside")
        sensors[col] = s.where(~fillable, interpolated)
        newly = fillable & sensors[col].notna()
        report.values_imputed += int(newly.sum())
        was_imputed |= newly

    res = pd.concat([sensors, occupancy, cats], axis=1)
    res["was_imputed"] = was_imputed
    required = SENSOR_COLUMNS + ["occupancy", "location", "ventilation", "fan"]
    usable = res[required].notna().all(axis=1)
    report.rows_dropped_unfillable += int((~usable).sum())
    res = res[usable].copy()
    res["occupancy"] = res["occupancy"].astype(int)
    res.insert(0, "experiment_id", exp_id)
    res.index.name = "timestamp"
    return res.reset_index()


# ---------------------------------------------------------------- CLI
def _default_output(input_path: Path) -> Path:
    return PROCESSED_DIR / f"clean_{input_path.stem}.csv"


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Validate and clean the sensor CSV.")
    p.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    p.add_argument("--output", type=Path, default=None, help="default: data/processed/clean_<input name>.csv")
    p.add_argument("--interval-seconds", type=int, default=None, help="default: inferred from the data")
    p.add_argument("--max-gap-samples", type=int, default=MAX_GAP_SAMPLES)
    args = p.parse_args(argv)

    try:
        clean, report = preprocess(load_csv(args.input), args.interval_seconds, args.max_gap_samples)
    except (FileNotFoundError, ValueError, pd.errors.EmptyDataError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 1

    output = args.output or _default_output(args.input)
    output.parent.mkdir(parents=True, exist_ok=True)
    clean.to_csv(output, index=False, date_format="%Y-%m-%dT%H:%M:%SZ")
    print(report.summary())
    print(f"wrote {len(clean)} rows -> {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())