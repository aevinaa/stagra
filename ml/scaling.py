"""Training-only standardisation of a SequenceSet (Step 3B).

What it scales
--------------
Only the continuous sensor channels in SCALED_COLUMNS (temperature_c, humidity_percent,
mq135_raw), and only when they are among the SequenceSet's feature_names. Everything else
(occupancy, ventilation_open, fan_on, ac_on, ac_recorded, ...) is left exactly as it is.
Scaling is plain standardisation, (x - mean) / scale, with one mean and one scale per channel.
`mq135_raw` stays a raw sensor value: no ppm / CO2 / AQI conversion happens here.

Fitting (training data only)
----------------------------
* The scaler is created ONLY by `SequenceScaler.fit_train(train_set)` or
  `SequenceScaler.fit_from_split(split_result)` (which uses `split_result.train` and nothing
  else). There is no `fit` on an instance and instances are immutable, so `transform` and
  `inverse_transform*` can never fit or refit anything. The names are deliberately explicit;
  Python cannot tell a training set from a validation set, so pass only training data.
* Overlapping windows repeat the same readings. Statistics are computed over UNIQUE
  observations, identified by (experiment id, timestamp), where the timestamp of step t of a
  window is origin_time - (history_steps - 1 - t) * interval. Each reading therefore counts once,
  whatever the stride. Repeats of one (experiment, timestamp) must carry identical values;
  otherwise fitting raises, because the data would be inconsistent.
* Means and standard deviations (population, ddof=0) are computed in float64. A channel whose
  standard deviation is (numerically) zero gets scale 1.0 and is flagged `zero_variance`; it is
  only centred, so outputs stay finite.

Target
------
The forecast target is scaled with the statistics of its matching input channel
(`target_column` must be one of SCALED_COLUMNS and must be in feature_names; anything else
raises a clear error). `y` and `target_at_origin` are scaled the same way, so the persistence
baseline stays comparable. `inverse_transform_y` maps predictions back to the original units.
The statistics come from the X channel (readings up to each window's origin); the last
`horizon_steps` readings of an experiment appear only as targets and are not used for them.

Compatibility
-------------
Applying a scaler checks feature_names, target_column, interval_seconds, history_steps and
horizon_steps against what it was fitted on and raises ValueError on any mismatch. Stride is
not checked (it does not change the meaning of the data). A SequenceSet carries no flag saying
whether it is already scaled, so do not transform the same set twice.

Persistence
-----------
`save(path)` / `load(path)` use JSON (schema name + version, feature names, target column,
interval / history / horizon, statistics and how the scaler was fitted). Loading validates
everything and rejects unknown schema versions, malformed or non-finite numbers and
inconsistent metadata.

No torch, imputation, splitting or training happens here.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, replace
from pathlib import Path

import numpy as np
import pandas as pd

from ml.preprocess import SYNTHETIC_PREFIX
from ml.sequences import SequenceSet

SCALED_COLUMNS = ("temperature_c", "humidity_percent", "mq135_raw")
SCHEMA_NAME = "airq.sequence_scaler"
SCHEMA_VERSION = 1
_MIN_STD = 1e-9  # relative: std <= _MIN_STD * max(1, |mean|) counts as zero variance


# ---------------------------------------------------------------- statistics containers
@dataclass(frozen=True)
class ChannelStats:
    name: str
    mean: float
    std: float  # population standard deviation of the training observations
    scale: float  # divisor actually used: std, or 1.0 for a zero-variance channel
    zero_variance: bool


@dataclass(frozen=True)
class FitInfo:
    """How the scaler was fitted (for the record; never used to transform)."""

    experiments: tuple  # experiment ids of the training data
    synthetic_experiments: tuple  # those starting with ml.preprocess.SYNTHETIC_PREFIX
    n_windows: int
    n_window_samples: int  # n_windows * history_steps: readings counted with repeats
    n_observations: int  # unique (experiment, timestamp) readings actually used


# ---------------------------------------------------------------- helpers
def _is_number(value) -> bool:
    return isinstance(value, (int, float, np.integer, np.floating)) and not isinstance(value, bool)


def _check_sequence_set(seq, role: str) -> None:
    if not isinstance(seq, SequenceSet):
        raise TypeError(f"{role} must be a SequenceSet, got {type(seq).__name__}")
    n = len(seq)
    X = np.asarray(seq.X)
    if X.ndim != 3:
        raise ValueError(f"{role}: X must have shape (N, T, F), got {X.shape}")
    if X.shape[2] != len(seq.feature_names):
        raise ValueError(
            f"{role}: X has {X.shape[2]} features but feature_names has {len(seq.feature_names)}"
        )
    if X.shape[1] != seq.history_steps:
        raise ValueError(f"{role}: X has {X.shape[1]} time steps but history_steps is {seq.history_steps}")
    lengths = {
        "y": len(seq.y),
        "target_at_origin": len(seq.target_at_origin),
        "experiment_ids": len(seq.experiment_ids),
        "origin_times": len(seq.origin_times),
        "target_times": len(seq.target_times),
    }
    bad = {k: v for k, v in lengths.items() if v != n}
    if bad:
        raise ValueError(f"{role}: arrays are not aligned with X (length {n}): {bad}")
    if getattr(seq.origin_times, "tz", None) is None:
        raise ValueError(f"{role}: origin_times must be timezone-aware; refusing to assume a timezone")
    for name, arr in (("X", X), ("y", seq.y), ("target_at_origin", seq.target_at_origin)):
        if not np.all(np.isfinite(arr)):
            raise ValueError(f"{role}: {name} contains NaN or infinite values")


def _check_target(feature_names, target_column) -> None:
    if target_column not in SCALED_COLUMNS:
        raise ValueError(
            f"unsupported target_column {target_column!r}: the target can only be scaled together "
            f"with one of the scaled sensor channels {list(SCALED_COLUMNS)}"
        )
    if target_column not in feature_names:
        raise ValueError(
            f"target_column {target_column!r} is not among the input features "
            f"{list(feature_names)}, so there are no statistics to scale it with"
        )


def _unique_observations(seq: SequenceSet, columns: list) -> np.ndarray:
    """Values (n_unique, len(columns)) of every distinct (experiment, timestamp) in the windows."""
    n, steps, _ = seq.X.shape
    step_ns = int(seq.interval_seconds) * 1_000_000_000
    origin_ns = np.asarray(seq.origin_times.tz_convert("UTC").as_unit("ns").asi8, dtype=np.int64)
    offsets = (steps - 1 - np.arange(steps, dtype=np.int64)) * step_ns
    times = (origin_ns[:, None] - offsets[None, :]).ravel()
    exp_codes = np.repeat(pd.factorize(np.asarray(seq.experiment_ids).astype(str))[0], steps)
    idx = [seq.feature_names.index(c) for c in columns]
    values = np.asarray(seq.X, dtype=np.float64).reshape(n * steps, -1)[:, idx]

    order = np.lexsort((times, exp_codes))
    e, t, v = exp_codes[order], times[order], values[order]
    same_as_previous = (e[1:] == e[:-1]) & (t[1:] == t[:-1])
    if not np.array_equal(v[1:][same_as_previous], v[:-1][same_as_previous]):
        raise ValueError(
            "the same (experiment, timestamp) appears with different values in different windows; "
            "refusing to fit on inconsistent data"
        )
    keep = np.concatenate(([True], ~same_as_previous))
    return v[keep]


# ---------------------------------------------------------------- the scaler
@dataclass(frozen=True)
class SequenceScaler:
    """Standardiser fitted on training data. Create it with fit_train / fit_from_split / load."""

    feature_names: tuple
    target_column: str
    interval_seconds: int
    history_steps: int
    horizon_steps: int
    channels: tuple  # ChannelStats, in feature order
    fit_info: FitInfo

    # ------------------------------------------------------------ construction
    @classmethod
    def fit_train(cls, train: SequenceSet) -> "SequenceScaler":
        """Fit on TRAINING sequences only (never pass validation or test data)."""
        _check_sequence_set(train, "training data")
        if len(train) == 0:
            raise ValueError("cannot fit a scaler on an empty training set")
        feature_names = tuple(train.feature_names)
        columns = [c for c in feature_names if c in SCALED_COLUMNS]
        if not columns:
            raise ValueError(
                f"none of the scaled channels {list(SCALED_COLUMNS)} is among the features "
                f"{list(feature_names)}"
            )
        _check_target(feature_names, train.target_column)

        obs = _unique_observations(train, columns)
        channels = []
        for j, name in enumerate(columns):
            col = obs[:, j]
            mean = float(col.mean())
            std = float(col.std())
            zero = (not math.isfinite(std)) or std <= _MIN_STD * max(1.0, abs(mean))
            channels.append(
                ChannelStats(name=name, mean=mean, std=0.0 if zero else std,
                             scale=1.0 if zero else std, zero_variance=bool(zero))
            )
        ids = np.asarray(train.experiment_ids).astype(str)
        experiments = tuple(sorted(set(ids)))

        info = FitInfo(
            experiments=experiments,
            synthetic_experiments=tuple(e for e in experiments if e.startswith(SYNTHETIC_PREFIX)),
            n_windows=len(train),
            n_window_samples=len(train) * int(train.history_steps),
            n_observations=int(obs.shape[0]),
        )
        return cls(
            feature_names=feature_names,
            target_column=str(train.target_column),
            interval_seconds=int(train.interval_seconds),
            history_steps=int(train.history_steps),
            horizon_steps=int(train.horizon_steps),
            channels=tuple(channels),
            fit_info=info,
        )

    @classmethod
    def fit_from_split(cls, split) -> "SequenceScaler":
        """Fit on `split.train` of an ml.splits.SplitResult; validation and test are never read."""
        from ml.splits import SplitResult

        if not isinstance(split, SplitResult):
            raise TypeError(f"expected an ml.splits.SplitResult, got {type(split).__name__}")
        return cls.fit_train(split.train)

    # ------------------------------------------------------------ introspection
    @property
    def scaled_columns(self) -> tuple:
        return tuple(c.name for c in self.channels)

    def stats(self, name: str) -> ChannelStats:
        for c in self.channels:
            if c.name == name:
                return c
        raise KeyError(f"{name!r} is not a scaled channel; scaled channels: {list(self.scaled_columns)}")

    @property
    def target_stats(self) -> ChannelStats:
        return self.stats(self.target_column)

    def describe(self) -> str:
        lines = [
            f"SequenceScaler v{SCHEMA_VERSION}: target {self.target_column}, interval "
            f"{self.interval_seconds} s, history {self.history_steps} steps, horizon {self.horizon_steps} steps",
            f"  fitted on {self.fit_info.n_observations} unique readings "
            f"({self.fit_info.n_window_samples} with overlap) from {len(self.fit_info.experiments)} experiment(s)",
        ]
        for c in self.channels:
            lines.append(
                f"  {c.name:<17} mean {c.mean:.6g}  scale {c.scale:.6g}" + ("  (zero variance)" if c.zero_variance else "")
            )
        return "\n".join(lines)

    # ------------------------------------------------------------ compatibility
    def check_compatible(self, seq: SequenceSet) -> None:
        """Raise ValueError unless `seq` has the same layout the scaler was fitted on."""
        _check_sequence_set(seq, "sequences")
        problems = []
        if tuple(seq.feature_names) != self.feature_names:
            problems.append(f"feature_names {list(seq.feature_names)} != fitted {list(self.feature_names)}")
        if seq.target_column != self.target_column:
            problems.append(f"target_column {seq.target_column!r} != fitted {self.target_column!r}")
        if int(seq.interval_seconds) != self.interval_seconds:
            problems.append(f"interval_seconds {seq.interval_seconds} != fitted {self.interval_seconds}")
        if int(seq.history_steps) != self.history_steps:
            problems.append(f"history_steps {seq.history_steps} != fitted {self.history_steps}")
        if int(seq.horizon_steps) != self.horizon_steps:
            problems.append(f"horizon_steps {seq.horizon_steps} != fitted {self.horizon_steps}")
        if problems:
            raise ValueError("sequences do not match the scaler: " + "; ".join(problems))

    # ------------------------------------------------------------ transforms
    def _apply(self, seq: SequenceSet, inverse: bool) -> SequenceSet:
        self.check_compatible(seq)
        X = np.array(seq.X, dtype=np.float64)  # copies
        for c in self.channels:
            j = self.feature_names.index(c.name)
            X[:, :, j] = X[:, :, j] * c.scale + c.mean if inverse else (X[:, :, j] - c.mean) / c.scale
        t = self.target_stats
        y = np.asarray(seq.y, dtype=np.float64)
        o = np.asarray(seq.target_at_origin, dtype=np.float64)
        if inverse:
            y, o = y * t.scale + t.mean, o * t.scale + t.mean
        else:
            y, o = (y - t.mean) / t.scale, (o - t.mean) / t.scale
        out = {"X": X.astype(np.float32), "y": y.astype(np.float32), "target_at_origin": o.astype(np.float32)}
        for name, arr in out.items():
            if not np.all(np.isfinite(arr)):
                raise ValueError(f"scaling produced non-finite values in {name}")
        return replace(seq, **out)

    def transform(self, seq: SequenceSet) -> SequenceSet:
        """New SequenceSet with the scaled channels, y and target_at_origin standardised."""
        return self._apply(seq, inverse=False)

    def inverse_transform(self, seq: SequenceSet) -> SequenceSet:
        """Undo `transform` (original units for the scaled channels, y and target_at_origin)."""
        return self._apply(seq, inverse=True)

    def transform_y(self, values):
        """Scale target values given in original units. Returns float32 with the same shape."""
        v = self._finite_array(values)
        t = self.target_stats
        return ((v - t.mean) / t.scale).astype(np.float32)

    def inverse_transform_y(self, values):
        """Map scaled predictions back to the original target units (float32, same shape)."""
        v = self._finite_array(values)
        t = self.target_stats
        return (v * t.scale + t.mean).astype(np.float32)

    @staticmethod
    def _finite_array(values) -> np.ndarray:
        v = np.asarray(values, dtype=np.float64)
        if not np.all(np.isfinite(v)):
            raise ValueError("values contain NaN or infinite entries")
        return v

    # ------------------------------------------------------------ JSON persistence
    def to_dict(self) -> dict:
        return {
            "schema": SCHEMA_NAME,
            "version": SCHEMA_VERSION,
            "feature_names": list(self.feature_names),
            "target_column": self.target_column,
            "interval_seconds": self.interval_seconds,
            "history_steps": self.history_steps,
            "horizon_steps": self.horizon_steps,
            "channels": {
                c.name: {"mean": c.mean, "std": c.std, "scale": c.scale, "zero_variance": c.zero_variance}
                for c in self.channels
            },
            "fit": {
                "experiments": list(self.fit_info.experiments),
                "synthetic_experiments": list(self.fit_info.synthetic_experiments),
                "n_windows": self.fit_info.n_windows,
                "n_window_samples": self.fit_info.n_window_samples,
                "n_observations": self.fit_info.n_observations,
            },
        }

    @classmethod
    def from_dict(cls, data) -> "SequenceScaler":
        if not isinstance(data, dict):
            raise ValueError("scaler file must contain a JSON object")
        if data.get("schema") != SCHEMA_NAME:
            raise ValueError(f"not a sequence-scaler file (schema {data.get('schema')!r}, expected {SCHEMA_NAME!r})")
        if data.get("version") != SCHEMA_VERSION or isinstance(data.get("version"), bool):
            raise ValueError(
                f"unsupported scaler version {data.get('version')!r}; this code reads version {SCHEMA_VERSION}"
            )
        required = ("feature_names", "target_column", "interval_seconds", "history_steps",
                    "horizon_steps", "channels", "fit")
        missing = [k for k in required if k not in data]
        if missing:
            raise ValueError(f"scaler file is missing keys: {missing}")

        names = data["feature_names"]
        if not isinstance(names, list) or not names or not all(isinstance(n, str) for n in names):
            raise ValueError("feature_names must be a non-empty list of strings")
        if len(set(names)) != len(names):
            raise ValueError("feature_names contains duplicates")
        target = data["target_column"]
        if not isinstance(target, str):
            raise ValueError("target_column must be a string")
        ints = {}
        for key in ("interval_seconds", "history_steps", "horizon_steps"):
            v = data[key]
            if isinstance(v, bool) or not isinstance(v, int) or v <= 0:
                raise ValueError(f"{key} must be a positive integer, got {v!r}")
            ints[key] = v

        raw = data["channels"]
        if not isinstance(raw, dict) or not raw:
            raise ValueError("channels must be a non-empty object")
        channels = []
        for name in [n for n in names if n in raw]:
            entry = raw[name]
            if name not in SCALED_COLUMNS:
                raise ValueError(f"channel {name!r} is not a scalable sensor channel {list(SCALED_COLUMNS)}")
            if not isinstance(entry, dict) or not all(k in entry for k in ("mean", "std", "scale", "zero_variance")):
                raise ValueError(f"channel {name!r} needs mean, std, scale and zero_variance")
            mean, std, scale, zero = entry["mean"], entry["std"], entry["scale"], entry["zero_variance"]
            if not (_is_number(mean) and _is_number(std) and _is_number(scale)) or not isinstance(zero, bool):
                raise ValueError(f"channel {name!r} has non-numeric statistics")
            if not (math.isfinite(mean) and math.isfinite(std) and math.isfinite(scale)):
                raise ValueError(f"channel {name!r} has non-finite statistics")
            if scale <= 0 or std < 0:
                raise ValueError(f"channel {name!r} needs scale > 0 and std >= 0")
            channels.append(ChannelStats(name, float(mean), float(std), float(scale), zero))
        unknown = sorted(set(raw) - set(names))
        if unknown:
            raise ValueError(f"channels {unknown} are not in feature_names")
        _check_target(tuple(names), target)
        if target not in {c.name for c in channels}:
            raise ValueError(f"no statistics stored for target_column {target!r}")

        fit = data["fit"]
        if not isinstance(fit, dict):
            raise ValueError("fit must be an object")
        try:
            info = FitInfo(
                experiments=tuple(str(e) for e in fit["experiments"]),
                synthetic_experiments=tuple(str(e) for e in fit["synthetic_experiments"]),
                n_windows=int(fit["n_windows"]),
                n_window_samples=int(fit["n_window_samples"]),
                n_observations=int(fit["n_observations"]),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(f"invalid fit information: {exc}") from exc
        return cls(
            feature_names=tuple(names),
            target_column=target,
            interval_seconds=ints["interval_seconds"],
            history_steps=ints["history_steps"],
            horizon_steps=ints["horizon_steps"],
            channels=tuple(channels),
            fit_info=info,
        )

    def save(self, path) -> Path:
        """Write the scaler as JSON (parent folders are created). Returns the path."""
        path = Path(path)
        text = json.dumps(self.to_dict(), indent=2, allow_nan=False)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text + "\n", encoding="utf-8")
        return path

    @classmethod
    def load(cls, path) -> "SequenceScaler":
        """Read a scaler written by `save`; rejects invalid or incompatible files."""
        path = Path(path)
        try:
            data = json.loads(path.read_text(encoding="utf-8"), parse_constant=_reject_constant)
        except json.JSONDecodeError as exc:
            raise ValueError(f"{path} is not valid JSON: {exc}") from exc
        return cls.from_dict(data)


def _reject_constant(token):
    raise ValueError(f"scaler file contains the non-finite constant {token}")