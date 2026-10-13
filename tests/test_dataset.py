"""Tests for ml/dataset.py (SequenceDataset, validation, optional PyTorch adapter).

All data is tiny and generated in memory; nothing is downloaded. Experiment ids such as "E1" are
plain test labels, not evidence of anything. Torch-specific tests are skipped (with a reason) only
when PyTorch cannot be imported; the "torch is missing" behaviour is tested by simulating absence,
so it is covered whether or not PyTorch is installed.
"""

import dataclasses
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

np = pytest.importorskip("numpy")
pd = pytest.importorskip("pandas")

from ml import dataset as ds_mod  # noqa: E402
from ml.dataset import (  # noqa: E402
    TORCH_INSTALL_HINT,
    SequenceDataset,
    SequenceMetadata,
    require_torch,
    torch_available,
    validate_sequence_set,
)
from ml.sequences import SequenceSet, build_sequences  # noqa: E402

PROJECT_ROOT = Path(__file__).resolve().parents[1]
START = pd.Timestamp("2026-01-05T08:00:00Z")

needs_torch = pytest.mark.skipif(not torch_available(), reason="PyTorch is not installed / importable here")


# ---------------------------------------------------------------- fixtures
def make_frame(rows=30, ids=("E1", "E2"), interval=60):
    rng = np.random.default_rng(0)
    parts = []
    for k, exp_id in enumerate(ids):
        j = np.arange(rows)
        parts.append(
            pd.DataFrame(
                {
                    "timestamp": pd.date_range(START + k * pd.Timedelta(days=1), periods=rows, freq=f"{interval}s"),
                    "experiment_id": exp_id,
                    "location": "room",
                    "temperature_c": 22.0 + np.sin(j / 5.0) + rng.normal(0, 0.1, rows),
                    "humidity_percent": 45.0 + np.cos(j / 7.0) + rng.normal(0, 0.1, rows),
                    "mq135_raw": 300.0 + 3.0 * j + rng.normal(0, 1.0, rows),
                    "occupancy": (j // 6) % 3,
                    "ventilation": np.where((j // 8) % 2 == 0, "closed", "open"),
                    "fan": np.where((j // 10) % 2 == 0, "off", "on"),
                    "ac": np.where(j < rows // 2, None, "on"),
                    "was_imputed": False,
                }
            )
        )
    return pd.concat(parts, ignore_index=True)


@pytest.fixture(scope="module")
def seq():
    return build_sequences(make_frame(), "3min", "3min", interval_seconds=60)


@pytest.fixture(scope="module")
def ds(seq):
    return SequenceDataset(seq)


def broken(seq, **changes):
    return dataclasses.replace(seq, **changes)


def snapshot(seq):
    return dict(
        X=seq.X.copy(), y=seq.y.copy(), t0=seq.target_at_origin.copy(), ids=list(seq.experiment_ids),
        o=seq.origin_times.copy(), t=seq.target_times.copy(), names=tuple(seq.feature_names),
    )


def assert_unchanged(seq, snap):
    np.testing.assert_array_equal(seq.X, snap["X"])
    np.testing.assert_array_equal(seq.y, snap["y"])
    np.testing.assert_array_equal(seq.target_at_origin, snap["t0"])
    assert list(seq.experiment_ids) == snap["ids"]
    assert seq.origin_times.equals(snap["o"]) and seq.target_times.equals(snap["t"])
    assert tuple(seq.feature_names) == snap["names"]


# ---------------------------------------------------------------- 1. shapes and alignment
def test_shapes_dtypes_and_alignment(seq, ds):
    n, steps, feats = seq.X.shape
    assert len(ds) == n and n > 0
    assert ds.X.shape == (n, steps, feats) and ds.X.dtype == np.float32
    assert ds.y.shape == (n,) and ds.y.dtype == np.float32
    assert ds.target_at_origin.shape == (n,) and ds.target_at_origin.dtype == np.float32
    assert len(ds.experiment_ids) == len(ds.origin_times) == len(ds.target_times) == n
    assert ds.n_features == feats == len(ds.feature_names)
    np.testing.assert_array_equal(ds.X, seq.X.astype(np.float32))
    np.testing.assert_array_equal(ds.y, seq.y.astype(np.float32))


def test_getitem_returns_aligned_window_and_target(seq, ds):
    for i in (0, 5, len(ds) - 1):
        x, y = ds[i]
        assert x.shape == (seq.history_steps, ds.n_features)
        np.testing.assert_array_equal(x, seq.X[i])
        assert float(y) == pytest.approx(float(seq.y[i]))


def test_negative_indices_wrap_and_bad_indices_fail(ds):
    np.testing.assert_array_equal(ds[-1][0], ds[len(ds) - 1][0])
    with pytest.raises(IndexError, match="out of range"):
        ds[len(ds)]
    with pytest.raises(IndexError):
        ds[-len(ds) - 1]
    for bad in (1.5, "0", None, True):
        with pytest.raises(TypeError, match="integer"):
            ds[bad]


def test_target_is_horizon_ahead_of_the_last_input_step(seq, ds):
    """Alignment against the source frame: y equals mq135_raw at target_time, last X row sits at origin_time."""
    df = make_frame().set_index(["experiment_id", "timestamp"])
    col = list(ds.feature_names).index("mq135_raw")
    for i in range(len(ds)):
        m = ds.metadata(i)
        assert df.loc[(m.experiment_id, m.target_time), "mq135_raw"] == pytest.approx(float(ds.y[i]), rel=1e-6)
        assert df.loc[(m.experiment_id, m.origin_time), "mq135_raw"] == pytest.approx(float(ds.X[i, -1, col]), rel=1e-6)
        assert df.loc[(m.experiment_id, m.origin_time), "mq135_raw"] == pytest.approx(float(ds.target_at_origin[i]), rel=1e-6)


# ---------------------------------------------------------------- 2. ids, times, metadata
def test_experiment_ids_origin_and_target_times(seq, ds):
    assert list(ds.experiment_ids) == list(seq.experiment_ids)
    assert set(ds.experiment_ids) == {"E1", "E2"}
    assert ds.origin_times.equals(seq.origin_times) and ds.target_times.equals(seq.target_times)
    assert ds.origin_times.tz is not None and ds.target_times.tz is not None
    gap = (ds.target_times - ds.origin_times).total_seconds()
    assert np.all(gap == ds.horizon_seconds) and ds.horizon_seconds == 180


def test_metadata_per_window(seq, ds):
    m = ds.metadata(3)
    assert isinstance(m, SequenceMetadata)
    assert m.experiment_id == str(seq.experiment_ids[3])
    assert m.origin_time == seq.origin_times[3] and m.target_time == seq.target_times[3]
    assert ds.metadata(-1).origin_time == seq.origin_times[-1]
    with pytest.raises(IndexError):
        ds.metadata(len(ds))
    with pytest.raises(dataclasses.FrozenInstanceError):
        m.experiment_id = "other"


def test_dataset_level_metadata(seq, ds):
    assert ds.feature_names == tuple(seq.feature_names)
    assert ds.target_column == "mq135_raw"
    assert ds.interval_seconds == 60
    assert (ds.history_steps, ds.horizon_steps) == (seq.history_steps, seq.horizon_steps)
    assert ds.history_seconds == seq.history_steps * 60 and ds.horizon_seconds == seq.horizon_steps * 60
    text = ds.describe()
    assert "mq135_raw" in text and "E1" in text and str(len(ds)) in text


# ---------------------------------------------------------------- 3. rejection of bad input
def test_rejects_wrong_type():
    for bad in (None, {"X": 1}, np.zeros((2, 3, 4))):
        with pytest.raises(TypeError, match="SequenceSet"):
            SequenceDataset(bad)
        with pytest.raises(TypeError, match="SequenceSet"):
            validate_sequence_set(bad)


def test_rejects_empty(seq):
    empty = seq.subset(np.zeros(len(seq), dtype=bool))
    assert len(empty) == 0
    with pytest.raises(ValueError, match="empty"):
        SequenceDataset(empty)


def test_error_messages_name_the_role(seq):
    with pytest.raises(ValueError, match="validation data"):
        SequenceDataset(seq.subset(np.zeros(len(seq), dtype=bool)), role="validation data")


def test_rejects_malformed_shapes(seq):
    with pytest.raises(ValueError, match=r"shape \(N, T, F\)"):
        SequenceDataset(broken(seq, X=seq.X[:, :, 0]))
    with pytest.raises(ValueError, match="time steps"):
        SequenceDataset(broken(seq, history_steps=seq.history_steps + 1))
    with pytest.raises(ValueError, match="features"):
        SequenceDataset(broken(seq, feature_names=tuple(seq.feature_names[:-1])))
    with pytest.raises(ValueError, match=r"y must have shape"):
        SequenceDataset(broken(seq, y=seq.y.reshape(-1, 1)))
    with pytest.raises(ValueError, match="duplicates"):
        names = (seq.feature_names[0],) * len(seq.feature_names)
        SequenceDataset(broken(seq, feature_names=names))


@pytest.mark.parametrize("field", ["y", "target_at_origin", "experiment_ids", "origin_times", "target_times"])
def test_rejects_misaligned_lengths(seq, field):
    with pytest.raises(ValueError, match="not aligned") as exc:
        SequenceDataset(broken(seq, **{field: getattr(seq, field)[:-1]}))
    assert field in str(exc.value)


@pytest.mark.parametrize("field", ["origin_times", "target_times"])
def test_rejects_timezone_naive_times(seq, field):
    naive = getattr(seq, field).tz_localize(None)
    assert naive.tz is None
    with pytest.raises(ValueError, match="timezone-aware"):
        SequenceDataset(broken(seq, **{field: naive}))


@pytest.mark.parametrize("field", ["X", "y", "target_at_origin"])
@pytest.mark.parametrize("bad", [np.nan, np.inf, -np.inf])
def test_rejects_nan_and_infinite(seq, field, bad):
    arr = getattr(seq, field).copy()
    arr.reshape(-1)[0] = bad
    with pytest.raises(ValueError, match=f"{field} contains NaN or infinite"):
        SequenceDataset(broken(seq, **{field: arr}))


def test_valid_set_passes_validation(seq):
    assert validate_sequence_set(seq) is None


# ---------------------------------------------------------------- 4. no mutation of sources
def test_source_arrays_not_mutated_by_building_or_iterating(seq):
    snap = snapshot(seq)
    d = SequenceDataset(seq)
    for _ in d.batches(4, shuffle=True, seed=1):
        pass
    d.describe(), d.metadata(0), d[0]
    assert_unchanged(seq, snap)


def test_dataset_owns_copies_and_is_read_only(seq):
    snap = snapshot(seq)
    d = SequenceDataset(seq)
    assert not np.shares_memory(d.X, seq.X) and not np.shares_memory(d.y, seq.y)
    seq.X[0, 0, 0] += 1000.0  # change the source afterwards ...
    try:
        assert d.X[0, 0, 0] != seq.X[0, 0, 0]  # ... the dataset does not follow
    finally:
        seq.X[0, 0, 0] = snap["X"][0, 0, 0]
    for arr in (d.X, d.y, d.target_at_origin):
        assert not arr.flags.writeable
        with pytest.raises(ValueError):
            arr.reshape(-1)[0] = 0.0
    assert_unchanged(seq, snap)


def test_modifying_a_batch_cannot_change_the_dataset(ds):
    before_X, before_y = ds.X.copy(), ds.y.copy()
    for _, xb, yb in ds.batches(5):
        assert not np.shares_memory(xb, ds.X) and not np.shares_memory(yb, ds.y)
        xb[...] = 0.0
        yb[...] = 0.0
    np.testing.assert_array_equal(ds.X, before_X)
    np.testing.assert_array_equal(ds.y, before_y)


# ---------------------------------------------------------------- 5. batching
def test_batches_cover_everything_in_order(ds):
    batches = list(ds.batches(7))
    idx = np.concatenate([b[0] for b in batches])
    np.testing.assert_array_equal(idx, np.arange(len(ds)))
    np.testing.assert_array_equal(np.concatenate([b[1] for b in batches]), ds.X)
    np.testing.assert_array_equal(np.concatenate([b[2] for b in batches]), ds.y)
    assert all(len(b[0]) == 7 for b in batches[:-1]) and 1 <= len(batches[-1][0]) <= 7
    assert len(batches) == -(-len(ds) // 7)


def test_batch_content_matches_indices(ds):
    for idx, xb, yb in ds.batches(6, shuffle=True, seed=3):
        np.testing.assert_array_equal(xb, ds.X[idx])
        np.testing.assert_array_equal(yb, ds.y[idx])


def test_batch_size_larger_than_dataset_gives_single_batch(ds):
    batches = list(ds.batches(10_000))
    assert len(batches) == 1 and len(batches[0][0]) == len(ds)


def test_seeded_shuffle_is_reproducible_and_a_permutation(ds):
    def order(seed):
        return np.concatenate([b[0] for b in ds.batches(5, shuffle=True, seed=seed)])

    a, b, c = order(11), order(11), order(12)
    np.testing.assert_array_equal(a, b)
    assert not np.array_equal(a, c)
    assert not np.array_equal(a, np.arange(len(ds)))
    np.testing.assert_array_equal(np.sort(a), np.arange(len(ds)))
    np.testing.assert_array_equal(a, np.random.default_rng(11).permutation(len(ds)))


def test_shuffle_order_independent_of_batch_size_and_global_rng(ds):
    np.random.seed(0)
    a = np.concatenate([b[0] for b in ds.batches(3, shuffle=True, seed=5)])
    np.random.seed(999)
    b = np.concatenate([b[0] for b in ds.batches(8, shuffle=True, seed=5)])
    np.testing.assert_array_equal(a, b)


def test_shuffle_without_seed_is_refused(ds):
    with pytest.raises(ValueError, match="explicit seed"):
        list(ds.batches(4, shuffle=True))
    assert len(list(ds.batches(4, shuffle=False, seed=None))) > 0


@pytest.mark.parametrize("bad", [0, -1, 2.5, "3", None, True])
def test_invalid_batch_size(ds, bad):
    with pytest.raises(ValueError, match="batch_size"):
        list(ds.batches(bad))


# ---------------------------------------------------------------- 6. optional PyTorch
def test_install_hint_is_helpful():
    assert "pip install torch" in TORCH_INSTALL_HINT and "requirements-ml.txt" in TORCH_INSTALL_HINT


def test_torch_available_is_consistent_with_module_state():
    assert torch_available() == (ds_mod.torch is not None)
    assert (ds_mod.TorchSequenceDataset is not None) == torch_available()


def test_missing_torch_gives_clear_error_in_process(monkeypatch, ds):
    monkeypatch.setattr(ds_mod, "torch", None)
    monkeypatch.setattr(ds_mod, "_TORCH_IMPORT_ERROR", "ModuleNotFoundError: No module named 'torch'")
    assert ds_mod.torch_available() is False
    with pytest.raises(ImportError, match="pip install torch") as exc:
        require_torch()
    assert "No module named 'torch'" in str(exc.value)
    with pytest.raises(ImportError, match="PyTorch is required"):
        ds.to_torch()
    # The NumPy side keeps working without torch.
    assert len(ds) > 0 and len(list(ds.batches(4))) > 0


def _run_isolated(code):
    return subprocess.run(
        [sys.executable, "-I", "-c", textwrap.dedent(code)],
        capture_output=True, text=True, cwd=str(PROJECT_ROOT), timeout=120,
    )


_PRELUDE = f"""
import sys
sys.path.insert(0, {str(PROJECT_ROOT)!r})
"""


def test_import_is_safe_when_torch_is_not_installed():
    r = _run_isolated(_PRELUDE + """
sys.modules['torch'] = None   # makes `import torch` raise ImportError
import ml.dataset as d
assert d.torch is None and d.torch_available() is False
assert d.TorchSequenceDataset is None
try:
    d.require_torch()
except ImportError as e:
    assert 'pip install torch' in str(e)
    print('OK')
""")
    assert r.returncode == 0, r.stderr
    assert r.stdout.strip() == "OK"


def test_import_is_safe_when_torch_is_installed_but_broken():
    r = _run_isolated(_PRELUDE + """
import importlib.abc
class Broken(importlib.abc.MetaPathFinder):
    def find_spec(self, name, path, target=None):
        if name == 'torch' or name.startswith('torch.'):
            raise OSError('libtorch_cpu.so: cannot open shared object file')
sys.meta_path.insert(0, Broken())
import ml.dataset as d
assert d.torch is None
try:
    d.require_torch()
except ImportError as e:
    assert 'OSError' in str(e) and 'libtorch_cpu' in str(e), str(e)
    print('OK')
""")
    assert r.returncode == 0, r.stderr
    assert r.stdout.strip() == "OK"


@needs_torch
def test_torch_adapter_items_shapes_and_values(seq, ds):
    import torch

    t = ds.to_torch()
    assert isinstance(t, torch.utils.data.Dataset) and isinstance(t, ds_mod.TorchSequenceDataset)
    assert len(t) == len(ds) and t.source is ds
    x, y = t[2]
    assert isinstance(x, torch.Tensor) and x.dtype == torch.float32 and tuple(x.shape) == (seq.history_steps, ds.n_features)
    assert y.dtype == torch.float32 and y.ndim == 0
    np.testing.assert_array_equal(x.numpy(), ds.X[2])
    assert float(y) == float(ds.y[2])
    np.testing.assert_array_equal(t[-1][0].numpy(), ds.X[-1])
    with pytest.raises(IndexError):
        t[len(t)]
    with pytest.raises(TypeError):
        t["a"]


@needs_torch
def test_torch_adapter_works_with_dataloader_and_does_not_alias_source(ds):
    import torch

    t = ds.to_torch()
    loader = torch.utils.data.DataLoader(t, batch_size=5, shuffle=False)
    xs, ys = zip(*loader)
    np.testing.assert_array_equal(torch.cat(xs).numpy(), ds.X)
    np.testing.assert_array_equal(torch.cat(ys).numpy(), ds.y)
    t._X[0, 0, 0] = 12345.0  # modifying the tensor copy must not touch the NumPy dataset
    assert ds.X[0, 0, 0] != 12345.0


@needs_torch
def test_torch_adapter_requires_a_sequence_dataset(seq):
    with pytest.raises(TypeError, match="SequenceDataset"):
        ds_mod.TorchSequenceDataset(seq)