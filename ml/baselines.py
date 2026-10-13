"""Simple forecasting baselines and regression metrics (Step 4A).

Baselines (no learning, no randomness)
--------------------------------------
* persistence   - predict, for every window, the target value at the forecast origin
                  (`SequenceSet.target_at_origin`). "Nothing changes over the horizon."
* training_mean - predict one constant: the mean of the TRAINING targets (`SequenceSet.y` of the
                  training set). It is fitted by `fit_training_mean(train_set)` /
                  `fit_training_mean_from_split(split)`, which only ever see the training set.
                  Evaluating on experiments that were used for the mean raises an error unless
                  `allow_overlap_with_training=True` is passed explicitly.

The target is whatever `SequenceSet.target_column` says (currently mq135_raw, a RAW sensor value:
nothing here converts it to ppm, CO2 or AQI).

Units
-----
Metrics are always computed and reported in ORIGINAL sensor units.
* Without a scaler, sequences are taken to be in original units already.
* With `scaler=...` the sequences are taken to be SCALED by that same ml.scaling.SequenceScaler;
  `y`, `target_at_origin` and the mean are converted back with `scaler.inverse_transform_y`.
  The scaler is only read (checked with `scaler.check_compatible`), never fitted or changed.
A SequenceSet has no flag saying whether it is scaled, so passing the right `scaler` (or none)
is the caller's responsibility.

Metrics
-------
MAE, RMSE and R^2 (`regression_metrics`). R^2 = 1 - SS_res / SS_tot is UNDEFINED when the target
is constant (SS_tot = 0, which also covers a single window): the result then has `r2=None` and an
explanatory `r2_note`; it is never NaN, inf or an arbitrary 0 / 1.
`evaluate_*` report pooled metrics over all windows ("overall", every window weighs the same) and
metrics per experiment (experiment ids stay attached), plus the macro average of the
per-experiment MAE / RMSE (every experiment weighs the same). Experiments are listed
chronologically (first origin time, then id).

Data origin
-----------
Every prediction set, evaluation and training mean is labelled "real", "synthetic" or "mixed"
from the experiment ids (ids starting with ml.preprocess.SYNTHETIC_PREFIX are synthetic).
Only an evaluation whose data is entirely real has `reportable_as_real_world == True`; any other
summary is explicitly marked "NOT real-world performance". The training origin is recorded too.

Validation
----------
Clear ValueError / TypeError for: wrong types, empty sequence sets, misaligned arrays,
timezone-naive times, non-finite values, `target_at_origin` that disagrees with the last input
step of the target channel, metadata that differs between the training mean and the evaluated
set (target_column, interval, history, horizon), a scaler that does not match, and an invalid
training set. Inputs are never modified.

Not here: torch, model training, plotting, file I/O, scaling/fitting (use ml.scaling), splitting
(use ml.splits).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from ml.preprocess import SYNTHETIC_PREFIX
from ml.scaling import SequenceScaler
from ml.sequences import SequenceSet
from ml.splits import SplitResult

PERSISTENCE = "persistence"
TRAINING_MEAN = "training_mean"
EVALUATION_SETS = ("validation", "test")

ORIGIN_REAL = "real"
ORIGIN_SYNTHETIC = "synthetic"
ORIGIN_MIXED = "mixed"

_CONSTANT_TARGET_NOTE = "undefined: the target is constant (SS_tot = 0)"
_UNIT_NOTE = "original sensor units"


# ---------------------------------------------------------------- data origin
def data_origin(experiment_ids) -> str:
    """'real', 'synthetic' or 'mixed' for a collection of experiment ids."""
    ids = [str(e) for e in np.asarray(experiment_ids).ravel()]
    if not ids:
        raise ValueError("cannot determine the data origin of an empty set of experiments")
    flags = {e.startswith(SYNTHETIC_PREFIX) for e in ids}
    if flags == {True}:
        return ORIGIN_SYNTHETIC
    if flags == {False}:
        return ORIGIN_REAL
    return ORIGIN_MIXED


def _origin_label(origin: str) -> str:
    if origin == ORIGIN_REAL:
        return "real data"
    return f"{origin.upper()} data - NOT real-world performance (pipeline testing only)"


# ---------------------------------------------------------------- result types
@dataclass(frozen=True)
class RegressionMetrics:
    n_windows: int
    mae: float
    rmse: float
    r2: float | None  # None when undefined (constant target)
    r2_note: str | None = None


@dataclass(frozen=True)
class ExperimentMetrics:
    experiment_id: str
    data_origin: str
    metrics: RegressionMetrics


@dataclass(frozen=True)
class TrainingMean:
    """The constant predicted by the training-mean baseline, and where it came from."""

    mean: float  # original units
    target_column: str
    interval_seconds: int
    history_steps: int
    horizon_steps: int
    experiments: tuple  # training experiment ids (sorted)
    n_windows: int
    data_origin: str  # origin of the training data


@dataclass(frozen=True, eq=False)
class BaselinePredictions:
    """Predictions and targets in original units, aligned with experiment ids and times."""

    baseline: str
    set_name: str
    target_column: str
    units: str  # always "original"
    y_true: np.ndarray  # (N,) float64
    y_pred: np.ndarray  # (N,) float64
    experiment_ids: np.ndarray  # (N,) object
    origin_times: object  # (N,) tz-aware DatetimeIndex
    target_times: object  # (N,) tz-aware DatetimeIndex
    data_origin: str  # origin of the evaluated data
    training_origin: str | None  # origin of the data behind the mean (None for persistence)

    def __len__(self) -> int:
        return int(self.y_true.shape[0])


@dataclass(frozen=True, eq=False)
class BaselineEvaluation:
    baseline: str
    set_name: str
    target_column: str
    units: str
    data_origin: str
    training_origin: str | None
    overall: RegressionMetrics
    per_experiment: tuple  # ExperimentMetrics, chronological
    macro_mae: float  # mean of the per-experiment MAEs
    macro_rmse: float  # mean of the per-experiment RMSEs
    predictions: BaselinePredictions

    @property
    def reportable_as_real_world(self) -> bool:
        """True only when every evaluated experiment is real."""
        return self.data_origin == ORIGIN_REAL

    def summary(self) -> str:
        o = self.overall
        r2 = f"{o.r2:.4f}" if o.r2 is not None else f"n/a ({o.r2_note})"
        head = (
            f"[{self.baseline}] {self.set_name} set, target {self.target_column} ({_UNIT_NOTE}), "
            f"{_origin_label(self.data_origin)}"
        )
        lines = [
            head,
            f"  overall: n={o.n_windows}  MAE={o.mae:.4f}  RMSE={o.rmse:.4f}  R2={r2}",
            f"  macro over {len(self.per_experiment)} experiment(s): MAE={self.macro_mae:.4f}  RMSE={self.macro_rmse:.4f}",
        ]
        for e in self.per_experiment:
            m = e.metrics
            r = f"{m.r2:.4f}" if m.r2 is not None else "n/a"
            lines.append(
                f"  {e.experiment_id} [{e.data_origin}]: n={m.n_windows}  MAE={m.mae:.4f}  RMSE={m.rmse:.4f}  R2={r}"
            )
        if self.training_origin is not None:
            lines.append(f"  mean fitted on {self.training_origin} training data")
        return "\n".join(lines)


@dataclass(frozen=True, eq=False)
class BaselineReport:
    training_mean: TrainingMean
    evaluations: tuple  # BaselineEvaluation, in the order sets x (persistence, training_mean)

    def get(self, baseline: str, set_name: str) -> BaselineEvaluation:
        for e in self.evaluations:
            if e.baseline == baseline and e.set_name == set_name:
                return e
        raise KeyError(f"no evaluation for baseline {baseline!r} on set {set_name!r}")

    def summary(self) -> str:
        tm = self.training_mean
        lines = [
            f"training mean of {tm.target_column}: {tm.mean:.6g} ({_UNIT_NOTE}), from "
            f"{len(tm.experiments)} training experiment(s), {tm.n_windows} windows, {tm.data_origin} data"
        ]
        lines += [e.summary() for e in self.evaluations]
        return "\n".join(lines)


# ---------------------------------------------------------------- validation helpers
def _check_sequences(seq, role: str) -> None:
    if not isinstance(seq, SequenceSet):
        raise TypeError(f"{role} must be a SequenceSet, got {type(seq).__name__}")
    n = len(seq)
    if n == 0:
        raise ValueError(f"{role} is empty (no sequences)")
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
    if getattr(seq.origin_times, "tz", None) is None or getattr(seq.target_times, "tz", None) is None:
        raise ValueError(f"{role}: origin_times and target_times must be timezone-aware")
    for name in ("y", "target_at_origin"):
        if not np.all(np.isfinite(np.asarray(getattr(seq, name), dtype=np.float64))):
            raise ValueError(f"{role}: {name} contains NaN or infinite values")
    X = np.asarray(seq.X)
    if X.ndim != 3 or X.shape[0] != n:
        raise ValueError(f"{role}: X must have shape (N, T, F) with N={n}, got {X.shape}")
    if not np.all(np.isfinite(X)):
        raise ValueError(f"{role}: X contains NaN or infinite values")
    if seq.target_column in seq.feature_names:
        j = list(seq.feature_names).index(seq.target_column)
        if not np.allclose(X[:, -1, j], seq.target_at_origin, rtol=1e-5, atol=1e-6):
            raise ValueError(
                f"{role}: target_at_origin does not match the last input step of "
                f"{seq.target_column!r}; the arrays are inconsistent"
            )


def _check_scaler(seq: SequenceSet, scaler, role: str) -> None:
    if scaler is None:
        return
    if not isinstance(scaler, SequenceScaler):
        raise TypeError(f"scaler must be a SequenceScaler or None, got {type(scaler).__name__}")
    try:
        scaler.check_compatible(seq)
    except ValueError as exc:
        raise ValueError(f"{role}: {exc}") from exc


def _original_units(seq: SequenceSet, scaler):
    """(y, target_at_origin) as float64 in original sensor units. Nothing is modified."""
    y = np.asarray(seq.y, dtype=np.float64)
    o = np.asarray(seq.target_at_origin, dtype=np.float64)
    if scaler is None:
        return y.copy(), o.copy()
    y_orig = np.asarray(scaler.inverse_transform_y(seq.y), dtype=np.float64)
    o_orig = np.asarray(scaler.inverse_transform_y(seq.target_at_origin), dtype=np.float64)
    return y_orig, o_orig


def _chronological_experiments(experiment_ids, origin_times) -> list:
    ids = np.asarray(experiment_ids).astype(str)
    first = {}
    for e, t in zip(ids, origin_times):
        if e not in first or t < first[e]:
            first[e] = t
    return sorted(first, key=lambda e: (first[e], e))


# ---------------------------------------------------------------- metrics
def regression_metrics(y_true, y_pred) -> RegressionMetrics:
    """MAE, RMSE and R^2 of `y_pred` against `y_true` (same units, 1-D, finite, non-empty)."""
    t = np.asarray(y_true, dtype=np.float64)
    p = np.asarray(y_pred, dtype=np.float64)
    if t.ndim != 1 or p.ndim != 1:
        raise ValueError(f"y_true and y_pred must be 1-D, got shapes {t.shape} and {p.shape}")
    if t.shape != p.shape:
        raise ValueError(f"y_true and y_pred must have the same length, got {t.shape[0]} and {p.shape[0]}")
    if t.size == 0:
        raise ValueError("cannot compute metrics on empty arrays")
    if not (np.all(np.isfinite(t)) and np.all(np.isfinite(p))):
        raise ValueError("y_true and y_pred must be finite (NaN or inf found)")
    err = p - t
    mae = float(np.mean(np.abs(err)))
    rmse = float(math.sqrt(np.mean(err * err)))
    mean_t = float(t.mean())
    constant = float(np.ptp(t)) <= 1e-12 * max(1.0, abs(mean_t))
    if constant:
        return RegressionMetrics(int(t.size), mae, rmse, None, _CONSTANT_TARGET_NOTE)
    ss_res = float(np.sum(err * err))
    ss_tot = float(np.sum((t - mean_t) ** 2))
    return RegressionMetrics(int(t.size), mae, rmse, 1.0 - ss_res / ss_tot, None)


# ---------------------------------------------------------------- training mean
def fit_training_mean(train: SequenceSet, *, scaler: SequenceScaler | None = None) -> TrainingMean:
    """Mean of the TRAINING targets, in original units. Pass only the training set.

    Each window has its own target reading (distinct windows have distinct target times), so no
    de-duplication is needed. With `scaler`, `train` is taken to be scaled and is converted back.
    """
    _check_sequences(train, "training data")
    _check_scaler(train, scaler, "training data")
    y, _ = _original_units(train, scaler)
    ids = np.asarray(train.experiment_ids).astype(str)
    return TrainingMean(
        mean=float(y.mean()),
        target_column=str(train.target_column),
        interval_seconds=int(train.interval_seconds),
        history_steps=int(train.history_steps),
        horizon_steps=int(train.horizon_steps),
        experiments=tuple(sorted(set(ids))),
        n_windows=len(train),
        data_origin=data_origin(ids),
    )


def fit_training_mean_from_split(split: SplitResult, *, scaler: SequenceScaler | None = None) -> TrainingMean:
    """Training mean from `split.train` only; validation and test are never read."""
    if not isinstance(split, SplitResult):
        raise TypeError(f"expected an ml.splits.SplitResult, got {type(split).__name__}")
    return fit_training_mean(split.train, scaler=scaler)


def _check_model_matches(model: TrainingMean, seq: SequenceSet) -> None:
    problems = []
    if seq.target_column != model.target_column:
        problems.append(f"target_column {seq.target_column!r} != training {model.target_column!r}")
    if int(seq.interval_seconds) != model.interval_seconds:
        problems.append(f"interval_seconds {seq.interval_seconds} != training {model.interval_seconds}")
    if int(seq.history_steps) != model.history_steps:
        problems.append(f"history_steps {seq.history_steps} != training {model.history_steps}")
    if int(seq.horizon_steps) != model.horizon_steps:
        problems.append(f"horizon_steps {seq.horizon_steps} != training {model.horizon_steps}")
    if problems:
        raise ValueError("sequences do not match the training mean: " + "; ".join(problems))


# ---------------------------------------------------------------- predictions
def _make_predictions(baseline, set_name, seq, y_true, y_pred, training_origin) -> BaselinePredictions:
    if not np.all(np.isfinite(y_pred)):
        raise ValueError(f"{baseline} produced non-finite predictions")
    return BaselinePredictions(
        baseline=baseline,
        set_name=set_name,
        target_column=str(seq.target_column),
        units="original",
        y_true=y_true,
        y_pred=y_pred,
        experiment_ids=np.array(seq.experiment_ids, dtype=object, copy=True),
        origin_times=seq.origin_times.copy(),
        target_times=seq.target_times.copy(),
        data_origin=data_origin(seq.experiment_ids),
        training_origin=training_origin,
    )


def predict_persistence(
    seq: SequenceSet, *, scaler: SequenceScaler | None = None, set_name: str = "evaluation"
) -> BaselinePredictions:
    """Persistence: predict `target_at_origin` for every window (targets in original units)."""
    _check_sequences(seq, f"{set_name} data")
    _check_scaler(seq, scaler, f"{set_name} data")
    y_true, at_origin = _original_units(seq, scaler)
    return _make_predictions(PERSISTENCE, set_name, seq, y_true, at_origin, None)


def predict_training_mean(
    model: TrainingMean,
    seq: SequenceSet,
    *,
    scaler: SequenceScaler | None = None,
    set_name: str = "evaluation",
    allow_overlap_with_training: bool = False,
) -> BaselinePredictions:
    """Predict the training mean for every window of `seq` (targets in original units)."""
    if not isinstance(model, TrainingMean):
        raise TypeError(f"model must be a TrainingMean from fit_training_mean, got {type(model).__name__}")
    if not math.isfinite(model.mean):
        raise ValueError("the training mean is not finite")
    _check_sequences(seq, f"{set_name} data")
    _check_scaler(seq, scaler, f"{set_name} data")
    _check_model_matches(model, seq)
    shared = sorted(set(np.asarray(seq.experiment_ids).astype(str)) & set(model.experiments))
    if shared and not allow_overlap_with_training:
        raise ValueError(
            f"{set_name} data contains experiments that were used to compute the training mean "
            f"({shared}); that is not a held-out evaluation. Pass allow_overlap_with_training=True "
            f"only for a deliberate sanity check."
        )
    y_true, _ = _original_units(seq, scaler)
    y_pred = np.full(y_true.shape, model.mean, dtype=np.float64)
    return _make_predictions(TRAINING_MEAN, set_name, seq, y_true, y_pred, model.data_origin)


# ---------------------------------------------------------------- evaluation
def score_predictions(pred: BaselinePredictions) -> BaselineEvaluation:
    """Overall and per-experiment metrics for a BaselinePredictions (original units)."""
    if not isinstance(pred, BaselinePredictions):
        raise TypeError(f"expected BaselinePredictions, got {type(pred).__name__}")
    if len(pred) == 0:
        raise ValueError("cannot evaluate empty predictions")
    overall = regression_metrics(pred.y_true, pred.y_pred)
    ids = np.asarray(pred.experiment_ids).astype(str)
    per_experiment = []
    for e in _chronological_experiments(ids, pred.origin_times):
        m = ids == e
        per_experiment.append(
            ExperimentMetrics(
                experiment_id=e,
                data_origin=data_origin(ids[m]),
                metrics=regression_metrics(pred.y_true[m], pred.y_pred[m]),
            )
        )
    return BaselineEvaluation(
        baseline=pred.baseline,
        set_name=pred.set_name,
        target_column=pred.target_column,
        units=pred.units,
        data_origin=pred.data_origin,
        training_origin=pred.training_origin,
        overall=overall,
        per_experiment=tuple(per_experiment),
        macro_mae=float(np.mean([e.metrics.mae for e in per_experiment])),
        macro_rmse=float(np.mean([e.metrics.rmse for e in per_experiment])),
        predictions=pred,
    )


def evaluate_persistence(
    seq: SequenceSet, *, scaler: SequenceScaler | None = None, set_name: str = "evaluation"
) -> BaselineEvaluation:
    return score_predictions(predict_persistence(seq, scaler=scaler, set_name=set_name))


def evaluate_training_mean(
    model: TrainingMean,
    seq: SequenceSet,
    *,
    scaler: SequenceScaler | None = None,
    set_name: str = "evaluation",
    allow_overlap_with_training: bool = False,
) -> BaselineEvaluation:
    return score_predictions(
        predict_training_mean(
            model, seq, scaler=scaler, set_name=set_name,
            allow_overlap_with_training=allow_overlap_with_training,
        )
    )


def evaluate_baselines(
    split: SplitResult,
    *,
    scaler: SequenceScaler | None = None,
    sets: tuple = ("validation",),
) -> BaselineReport:
    """Fit the training mean on `split.train` and evaluate both baselines on the chosen sets.

    `sets` is a subset of ("validation", "test"); it defaults to validation only so that the test
    set is only looked at when you ask for it. If `scaler` is given, the split's sequences are
    taken to be scaled by it. Results keep their data-origin labels; check
    `evaluation.reportable_as_real_world` before quoting any number as real-world performance.
    """
    if not isinstance(split, SplitResult):
        raise TypeError(f"expected an ml.splits.SplitResult, got {type(split).__name__}")
    sets = tuple(sets)
    if not sets:
        raise ValueError("sets must name at least one of " + ", ".join(EVALUATION_SETS))
    unknown = [s for s in sets if s not in EVALUATION_SETS]
    if unknown:
        raise ValueError(f"unknown evaluation set(s) {unknown}; choose from {list(EVALUATION_SETS)}")
    if len(set(sets)) != len(sets):
        raise ValueError(f"duplicate evaluation sets in {list(sets)}")
    model = fit_training_mean_from_split(split, scaler=scaler)
    evaluations = []
    for name in sets:
        seq = getattr(split, name)
        evaluations.append(evaluate_persistence(seq, scaler=scaler, set_name=name))
        evaluations.append(evaluate_training_mean(model, seq, scaler=scaler, set_name=name))
    return BaselineReport(training_mean=model, evaluations=tuple(evaluations))