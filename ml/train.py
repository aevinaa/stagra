"""Minimal, reproducible GRU / LSTM training for mq135_raw forecasting (Step 5B).

What it does
------------
`train_model(split, config, output_dir)` trains one recurrent regression model that maps a window
of sensor history (X, shape (T, F)) to the target value `horizon` later (y), using the existing
pipeline objects:

* `split` is an `ml.splits.SplitResult` (experiment-wise, chronological; no random window split).
* A `ml.scaling.SequenceScaler` is fitted on `split.train` ONLY, then applied (never refitted)
  to the validation set. The model works in scaled units; metrics for people are reported in
  original sensor units via `scaler.inverse_transform_y`.
* Training data is used for optimisation. Validation data is used for early stopping and for
  choosing the best epoch (lowest validation MSE in scaled units). The test set is NOT touched:
  its sequences are never read, scaled or evaluated here; only the experiment ids in
  `split.report` are copied into the metadata so the later evaluation step can verify that the
  held-out experiments are the same. Evaluating on the test set is the job of the next step,
  using `load_trained_model` below.
* The best model, its scaler and a metadata file are written to an explicit output directory
  (see "Output"). Nothing outside that directory is written, and existing artifacts are not
  overwritten unless `overwrite=True`.

Data-origin safeguards
----------------------
* Validation and test must be real: a synthetic experiment (id starting with
  ml.preprocess.SYNTHETIC_PREFIX) there raises an error. (ml.splits already guarantees it.)
* Synthetic experiments in the training set raise an error unless
  `allow_synthetic_in_training=True`; the metadata then records `synthetic_in_training: true` and
  the data origin ("mixed"). Because `ml.splits` requires at least 3 real experiments,
  a purely synthetic dataset cannot be trained on at all, by design: synthetic data is for
  pipeline plumbing and must not be presented as real-world evidence.
* `mq135_raw` is a raw sensor response (no ppm / CO2 / AQI meaning); the metadata says so.

Reproducibility (and its limits)
--------------------------------
`seed_everything` seeds Python, NumPy and PyTorch, asks PyTorch for deterministic algorithms
(`warn_only=True`, so an operation without a deterministic version warns instead of failing),
disables cuDNN benchmarking and, by default, uses 1 CPU thread (`torch_threads`). Mini-batch order
comes from a NumPy generator seeded with `seed + epoch`. With these settings, repeated runs on the
same machine, PyTorch version and device should give the same weights on CPU. Limits: results
can differ across PyTorch versions, CPU architectures and GPUs (CUDA/cuDNN kernels are not
bit-reproducible in general); changing `torch_threads` can change floating-point summation
order; global seeding and `set_num_threads` are process-wide side effects.

Output (inside `output_dir`)
----------------------------
* model.pt       - {"state_dict": ...} of the best epoch (tensors only; load with weights_only)
* scaler.json    - the fitted SequenceScaler (ml.scaling JSON format)
* metadata.json  - schema/version, model + training configuration, feature names, target column,
                   sampling interval, history / horizon (steps and seconds), seed, data origin,
                   experiment ids per split, per-epoch losses, best epoch, validation metrics in
                   original units, library versions and the notes above.

Running it
----------
    python -m ml.train --clean-csv data/processed/clean_<file>.csv --output-dir models/gru_run1 \\
        --history 10min --horizon 10min --seed 42

PyTorch is not listed in requirements-ml.txt yet and must be installed separately. Importing this
module never requires it; asking for training without it raises an ImportError with advice.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import platform
import random
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

from ml.baselines import data_origin, regression_metrics
from ml.dataset import SequenceDataset, require_torch, torch, validate_sequence_set
from ml.preprocess import SYNTHETIC_PREFIX
from ml.scaling import SequenceScaler
from ml.splits import SplitResult

MODEL_FILE = "model.pt"
SCALER_FILE = "scaler.json"
METADATA_FILE = "metadata.json"
SCHEMA_NAME = "airq.forecast_model"
SCHEMA_VERSION = 1
MODEL_TYPES = ("gru", "lstm")
TARGET_DESCRIPTION = (
    "raw sensor response of the MQ135 gas sensor as recorded (uncalibrated); "
    "not ppm, not CO2 concentration, not AQI"
)
DETERMINISM_NOTES = (
    "Seeded Python/NumPy/PyTorch, deterministic algorithms requested (warn_only), cuDNN benchmark off, "
    "CPU threads fixed to torch_threads; batch order from a NumPy generator seeded with seed + epoch.",
    "Reproducibility is expected only for the same machine, PyTorch version and device; GPU kernels "
    "and other CPU architectures can give different results.",
)


# ---------------------------------------------------------------- configuration
def _int_at_least(name, value, minimum):
    if isinstance(value, bool) or not isinstance(value, (int, np.integer)) or value < minimum:
        raise ValueError(f"{name} must be an integer >= {minimum}, got {value!r}")


def _number(name, value, *, low=None, high=None, low_open=False, high_open=False):
    if isinstance(value, bool) or not isinstance(value, (int, float, np.integer, np.floating)):
        raise ValueError(f"{name} must be a number, got {value!r}")
    v = float(value)
    if not math.isfinite(v):
        raise ValueError(f"{name} must be finite, got {value!r}")
    if low is not None and (v < low or (low_open and v == low)):
        raise ValueError(f"{name} must be {'>' if low_open else '>='} {low}, got {value!r}")
    if high is not None and (v > high or (high_open and v == high)):
        raise ValueError(f"{name} must be {'<' if high_open else '<='} {high}, got {value!r}")


@dataclass(frozen=True)
class TrainConfig:
    """Hyper-parameters. All validated on creation; defaults are small and CPU friendly."""

    seed: int = 0
    model_type: str = "gru"  # "gru" or "lstm"
    hidden_size: int = 32
    num_layers: int = 1
    dropout: float = 0.0  # between recurrent layers; needs num_layers > 1
    learning_rate: float = 1e-3
    weight_decay: float = 0.0
    batch_size: int = 64
    max_epochs: int = 50
    patience: int = 5  # epochs without validation improvement before stopping
    min_delta: float = 0.0  # smallest validation-loss decrease that counts as an improvement
    grad_clip: float | None = 1.0  # max gradient norm; None disables clipping
    torch_threads: int | None = 1  # None leaves PyTorch's default (less reproducible)
    device: str = "cpu"

    def __post_init__(self):
        _int_at_least("seed", self.seed, 0)
        if self.model_type not in MODEL_TYPES:
            raise ValueError(f"model_type must be one of {list(MODEL_TYPES)}, got {self.model_type!r}")
        _int_at_least("hidden_size", self.hidden_size, 1)
        _int_at_least("num_layers", self.num_layers, 1)
        _number("dropout", self.dropout, low=0.0, high=1.0, high_open=True)
        if self.dropout > 0 and self.num_layers < 2:
            raise ValueError("dropout > 0 needs num_layers >= 2 (it acts between recurrent layers)")
        _number("learning_rate", self.learning_rate, low=0.0, low_open=True)
        _number("weight_decay", self.weight_decay, low=0.0)
        _int_at_least("batch_size", self.batch_size, 1)
        _int_at_least("max_epochs", self.max_epochs, 1)
        _int_at_least("patience", self.patience, 1)
        _number("min_delta", self.min_delta, low=0.0)
        if self.grad_clip is not None:
            _number("grad_clip", self.grad_clip, low=0.0, low_open=True)
        if self.torch_threads is not None:
            _int_at_least("torch_threads", self.torch_threads, 1)
        if self.device not in ("cpu", "cuda"):
            raise ValueError(f"device must be 'cpu' or 'cuda', got {self.device!r}")


# ---------------------------------------------------------------- model (needs PyTorch)
if torch is not None:

    class RecurrentForecaster(torch.nn.Module):
        """GRU / LSTM over the history, then a linear layer on the last time step -> one value."""

        def __init__(self, n_features, hidden_size, num_layers=1, dropout=0.0, model_type="gru"):
            super().__init__()
            if model_type not in MODEL_TYPES:
                raise ValueError(f"model_type must be one of {list(MODEL_TYPES)}, got {model_type!r}")
            rnn = torch.nn.GRU if model_type == "gru" else torch.nn.LSTM
            self.rnn = rnn(
                input_size=n_features,
                hidden_size=hidden_size,
                num_layers=num_layers,
                batch_first=True,
                dropout=dropout if num_layers > 1 else 0.0,
            )
            self.head = torch.nn.Linear(hidden_size, 1)

        def forward(self, x):  # x: (batch, time, features) -> (batch,)
            out, _ = self.rnn(x)
            return self.head(out[:, -1, :]).squeeze(-1)

else:
    RecurrentForecaster = None


def seed_everything(seed: int, torch_threads: int | None = 1) -> None:
    """Seed Python, NumPy and PyTorch and request deterministic behaviour (process-wide)."""
    require_torch()
    random.seed(seed)
    np.random.seed(seed % (2**32))
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    os.environ.setdefault("CUBLAS_WORKSPACE_CONFIG", ":4096:8")
    torch.use_deterministic_algorithms(True, warn_only=True)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False
    if torch_threads is not None:
        torch.set_num_threads(torch_threads)


def build_model(config: TrainConfig, n_features: int):
    """A freshly initialised model (call seed_everything first for reproducible weights)."""
    require_torch()
    _int_at_least("n_features", n_features, 1)
    return RecurrentForecaster(
        n_features=n_features,
        hidden_size=config.hidden_size,
        num_layers=config.num_layers,
        dropout=config.dropout,
        model_type=config.model_type,
    )


def predict_scaled(model, dataset: SequenceDataset, *, batch_size: int = 256, device: str = "cpu") -> np.ndarray:
    """Predictions in the model's (scaled) units, in dataset order, as float32 (N,)."""
    require_torch()
    if not isinstance(dataset, SequenceDataset):
        raise TypeError(f"dataset must be a SequenceDataset, got {type(dataset).__name__}")
    model.eval()
    out = []
    with torch.no_grad():
        for _, xb, _ in dataset.batches(batch_size):
            out.append(model(torch.from_numpy(xb).to(device)).detach().cpu().numpy())
    pred = np.concatenate(out).astype(np.float32)
    if not np.all(np.isfinite(pred)):
        raise RuntimeError("the model produced non-finite predictions")
    return pred


def _run_epoch(model, dataset, batch_size, device, *, optimizer=None, grad_clip=None, shuffle_seed=None):
    """One pass over `dataset`; returns the mean squared error (scaled units) over its windows."""
    training = optimizer is not None
    model.train(training)
    total, count = 0.0, 0
    with torch.set_grad_enabled(training):
        for _, xb, yb in dataset.batches(batch_size, shuffle=training, seed=shuffle_seed):
            x = torch.from_numpy(xb).to(device)
            y = torch.from_numpy(yb).to(device)
            loss = torch.nn.functional.mse_loss(model(x), y)
            if not torch.isfinite(loss):
                raise RuntimeError("the loss became NaN or infinite; lower the learning rate or check the data")
            if training:
                optimizer.zero_grad(set_to_none=True)
                loss.backward()
                if grad_clip is not None:
                    torch.nn.utils.clip_grad_norm_(model.parameters(), grad_clip)
                optimizer.step()
            total += float(loss.detach()) * len(yb)
            count += len(yb)
    return total / count


# ---------------------------------------------------------------- result and I/O helpers
@dataclass(frozen=True, eq=False)
class TrainResult:
    output_dir: Path
    model_path: Path
    scaler_path: Path
    metadata_path: Path
    best_epoch: int
    best_val_loss: float  # validation MSE, scaled units
    epochs_run: int
    stopped_early: bool
    history: tuple  # ({"epoch", "train_loss", "val_loss"}, ...)
    metadata: dict
    scaler: SequenceScaler

    def summary(self) -> str:
        v = self.metadata["validation_metrics_original_units"]
        return (
            f"trained {self.metadata['model']['type'].upper()} on "
            f"{self.metadata['data_origin']['training']} training data, "
            f"best epoch {self.best_epoch}/{self.epochs_run} "
            f"({'early stop' if self.stopped_early else 'epoch limit'}), "
            f"validation MSE (scaled) {self.best_val_loss:.6g}; "
            f"validation MAE {v['mae']:.4g} / RMSE {v['rmse']:.4g} in raw {self.metadata['data']['target_column']} units "
            f"({self.metadata['data_origin']['validation']} validation data). Test set not used. "
            f"Saved to {self.output_dir}"
        )


@dataclass(frozen=True, eq=False)
class LoadedModel:
    model: object
    scaler: SequenceScaler
    metadata: dict


def _prepare_output_dir(output_dir, overwrite: bool) -> Path:
    if output_dir is None or str(output_dir).strip() == "":
        raise ValueError("output_dir must be given explicitly")
    path = Path(output_dir)
    if path.exists() and not path.is_dir():
        raise ValueError(f"output_dir {path} exists and is not a directory")
    existing = [n for n in (MODEL_FILE, SCALER_FILE, METADATA_FILE) if (path / n).exists()]
    if existing and not overwrite:
        raise FileExistsError(
            f"{path} already contains {existing}; choose another output_dir or pass overwrite=True"
        )
    path.mkdir(parents=True, exist_ok=True)
    return path


def _write_atomic(path: Path, writer) -> None:
    tmp = path.with_name(path.name + ".tmp")
    try:
        writer(tmp)
        os.replace(tmp, path)
    finally:
        if tmp.exists():
            tmp.unlink()


def _check_split_and_origins(split, allow_synthetic_in_training: bool):
    if not isinstance(split, SplitResult):
        raise TypeError(f"split must be an ml.splits.SplitResult, got {type(split).__name__}")
    validate_sequence_set(split.train, "training data")
    validate_sequence_set(split.validation, "validation data")
    train_ids = set(map(str, split.train.experiment_ids))
    val_ids = set(map(str, split.validation.experiment_ids))
    test_ids = set(split.report.test.experiment_ids)
    if train_ids & val_ids or train_ids & test_ids or val_ids & test_ids:
        raise ValueError(
            "train, validation and test must use disjoint experiments; "
            f"overlaps: train&val={sorted(train_ids & val_ids)}, train&test={sorted(train_ids & test_ids)}, "
            f"val&test={sorted(val_ids & test_ids)}"
        )
    if any(e.startswith(SYNTHETIC_PREFIX) for e in val_ids | test_ids):
        raise ValueError("validation and test data must be real: synthetic experiments are not allowed there")
    train_origin = data_origin(sorted(train_ids))
    if train_origin != "real" and not allow_synthetic_in_training:
        raise ValueError(
            f"the training data contains synthetic experiments (origin: {train_origin}). Synthetic data is "
            "for pipeline testing and must not be presented as real-world evidence; pass "
            "allow_synthetic_in_training=True only if you deliberately want it and will label the model accordingly"
        )
    return train_origin, data_origin(sorted(val_ids)), sorted(train_ids), sorted(val_ids), sorted(test_ids)


# ---------------------------------------------------------------- training
def train_model(
    split: SplitResult,
    config: TrainConfig,
    output_dir,
    *,
    allow_synthetic_in_training: bool = False,
    overwrite: bool = False,
) -> TrainResult:
    """Train on `split.train`, select on `split.validation`, save the best model to `output_dir`.

    The test set (`split.test`) is never read. See the module docstring for the guarantees.
    """
    require_torch()
    if not isinstance(config, TrainConfig):
        raise TypeError(f"config must be a TrainConfig, got {type(config).__name__}")
    train_origin, val_origin, train_ids, val_ids, test_ids = _check_split_and_origins(
        split, allow_synthetic_in_training
    )
    if config.device == "cuda" and not torch.cuda.is_available():
        raise ValueError("device='cuda' was requested but CUDA is not available")
    out = _prepare_output_dir(output_dir, overwrite)  # fail before any training time is spent

    # Scaling: fitted on the training set only, applied (not refitted) to validation.
    scaler = SequenceScaler.fit_train(split.train)
    train_scaled = scaler.transform(split.train)
    val_scaled = scaler.transform(split.validation)
    train_ds, val_ds = SequenceDataset(train_scaled, role="training data"), SequenceDataset(val_scaled, role="validation data")

    seed_everything(config.seed, config.torch_threads)
    device = torch.device(config.device)
    model = build_model(config, train_ds.n_features).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=config.learning_rate, weight_decay=config.weight_decay)

    history = []
    best_val, best_epoch, best_state, bad_epochs, stopped_early = math.inf, 0, None, 0, False
    for epoch in range(1, config.max_epochs + 1):
        train_loss = _run_epoch(
            model, train_ds, config.batch_size, device,
            optimizer=optimizer, grad_clip=config.grad_clip, shuffle_seed=config.seed + epoch,
        )
        val_loss = _run_epoch(model, val_ds, config.batch_size, device)
        history.append({"epoch": epoch, "train_loss": float(train_loss), "val_loss": float(val_loss)})
        if val_loss < best_val - config.min_delta:
            best_val, best_epoch, bad_epochs = val_loss, epoch, 0
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
        else:
            bad_epochs += 1
            if bad_epochs >= config.patience:
                stopped_early = True
                break
    if best_state is None:  # cannot happen with finite losses, kept as a safety net
        raise RuntimeError("no epoch improved on the initial validation loss")

    model.load_state_dict(best_state)
    pred_scaled = predict_scaled(model, val_ds, batch_size=config.batch_size, device=config.device)
    val_metrics = regression_metrics(
        scaler.inverse_transform_y(val_ds.y), scaler.inverse_transform_y(pred_scaled)
    )

    metadata = _build_metadata(
        config=config, scaler=scaler, train_scaled=train_scaled, n_features=train_ds.n_features,
        train_origin=train_origin, val_origin=val_origin,
        train_ids=train_ids, val_ids=val_ids, test_ids=test_ids,
        history=history, best_epoch=best_epoch, best_val=best_val, stopped_early=stopped_early,
        val_metrics=val_metrics,
    )
    paths = {n: out / n for n in (MODEL_FILE, SCALER_FILE, METADATA_FILE)}
    _write_atomic(paths[MODEL_FILE], lambda p: torch.save({"state_dict": best_state}, p))
    _write_atomic(paths[SCALER_FILE], lambda p: scaler.save(p))
    _write_atomic(paths[METADATA_FILE], lambda p: p.write_text(json.dumps(metadata, indent=2, allow_nan=False) + "\n", encoding="utf-8"))
    return TrainResult(
        output_dir=out, model_path=paths[MODEL_FILE], scaler_path=paths[SCALER_FILE],
        metadata_path=paths[METADATA_FILE], best_epoch=best_epoch, best_val_loss=float(best_val),
        epochs_run=len(history), stopped_early=stopped_early, history=tuple(history),
        metadata=metadata, scaler=scaler,
    )


def _build_metadata(*, config, scaler, train_scaled, n_features, train_origin, val_origin,
                    train_ids, val_ids, test_ids, history, best_epoch, best_val, stopped_early, val_metrics) -> dict:
    return {
        "schema": SCHEMA_NAME,
        "version": SCHEMA_VERSION,
        "model": {
            "type": config.model_type,
            "n_features": int(n_features),
            "hidden_size": config.hidden_size,
            "num_layers": config.num_layers,
            "dropout": float(config.dropout),
            "output": "target value at origin + horizon, in scaled units (use the saved scaler to invert)",
        },
        "config": asdict(config),
        "seed": config.seed,
        "data": {
            "feature_names": list(train_scaled.feature_names),
            "target_column": train_scaled.target_column,
            "target_description": TARGET_DESCRIPTION,
            "interval_seconds": int(train_scaled.interval_seconds),
            "history_steps": int(train_scaled.history_steps),
            "history_seconds": int(train_scaled.history_seconds),
            "horizon_steps": int(train_scaled.horizon_steps),
            "horizon_seconds": int(train_scaled.horizon_seconds),
            "stride_steps": int(train_scaled.stride_steps),
        },
        "experiments": {"train": train_ids, "validation": val_ids, "test": test_ids},
        "data_origin": {
            "training": train_origin,
            "validation": val_origin,
            "synthetic_in_training": train_origin != "real",
        },
        "scaling": {"file": SCALER_FILE, "fitted_on": "training split only", "scaled_columns": list(scaler.scaled_columns)},
        "training": {
            "selection_metric": "validation MSE in scaled units",
            "best_epoch": int(best_epoch),
            "best_val_loss": float(best_val),
            "epochs_run": len(history),
            "stopped_early": bool(stopped_early),
            "history": history,
            "test_set_used": False,
        },
        "validation_metrics_original_units": {
            "n_windows": val_metrics.n_windows,
            "mae": val_metrics.mae,
            "rmse": val_metrics.rmse,
            "r2": val_metrics.r2,
            "units": f"raw {train_scaled.target_column} sensor units",
        },
        "files": {"model": MODEL_FILE, "scaler": SCALER_FILE, "metadata": METADATA_FILE},
        "environment": {
            "python": platform.python_version(),
            "numpy": np.__version__,
            "torch": torch.__version__,
            "device": config.device,
        },
        "notes": list(DETERMINISM_NOTES),
    }


# ---------------------------------------------------------------- loading (for the evaluation step)
_REQUIRED_METADATA = {
    "data": ("feature_names", "target_column", "interval_seconds", "history_steps", "horizon_steps"),
    "model": ("type", "n_features", "hidden_size", "num_layers", "dropout"),
}


def _check_required_metadata(meta: dict, meta_path: Path) -> None:
    """Raise ValueError naming every missing section / key that load_trained_model needs."""
    problems = []
    for section, keys in _REQUIRED_METADATA.items():
        value = meta.get(section)
        if value is None:
            problems.append(f"section '{section}'")
        elif not isinstance(value, dict):
            problems.append(f"section '{section}' (expected an object, got {type(value).__name__})")
        else:
            missing = [k for k in keys if k not in value]
            if missing:
                problems.append(f"{section}: {missing}")
    if problems:
        raise ValueError(f"{meta_path} is missing required entries: {'; '.join(problems)}")


def load_trained_model(output_dir, *, device: str = "cpu") -> LoadedModel:
    """Load a model written by `train_model`: (model in eval mode, scaler, metadata)."""
    require_torch()
    path = Path(output_dir)
    for name in (MODEL_FILE, SCALER_FILE, METADATA_FILE):
        if not (path / name).is_file():
            raise FileNotFoundError(f"{path / name} not found; is {path} a train_model output directory?")
    try:
        meta = json.loads((path / METADATA_FILE).read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path / METADATA_FILE} is not valid JSON: {exc}") from exc
    if not isinstance(meta, dict) or meta.get("schema") != SCHEMA_NAME:
        raise ValueError(f"{path / METADATA_FILE} is not a forecast-model metadata file")
    if meta.get("version") != SCHEMA_VERSION:
        raise ValueError(f"unsupported model metadata version {meta.get('version')!r}; expected {SCHEMA_VERSION}")
    _check_required_metadata(meta, path / METADATA_FILE)
    scaler = SequenceScaler.load(path / SCALER_FILE)
    data = meta["data"]
    mismatches = [
        k for k, a, b in (
            ("feature_names", tuple(data["feature_names"]), scaler.feature_names),
            ("target_column", data["target_column"], scaler.target_column),
            ("interval_seconds", data["interval_seconds"], scaler.interval_seconds),
            ("history_steps", data["history_steps"], scaler.history_steps),
            ("horizon_steps", data["horizon_steps"], scaler.horizon_steps),
        ) if a != b
    ]
    if mismatches:
        raise ValueError(f"scaler.json does not match metadata.json for: {mismatches}")
    m = meta["model"]
    model = RecurrentForecaster(
        n_features=m["n_features"], hidden_size=m["hidden_size"], num_layers=m["num_layers"],
        dropout=m["dropout"], model_type=m["type"],
    )
    state = torch.load(path / MODEL_FILE, map_location="cpu", weights_only=True)
    model.load_state_dict(state["state_dict"])
    model.to(torch.device(device)).eval()
    return LoadedModel(model=model, scaler=scaler, metadata=meta)


# ---------------------------------------------------------------- command line
def _parse_args(argv):
    p = argparse.ArgumentParser(
        prog="python -m ml.train",
        description="Train a GRU/LSTM forecaster for mq135_raw (a raw sensor response, not ppm/CO2/AQI) "
                    "from a cleaned CSV written by ml.preprocess. Needs >= 3 REAL experiments.",
    )
    p.add_argument("--clean-csv", required=True, help="cleaned CSV from `python -m ml.preprocess`")
    p.add_argument("--output-dir", required=True, help="directory for model.pt, scaler.json, metadata.json")
    p.add_argument("--overwrite", action="store_true", help="replace existing artifacts in --output-dir")
    p.add_argument("--allow-synthetic-in-training", action="store_true",
                   help="allow SYNTH- experiments in the training split (recorded as 'mixed' origin)")
    g = p.add_argument_group("sequences and split")
    g.add_argument("--history", default="10min")
    g.add_argument("--horizon", default="10min")
    g.add_argument("--stride", default=None, help="e.g. 1min (default: every sample)")
    g.add_argument("--interval-seconds", type=int, default=None, help="sampling interval (default: inferred)")
    g.add_argument("--exclude-imputed", action="store_true", help="drop windows with interpolated values (all splits)")
    g.add_argument("--sensor-only", action="store_true",
                   help="use only temperature_c, humidity_percent and mq135_raw; recommended when context was not recorded")
    g.add_argument("--train-fraction", type=float, default=0.6)
    g.add_argument("--val-fraction", type=float, default=0.2)
    g.add_argument("--test-fraction", type=float, default=0.2)
    g.add_argument("--purge-seconds", type=float, default=0.0)
    h = p.add_argument_group("model and optimisation")
    h.add_argument("--model-type", choices=MODEL_TYPES, default="gru")
    h.add_argument("--seed", type=int, default=0)
    h.add_argument("--hidden-size", type=int, default=32)
    h.add_argument("--num-layers", type=int, default=1)
    h.add_argument("--dropout", type=float, default=0.0)
    h.add_argument("--learning-rate", type=float, default=1e-3)
    h.add_argument("--weight-decay", type=float, default=0.0)
    h.add_argument("--batch-size", type=int, default=64)
    h.add_argument("--max-epochs", type=int, default=50)
    h.add_argument("--patience", type=int, default=5)
    h.add_argument("--min-delta", type=float, default=0.0)
    h.add_argument("--grad-clip", type=float, default=1.0)
    h.add_argument("--device", choices=("cpu", "cuda"), default="cpu")
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = _parse_args(argv)
    try:
        require_torch()  # training was requested: fail early with installation advice
        from ml.preprocess import load_clean_csv
        from ml.sequences import build_sequences
        from ml.splits import split_by_experiment

        config = TrainConfig(
            seed=args.seed, model_type=args.model_type, hidden_size=args.hidden_size,
            num_layers=args.num_layers, dropout=args.dropout, learning_rate=args.learning_rate,
            weight_decay=args.weight_decay, batch_size=args.batch_size, max_epochs=args.max_epochs,
            patience=args.patience, min_delta=args.min_delta, grad_clip=args.grad_clip, device=args.device,
        )
        df = load_clean_csv(args.clean_csv)
        input_columns = ("temperature_c", "humidity_percent", "mq135_raw") if args.sensor_only else None
        seq = build_sequences(
            df, args.history, args.horizon, stride=args.stride,
            interval_seconds=args.interval_seconds, input_columns=input_columns,
            exclude_imputed=args.exclude_imputed,
        )
        split = split_by_experiment(
            seq, train_fraction=args.train_fraction, val_fraction=args.val_fraction,
            test_fraction=args.test_fraction, purge_seconds=args.purge_seconds,
        )
        print(split.report.summary())
        result = train_model(
            split, config, args.output_dir,
            allow_synthetic_in_training=args.allow_synthetic_in_training, overwrite=args.overwrite,
        )
    except (ImportError, ValueError, FileNotFoundError, FileExistsError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    print(result.summary())
    return 0


if __name__ == "__main__":
    sys.exit(main())