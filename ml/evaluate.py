"""Held-out TEST evaluation of a saved forecasting model (Step 6).

What it does
------------
`evaluate_saved_model(split, model_dir)` loads a model written by `ml.train.train_model` (via the
existing `ml.train.load_trained_model`) and scores it on `split.test` ONLY, next to the two
existing baselines from `ml.baselines`:

* the recurrent model (GRU / LSTM) - predictions come from the saved weights;
* persistence    - `ml.baselines.evaluate_persistence`;
* training mean  - `ml.baselines.fit_training_mean(split.train)` + `evaluate_training_mean`.

Metrics (MAE, RMSE, and R^2 only when it is defined) are computed by the existing
`ml.baselines.regression_metrics` / `score_predictions`, pooled and per experiment, in ORIGINAL
sensor units: the model works in scaled units, its predictions are converted back with the SAVED
scaler's `inverse_transform_y`, and that conversion is cross-checked against the unscaled targets.

The target is the raw sensor response of the MQ135 gas sensor as recorded (`mq135_raw`). It is NOT
ppm, NOT a CO2 concentration and NOT an AQI, and nothing here converts it.

What it will not do
-------------------
* Fit or refit a scaler, train, select a model, early-stop or tune anything. The only scaler used
  is the one saved with the model (fitted on the training split during training). Nothing in this
  module changes weights or hyper-parameters, and nothing is written unless the command-line
  interface is given `--output-json`.
* Treat synthetic data as a genuine test set. If any test experiment is synthetic (id starting with
  ml.preprocess.SYNTHETIC_PREFIX) a ValueError is raised.
* Run on a test set that the saved run says was used during training (`test_set_used` must be
  False), or on experiments that differ from the ones recorded in the run.

Inputs and units
----------------
`split` is an `ml.splits.SplitResult` in ORIGINAL (unscaled) units, exactly what
`ml.splits.split_by_experiment` returns, built with the same sequence settings as the training run.
The saved metadata is checked against it: experiment ids of train / validation / test (also the
test ids declared in `split.report`), feature names, target column, sampling interval, history and
horizon, and the training data origin. Scaler/metadata compatibility is checked by
`load_trained_model` and `SequenceScaler.check_compatible`.

Reading the report
------------------
`EvaluationReport` keeps the experiment ids and the data origin ("real" / "synthetic" / "mixed")
of the test data and of the training data. Numbers describe THIS model on THIS test split only.
If the training data was not purely real, that is stated in the summary. No claim about real-world
performance should be made unless the data really is real and the split is meaningful (several
independent experiments); the summary lists these caveats.

Running it
----------
    python -m ml.evaluate --clean-csv data/processed/clean_<file>.csv --model-dir models/gru_run1

The split is rebuilt from the CSV with the history / horizon / interval / stride stored in the
model's metadata; pass the same --train-fraction / --val-fraction / --test-fraction /
--purge-seconds / --exclude-imputed that were used for training (the saved experiment ids are
compared, so a different split is rejected). PyTorch is needed to run a model; importing this
module never requires it.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from ml.baselines import (
    BaselineEvaluation,
    BaselinePredictions,
    RegressionMetrics,
    data_origin,
    evaluate_persistence,
    evaluate_training_mean,
    fit_training_mean,
    score_predictions,
)
from ml.dataset import SequenceDataset, require_torch, validate_sequence_set
from ml.preprocess import SYNTHETIC_PREFIX
from ml.splits import SplitResult
from ml.train import (
    METADATA_FILE,
    TARGET_DESCRIPTION,
    LoadedModel,
    load_trained_model,
    predict_scaled,
)

SCHEMA_NAME = "airq.model_evaluation"
SCHEMA_VERSION = 1
TEST_SET = "test"
PERSISTENCE_NAME = "persistence"
TRAINING_MEAN_NAME = "training_mean"
_MQ135 = "mq135_raw"
MIN_RECOMMENDED_TEST_EXPERIMENTS = 3


# ---------------------------------------------------------------- report types
@dataclass(frozen=True, eq=False)
class EvaluationReport:
    """Test-set results of one saved model and the two baselines (all in original sensor units)."""

    model_dir: Path
    model_type: str
    target_column: str
    target_description: str
    units: str
    test_experiments: tuple  # experiment ids of the evaluated test data (chronological)
    train_experiments: tuple
    validation_experiments: tuple
    test_origin: str  # always "real" (synthetic test data is rejected)
    training_origin: str  # "real" or "mixed" (synthetic training data was explicitly allowed)
    interval_seconds: int
    history_steps: int
    horizon_steps: int
    n_test_windows: int
    model: BaselineEvaluation  # the saved recurrent model, scored with the same code as the baselines
    persistence: BaselineEvaluation
    training_mean: BaselineEvaluation
    training_mean_value: float  # the constant predicted by the training-mean baseline (original units)
    caveats: tuple

    def evaluations(self) -> tuple:
        return (self.model, self.persistence, self.training_mean)

    def mae_skill(self, baseline: str) -> float | None:
        """(MAE_baseline - MAE_model) / MAE_baseline; > 0 means the model has the lower MAE.

        None when the baseline MAE is zero (the ratio is undefined).
        """
        ref = self._baseline(baseline).overall.mae
        if ref == 0.0:
            return None
        return (ref - self.model.overall.mae) / ref

    def rmse_skill(self, baseline: str) -> float | None:
        ref = self._baseline(baseline).overall.rmse
        if ref == 0.0:
            return None
        return (ref - self.model.overall.rmse) / ref

    def _baseline(self, name: str) -> BaselineEvaluation:
        if name == PERSISTENCE_NAME:
            return self.persistence
        if name == TRAINING_MEAN_NAME:
            return self.training_mean
        raise KeyError(f"unknown baseline {name!r}; choose {PERSISTENCE_NAME!r} or {TRAINING_MEAN_NAME!r}")

    def summary(self) -> str:
        lines = [
            f"Test-set evaluation of the saved {self.model_type.upper()} in {self.model_dir}",
            f"target: {self.target_column} - {self.target_description}",
            f"units: {self.units}; horizon {self.horizon_steps * self.interval_seconds} s, "
            f"history {self.history_steps * self.interval_seconds} s",
            f"test data: {self.test_origin}, {len(self.test_experiments)} experiment(s) "
            f"{list(self.test_experiments)}, {self.n_test_windows} windows",
            f"training data: {self.training_origin}, experiments {list(self.train_experiments)}",
            f"training-mean baseline constant: {self.training_mean_value:.6g}",
        ]
        for ev in self.evaluations():
            lines.append(ev.summary())
        for name in (PERSISTENCE_NAME, TRAINING_MEAN_NAME):
            s = self.mae_skill(name)
            r = self.rmse_skill(name)
            lines.append(
                f"model vs {name}: MAE change {_pct(s)}, RMSE change {_pct(r)} "
                "(positive = model error is lower; this test split only)"
            )
        for c in self.caveats:
            lines.append(f"caveat: {c}")
        return "\n".join(lines)

    def to_dict(self) -> dict:
        """JSON-serialisable form (NaN / inf never appear; undefined R^2 is null with a note)."""
        return {
            "schema": SCHEMA_NAME,
            "version": SCHEMA_VERSION,
            "model": {"type": self.model_type, "directory": str(self.model_dir)},
            "target": {"column": self.target_column, "description": self.target_description, "units": self.units},
            "data": {
                "interval_seconds": self.interval_seconds,
                "history_steps": self.history_steps,
                "horizon_steps": self.horizon_steps,
                "n_test_windows": self.n_test_windows,
            },
            "experiments": {
                "train": list(self.train_experiments),
                "validation": list(self.validation_experiments),
                "test": list(self.test_experiments),
            },
            "data_origin": {"test": self.test_origin, "training": self.training_origin},
            "training_mean_value": float(self.training_mean_value),
            "results": {
                "model": _evaluation_dict(self.model),
                PERSISTENCE_NAME: _evaluation_dict(self.persistence),
                TRAINING_MEAN_NAME: _evaluation_dict(self.training_mean),
            },
            "model_vs_baselines": {
                name: {"mae_skill": self.mae_skill(name), "rmse_skill": self.rmse_skill(name)}
                for name in (PERSISTENCE_NAME, TRAINING_MEAN_NAME)
            },
            "caveats": list(self.caveats),
        }


def _pct(value) -> str:
    return "n/a (baseline error is 0)" if value is None else f"{100.0 * value:+.2f}%"


def _metrics_dict(m: RegressionMetrics) -> dict:
    return {"n_windows": m.n_windows, "mae": m.mae, "rmse": m.rmse, "r2": m.r2, "r2_note": m.r2_note}


def _evaluation_dict(ev: BaselineEvaluation) -> dict:
    return {
        "name": ev.baseline,
        "data_origin": ev.data_origin,
        "overall": _metrics_dict(ev.overall),
        "macro_mae": ev.macro_mae,
        "macro_rmse": ev.macro_rmse,
        "per_experiment": [
            {"experiment_id": e.experiment_id, "data_origin": e.data_origin, **_metrics_dict(e.metrics)}
            for e in ev.per_experiment
        ],
    }


# ---------------------------------------------------------------- validation helpers
_REQUIRED_RUN_ENTRIES = {
    "experiments": ("train", "validation", "test"),
    "data_origin": ("training",),
    "training": ("test_set_used",),
    "model": ("type",),
}


def _check_run_metadata(meta: dict, meta_path) -> None:
    """ValueError naming every missing section / key the evaluation needs (beyond what load_trained_model checks)."""
    problems = []
    for section, keys in _REQUIRED_RUN_ENTRIES.items():
        value = meta.get(section)
        if not isinstance(value, dict):
            problems.append(f"section '{section}'")
            continue
        missing = [k for k in keys if k not in value]
        if missing:
            problems.append(f"{section}: {missing}")
    if problems:
        raise ValueError(f"{meta_path} is missing entries needed for evaluation: {'; '.join(problems)}")
    for key in ("train", "validation", "test"):
        ids = meta["experiments"][key]
        if not isinstance(ids, list) or not all(isinstance(e, str) for e in ids) or not ids:
            raise ValueError(f"{meta_path}: experiments.{key} must be a non-empty list of experiment ids")
    if meta["training"]["test_set_used"] is not False:
        raise ValueError(
            f"{meta_path} does not state that the test set was unused during training "
            f"(training.test_set_used = {meta['training']['test_set_used']!r}); refusing to call it a held-out evaluation"
        )


def _ids(seq) -> list:
    return sorted(set(str(e) for e in np.asarray(seq.experiment_ids).ravel()))


def _chronological(seq) -> tuple:
    first = {}
    for e, t in zip(np.asarray(seq.experiment_ids).astype(str), seq.origin_times):
        e = str(e)
        if e not in first or t < first[e]:
            first[e] = t
    return tuple(sorted(first, key=lambda e: (first[e], e)))


def _check_experiment_ids(meta: dict, split: SplitResult) -> None:
    problems = []
    for name, seq in (("train", split.train), ("validation", split.validation), ("test", split.test)):
        got, saved = _ids(seq), sorted(meta["experiments"][name])
        if got != saved:
            problems.append(f"{name}: split has {got}, saved run has {saved}")
    declared = sorted(str(e) for e in split.report.test.experiment_ids)
    if declared != _ids(split.test):
        problems.append(f"test: split.report declares {declared} but split.test contains {_ids(split.test)}")
    if problems:
        raise ValueError(
            "the split does not match the experiments recorded for this model (it must be the same "
            "split that was used for training): " + "; ".join(problems)
        )


def _check_data_matches_metadata(meta: dict, seq, role: str) -> None:
    d = meta["data"]
    problems = []
    if list(seq.feature_names) != list(d["feature_names"]):
        problems.append(f"feature_names {list(seq.feature_names)} != saved {list(d['feature_names'])}")
    if seq.target_column != d["target_column"]:
        problems.append(f"target_column {seq.target_column!r} != saved {d['target_column']!r}")
    for key in ("interval_seconds", "history_steps", "horizon_steps"):
        if int(getattr(seq, key)) != int(d[key]):
            problems.append(f"{key} {getattr(seq, key)} != saved {d[key]}")
    if problems:
        raise ValueError(f"{role} is not compatible with the saved model: " + "; ".join(problems))


# ---------------------------------------------------------------- evaluation
def evaluate_loaded_model(
    loaded: LoadedModel,
    split: SplitResult,
    *,
    model_dir="<loaded model>",
    batch_size: int = 256,
    device: str = "cpu",
) -> EvaluationReport:
    """Score an already loaded model (see `evaluate_saved_model`). Reads `split.test` only for scoring."""
    require_torch()
    if isinstance(batch_size, bool) or not isinstance(batch_size, (int, np.integer)) or batch_size < 1:
        raise ValueError(f"batch_size must be a positive integer, got {batch_size!r}")
    if not isinstance(loaded, LoadedModel):
        raise TypeError(f"loaded must be an ml.train.LoadedModel, got {type(loaded).__name__}")
    if not isinstance(split, SplitResult):
        raise TypeError(f"split must be an ml.splits.SplitResult, got {type(split).__name__}")
    meta = loaded.metadata
    _check_run_metadata(meta, Path(str(model_dir)) / METADATA_FILE)

    validate_sequence_set(split.train, "training data")
    validate_sequence_set(split.test, "test data")

    # Synthetic data is never a genuine test set; refuse before doing any work.
    test_ids = _ids(split.test)
    synthetic = [e for e in test_ids if e.startswith(SYNTHETIC_PREFIX)]
    if synthetic:
        raise ValueError(
            f"test data contains synthetic experiments {synthetic}; synthetic data cannot serve as a "
            "genuine test set and results on it must not be presented as real-world performance"
        )
    test_origin = data_origin(test_ids)  # "real" here

    _check_experiment_ids(meta, split)
    _check_data_matches_metadata(meta, split.test, "test data")
    _check_data_matches_metadata(meta, split.train, "training data")
    train_origin = data_origin(_ids(split.train))
    if train_origin != meta["data_origin"]["training"]:
        raise ValueError(
            f"training data origin is {train_origin!r} but the saved run says {meta['data_origin']['training']!r}"
        )
    try:
        loaded.scaler.check_compatible(split.test)
    except ValueError as exc:
        raise ValueError(f"test data is not compatible with the saved scaler: {exc}") from exc

    # Model predictions: scale with the SAVED scaler (transform only, never fitted), predict, convert back.
    test_scaled = loaded.scaler.transform(split.test)
    ds = SequenceDataset(test_scaled, role="test data")
    pred_scaled = predict_scaled(loaded.model, ds, batch_size=int(batch_size), device=device)
    y_pred = np.asarray(loaded.scaler.inverse_transform_y(pred_scaled), dtype=np.float64)
    y_true = np.asarray(split.test.y, dtype=np.float64)
    y_roundtrip = np.asarray(loaded.scaler.inverse_transform_y(ds.y), dtype=np.float64)
    if not np.allclose(y_roundtrip, y_true, rtol=1e-4, atol=1e-3):
        raise RuntimeError("inverse target scaling does not reproduce the original test targets; refusing to report metrics")
    if not np.all(np.isfinite(y_pred)):
        raise RuntimeError("the model produced non-finite predictions on the test data")

    model_type = str(meta["model"]["type"])
    model_pred = BaselinePredictions(
        baseline=model_type,
        set_name=TEST_SET,
        target_column=str(split.test.target_column),
        units="original",
        y_true=y_true.copy(),
        y_pred=y_pred,
        experiment_ids=np.array(split.test.experiment_ids, dtype=object, copy=True),
        origin_times=split.test.origin_times.copy(),
        target_times=split.test.target_times.copy(),
        data_origin=test_origin,
        training_origin=train_origin,
    )
    model_eval = score_predictions(model_pred)

    # Baselines on the same, unscaled test windows; the training mean sees split.train only.
    persistence = evaluate_persistence(split.test, set_name=TEST_SET)
    mean_model = fit_training_mean(split.train)
    mean_eval = evaluate_training_mean(mean_model, split.test, set_name=TEST_SET)

    target = str(split.test.target_column)
    caveats = []
    if train_origin != "real":
        caveats.append(
            f"the model was trained with {train_origin} (synthetic) data; the test data is real, but the "
            "result describes a model that saw synthetic training data"
        )
    if len(test_ids) < MIN_RECOMMENDED_TEST_EXPERIMENTS:
        caveats.append(
            f"only {len(test_ids)} test experiment(s); error estimates from so few independent experiments are very uncertain"
        )
    caveats.append(
        f"{target} is a raw, uncalibrated sensor response, not ppm, CO2 concentration or AQI; "
        "numbers are in raw sensor units for this device and these experiments only"
    )

    return EvaluationReport(
        model_dir=Path(str(model_dir)),
        model_type=model_type,
        target_column=target,
        target_description=TARGET_DESCRIPTION if target == _MQ135 else f"{target} as recorded (units of the recorded column)",
        units="original sensor units",
        test_experiments=_chronological(split.test),
        train_experiments=tuple(_ids(split.train)),
        validation_experiments=tuple(_ids(split.validation)),
        test_origin=test_origin,
        training_origin=train_origin,
        interval_seconds=int(split.test.interval_seconds),
        history_steps=int(split.test.history_steps),
        horizon_steps=int(split.test.horizon_steps),
        n_test_windows=len(split.test),
        model=model_eval,
        persistence=persistence,
        training_mean=mean_eval,
        training_mean_value=float(mean_model.mean),
        caveats=tuple(caveats),
    )


def evaluate_saved_model(
    split: SplitResult, model_dir, *, batch_size: int = 256, device: str = "cpu"
) -> EvaluationReport:
    """Load the run in `model_dir` with `ml.train.load_trained_model` and evaluate it on `split.test`."""
    require_torch()
    loaded = load_trained_model(model_dir, device=device)
    return evaluate_loaded_model(loaded, split, model_dir=model_dir, batch_size=batch_size, device=device)


# ---------------------------------------------------------------- command line
def _parse_args(argv):
    p = argparse.ArgumentParser(
        prog="python -m ml.evaluate",
        description="Evaluate a saved GRU/LSTM on the held-out TEST split next to persistence and training-mean "
                    "baselines. The target is mq135_raw, a raw sensor response (not ppm/CO2/AQI). "
                    "Synthetic test data is rejected.",
    )
    p.add_argument("--clean-csv", required=True, help="cleaned CSV from `python -m ml.preprocess`")
    p.add_argument("--model-dir", required=True, help="directory written by `python -m ml.train`")
    p.add_argument("--output-json", default=None, help="optionally write the report to this JSON file")
    p.add_argument("--overwrite", action="store_true", help="replace --output-json if it exists")
    p.add_argument("--train-fraction", type=float, default=0.6)
    p.add_argument("--val-fraction", type=float, default=0.2)
    p.add_argument("--test-fraction", type=float, default=0.2)
    p.add_argument("--purge-seconds", type=float, default=0.0)
    p.add_argument("--exclude-imputed", action="store_true", help="use the same setting as for training")
    p.add_argument("--batch-size", type=int, default=256)
    p.add_argument("--device", choices=("cpu", "cuda"), default="cpu")
    return p.parse_args(argv)


def _write_report_json(report: EvaluationReport, path, overwrite: bool) -> Path:
    out = Path(path)
    if out.exists() and not overwrite:
        raise FileExistsError(f"{out} already exists; choose another --output-json or pass --overwrite")
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(out.name + ".tmp")
    try:
        tmp.write_text(json.dumps(report.to_dict(), indent=2, allow_nan=False) + "\n", encoding="utf-8")
        os.replace(tmp, out)
    finally:
        if tmp.exists():
            tmp.unlink()
    return out


def main(argv=None) -> int:
    args = _parse_args(argv)
    try:
        require_torch()
        from ml.preprocess import load_clean_csv
        from ml.sequences import build_sequences
        from ml.splits import split_by_experiment

        loaded = load_trained_model(args.model_dir, device=args.device)
        _check_run_metadata(loaded.metadata, Path(args.model_dir) / METADATA_FILE)
        d = loaded.metadata["data"]
        interval = int(d["interval_seconds"])
        stride_steps = int(d.get("stride_steps", 1))
        df = load_clean_csv(args.clean_csv)
        seq = build_sequences(
            df, f"{int(d['history_seconds'])}s", f"{int(d['horizon_seconds'])}s",
            stride=None if stride_steps == 1 else f"{stride_steps * interval}s",
            interval_seconds=interval, exclude_imputed=args.exclude_imputed,
        )
        split = split_by_experiment(
            seq, train_fraction=args.train_fraction, val_fraction=args.val_fraction,
            test_fraction=args.test_fraction, purge_seconds=args.purge_seconds,
        )
        report = evaluate_loaded_model(
            loaded, split, model_dir=args.model_dir, batch_size=args.batch_size, device=args.device
        )
        print(report.summary())
        if args.output_json:
            print(f"report written to {_write_report_json(report, args.output_json, args.overwrite)}")
    except (ImportError, ValueError, FileNotFoundError, FileExistsError, KeyError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
