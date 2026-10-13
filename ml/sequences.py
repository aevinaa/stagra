"""Sequence preparation: sliding input windows plus a future target.

Turns the cleaned data from `ml.preprocess` (a regular time grid per
experiment) into supervised-learning samples for sequence models
(LSTM / GRU / Transformer). No model is trained here and no label is invented:
the target is simply the *raw* value of a column some time in the future.

Definitions (a "step" is one sampling interval; durations are converted with
the sampling interval, so the same settings mean the same real time at 10 s
and at 60 s):

    origin t      the last time covered by the input window ("now")
    history       the input window is the `history_steps` samples ending at t,
                  i.e. the time interval (t - history, t]. Default 10 min.
    horizon       the target is the value of `target_column` exactly
                  `horizon_steps` samples after t, i.e. at t + horizon.
                  Default 10 min.
    stride        origins are every `stride`-th row of an experiment, counting
                  from the first row that has a full history (default: every row).

    10 s sampling : history = 60 steps, horizon = 60 steps
    60 s sampling : history = 10 steps, horizon = 10 steps

Output (`SequenceSet`, N = number of sequences, T = history_steps, F = features):

    X                  (N, T, F) float32  inputs, oldest step first, newest (= origin) last;
                                          the last axis follows `feature_names`
    y                  (N,)      float32  raw target value at origin + horizon
    target_at_origin   (N,)      float32  raw target value at the origin ("persistence"
                                          forecast; a model should beat this baseline)
    experiment_ids     (N,)      object   experiment of each sequence
    origin_times       DatetimeIndex (UTC) time of the last input step
    target_times       DatetimeIndex (UTC) time of y (= origin_times + horizon)

Arrays convert directly to tensors: `torch.from_numpy(seqs.X)`.
Output order: experiments sorted by id, chronological within each experiment.

Default input features per step (F = 8): temperature_c, humidity_percent,
mq135_raw, occupancy, ventilation_open, fan_on, ac_on, ac_recorded, i.e. the
three sensors plus the encoded context of `ml.features` (same encoding). Any
other numeric column can be used via `input_columns`.

Guarantees:
  * Timestamps must be timezone-aware (never assumed to be UTC) and strictly
    increasing within each experiment; otherwise a ValueError is raised.
  * A sequence and its target come from ONE experiment and cover an unbroken
    stretch of exactly `history + horizon` of consecutive samples. Anything
    that would span a missing sample or an experiment boundary is dropped,
    never bridged.
  * The inputs hold nothing after the origin: no future sensor value and no
    future context (fan, ventilation, occupancy, ...). The final `horizon` of
    every experiment therefore yields no sequence (its target is not known).
  * Windows with a missing/non-finite input or target value are dropped, not
    filled. The `SequenceReport` counts what was dropped and why.
  * Values are returned as they are: no scaling, no unit conversion
    (`mq135_raw` stays a raw sensor value), no categories or thresholds.

Caveats for the next steps:
  * Neighbouring sequences overlap almost completely. Split train / validation /
    test by experiment, or by time with a gap of at least history + horizon
    between the parts, otherwise test windows share samples with training windows.
  * Fit any scaler on the training part only.
  * `ml.preprocess` linearly interpolates short gaps, using the next real
    reading. An interpolated value near the end of a window can therefore carry
    information from after the origin. `report.kept_with_imputed` says how many
    kept sequences contain such values; pass `exclude_imputed=True` to drop them
    (recommended for final evaluation).
  * Data whose experiment ids start with "SYNTH-" is synthetic test data; the
    report and `describe()` say so. It is not a research dataset.

Example (from the project root):

    from ml.preprocess import load_clean_csv
    from ml.sequences import build_sequences

    clean = load_clean_csv("data/processed/clean_SYNTHETIC_test_readings.csv")
    seqs = build_sequences(clean)                       # 10 min history -> mq135_raw in 10 min
    seqs = build_sequences(clean, history="5min", horizon="2min",
                           stride="30s", target_column="temperature_c")
    print(seqs.describe())
"""

from __future__ import annotations

import math
import numbers
from dataclasses import dataclass, replace

import numpy as np
import pandas as pd
from numpy.lib.stride_tricks import sliding_window_view

from ml.features import CONTEXT_FEATURES, DEFAULT_MAX_ROUNDING_ERROR, format_duration, parse_duration
from ml.preprocess import SENSOR_COLUMNS, SYNTHETIC_PREFIX, infer_interval_seconds

DEFAULT_HISTORY = "10min"
DEFAULT_HORIZON = "10min"
DEFAULT_TARGET = "mq135_raw"
DEFAULT_INPUT_COLUMNS = tuple(SENSOR_COLUMNS + CONTEXT_FEATURES)

# Encoded context columns that can be derived from the raw columns of ml.preprocess.
_DERIVED_FROM = {
    "ventilation_open": "ventilation",
    "fan_on": "fan",
    "ac_on": "ac",
    "ac_recorded": "ac",
}


# ---------------------------------------------------------------- result types
@dataclass(frozen=True)
class SequenceReport:
    """What happened while building the sequences (counts are of candidate origins)."""

    experiments: int = 0
    experiments_with_sequences: int = 0
    too_short_experiments: tuple = ()  # shorter than history + horizon
    candidate_windows: int = 0  # origins with a full history and a target row after them
    kept: int = 0
    dropped_gap: int = 0  # the window or its target would span a gap
    dropped_missing: int = 0  # missing / non-finite input or target value
    dropped_imputed: int = 0  # contained an interpolated value (exclude_imputed=True)
    kept_with_imputed: int | None = None  # None: the data has no `was_imputed` column
    synthetic_experiments: int = 0

    def summary(self) -> str:
        imputed = "n/a (no was_imputed column)" if self.kept_with_imputed is None else self.kept_with_imputed
        lines = []
        if self.synthetic_experiments:
            lines += [
                "!" * 72,
                f"SYNTHETIC data detected ({self.synthetic_experiments} experiment(s) with "
                f"'{SYNTHETIC_PREFIX}' ids): for pipeline testing only, not a research dataset.",
                "!" * 72,
            ]
        lines += [
            f"experiments (with sequences) : {self.experiments} ({self.experiments_with_sequences})",
            f"too short for one sequence   : {list(self.too_short_experiments)}",
            f"candidate windows            : {self.candidate_windows}",
            f"kept                         : {self.kept}",
            f"dropped (gap)                : {self.dropped_gap}",
            f"dropped (missing value)      : {self.dropped_missing}",
            f"dropped (interpolated value) : {self.dropped_imputed}",
            f"kept, containing interpolated: {imputed}",
        ]
        return "\n".join(lines)


@dataclass(frozen=True, eq=False)
class SequenceSet:
    """Input sequences, targets and their bookkeeping. See the module docstring for shapes."""

    X: np.ndarray  # (N, history_steps, F) float32
    y: np.ndarray  # (N,) float32, target at origin + horizon
    target_at_origin: np.ndarray  # (N,) float32, target at the origin (persistence baseline)
    experiment_ids: np.ndarray  # (N,) object
    origin_times: pd.DatetimeIndex  # (N,) UTC, time of the last input step
    target_times: pd.DatetimeIndex  # (N,) UTC, time of y
    feature_names: tuple  # names along the last axis of X
    target_column: str
    interval_seconds: int
    history_steps: int
    horizon_steps: int
    stride_steps: int
    report: SequenceReport

    def __len__(self) -> int:
        return int(self.X.shape[0])

    @property
    def n_features(self) -> int:
        return int(self.X.shape[2])

    @property
    def history_seconds(self) -> int:
        """Real time covered by one input window (history_steps * interval)."""
        return self.history_steps * self.interval_seconds

    @property
    def horizon_seconds(self) -> int:
        """Real time between the origin and the target (horizon_steps * interval)."""
        return self.horizon_steps * self.interval_seconds

    def subset(self, index) -> "SequenceSet":
        """New SequenceSet with the selected sequences; every array stays aligned.

        `index` is a boolean mask of length len(self) or an array of integer positions.
        The report still describes the full build.
        """
        idx = np.asarray(index)
        if idx.dtype == bool:
            if idx.shape != (len(self),):
                raise ValueError(f"boolean mask must have shape ({len(self)},), got {idx.shape}")
        else:
            if idx.size == 0:
                idx = idx.astype(np.int64)
            if idx.dtype.kind not in "iu":
                raise ValueError("index must be a boolean mask or an array of integer positions")
        return replace(
            self,
            X=self.X[idx],
            y=self.y[idx],
            target_at_origin=self.target_at_origin[idx],
            experiment_ids=self.experiment_ids[idx],
            origin_times=self.origin_times[idx],
            target_times=self.target_times[idx],
        )

    def describe(self) -> str:
        head = [
            f"sequences        : {len(self)}",
            f"X shape          : {self.X.shape}  (sequences, time steps, features)",
            f"y shape          : {self.y.shape}",
            f"sampling interval: {self.interval_seconds} s",
            f"input history    : {self.history_steps} steps = {format_duration(self.history_seconds)}",
            f"forecast horizon : {self.horizon_steps} steps = {format_duration(self.horizon_seconds)}",
            f"stride           : {self.stride_steps} step(s) = {format_duration(self.stride_steps * self.interval_seconds)}",
            f"target           : {self.target_column}",
            f"features         : {list(self.feature_names)}",
        ]
        return "\n".join(head + [self.report.summary()])


# ---------------------------------------------------------------- column helpers
def _b(x):
    """Boolean Series without missing values."""
    return x.fillna(False).astype(bool)


def _norm_text(series):
    """Stripped lower-case text; blank becomes missing."""
    s = series.astype("string").str.strip().str.lower()
    return s.mask(_b(s.eq("")), pd.NA)


def _two_state(series, on, off):
    """1.0 for `on`, 0.0 for `off`, NaN for anything else (unknown values are never guessed)."""
    s = _norm_text(series)
    out = np.full(len(s), np.nan)
    out[_b(s.eq(on)).to_numpy()] = 1.0
    out[_b(s.eq(off)).to_numpy()] = 0.0
    return out


def _derive(name, series):
    if name == "ventilation_open":
        return _two_state(series, "open", "closed")
    if name == "fan_on":
        return _two_state(series, "on", "off")
    s = _norm_text(series)  # ac: blank means "not recorded"
    is_on = _b(s.eq("on")).to_numpy()
    is_off = _b(s.eq("off")).to_numpy()
    blank = s.isna().to_numpy()
    if name == "ac_on":
        return np.where(is_on, 1.0, np.where(is_off | blank, 0.0, np.nan))
    return np.where(is_on | is_off, 1.0, np.where(blank, 0.0, np.nan))  # ac_recorded


def _column_values(df, name):
    """Float64 values of a column; encoded context columns are derived when absent."""
    if name in df.columns:
        col = df[name]
        if not pd.api.types.is_numeric_dtype(col):
            raise ValueError(f"Column {name!r} must be numeric, got dtype {col.dtype}")
        return col.to_numpy(dtype="float64", na_value=np.nan)
    if name in _DERIVED_FROM:
        source = _DERIVED_FROM[name]
        if source not in df.columns:
            raise ValueError(
                f"Cannot build {name!r}: the data needs a {source!r} column (ml.preprocess output) "
                f"or an already encoded {name!r} column"
            )
        return _derive(name, df[source])
    raise ValueError(f"Column {name!r} not found in the data")


# ---------------------------------------------------------------- duration helpers
def _seconds(name, value):
    try:
        return parse_duration(value)
    except ValueError as e:
        raise ValueError(f"{name}: {e}") from None


def _to_steps(name, seconds, interval, minimum, max_error):
    """Whole samples for a duration; refuses durations the sampling interval cannot represent."""
    steps = int(math.floor(seconds / interval + 0.5))  # round half up
    if steps < minimum:
        raise ValueError(
            f"{name}: {format_duration(seconds)} is shorter than the {minimum} sample(s) needed at the "
            f"{interval} s sampling interval (minimum {format_duration(minimum * interval)})"
        )
    effective = steps * interval
    error = abs(effective - seconds) / seconds
    if error > max_error:
        raise ValueError(
            f"{name}: {format_duration(seconds)} cannot be represented at the {interval} s sampling interval: "
            f"nearest is {steps} sample(s) = {format_duration(effective)} ({error:.0%} off, limit {max_error:.0%})"
        )
    return steps


# ---------------------------------------------------------------- core
def build_sequences(
    df,
    history=DEFAULT_HISTORY,
    horizon=DEFAULT_HORIZON,
    *,
    target_column=DEFAULT_TARGET,
    stride=None,
    interval_seconds=None,
    input_columns=None,
    exclude_imputed=False,
    max_rounding_error=DEFAULT_MAX_ROUNDING_ERROR,
    allow_empty=True,
) -> SequenceSet:
    """Build input sequences and future targets from cleaned data (see the module docstring).

    df                 cleaned data (output of ml.preprocess): needs `timestamp` (timezone-aware),
                       `experiment_id` and the input / target columns.
    history, horizon   durations such as "30s", "10min", "1h" (a plain number means seconds).
    target_column      any numeric column; default "mq135_raw" (raw value, not converted).
    stride             spacing of consecutive origins as a duration; default one sample.
    interval_seconds   sampling interval; default: inferred from the data.
    input_columns      numeric columns used as inputs; default: the three sensors plus the
                       encoded context (see DEFAULT_INPUT_COLUMNS).
    exclude_imputed    drop sequences containing an interpolated value (needs `was_imputed`).
    max_rounding_error a duration whose nearest whole number of samples is further off than this
                       fraction is rejected instead of silently meaning something else.
    allow_empty        if False, raise ValueError when no sequence can be built.

    Raises ValueError for unusable data or settings. Returns an empty SequenceSet (correct
    shapes, N = 0) when the data is valid but too short or too broken to yield any sequence.
    """
    if not isinstance(df, pd.DataFrame):
        raise TypeError("df must be a pandas DataFrame")
    missing = [c for c in ("timestamp", "experiment_id") if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")
    if len(df) == 0:
        raise ValueError("The data has no rows")
    if not isinstance(df["timestamp"].dtype, pd.DatetimeTZDtype):
        raise ValueError(
            "timestamp must be timezone-aware datetimes (use ml.preprocess output); "
            "timezone-less timestamps are never assumed to be UTC"
        )
    if df["timestamp"].isna().any():
        raise ValueError("timestamp contains missing values")
    if df["experiment_id"].isna().any():
        raise ValueError("experiment_id contains missing values")
    if isinstance(max_rounding_error, bool) or not isinstance(max_rounding_error, numbers.Real) \
            or not 0 <= max_rounding_error < 1:
        raise ValueError("max_rounding_error must be at least 0 and below 1")

    # ---- settings that do not depend on the data
    history_s = _seconds("history", history)
    horizon_s = _seconds("horizon", horizon)
    stride_s = None if stride is None else _seconds("stride", stride)
    if not isinstance(target_column, str) or not target_column:
        raise ValueError("target_column must be a column name")
    names = [input_columns] if isinstance(input_columns, str) else list(
        DEFAULT_INPUT_COLUMNS if input_columns is None else input_columns
    )
    if not names:
        raise ValueError("input_columns must not be empty")
    if not all(isinstance(n, str) for n in names):
        raise ValueError("input_columns must be column names")
    if len(set(names)) != len(names):
        raise ValueError("input_columns contains duplicates")
    if interval_seconds is not None and (
        isinstance(interval_seconds, bool) or not isinstance(interval_seconds, numbers.Integral) or interval_seconds < 1
    ):
        raise ValueError(f"interval_seconds must be a whole number of seconds >= 1, got {interval_seconds!r}")

    # ---- values (float64, NaN = missing)
    matrix = np.column_stack([_column_values(df, n) for n in names])  # (rows, F)
    target = _column_values(df, target_column)  # (rows,)
    imputed = None
    if "was_imputed" in df.columns:
        imputed = df["was_imputed"].astype("boolean").fillna(False).to_numpy(dtype=bool)
    elif exclude_imputed:
        raise ValueError("exclude_imputed=True needs a 'was_imputed' column (ml.preprocess output)")

    # ---- order within each experiment, sampling interval
    ts_utc = df["timestamp"].dt.tz_convert("UTC")
    groups = df.groupby("experiment_id", sort=True).indices  # id -> row positions, in frame order
    ids = sorted(groups, key=str)
    steps_by_exp = {}
    for exp_id in ids:
        t = ts_utc.iloc[groups[exp_id]]
        rel = (t - t.iloc[0]).dt.total_seconds().to_numpy(dtype="float64")
        steps = np.diff(rel)
        if (steps <= 0).any():
            row = int(np.argmax(steps <= 0)) + 1
            raise ValueError(
                f"experiment {exp_id!r}: timestamps must be strictly increasing (duplicate or out of "
                f"order at its row {row}); sort and de-duplicate with ml.preprocess"
            )
        steps_by_exp[exp_id] = steps

    interval = (
        infer_interval_seconds(df[["experiment_id", "timestamp"]])
        if interval_seconds is None
        else int(interval_seconds)
    )
    off = {
        exp_id: int(math.floor(np.median(s) + 0.5))
        for exp_id, s in steps_by_exp.items()
        if s.size and int(math.floor(np.median(s) + 0.5)) != interval
    }
    if off:
        shown = ", ".join(f"{k}: {v} s" for k, v in list(off.items())[:5])
        raise ValueError(
            f"Experiments are not sampled at the {interval} s interval ({shown}). Run ml.preprocess on "
            "all experiments together, or build sequences separately per sampling interval."
        )

    n = _to_steps("history", history_s, interval, 2, max_rounding_error)  # input steps
    k = _to_steps("horizon", horizon_s, interval, 1, max_rounding_error)  # steps ahead
    s = 1 if stride_s is None else _to_steps("stride", stride_s, interval, 1, max_rounding_error)

    # ---- windows, experiment by experiment (nothing is ever combined across experiments)
    xs, ys, y0s, rows_origin, rows_target = [], [], [], [], []
    too_short = []
    candidates = kept = dropped_gap = dropped_missing = dropped_imputed = kept_imputed = 0
    with_sequences = 0
    for exp_id in ids:
        pos = groups[exp_id]
        length = len(pos)
        if length < n + k:
            too_short.append(exp_id)
            continue
        origins = np.arange(n - 1, length - k, s)  # row of the last input step
        a = origins - (n - 1)  # first input row
        b = origins + k  # target row
        candidates += len(origins)

        # all steps between row a and row b must be exactly one interval (no gap)
        good_step = np.isclose(steps_by_exp[exp_id], interval, rtol=0.0, atol=1e-6)
        bad_cum = np.concatenate(([0], np.cumsum(~good_step)))
        in_span = (bad_cum[b] - bad_cum[a]) == 0

        # missing / non-finite values in the input rows a..origin or in the target rows
        rows = matrix[pos]
        tgt = target[pos]
        row_bad = ~np.isfinite(rows).all(axis=1)
        rb_cum = np.concatenate(([0], np.cumsum(row_bad)))
        missing_mask = ((rb_cum[origins + 1] - rb_cum[a]) > 0) | ~np.isfinite(tgt[b]) | ~np.isfinite(tgt[origins])

        # interpolated values in the input rows or in the target row
        if imputed is not None:
            imp = imputed[pos]
            im_cum = np.concatenate(([0], np.cumsum(imp)))
            imp_mask = ((im_cum[origins + 1] - im_cum[a]) > 0) | imp[b]
        else:
            imp_mask = np.zeros(len(origins), dtype=bool)

        ok = in_span & ~missing_mask
        keep = ok & ~imp_mask if exclude_imputed else ok
        dropped_gap += int((~in_span).sum())
        dropped_missing += int((in_span & missing_mask).sum())
        dropped_imputed += int((ok & imp_mask).sum()) if exclude_imputed else 0
        kept_imputed += int((keep & imp_mask).sum())
        kept += int(keep.sum())

        picked = origins[keep]
        if picked.size == 0:
            continue
        with_sequences += 1
        windows = sliding_window_view(rows, n, axis=0)  # (length - n + 1, F, n)
        xs.append(np.ascontiguousarray(windows[picked - (n - 1)].transpose(0, 2, 1), dtype=np.float32))
        ys.append(tgt[picked + k].astype(np.float32))
        y0s.append(tgt[picked].astype(np.float32))
        rows_origin.append(pos[picked])
        rows_target.append(pos[picked + k])

    report = SequenceReport(
        experiments=len(ids),
        experiments_with_sequences=with_sequences,
        too_short_experiments=tuple(too_short),
        candidate_windows=candidates,
        kept=kept,
        dropped_gap=dropped_gap,
        dropped_missing=dropped_missing,
        dropped_imputed=dropped_imputed,
        kept_with_imputed=None if imputed is None else kept_imputed,
        synthetic_experiments=sum(str(i).startswith(SYNTHETIC_PREFIX) for i in ids),
    )
    if kept == 0 and not allow_empty:
        raise ValueError(
            f"No sequences could be built (history {history_s} s + horizon {horizon_s} s needs "
            f"{n + k} consecutive samples with no gap or missing value).\n" + report.summary()
        )

    if xs:
        X, y, y0 = np.concatenate(xs), np.concatenate(ys), np.concatenate(y0s)
        row_o, row_t = np.concatenate(rows_origin), np.concatenate(rows_target)
    else:
        X = np.empty((0, n, len(names)), dtype=np.float32)
        y = np.empty(0, dtype=np.float32)
        y0 = np.empty(0, dtype=np.float32)
        row_o = row_t = np.empty(0, dtype=np.int64)
    return SequenceSet(
        X=X,
        y=y,
        target_at_origin=y0,
        experiment_ids=df["experiment_id"].to_numpy(dtype=object)[row_o],
        origin_times=pd.DatetimeIndex(ts_utc.iloc[row_o], name="origin_time"),
        target_times=pd.DatetimeIndex(ts_utc.iloc[row_t], name="target_time"),
        feature_names=tuple(names),
        target_column=target_column,
        interval_seconds=interval,
        history_steps=n,
        horizon_steps=k,
        stride_steps=s,
        report=report,
    )