"""Time-series features for MQ135 / temperature / humidity.

Input: the cleaned data from `ml.preprocess` (regular time grid per experiment).

Lags, change horizons and rolling windows are configured as DURATIONS: "30s",
"5min", "1h" (a plain number in the Python API means seconds). They are
converted to a whole number of samples using the sampling interval inferred
from the data (or given with `interval_seconds`), so the same configuration
covers the same real time whether the ESP32 logs every 10 s or every 60 s.
Column names carry the duration, not the sample count: `mq135_raw_lag_5min`.

For each sensor column it adds, per experiment:
    <sensor>_lag_<d>        value d ago
    <sensor>_diff_<d>       value now minus value d ago (change over d)
    <sensor>_roll_mean_<d>  mean over the last d, i.e. the window (t - d, t]
    <sensor>_roll_std_<d>   std (ddof=1) over the same window
Context columns are encoded: occupancy, ventilation_open, fan_on, ac_on,
ac_recorded (ac_on is 0 when ac is blank, ac_recorded tells you it was blank).

Duration -> samples: n = round(d / interval). A window of n samples covers the
current sample and the n-1 before it. If n * interval is more than
`max_rounding_error` (default 25 %) away from d, the duration is rejected
instead of silently meaning something else; durations shorter than one sample
(two for windows) and two durations that resolve to the same n are rejected too.

Rules:
  * Only past and current samples are used, never future ones (no leakage).
  * Features never cross experiments, and are set to missing wherever the
    needed history spans a time gap.
  * No label/target exists yet: it is defined in the next ML step.

Defaults (at a 10 s interval): lags 1/5/15 min = 6/30/90 samples back, changes
over 1/5 min = 6/30 samples, rolling windows 5/15/30 min = 30/90/180 samples.

Run from the project root:
    python -m ml.features
    python -m ml.features --input data/processed/clean_SYNTHETIC_test_readings.csv
    python -m ml.features --lags 30s 1min 5min --diffs 30s 5min --windows 1min 5min
"""

from __future__ import annotations

import argparse
import math
import numbers
import re
import sys
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from ml.preprocess import (
    COLUMNS,
    PROCESSED_DIR,
    SENSOR_COLUMNS,
    SYNTHETIC_PREFIX,
    infer_interval_seconds,
    load_clean_csv,
)

DEFAULT_INPUT = PROCESSED_DIR / "clean_SYNTHETIC_test_readings.csv"

DEFAULT_LAGS = ("1min", "5min", "15min")
DEFAULT_DIFFS = ("1min", "5min")
DEFAULT_WINDOWS = ("5min", "15min", "30min")
DEFAULT_MAX_ROUNDING_ERROR = 0.25

ID_COLUMNS = ["timestamp", "experiment_id", "location"]
CONTEXT_FEATURES = ["occupancy", "ventilation_open", "fan_on", "ac_on", "ac_recorded"]

_UNITS = {
    "s": 1, "sec": 1, "secs": 1, "second": 1, "seconds": 1,
    "m": 60, "min": 60, "mins": 60, "minute": 60, "minutes": 60,
    "h": 3600, "hr": 3600, "hrs": 3600, "hour": 3600, "hours": 3600,
}  # fmt: skip
_DURATION_RE = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*([a-zA-Z]+)\s*$")


# ---------------------------------------------------------------- durations
def parse_duration(value) -> int:
    """Duration in whole seconds. Accepts "30s", "5min", "1.5min", "1h" or a number of seconds."""
    if isinstance(value, bool):
        raise ValueError(f"Cannot read duration {value!r}; use e.g. '30s', '5min' or '1h'")
    if isinstance(value, numbers.Real):
        seconds = float(value)
    elif isinstance(value, str):
        match = _DURATION_RE.match(value)
        if not match or match.group(2).lower() not in _UNITS:
            raise ValueError(f"Cannot read duration {value!r}; use e.g. '30s', '5min' or '1h'")
        seconds = float(match.group(1)) * _UNITS[match.group(2).lower()]
    else:
        raise ValueError(f"Cannot read duration {value!r}; use e.g. '30s', '5min' or '1h'")
    if not math.isfinite(seconds) or seconds <= 0 or abs(seconds - round(seconds)) > 1e-9:
        raise ValueError(f"Duration {value!r} must be a positive whole number of seconds")
    return int(round(seconds))


def format_duration(seconds: int) -> str:
    """Compact label used in column names: 30 -> '30s', 300 -> '5min', 7200 -> '2h'."""
    if seconds % 3600 == 0:
        return f"{seconds // 3600}h"
    if seconds % 60 == 0:
        return f"{seconds // 60}min"
    return f"{seconds}s"


def _parse_list(name, values):
    """Validate a duration list. Returns [(label, seconds), ...] in the given order."""
    if isinstance(values, (str, numbers.Real)):
        values = (values,)  # a single duration is accepted
    values = tuple(values)
    if not values:
        raise ValueError(f"{name} must contain at least one duration")
    parsed, seen = [], set()
    for value in values:
        seconds = parse_duration(value)
        label = format_duration(seconds)
        if seconds in seen:
            raise ValueError(f"{name}: duration {label} is listed more than once")
        seen.add(seconds)
        parsed.append((label, seconds))
    return parsed


@dataclass(frozen=True)
class FeatureStep:
    label: str  # as used in column names, e.g. "5min"
    seconds: int  # requested duration
    samples: int  # whole samples at the sampling interval
    effective_seconds: int  # samples * interval (what the feature really spans)


@dataclass(frozen=True)
class FeaturePlan:
    interval_seconds: int
    lags: tuple
    diffs: tuple
    windows: tuple

    @property
    def history_seconds(self) -> int:
        """Continuous history a row needs before all its features exist."""
        steps = [s.samples for s in self.lags + self.diffs] + [s.samples - 1 for s in self.windows]
        return max(steps) * self.interval_seconds

    def describe(self) -> str:
        lines = [f"sampling interval: {self.interval_seconds} s"]
        for kind, steps in (("lags", self.lags), ("diffs", self.diffs), ("windows", self.windows)):
            parts = []
            for s in steps:
                part = f"{s.label}={s.samples} samples"
                if s.effective_seconds != s.seconds:
                    part += f" (really {format_duration(s.effective_seconds)})"
                parts.append(part)
            lines.append(f"  {kind:<8}" + ", ".join(parts))
        lines.append(f"  history needed per row: {format_duration(self.history_seconds)}")
        return "\n".join(lines)


def _resolve(name, values, interval, minimum, max_error):
    steps, by_samples = [], {}
    for label, seconds in _parse_list(name, values):
        samples = int(math.floor(seconds / interval + 0.5))  # round half up
        if samples < minimum:
            raise ValueError(
                f"{name}: {label} is shorter than the {minimum} sample(s) needed at the "
                f"{interval} s sampling interval (minimum {format_duration(minimum * interval)})"
            )
        effective = samples * interval
        error = abs(effective - seconds) / seconds
        if error > max_error:
            raise ValueError(
                f"{name}: {label} cannot be represented at the {interval} s sampling interval: "
                f"nearest is {samples} sample(s) = {format_duration(effective)} "
                f"({error:.0%} off, limit {max_error:.0%})"
            )
        if samples in by_samples:
            raise ValueError(
                f"{name}: {by_samples[samples]} and {label} both resolve to {samples} sample(s) "
                f"at the {interval} s sampling interval; keep only one"
            )
        by_samples[samples] = label
        steps.append(FeatureStep(label, seconds, samples, effective))
    return tuple(steps)


def plan_features(
    interval_seconds,
    lags=DEFAULT_LAGS,
    windows=DEFAULT_WINDOWS,
    diffs=DEFAULT_DIFFS,
    max_rounding_error=DEFAULT_MAX_ROUNDING_ERROR,
) -> FeaturePlan:
    """Convert duration settings to sample counts for a given sampling interval."""
    if isinstance(interval_seconds, bool) or not isinstance(interval_seconds, numbers.Integral):
        raise ValueError(f"interval_seconds must be a whole number of seconds, got {interval_seconds!r}")
    interval = int(interval_seconds)
    if interval < 1:
        raise ValueError("interval_seconds must be at least 1")
    if not 0 <= max_rounding_error < 1:
        raise ValueError("max_rounding_error must be at least 0 and below 1")
    return FeaturePlan(
        interval_seconds=interval,
        lags=_resolve("lags", lags, interval, 1, max_rounding_error),
        diffs=_resolve("diffs", diffs, interval, 1, max_rounding_error),
        windows=_resolve("windows", windows, interval, 2, max_rounding_error),
    )


# ---------------------------------------------------------------- columns
def _column_names(lags, diffs, windows):
    cols = []
    for sensor in SENSOR_COLUMNS:
        cols += [f"{sensor}_lag_{d}" for d in lags]
        cols += [f"{sensor}_diff_{d}" for d in diffs]
        for d in windows:
            cols += [f"{sensor}_roll_mean_{d}", f"{sensor}_roll_std_{d}"]
    return cols


def feature_columns(lags=DEFAULT_LAGS, windows=DEFAULT_WINDOWS, diffs=DEFAULT_DIFFS):
    """Names of all model-input columns (raw sensors + context + engineered).

    The names depend only on the durations, not on the sampling interval.
    """
    labels = lambda name, v: [label for label, _ in _parse_list(name, v)]  # noqa: E731
    engineered = _column_names(labels("lags", lags), labels("diffs", diffs), labels("windows", windows))
    return SENSOR_COLUMNS + CONTEXT_FEATURES + engineered


# ---------------------------------------------------------------- core
def _is(series, value):
    return series.astype("string").str.lower().eq(value).fillna(False).astype(int)


def _check_uniform_interval(df, interval):
    """Every experiment must be sampled at `interval`; otherwise its features would be empty."""
    off = {}
    for exp_id, g in df.groupby("experiment_id", sort=False):
        steps = g["timestamp"].diff().dt.total_seconds().dropna()
        steps = steps[steps > 0]
        if steps.empty:
            continue
        median = int(math.floor(steps.median() + 0.5))
        if median != interval:
            off[exp_id] = median
    if off:
        shown = ", ".join(f"{k}: {v} s" for k, v in list(off.items())[:5])
        raise ValueError(
            f"Experiments are not sampled at the {interval} s interval ({shown}). Run ml.preprocess on "
            "all experiments together, or build features separately per sampling interval."
        )


def _experiment_features(g, plan):
    ts = g["timestamp"]
    step = pd.Timedelta(seconds=plan.interval_seconds)
    shifts = {s.samples for s in plan.lags + plan.diffs}
    needed = sorted(shifts | {s.samples - 1 for s in plan.windows})
    contiguous = {k: (ts - ts.shift(k)) == k * step for k in needed}  # no gap over k samples

    feats = {}
    for sensor in SENSOR_COLUMNS:
        s = g[sensor]
        lagged = {k: s.shift(k).where(contiguous[k]) for k in shifts}
        for st in plan.lags:
            feats[f"{sensor}_lag_{st.label}"] = lagged[st.samples]
        for st in plan.diffs:
            feats[f"{sensor}_diff_{st.label}"] = s - lagged[st.samples]
        for st in plan.windows:
            roll = s.rolling(st.samples, min_periods=st.samples)
            ok = contiguous[st.samples - 1]
            feats[f"{sensor}_roll_mean_{st.label}"] = roll.mean().where(ok)
            feats[f"{sensor}_roll_std_{st.label}"] = roll.std().where(ok)
    return pd.DataFrame(feats, index=g.index)


def build_features(
    df,
    interval_seconds=None,
    lags=DEFAULT_LAGS,
    windows=DEFAULT_WINDOWS,
    diffs=DEFAULT_DIFFS,
    drop_incomplete=True,
    max_rounding_error=DEFAULT_MAX_ROUNDING_ERROR,
):
    """Add features to cleaned data. With drop_incomplete, rows lacking full history are removed.

    lags / diffs / windows are durations ("30s", "5min", "1h"; numbers mean seconds).
    The result's `.attrs` hold `interval_seconds` and the resolved `feature_plan`.
    """
    missing = [c for c in COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")
    if not isinstance(df["timestamp"].dtype, pd.DatetimeTZDtype):
        raise ValueError("timestamp must be timezone-aware datetimes (use ml.preprocess output)")

    df = df.sort_values(["experiment_id", "timestamp"], kind="stable").reset_index(drop=True)
    if df.duplicated(["experiment_id", "timestamp"]).any():
        raise ValueError("Duplicate (experiment_id, timestamp) rows found (use ml.preprocess output)")

    if interval_seconds is None:
        interval = infer_interval_seconds(df)
    else:
        interval = interval_seconds
    plan = plan_features(interval, lags, windows, diffs, max_rounding_error)
    _check_uniform_interval(df, plan.interval_seconds)

    parts = [_experiment_features(g, plan) for _, g in df.groupby("experiment_id", sort=False)]
    feats = pd.concat(parts).reindex(df.index)

    out = df[ID_COLUMNS + SENSOR_COLUMNS].copy()
    out["occupancy"] = df["occupancy"].astype(int)
    out["ventilation_open"] = _is(df["ventilation"], "open")
    out["fan_on"] = _is(df["fan"], "on")
    out["ac_on"] = _is(df["ac"], "on")
    out["ac_recorded"] = df["ac"].notna().astype(int)
    out = pd.concat([out, feats], axis=1)

    if drop_incomplete:
        engineered = _column_names(
            [s.label for s in plan.lags], [s.label for s in plan.diffs], [s.label for s in plan.windows]
        )
        out = out.dropna(subset=engineered).reset_index(drop=True)
        if out.empty:
            raise ValueError(
                "No rows have a complete feature history. Each row needs "
                f"{format_duration(plan.history_seconds)} of continuous data before it; experiments may "
                "be shorter than that, or the data is not on a regular grid (run ml.preprocess first)."
            )
    out.attrs["interval_seconds"] = plan.interval_seconds
    out.attrs["feature_plan"] = plan
    return out


# ---------------------------------------------------------------- CLI
def _default_output(input_path: Path) -> Path:
    stem = input_path.stem.removeprefix("clean_")
    return PROCESSED_DIR / f"features_{stem}.csv"


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Build time-series features from cleaned data.")
    p.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    p.add_argument("--output", type=Path, default=None, help="default: data/processed/features_<name>.csv")
    p.add_argument("--interval-seconds", type=int, default=None, help="default: inferred from the data")
    p.add_argument("--lags", nargs="+", default=list(DEFAULT_LAGS), metavar="DURATION",
                   help="past values to add, e.g. 30s 1min 5min (default: %(default)s)")  # fmt: skip
    p.add_argument("--diffs", nargs="+", default=list(DEFAULT_DIFFS), metavar="DURATION",
                   help="changes over these durations (default: %(default)s)")  # fmt: skip
    p.add_argument("--windows", nargs="+", default=list(DEFAULT_WINDOWS), metavar="DURATION",
                   help="rolling mean/std windows (default: %(default)s)")  # fmt: skip
    p.add_argument("--max-rounding-error", type=float, default=DEFAULT_MAX_ROUNDING_ERROR,
                   help="reject a duration if the nearest whole number of samples is further off than "
                        "this fraction (default: %(default)s)")  # fmt: skip
    args = p.parse_args(argv)

    try:
        df = load_clean_csv(args.input)
        feats = build_features(
            df,
            args.interval_seconds,
            args.lags,
            args.windows,
            args.diffs,
            max_rounding_error=args.max_rounding_error,
        )
    except (FileNotFoundError, ValueError, pd.errors.EmptyDataError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 1

    if df["experiment_id"].astype(str).str.startswith(SYNTHETIC_PREFIX).any():
        print("!" * 72)
        print("SYNTHETIC data: for pipeline testing only, not a research dataset.")
        print("!" * 72)
    output = args.output or _default_output(args.input)
    output.parent.mkdir(parents=True, exist_ok=True)
    feats.to_csv(output, index=False, date_format="%Y-%m-%dT%H:%M:%SZ")
    print(feats.attrs["feature_plan"].describe())
    print(f"rows in / out: {len(df)} / {len(feats)}  (rows without full history are dropped)")
    print(f"model-input columns: {len(feature_columns(args.lags, args.windows, args.diffs))}")
    print(f"wrote {len(feats)} rows -> {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())