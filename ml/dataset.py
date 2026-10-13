"""Dataset adapters for SequenceSet (Step 5A).

`SequenceDataset` is a small, NumPy-only view of a `ml.sequences.SequenceSet`:
inputs `X` (N, T, F) float32 and targets `y` (N,) float32, plus the metadata needed to evaluate
a model later (experiment ids, origin and target times, feature names, target column, sampling
interval, history / horizon). Row i of every array describes the same window.

* It does NOT split data and does NOT fit or apply scalers. Hand it a SequenceSet that has
  already been split (ml.splits) and, if you want scaled inputs, already transformed
  (ml.scaling). Which units the arrays are in is the caller's business; the metadata here
  does not say.
* It copies the arrays it is given, so later changes to the SequenceSet do not leak in, and it
  never modifies the SequenceSet.
* Invalid input is rejected with a clear error: wrong type, no sequences, wrong array shapes,
  misaligned lengths, timezone-naive times, NaN / infinite values.

PyTorch is optional. Importing this module never fails because PyTorch is missing (or broken);
`torch_available()` says whether it can be used, `SequenceDataset.to_torch()` builds a
`torch.utils.data.Dataset` and raises an ImportError with installation advice when PyTorch is
absent. PyTorch is not a dependency listed in requirements-ml.txt yet; install it separately.

`mq135_raw` remains a raw sensor response: nothing here converts it to ppm, CO2 or AQI.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from ml.sequences import SequenceSet

try:  # PyTorch is optional; a broken install (e.g. missing shared libraries) counts as absent
    import torch
    from torch.utils.data import Dataset as _TorchBaseDataset

    _TORCH_IMPORT_ERROR = None
except Exception as _exc:  # noqa: BLE001 - any failure to import means "not usable"
    torch = None
    _TorchBaseDataset = None
    _TORCH_IMPORT_ERROR = f"{type(_exc).__name__}: {_exc}"

TORCH_INSTALL_HINT = (
    "PyTorch is required for this step but is not available. Install it separately (it is not in "
    "requirements-ml.txt yet), for example `pip install torch`; see "
    "https://pytorch.org/get-started/locally/ for CPU / GPU builds."
)


def torch_available() -> bool:
    """True when PyTorch could be imported."""
    return torch is not None


def require_torch() -> None:
    """Raise ImportError with installation advice when PyTorch is not usable."""
    if torch is None:
        detail = f" (import failed with {_TORCH_IMPORT_ERROR})" if _TORCH_IMPORT_ERROR else ""
        raise ImportError(TORCH_INSTALL_HINT + detail)


# ---------------------------------------------------------------- validation
def validate_sequence_set(seq, role: str = "sequences") -> None:
    """Raise TypeError / ValueError unless `seq` is a usable, aligned, finite SequenceSet."""
    if not isinstance(seq, SequenceSet):
        raise TypeError(f"{role} must be a SequenceSet, got {type(seq).__name__}")
    X = np.asarray(seq.X)
    if X.ndim != 3:
        raise ValueError(f"{role}: X must have shape (N, T, F), got {X.shape}")
    n, steps, n_features = X.shape
    if n == 0:
        raise ValueError(f"{role} is empty (no sequences)")
    if steps != seq.history_steps:
        raise ValueError(f"{role}: X has {steps} time steps but history_steps is {seq.history_steps}")
    if n_features != len(seq.feature_names):
        raise ValueError(f"{role}: X has {n_features} features but feature_names has {len(seq.feature_names)}")
    y = np.asarray(seq.y)
    if y.ndim != 1:
        raise ValueError(f"{role}: y must have shape (N,), got {y.shape}")
    lengths = {
        "y": len(y),
        "target_at_origin": len(seq.target_at_origin),
        "experiment_ids": len(seq.experiment_ids),
        "origin_times": len(seq.origin_times),
        "target_times": len(seq.target_times),
    }
    bad = {k: v for k, v in lengths.items() if v != n}
    if bad:
        raise ValueError(f"{role}: arrays are not aligned with X (length {n}): {bad}")
    for name in ("origin_times", "target_times"):
        if getattr(getattr(seq, name), "tz", None) is None:
            raise ValueError(f"{role}: {name} must be timezone-aware; refusing to assume a timezone")
    for name, arr in (("X", X), ("y", y), ("target_at_origin", np.asarray(seq.target_at_origin))):
        if not np.all(np.isfinite(arr.astype(np.float64, copy=False))):
            raise ValueError(f"{role}: {name} contains NaN or infinite values")
    if len(set(seq.feature_names)) != len(seq.feature_names):
        raise ValueError(f"{role}: feature_names contains duplicates")


# ---------------------------------------------------------------- NumPy dataset
@dataclass(frozen=True, eq=False)
class SequenceMetadata:
    """Everything about one window except the numbers themselves."""

    experiment_id: str
    origin_time: object  # tz-aware pandas Timestamp
    target_time: object  # tz-aware pandas Timestamp


class SequenceDataset:
    """Aligned (X, y) arrays plus experiment and time metadata, built from a SequenceSet."""

    def __init__(self, seq: SequenceSet, *, role: str = "sequences"):
        validate_sequence_set(seq, role)
        self.X = np.array(seq.X, dtype=np.float32, copy=True)
        self.y = np.array(seq.y, dtype=np.float32, copy=True)
        self.target_at_origin = np.array(seq.target_at_origin, dtype=np.float32, copy=True)
        self.experiment_ids = np.array(seq.experiment_ids, dtype=object, copy=True)
        self.origin_times = seq.origin_times.copy()
        self.target_times = seq.target_times.copy()
        self.feature_names = tuple(seq.feature_names)
        self.target_column = str(seq.target_column)
        self.interval_seconds = int(seq.interval_seconds)
        self.history_steps = int(seq.history_steps)
        self.horizon_steps = int(seq.horizon_steps)
        for arr in (self.X, self.y, self.target_at_origin):
            arr.setflags(write=False)

    # ------------------------------------------------------------ basic protocol
    def __len__(self) -> int:
        return int(self.X.shape[0])

    @property
    def n_features(self) -> int:
        return int(self.X.shape[2])

    @property
    def history_seconds(self) -> int:
        return self.history_steps * self.interval_seconds

    @property
    def horizon_seconds(self) -> int:
        return self.horizon_steps * self.interval_seconds

    def _check_index(self, i) -> int:
        if isinstance(i, bool) or not isinstance(i, (int, np.integer)):
            raise TypeError(f"index must be an integer, got {type(i).__name__}")
        i = int(i)
        if not -len(self) <= i < len(self):
            raise IndexError(f"index {i} out of range for a dataset of {len(self)} sequences")
        return i % len(self)

    def __getitem__(self, i):
        """(x, y) for window i: x has shape (T, F), y is a float32 scalar."""
        i = self._check_index(i)
        return self.X[i], self.y[i]

    def metadata(self, i) -> SequenceMetadata:
        i = self._check_index(i)
        return SequenceMetadata(
            experiment_id=str(self.experiment_ids[i]),
            origin_time=self.origin_times[i],
            target_time=self.target_times[i],
        )

    def batches(self, batch_size: int, *, shuffle: bool = False, seed: int | None = None):
        """Yield (indices, X_batch, y_batch) as NumPy arrays; deterministic for a given seed.

        `indices` index into this dataset, so predictions can be matched back to experiment ids
        and times via `experiment_ids[indices]`, `origin_times[indices]`, ...
        """
        if isinstance(batch_size, bool) or not isinstance(batch_size, (int, np.integer)) or batch_size < 1:
            raise ValueError(f"batch_size must be a positive integer, got {batch_size!r}")
        order = np.arange(len(self))
        if shuffle:
            if seed is None:
                raise ValueError("shuffle=True needs an explicit seed so that results are reproducible")
            order = np.random.default_rng(seed).permutation(len(self))
        for start in range(0, len(order), int(batch_size)):
            idx = order[start : start + int(batch_size)]
            yield idx, self.X[idx], self.y[idx]

    def describe(self) -> str:
        return (
            f"SequenceDataset: {len(self)} windows, X {self.X.shape}, target {self.target_column}, "
            f"interval {self.interval_seconds} s, history {self.history_seconds} s, "
            f"horizon {self.horizon_seconds} s, experiments {sorted(set(map(str, self.experiment_ids)))}"
        )

    # ------------------------------------------------------------ PyTorch
    def to_torch(self) -> "TorchSequenceDataset":
        """A torch.utils.data.Dataset over the same arrays (raises ImportError without PyTorch)."""
        require_torch()
        return TorchSequenceDataset(self)


# ---------------------------------------------------------------- PyTorch adapter (optional)
if torch is not None:

    class TorchSequenceDataset(_TorchBaseDataset):
        """Items are (x, y): x float32 (T, F), y float32 scalar tensor.

        Metadata stays on `.source` (a SequenceDataset); index it with the same positions, e.g.
        `ds.source.metadata(i)`. Do not shuffle if you want predictions in dataset order.
        """

        def __init__(self, source: SequenceDataset):
            if not isinstance(source, SequenceDataset):
                raise TypeError(f"source must be a SequenceDataset, got {type(source).__name__}")
            self.source = source
            self._X = torch.from_numpy(source.X.copy())
            self._y = torch.from_numpy(source.y.copy())

        def __len__(self) -> int:
            return len(self.source)

        def __getitem__(self, i):
            i = self.source._check_index(i)
            return self._X[i], self._y[i]

else:
    TorchSequenceDataset = None  # PyTorch not available; SequenceDataset.to_torch() explains how to install it