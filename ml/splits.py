"""Experiment-wise train / validation / test split of a SequenceSet (Step 3A).

Why by experiment
-----------------
Neighbouring sequences overlap almost completely (with stride 1 they share all but one input
sample, and one window's target is another window's input), so any split of individual windows
leaks. This module therefore splits ONLY by whole experiment: every window of an experiment goes
to exactly one of train / validation / test, and nothing is split at window level or randomised.

What it does
------------
1. Real experiments are ordered by their earliest sample (the first input timestamp of their
   first window; ties are broken by experiment id). The earliest go to train, the next to
   validation, the latest to test.
2. Counts: with R real experiments, n_val = max(1, round_half_up(R * val_fraction)),
   n_test = max(1, round_half_up(R * test_fraction)) and train gets the rest (at least 1).
   R must be at least 3. `train_fraction` is validated (all three must be in (0, 1) and sum
   to 1) but train is, by construction, the remainder.
3. Synthetic experiments (ids starting with ml.preprocess.SYNTHETIC_PREFIX) can only ever be
   placed in TRAIN, and they are not counted when the proportions are applied. Validation and test
   are always real-only. If there are fewer than 3 real experiments, a ValueError is raised
   (including when ALL experiments are synthetic): no mislabelled or synthetic evaluation set
   is ever produced, and no real data is silently dropped.
4. Optional purge buffer (`purge_seconds`, default 0 = off). Disjoint experiments are already
   independent as far as sample sharing goes, but consecutive experiments may share PHYSICAL
   conditions (residual gas in the room, sensor warm-up, drift). With a buffer, a window of a
   later split is dropped when its first input sample is less than `purge_seconds` after the
   last sample (target) of any real experiment in an EARLIER split. The earlier split is never
   trimmed. The buffer is in real seconds, so it means the same at 10 s and 60 s sampling.
   Experiments that overlap in time (e.g. two rooms recorded at once) are also purged when the
   buffer is > 0, which is the conservative choice.
   Dropped windows are counted in the report; if a split ends up with no windows at all, a
   ValueError is raised rather than silently returning an empty set.

Assumptions
-----------
* The SequenceSet is the full output of build_sequences. Experiments that produced no window
  (too short, or every window dropped) are not in the SequenceSet and cannot be split.
* An experiment's time span is [first input sample of its first window, target of its last
  window]. `origin_times` and `target_times` are timezone-aware UTC.
* Result subsets come from SequenceSet.subset(), which does NOT update `.report`; the numbers
  of a split live in the returned SplitReport instead.

No scaling and no training happen here.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import NamedTuple

import numpy as np
import pandas as pd

from ml.preprocess import SYNTHETIC_PREFIX
from ml.sequences import SequenceSet

DEFAULT_TRAIN_FRACTION = 0.6
DEFAULT_VAL_FRACTION = 0.2
DEFAULT_TEST_FRACTION = 0.2
MIN_REAL_EXPERIMENTS = 3
SPLIT_NAMES = ("train", "validation", "test")
_FRACTION_TOLERANCE = 1e-6


# ---------------------------------------------------------------- result types
@dataclass(frozen=True)
class SplitInfo:
    """What happened to one split."""

    name: str
    experiment_ids: tuple  # assigned experiments, chronological (train: includes synthetic ones)
    start: pd.Timestamp  # earliest sample of the split's REAL experiments
    end: pd.Timestamp  # latest sample (target) of the split's REAL experiments
    windows_retained: int
    windows_dropped_purge: int
    fully_purged_experiments: tuple = ()  # assigned experiments left with no window at all

    @property
    def windows_total(self) -> int:
        return self.windows_retained + self.windows_dropped_purge


@dataclass(frozen=True)
class SplitReport:
    train: SplitInfo
    validation: SplitInfo
    test: SplitInfo
    synthetic_experiments: tuple  # always in train (empty tuple when there are none)
    total_windows: int  # windows in the input SequenceSet
    purge_seconds: float
    interval_seconds: int
    history_seconds: int
    horizon_seconds: int
    fractions: tuple  # (train, validation, test) as requested

    @property
    def windows_retained(self) -> int:
        return sum(s.windows_retained for s in self.splits)

    @property
    def windows_dropped_purge(self) -> int:
        return sum(s.windows_dropped_purge for s in self.splits)

    @property
    def splits(self) -> tuple:
        return (self.train, self.validation, self.test)

    def summary(self) -> str:
        lines = [
            f"experiment-wise split of {self.total_windows} windows "
            f"(interval {self.interval_seconds} s, history {self.history_seconds} s, "
            f"horizon {self.horizon_seconds} s, purge {self.purge_seconds:g} s)",
        ]
        for s in self.splits:
            lines.append(
                f"  {s.name:<10}: {len(s.experiment_ids):>3} experiment(s), "
                f"{s.windows_retained} windows kept, {s.windows_dropped_purge} purged"
                + (f", fully purged: {list(s.fully_purged_experiments)}" if s.fully_purged_experiments else "")
            )
            lines.append(f"              ids: {list(s.experiment_ids)}")
        if self.synthetic_experiments:
            lines.append(
                f"  synthetic experiments (train only, pipeline testing; not research data): "
                f"{list(self.synthetic_experiments)}"
            )
        return "\n".join(lines)


class SplitResult(NamedTuple):
    train: SequenceSet
    validation: SequenceSet
    test: SequenceSet
    report: SplitReport


# ---------------------------------------------------------------- validation helpers
def _check_fraction(name: str, value) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float, np.integer, np.floating)):
        raise ValueError(f"{name} must be a number, got {value!r}")
    value = float(value)
    if not math.isfinite(value) or not 0.0 < value < 1.0:
        raise ValueError(f"{name} must be strictly between 0 and 1, got {value!r}")
    return value


def _check_purge(value) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float, np.integer, np.floating)):
        raise ValueError(f"purge_seconds must be a number of seconds, got {value!r}")
    value = float(value)
    if not math.isfinite(value) or value < 0:
        raise ValueError(f"purge_seconds must be finite and >= 0, got {value!r}")
    return value


def _round_half_up(x: float) -> int:
    return int(math.floor(x + 0.5))


def _check_sequence_set(seq) -> None:
    if not isinstance(seq, SequenceSet):
        raise TypeError(f"expected a SequenceSet, got {type(seq).__name__}")
    n = len(seq)
    if n == 0:
        raise ValueError("the SequenceSet has no sequences, so there is nothing to split")
    lengths = {
        "y": len(seq.y),
        "target_at_origin": len(seq.target_at_origin),
        "experiment_ids": len(seq.experiment_ids),
        "origin_times": len(seq.origin_times),
        "target_times": len(seq.target_times),
    }
    bad = {k: v for k, v in lengths.items() if v != n}
    if bad:
        raise ValueError(f"SequenceSet arrays are not aligned with X (length {n}): {bad}")
    for name in ("origin_times", "target_times"):
        index = getattr(seq, name)
        if getattr(index, "tz", None) is None:
            raise ValueError(f"{name} must be timezone-aware; refusing to assume a timezone")


def _is_synthetic(experiment_id: str) -> bool:
    return str(experiment_id).startswith(SYNTHETIC_PREFIX)


# ---------------------------------------------------------------- main function
def split_by_experiment(
    seq: SequenceSet,
    *,
    train_fraction: float = DEFAULT_TRAIN_FRACTION,
    val_fraction: float = DEFAULT_VAL_FRACTION,
    test_fraction: float = DEFAULT_TEST_FRACTION,
    purge_seconds: float = 0.0,
) -> SplitResult:
    """Split `seq` into (train, validation, test, report) by whole experiments, in time order.

    See the module docstring for the rules. Raises ValueError for invalid fractions or purge,
    for fewer than 3 real experiments, and for any split that ends up empty; TypeError if `seq`
    is not a SequenceSet.
    """
    fractions = (
        _check_fraction("train_fraction", train_fraction),
        _check_fraction("val_fraction", val_fraction),
        _check_fraction("test_fraction", test_fraction),
    )
    if abs(sum(fractions) - 1.0) > _FRACTION_TOLERANCE:
        raise ValueError(
            f"train_fraction + val_fraction + test_fraction must sum to 1, got {sum(fractions):.6g}"
        )
    purge_seconds = _check_purge(purge_seconds)
    _check_sequence_set(seq)

    n = len(seq)
    ids = np.asarray(seq.experiment_ids).astype(str)
    first_input = seq.origin_times - pd.Timedelta(seconds=(seq.history_steps - 1) * seq.interval_seconds)
    windows = pd.DataFrame(
        {
            "experiment": ids,
            "first": pd.Series(first_input, index=pd.RangeIndex(n)),
            "last": pd.Series(seq.target_times, index=pd.RangeIndex(n)),
        }
    )
    table = (
        windows.groupby("experiment", sort=False)
        .agg(start=("first", "min"), end=("last", "max"), windows=("first", "size"))
        .reset_index()
    )
    table["synthetic"] = [_is_synthetic(e) for e in table["experiment"]]
    table = table.sort_values(["start", "experiment"], kind="stable").reset_index(drop=True)

    real = table[~table["synthetic"]]
    synthetic = table[table["synthetic"]]
    n_real = len(real)
    if n_real < MIN_REAL_EXPERIMENTS:
        raise ValueError(
            f"need at least {MIN_REAL_EXPERIMENTS} real experiments (validation and test must be "
            f"real-only, train needs one), found {n_real} real and {len(synthetic)} synthetic "
            f"('{SYNTHETIC_PREFIX}' ids) experiment(s)"
        )

    n_val = max(1, _round_half_up(n_real * fractions[1]))
    n_test = max(1, _round_half_up(n_real * fractions[2]))
    n_train = n_real - n_val - n_test
    if n_train < 1:
        raise ValueError(
            f"{n_real} real experiments are too few for fractions train/val/test = "
            f"{fractions[0]:g}/{fractions[1]:g}/{fractions[2]:g}: validation would get {n_val}, "
            f"test {n_test}, leaving {n_train} for train. Add experiments or lower the fractions."
        )

    real_ids = list(real["experiment"])
    assignment = {}
    for e in real_ids[:n_train]:
        assignment[e] = "train"
    for e in real_ids[n_train : n_train + n_val]:
        assignment[e] = "validation"
    for e in real_ids[n_train + n_val :]:
        assignment[e] = "test"
    for e in synthetic["experiment"]:
        assignment[e] = "train"

    split_of_window = np.array([assignment[e] for e in ids], dtype=object)
    keep = np.ones(n, dtype=bool)

    ends = dict(zip(real["experiment"], real["end"]))
    if purge_seconds > 0:
        buffer = pd.Timedelta(seconds=purge_seconds)
        earlier_splits = {"validation": ("train",), "test": ("train", "validation")}
        for name, earlier in earlier_splits.items():
            previous_end = max(ends[e] for e in real_ids if assignment[e] in earlier)
            too_close = np.asarray((first_input - previous_end) < buffer)
            keep &= ~((split_of_window == name) & too_close)

    infos = {}
    subsets = {}
    for name in SPLIT_NAMES:
        in_split = split_of_window == name
        kept = in_split & keep
        members = table[table["experiment"].map(assignment) == name]
        real_members = members[~members["synthetic"]]
        n_kept = int(kept.sum())
        if n_kept == 0:
            raise ValueError(
                f"the {name} split has no windows"
                + (f" after purging {int(in_split.sum())} of them with purge_seconds={purge_seconds:g}"
                   if in_split.any() and purge_seconds > 0 else "")
                + "; use a smaller purge_seconds or provide more experiments"
            )
        present = set(ids[kept])
        infos[name] = SplitInfo(
            name=name,
            experiment_ids=tuple(members["experiment"]),
            start=real_members["start"].min(),
            end=real_members["end"].max(),
            windows_retained=n_kept,
            windows_dropped_purge=int(in_split.sum()) - n_kept,
            fully_purged_experiments=tuple(e for e in members["experiment"] if e not in present),
        )
        subsets[name] = seq.subset(kept)

    report = SplitReport(
        train=infos["train"],
        validation=infos["validation"],
        test=infos["test"],
        synthetic_experiments=tuple(synthetic["experiment"]),
        total_windows=n,
        purge_seconds=purge_seconds,
        interval_seconds=int(seq.interval_seconds),
        history_seconds=int(seq.history_seconds),
        horizon_seconds=int(seq.horizon_seconds),
        fractions=fractions,
    )
    return SplitResult(subsets["train"], subsets["validation"], subsets["test"], report)