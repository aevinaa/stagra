"""Tests for ml/train.py (TrainConfig, GRU/LSTM forecaster, train_model, load_trained_model).

Fixtures are tiny (6 short experiments, 8 hidden units, a few epochs), run on CPU, use temporary
directories for every artifact and download nothing. Experiment ids "E1".."E6" are plain test labels
and "SYNTH-..." ids exercise the synthetic-data safeguards; none of this is evidence about real air
quality. Torch-dependent tests are skipped (with a reason) only when PyTorch cannot be imported;
the "PyTorch is missing" behaviour is tested by simulating its absence, so it runs either way.
"""

import copy
import dataclasses
import hashlib
import json
import shutil
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

np = pytest.importorskip("numpy")
pd = pytest.importorskip("pandas")

from ml import dataset as ds_mod  # noqa: E402
from ml import train as train_mod  # noqa: E402
from ml.baselines import regression_metrics  # noqa: E402
from ml.dataset import SequenceDataset, torch_available  # noqa: E402
from ml.scaling import SequenceScaler  # noqa: E402
from ml.sequences import build_sequences  # noqa: E402
from ml.splits import SplitResult, split_by_experiment  # noqa: E402
from ml.train import (  # noqa: E402
    METADATA_FILE,
    MODEL_FILE,
    SCALER_FILE,
    SCHEMA_NAME,
    TrainConfig,
    load_trained_model,
    train_model,
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]
START = pd.Timestamp("2026-01-05T08:00:00Z")
DAY = pd.Timedelta(days=1)
IDS6 = ["E1", "E2", "E3", "E4", "E5", "E6"]  # train E1-E4, validation E5, test E6
ARTIFACTS = {MODEL_FILE, SCALER_FILE, METADATA_FILE}

needs_torch = pytest.mark.skipif(not torch_available(), reason="PyTorch is not installed / importable here")

if torch_available():
    import torch


# ---------------------------------------------------------------- fixtures and helpers
def make_frame(specs, interval=60, seed=0):
    """Cleaned-data frame (like ml.preprocess output). specs: (experiment_id, start, rows[, factor])."""
    rng = np.random.default_rng(seed)
    parts = []
    for spec in specs:
        exp_id, start, rows = spec[:3]
        factor = spec[3] if len(spec) > 3 else 1.0
        j = np.arange(rows)
        parts.append(
            pd.DataFrame(
                {
                    "timestamp": pd.date_range(start, periods=rows, freq=f"{interval}s"),
                    "experiment_id": exp_id,
                    "location": "room",
                    "temperature_c": factor * (22.0 + 3.0 * np.sin(j / 7.0) + rng.normal(0, 0.3, rows)),
                    "humidity_percent": factor * (45.0 + 8.0 * np.cos(j / 11.0) + rng.normal(0, 0.5, rows)),
                    "mq135_raw": factor * (300.0 + 2.0 * j + rng.normal(0, 5.0, rows)),
                    "occupancy": (j // 9) % 4,
                    "ventilation": np.where((j // 13) % 2 == 0, "closed", "open"),
                    "fan": np.where((j // 17) % 2 == 0, "off", "on"),
                    "ac": np.where(j < rows // 2, None, "on"),
                    "was_imputed": False,
                }
            )
        )
    return pd.concat(parts, ignore_index=True)


def daily(ids, rows=40, factors=None):
    factors = factors or {}
    return [(e, START + i * DAY, rows, factors.get(e, 1.0)) for i, e in enumerate(ids)]


def build(specs, interval=60, history="3min", horizon="3min", **kw):
    return build_sequences(make_frame(specs, interval), history, horizon, interval_seconds=interval, **kw)


def make_split(ids=IDS6, rows=40, factors=None):
    return split_by_experiment(build(daily(ids, rows, factors)))


def tiny(**kw):
    args = dict(seed=0, hidden_size=8, batch_size=32, max_epochs=4, patience=3, learning_rate=1e-2)
    args.update(kw)
    return TrainConfig(**args)


@pytest.fixture(scope="module")
def split():
    return make_split()


@pytest.fixture(autouse=True)
def restore_torch_globals():
    """seed_everything changes process-wide settings; put them back after each test."""
    if not torch_available():
        yield
        return
    threads = torch.get_num_threads()
    deterministic = torch.are_deterministic_algorithms_enabled()
    warn_only = torch.is_deterministic_algorithms_warn_only_enabled()
    yield
    torch.set_num_threads(threads)
    torch.use_deterministic_algorithms(deterministic, warn_only=warn_only)


@pytest.fixture(scope="module")
def trained(split, tmp_path_factory):
    """One shared small GRU run (read-only for tests; tests that corrupt files copy the directory)."""
    if not torch_available():
        pytest.skip("PyTorch is not installed / importable here")
    out = tmp_path_factory.mktemp("trained") / "run"
    return train_model(split, tiny(), out)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def tree_hashes(root):
    root = Path(root)
    return {str(p.relative_to(root)): sha(p) for p in sorted(root.rglob("*")) if p.is_file()}


def seq_snapshot(seq):
    return dict(
        X=seq.X.copy(), y=seq.y.copy(), t0=seq.target_at_origin.copy(), ids=list(seq.experiment_ids),
        o=seq.origin_times.copy(), t=seq.target_times.copy(), names=tuple(seq.feature_names),
        col=seq.target_column,
    )


def assert_seq_unchanged(seq, snap):
    np.testing.assert_array_equal(seq.X, snap["X"])
    np.testing.assert_array_equal(seq.y, snap["y"])
    np.testing.assert_array_equal(seq.target_at_origin, snap["t0"])
    assert list(seq.experiment_ids) == snap["ids"]
    assert seq.origin_times.equals(snap["o"]) and seq.target_times.equals(snap["t"])
    assert tuple(seq.feature_names) == snap["names"] and seq.target_column == snap["col"]


def with_test_ids(split, ids):
    """Copy of `split` whose report claims different held-out test experiments."""
    info = dataclasses.replace(split.report.test, experiment_ids=tuple(ids))
    return split._replace(report=dataclasses.replace(split.report, test=info))


def read_meta(out):
    return json.loads((Path(out) / METADATA_FILE).read_text(encoding="utf-8"))


def write_meta(out, meta):
    (Path(out) / METADATA_FILE).write_text(json.dumps(meta), encoding="utf-8")


def script_validation_losses(monkeypatch, values):
    """Replace the validation losses seen by train_model with `values` (training still really runs).

    Returns (train_states, val_sizes): a copy of the weights after each training epoch.
    """
    real = train_mod._run_epoch
    scripted = iter(values)
    states, val_sizes = [], []

    def fake(model, dataset, batch_size, device, *, optimizer=None, grad_clip=None, shuffle_seed=None):
        out = real(model, dataset, batch_size, device, optimizer=optimizer, grad_clip=grad_clip, shuffle_seed=shuffle_seed)
        if optimizer is not None:
            states.append({k: v.detach().clone() for k, v in model.state_dict().items()})
            return out
        val_sizes.append(len(dataset))
        return next(scripted)

    monkeypatch.setattr(train_mod, "_run_epoch", fake)
    return states, val_sizes


# ================================================================ TrainConfig (no torch needed)
def test_config_defaults_are_valid_and_small():
    c = TrainConfig()
    assert c.model_type == "gru" and c.device == "cpu" and c.torch_threads == 1
    assert c.hidden_size <= 64 and c.dropout == 0.0 and c.grad_clip == 1.0 and c.patience >= 1


def test_config_is_frozen():
    with pytest.raises(dataclasses.FrozenInstanceError):
        TrainConfig().seed = 5


@pytest.mark.parametrize("model_type", ["gru", "lstm"])
def test_config_accepts_supported_model_types(model_type):
    assert TrainConfig(model_type=model_type).model_type == model_type


@pytest.mark.parametrize("bad", ["rnn", "GRU", "transformer", "", None, 3])
def test_config_rejects_unknown_model_type(bad):
    with pytest.raises(ValueError, match="model_type"):
        TrainConfig(model_type=bad)


@pytest.mark.parametrize(
    "field,bad",
    [
        ("seed", -1), ("seed", 1.5), ("seed", True), ("seed", None),
        ("hidden_size", 0), ("hidden_size", -4), ("hidden_size", 2.0),
        ("num_layers", 0), ("num_layers", True),
        ("dropout", -0.1), ("dropout", 1.0), ("dropout", float("nan")), ("dropout", "0.1"),
        ("learning_rate", 0.0), ("learning_rate", -1e-3), ("learning_rate", float("inf")), ("learning_rate", float("nan")),
        ("weight_decay", -1e-4), ("weight_decay", float("nan")),
        ("batch_size", 0), ("batch_size", 3.5),
        ("max_epochs", 0), ("max_epochs", -1),
        ("patience", 0), ("patience", -2),
        ("min_delta", -0.1), ("min_delta", float("inf")),
        ("grad_clip", 0.0), ("grad_clip", -1.0), ("grad_clip", float("nan")),
        ("torch_threads", 0), ("torch_threads", 1.5),
        ("device", "tpu"), ("device", "gpu"), ("device", ""),
    ],
)
def test_config_rejects_invalid_hyperparameters(field, bad):
    with pytest.raises(ValueError, match=field):
        TrainConfig(**{field: bad})


def test_config_dropout_needs_multiple_layers():
    with pytest.raises(ValueError, match="num_layers >= 2"):
        TrainConfig(dropout=0.2, num_layers=1)
    assert TrainConfig(dropout=0.2, num_layers=2).dropout == 0.2
    assert TrainConfig(dropout=0.0, num_layers=1).dropout == 0.0


def test_config_optional_values_may_be_none_or_edge():
    c = TrainConfig(grad_clip=None, torch_threads=None, weight_decay=0.0, min_delta=0.0, seed=0)
    assert c.grad_clip is None and c.torch_threads is None
    assert TrainConfig(dropout=0.999, num_layers=2).dropout == 0.999


def test_config_accepts_numpy_integers():
    c = TrainConfig(seed=np.int64(3), hidden_size=np.int32(4), batch_size=np.int64(8))
    assert c.seed == 3 and c.hidden_size == 4


# ================================================================ PyTorch missing (simulated and isolated)
def test_module_constants_describe_the_artifacts():
    assert (MODEL_FILE, SCALER_FILE, METADATA_FILE) == ("model.pt", "scaler.json", "metadata.json")
    assert train_mod.MODEL_TYPES == ("gru", "lstm") and train_mod.SCHEMA_VERSION == 1
    assert "not ppm" in train_mod.TARGET_DESCRIPTION and "AQI" in train_mod.TARGET_DESCRIPTION


def test_training_without_torch_raises_clear_install_error(monkeypatch, split, tmp_path):
    monkeypatch.setattr(ds_mod, "torch", None)
    monkeypatch.setattr(ds_mod, "_TORCH_IMPORT_ERROR", "ModuleNotFoundError: No module named 'torch'")
    out = tmp_path / "run"
    with pytest.raises(ImportError, match="pip install torch") as exc:
        train_model(split, TrainConfig(), out)
    assert "PyTorch is required" in str(exc.value) and "requirements-ml.txt" in str(exc.value)
    assert not out.exists(), "nothing may be written when training cannot start"
    for call in (
        lambda: train_mod.seed_everything(0),
        lambda: train_mod.build_model(TrainConfig(), 3),
        lambda: load_trained_model(tmp_path),
    ):
        with pytest.raises(ImportError, match="pip install torch"):
            call()


def test_cli_without_torch_exits_2_with_install_advice(monkeypatch, capsys, tmp_path):
    monkeypatch.setattr(ds_mod, "torch", None)
    out = tmp_path / "run"
    rc = train_mod.main(["--clean-csv", str(tmp_path / "nope.csv"), "--output-dir", str(out)])
    captured = capsys.readouterr()
    assert rc == 2
    assert "pip install torch" in captured.err and captured.err.startswith("error:")
    assert not out.exists()


def _isolated(code):
    prelude = f"import sys\nsys.path.insert(0, {str(PROJECT_ROOT)!r})\n"
    return subprocess.run(
        [sys.executable, "-I", "-c", prelude + textwrap.dedent(code)],
        capture_output=True, text=True, cwd=str(PROJECT_ROOT), timeout=120,
    )


def test_import_works_without_torch_in_a_fresh_interpreter():
    r = _isolated("""
        sys.modules['torch'] = None   # `import torch` now raises ImportError
        import ml.train as t, ml.dataset as d
        assert d.torch is None and t.RecurrentForecaster is None
        cfg = t.TrainConfig(model_type='lstm', hidden_size=4)      # configuration still works
        try:
            t.train_model(None, cfg, 'unused')
        except ImportError as e:
            assert 'pip install torch' in str(e)
        else:
            raise SystemExit('no ImportError')
        assert t.main(['--clean-csv', 'x.csv', '--output-dir', 'out_not_created']) == 2
        import os
        assert not os.path.exists('out_not_created')
        print('OK')
    """)
    assert r.returncode == 0, r.stderr
    assert r.stdout.strip().endswith("OK")
    assert "pip install torch" in r.stderr  # the CLI printed the advice


def test_import_works_with_a_broken_torch_install():
    r = _isolated("""
        import importlib.abc
        class Broken(importlib.abc.MetaPathFinder):
            def find_spec(self, name, path, target=None):
                if name == 'torch' or name.startswith('torch.'):
                    raise OSError('cannot open shared object file')
        sys.meta_path.insert(0, Broken())
        import ml.train as t
        assert t.RecurrentForecaster is None
        try:
            t.build_model(t.TrainConfig(), 3)
        except ImportError as e:
            assert 'OSError' in str(e)
            print('OK')
    """)
    assert r.returncode == 0, r.stderr
    assert r.stdout.strip() == "OK"


# ================================================================ models
@needs_torch
@pytest.mark.parametrize("model_type,rnn_cls", [("gru", "GRU"), ("lstm", "LSTM")])
def test_forward_shape_for_gru_and_lstm(model_type, rnn_cls):
    cfg = TrainConfig(model_type=model_type, hidden_size=6)
    model = train_mod.build_model(cfg, n_features=8)
    assert type(model.rnn).__name__ == rnn_cls and model.rnn.batch_first
    out = model(torch.zeros(5, 4, 8))
    assert tuple(out.shape) == (5,) and torch.isfinite(out).all() and out.dtype == torch.float32
    assert tuple(model(torch.zeros(1, 1, 8)).shape) == (1,)  # single window, single step


@needs_torch
def test_forward_shape_with_stacked_layers_and_dropout():
    model = train_mod.build_model(TrainConfig(model_type="lstm", hidden_size=5, num_layers=2, dropout=0.3), 3)
    model.eval()
    out = model(torch.randn(7, 6, 3))
    assert tuple(out.shape) == (7,)
    assert model.rnn.num_layers == 2 and model.rnn.dropout == pytest.approx(0.3)


@needs_torch
def test_forward_uses_the_last_time_step_and_is_deterministic_in_eval():
    model = train_mod.build_model(TrainConfig(hidden_size=4), 3).eval()
    x = torch.randn(2, 5, 3)
    np.testing.assert_array_equal(model(x).detach().numpy(), model(x).detach().numpy())
    x2 = x.clone()
    x2[:, -1, :] += 1.0  # changing the last step changes the output ...
    assert not torch.allclose(model(x), model(x2))


@needs_torch
def test_build_model_validates_features_and_is_reproducible_after_seeding():
    with pytest.raises(ValueError, match="n_features"):
        train_mod.build_model(TrainConfig(), 0)
    cfg = TrainConfig(hidden_size=4)
    train_mod.seed_everything(7)
    a = train_mod.build_model(cfg, 3).state_dict()
    train_mod.seed_everything(7)
    b = train_mod.build_model(cfg, 3).state_dict()
    train_mod.seed_everything(8)
    c = train_mod.build_model(cfg, 3).state_dict()
    assert all(torch.equal(a[k], b[k]) for k in a)
    assert any(not torch.equal(a[k], c[k]) for k in a)


@needs_torch
def test_seed_everything_sets_threads_and_deterministic_mode():
    train_mod.seed_everything(1, torch_threads=1)
    assert torch.get_num_threads() == 1
    assert torch.are_deterministic_algorithms_enabled() and torch.is_deterministic_algorithms_warn_only_enabled()


@needs_torch
def test_predict_scaled_shape_order_and_type_check(trained, split):
    loaded = load_trained_model(trained.output_dir)
    ds = SequenceDataset(loaded.scaler.transform(split.validation))
    pred = train_mod.predict_scaled(loaded.model, ds, batch_size=7)
    assert pred.shape == (len(ds),) and pred.dtype == np.float32 and np.isfinite(pred).all()
    np.testing.assert_allclose(pred, train_mod.predict_scaled(loaded.model, ds, batch_size=1000), atol=1e-6)
    with pytest.raises(TypeError, match="SequenceDataset"):
        train_mod.predict_scaled(loaded.model, split.validation)


@needs_torch
def test_non_finite_loss_is_reported_not_hidden(split):
    cfg = tiny()
    model = train_mod.build_model(cfg, split.train.n_features)
    with torch.no_grad():
        model.head.bias.fill_(float("nan"))
    ds = SequenceDataset(SequenceScaler.fit_train(split.train).transform(split.train))
    with pytest.raises(RuntimeError, match="NaN or infinite"):
        train_mod._run_epoch(model, ds, 16, torch.device("cpu"))


# ================================================================ small deterministic training runs
@needs_torch
@pytest.mark.parametrize("model_type", ["gru", "lstm"])
def test_small_training_run_has_finite_losses(split, tmp_path, model_type):
    res = train_model(split, tiny(model_type=model_type, max_epochs=5, patience=5), tmp_path / "run")
    assert res.epochs_run == len(res.history) == 5 and not res.stopped_early
    for k, row in enumerate(res.history, start=1):
        assert row["epoch"] == k
        assert np.isfinite(row["train_loss"]) and np.isfinite(row["val_loss"]) and row["train_loss"] >= 0
    assert np.isfinite(res.best_val_loss) and res.best_val_loss == min(r["val_loss"] for r in res.history)
    assert res.best_epoch == 1 + int(np.argmin([r["val_loss"] for r in res.history]))
    assert 1 <= res.best_epoch <= res.epochs_run
    assert model_type.upper() in res.summary() and "Test set not used" in res.summary()


@needs_torch
def test_training_reduces_the_training_loss(split, tmp_path):
    res = train_model(split, tiny(max_epochs=12, patience=12, learning_rate=2e-2), tmp_path / "run")
    first, last = res.history[0]["train_loss"], res.history[-1]["train_loss"]
    assert last < first, "training loss should fall on this easy ramp-like series"


# ================================================================ reproducibility
@needs_torch
def test_same_seed_gives_same_losses_and_weights(split, tmp_path):
    """Same machine, same thread count, CPU: runs are expected to match bit for bit.

    A tiny tolerance (atol 1e-6 on weights, rtol 1e-6 on losses) is allowed so the test does not
    depend on BLAS summation details, yet it is ~4 orders of magnitude below the differences a
    different seed produces (asserted below), so it still catches nondeterminism.
    """
    a = train_model(split, tiny(seed=3), tmp_path / "a")
    torch.manual_seed(12345)  # disturb global state between runs: train_model must re-seed itself
    np.random.seed(999)
    b = train_model(split, tiny(seed=3), tmp_path / "b")
    c = train_model(split, tiny(seed=4), tmp_path / "c")
    for ra, rb in zip(a.history, b.history):
        assert ra["train_loss"] == pytest.approx(rb["train_loss"], rel=1e-6)
        assert ra["val_loss"] == pytest.approx(rb["val_loss"], rel=1e-6)
    sa = torch.load(a.model_path, weights_only=True)["state_dict"]
    sb = torch.load(b.model_path, weights_only=True)["state_dict"]
    sc = torch.load(c.model_path, weights_only=True)["state_dict"]
    assert sa.keys() == sb.keys()
    for k in sa:
        torch.testing.assert_close(sa[k], sb[k], rtol=0, atol=1e-6)
    assert max(float((sa[k] - sc[k]).abs().max()) for k in sa) > 1e-2  # a different seed really differs
    assert a.scaler.to_dict() == b.scaler.to_dict()


@needs_torch
def test_batch_order_depends_on_seed_and_epoch(split):
    ds = SequenceDataset(SequenceScaler.fit_train(split.train).transform(split.train))
    o = lambda seed: np.concatenate([b[0] for b in ds.batches(8, shuffle=True, seed=seed)])  # noqa: E731
    assert not np.array_equal(o(3 + 1), o(3 + 2))  # consecutive epochs shuffle differently
    np.testing.assert_array_equal(o(3 + 1), o(3 + 1))


# ================================================================ scaler: training data only
@needs_torch
def test_scaler_is_fitted_on_training_data_only(split, tmp_path):
    res = train_model(split, tiny(), tmp_path / "run")
    expected = SequenceScaler.fit_train(split.train)
    assert res.scaler.to_dict() == expected.to_dict()
    assert SequenceScaler.load(res.scaler_path).to_dict() == expected.to_dict()
    assert read_meta(res.output_dir)["scaling"]["fitted_on"] == "training split only"


@needs_torch
def test_extreme_validation_and_test_values_do_not_change_the_scaler(split, tmp_path):
    extreme = make_split(factors={"E5": 1000.0, "E6": -500.0})
    # sanity: the training experiments are identical in both splits; only validation/test differ
    np.testing.assert_array_equal(extreme.train.X, split.train.X)
    assert extreme.validation.X.max() > 100 * split.validation.X.max()
    a = train_model(split, tiny(), tmp_path / "a")
    b = train_model(extreme, tiny(), tmp_path / "b")
    assert a.scaler.to_dict() == b.scaler.to_dict()
    ta = read_meta(a.output_dir)["scaling"]
    tb = read_meta(b.output_dir)["scaling"]
    assert ta == tb


@needs_torch
def test_scaler_is_not_refitted_on_validation(split, tmp_path, monkeypatch):
    fits = []
    real = SequenceScaler.fit_train.__func__
    monkeypatch.setattr(
        SequenceScaler, "fit_train", classmethod(lambda cls, seq, *a, **k: fits.append(seq) or real(cls, seq, *a, **k))
    )
    train_model(split, tiny(), tmp_path / "run")
    assert len(fits) == 1 and fits[0] is split.train


# ================================================================ disjoint experiments, origins
@needs_torch
def test_train_validation_and_test_experiments_are_disjoint(trained, split):
    exp = trained.metadata["experiments"]
    assert exp["train"] == ["E1", "E2", "E3", "E4"] and exp["validation"] == ["E5"] and exp["test"] == ["E6"]
    sets = [set(exp[k]) for k in ("train", "validation", "test")]
    assert not (sets[0] & sets[1]) and not (sets[0] & sets[2]) and not (sets[1] & sets[2])
    assert exp["train"] == sorted(set(map(str, split.train.experiment_ids)))
    assert exp["test"] == list(split.report.test.experiment_ids)


@needs_torch
def test_overlapping_train_and_validation_is_rejected(split, tmp_path):
    bad = split._replace(validation=split.train)
    with pytest.raises(ValueError, match="disjoint"):
        train_model(bad, tiny(), tmp_path / "run")
    assert not (tmp_path / "run").exists()


@needs_torch
@pytest.mark.parametrize("claimed_test", [["E1"], ["E5"], ["E6", "E2"]])
def test_overlap_with_the_declared_test_experiments_is_rejected(split, tmp_path, claimed_test):
    with pytest.raises(ValueError, match="disjoint"):
        train_model(with_test_ids(split, claimed_test), tiny(), tmp_path / "run")


@needs_torch
def test_synthetic_validation_is_rejected(split, tmp_path):
    synth_val = build(daily(["SYNTH-V"], rows=40))
    with pytest.raises(ValueError, match="must be real"):
        train_model(split._replace(validation=synth_val), tiny(), tmp_path / "run", allow_synthetic_in_training=True)


@needs_torch
def test_synthetic_test_is_rejected(split, tmp_path):
    with pytest.raises(ValueError, match="must be real"):
        train_model(with_test_ids(split, ["SYNTH-T"]), tiny(), tmp_path / "run", allow_synthetic_in_training=True)


@needs_torch
def test_synthetic_training_is_refused_by_default_and_labelled_when_allowed(tmp_path):
    mixed = make_split(ids=IDS6 + ["SYNTH-A"])
    assert "SYNTH-A" in set(map(str, mixed.train.experiment_ids))  # ml.splits puts synthetic data in train
    with pytest.raises(ValueError, match="synthetic"):
        train_model(mixed, tiny(), tmp_path / "refused")
    assert not (tmp_path / "refused").exists()

    res = train_model(mixed, tiny(), tmp_path / "allowed", allow_synthetic_in_training=True)
    origin = res.metadata["data_origin"]
    assert origin == {"training": "mixed", "validation": "real", "synthetic_in_training": True}
    assert "SYNTH-A" in res.metadata["experiments"]["train"]
    assert "mixed training data" in res.summary()
    assert read_meta(res.output_dir)["data_origin"] == origin


@needs_torch
def test_real_only_training_is_labelled_real(trained):
    assert trained.metadata["data_origin"] == {"training": "real", "validation": "real", "synthetic_in_training": False}
    assert "real training data" in trained.summary() and "real validation data" in trained.summary()


# ================================================================ validation controls early stopping / selection
@needs_torch
def test_validation_loss_controls_early_stopping_and_best_epoch(split, tmp_path, monkeypatch):
    states, val_sizes = script_validation_losses(monkeypatch, [5.0, 3.0, 4.0, 4.0, 4.0, 4.0])
    res = train_model(split, tiny(max_epochs=6, patience=2), tmp_path / "run")
    assert res.best_epoch == 2 and res.best_val_loss == 3.0
    assert res.epochs_run == 4 and res.stopped_early  # epochs 3 and 4 failed to improve -> stop
    assert [r["val_loss"] for r in res.history] == [5.0, 3.0, 4.0, 4.0]
    assert set(val_sizes) == {len(split.validation)}  # the losses came from the validation set
    assert res.metadata["training"]["best_epoch"] == 2 and res.metadata["training"]["stopped_early"] is True


@needs_torch
def test_keeps_training_while_validation_keeps_improving(split, tmp_path, monkeypatch):
    script_validation_losses(monkeypatch, [5.0, 4.0, 3.0, 2.0, 1.0])
    res = train_model(split, tiny(max_epochs=5, patience=1), tmp_path / "run")
    assert res.epochs_run == 5 and res.best_epoch == 5 and not res.stopped_early


@needs_torch
def test_patience_counts_epochs_without_improvement(split, tmp_path, monkeypatch):
    script_validation_losses(monkeypatch, [1.0, 2.0, 2.0, 2.0, 0.5, 9.0, 9.0])
    res = train_model(split, tiny(max_epochs=7, patience=4), tmp_path / "run")
    assert res.epochs_run == 7 or res.stopped_early
    assert res.best_epoch == 5 and res.best_val_loss == 0.5  # the late improvement was still found


@needs_torch
def test_min_delta_requires_a_meaningful_improvement(split, tmp_path, monkeypatch):
    script_validation_losses(monkeypatch, [5.0, 4.9, 4.8, 4.7, 4.6])
    res = train_model(split, tiny(max_epochs=5, patience=2, min_delta=0.5), tmp_path / "run")
    assert res.best_epoch == 1 and res.stopped_early and res.epochs_run == 3


@needs_torch
def test_best_checkpoint_is_restored_and_saved(split, tmp_path, monkeypatch):
    states, _ = script_validation_losses(monkeypatch, [5.0, 3.0, 4.0, 4.0])
    res = train_model(split, tiny(max_epochs=4, patience=2), tmp_path / "run")
    assert res.best_epoch == 2 and len(states) == 4
    saved = torch.load(res.model_path, weights_only=True)["state_dict"]
    for k in saved:
        torch.testing.assert_close(saved[k], states[1][k], rtol=0, atol=0)  # epoch 2 weights, exactly
    assert any(not torch.equal(saved[k], states[-1][k]) for k in saved)  # not the last epoch's weights
    loaded = load_trained_model(res.output_dir)
    for k, v in loaded.model.state_dict().items():
        torch.testing.assert_close(v, states[1][k], rtol=0, atol=0)


@needs_torch
def test_validation_metrics_describe_the_restored_best_model(trained, split):
    loaded = load_trained_model(trained.output_dir)
    ds = SequenceDataset(loaded.scaler.transform(split.validation))
    pred = loaded.scaler.inverse_transform_y(train_mod.predict_scaled(loaded.model, ds))
    m = regression_metrics(split.validation.y, pred)
    stored = trained.metadata["validation_metrics_original_units"]
    assert stored["mae"] == pytest.approx(m.mae, rel=1e-4) and stored["rmse"] == pytest.approx(m.rmse, rel=1e-4)
    assert stored["n_windows"] == len(split.validation) and "mq135_raw" in stored["units"]
    scaled = loaded.scaler.transform_y(split.validation.y)
    assert trained.best_val_loss == pytest.approx(float(np.mean((train_mod.predict_scaled(loaded.model, ds) - scaled) ** 2)), rel=1e-3)


# ================================================================ the test set is never used
class Poison:
    """Stands in for split.test: ANY attribute access fails the test."""

    def __getattribute__(self, name):
        raise AssertionError(f"split.test was accessed ({name!r}) during training")


@needs_torch
def test_training_never_touches_the_test_set(split, tmp_path):
    poisoned = split._replace(test=Poison())
    res = train_model(poisoned, tiny(), tmp_path / "run")
    clean = train_model(split, tiny(), tmp_path / "clean")
    assert res.history == clean.history and res.best_epoch == clean.best_epoch
    assert res.scaler.to_dict() == clean.scaler.to_dict()
    assert res.metadata["training"]["test_set_used"] is False
    assert res.metadata["experiments"]["test"] == ["E6"]  # only the ids from the report are recorded


@needs_torch
def test_corrupt_test_arrays_change_nothing(split, tmp_path):
    nan_test = dataclasses.replace(
        split.test, X=np.full_like(split.test.X, np.nan), y=np.full_like(split.test.y, np.inf)
    )
    res = train_model(split._replace(test=nan_test), tiny(), tmp_path / "nan")
    clean = train_model(split, tiny(), tmp_path / "clean")
    assert res.history == clean.history and res.scaler.to_dict() == clean.scaler.to_dict()
    for name in ("model.pt",):
        a = torch.load(res.output_dir / name, weights_only=True)["state_dict"]
        b = torch.load(clean.output_dir / name, weights_only=True)["state_dict"]
        assert all(torch.equal(a[k], b[k]) for k in a)


@needs_torch
def test_scaler_transform_and_datasets_only_see_train_and_validation(split, tmp_path, monkeypatch):
    seen_transform, seen_ds = [], []
    real_t = SequenceScaler.transform
    real_init = SequenceDataset.__init__
    monkeypatch.setattr(SequenceScaler, "transform", lambda self, seq, *a, **k: seen_transform.append(seq) or real_t(self, seq, *a, **k))
    monkeypatch.setattr(SequenceDataset, "__init__", lambda self, seq, **k: seen_ds.append(seq) or real_init(self, seq, **k))
    train_model(split, tiny(), tmp_path / "run")
    assert [s is split.train for s in seen_transform] == [True, False]
    assert seen_transform[1] is split.validation
    assert all(s is not split.test for s in seen_transform + seen_ds)
    assert len(seen_ds) == 2


# ================================================================ artifacts
@needs_torch
def test_model_scaler_and_metadata_are_saved_in_the_requested_directory(split, tmp_path):
    out = tmp_path / "nested" / "does_not_exist_yet" / "run"
    before = tree_hashes(tmp_path)
    res = train_model(split, tiny(), out)
    assert before == {} and res.output_dir == out
    assert {p.name for p in out.iterdir()} == ARTIFACTS  # no temp files left behind
    assert (res.model_path, res.scaler_path, res.metadata_path) == (out / MODEL_FILE, out / SCALER_FILE, out / METADATA_FILE)
    assert {p.relative_to(tmp_path).as_posix() for p in tmp_path.rglob("*") if p.is_file()} == {
        f"nested/does_not_exist_yet/run/{n}" for n in ARTIFACTS
    }
    assert set(torch.load(out / MODEL_FILE, weights_only=True)) == {"state_dict"}
    assert SequenceScaler.load(out / SCALER_FILE).to_dict() == res.scaler.to_dict()


@needs_torch
def test_metadata_content(trained, split):
    meta = read_meta(trained.output_dir)
    assert meta == json.loads(json.dumps(trained.metadata))  # what is returned is what is on disk
    assert meta["schema"] == SCHEMA_NAME and meta["version"] == 1 and meta["seed"] == 0
    assert meta["model"]["type"] == "gru" and meta["model"]["n_features"] == split.train.n_features
    assert meta["config"] == dataclasses.asdict(tiny())
    d = meta["data"]
    assert d["feature_names"] == list(split.train.feature_names) and d["target_column"] == "mq135_raw"
    assert d["interval_seconds"] == 60 and d["history_steps"] == split.train.history_steps
    assert d["history_seconds"] == split.train.history_seconds and d["horizon_seconds"] == split.train.horizon_seconds
    assert "not ppm" in d["target_description"]
    assert meta["files"] == {"model": MODEL_FILE, "scaler": SCALER_FILE, "metadata": METADATA_FILE}
    assert meta["training"]["test_set_used"] is False and meta["training"]["selection_metric"].startswith("validation")
    assert meta["environment"]["torch"] == torch.__version__
    assert len(meta["training"]["history"]) == meta["training"]["epochs_run"]
    assert isinstance(meta["notes"], list) and meta["notes"]


@needs_torch
def test_existing_artifacts_are_not_overwritten_by_default(split, tmp_path):
    out = tmp_path / "run"
    train_model(split, tiny(seed=1), out)
    before = tree_hashes(out)
    with pytest.raises(FileExistsError, match="overwrite=True"):
        train_model(split, tiny(seed=2), out)
    assert tree_hashes(out) == before


@needs_torch
@pytest.mark.parametrize("existing", [MODEL_FILE, SCALER_FILE, METADATA_FILE])
def test_any_single_existing_artifact_blocks_training(split, tmp_path, existing, monkeypatch):
    out = tmp_path / "run"
    out.mkdir()
    (out / existing).write_text("precious", encoding="utf-8")
    fits = []
    monkeypatch.setattr(SequenceScaler, "fit_train", classmethod(lambda cls, *a, **k: fits.append(1)))
    with pytest.raises(FileExistsError):
        train_model(split, tiny(), out)
    assert (out / existing).read_text() == "precious" and {p.name for p in out.iterdir()} == {existing}
    assert fits == [], "the check must fail before any training work starts"


@needs_torch
def test_overwrite_true_replaces_artifacts(split, tmp_path):
    out = tmp_path / "run"
    first = train_model(split, tiny(seed=1), out)
    h1 = sha(out / METADATA_FILE)
    second = train_model(split, tiny(seed=2), out, overwrite=True)
    assert sha(out / METADATA_FILE) != h1 and read_meta(out)["seed"] == 2
    assert {p.name for p in out.iterdir()} == ARTIFACTS
    assert first.output_dir == second.output_dir


@needs_torch
def test_unrelated_files_in_the_output_directory_are_left_alone(split, tmp_path):
    out = tmp_path / "run"
    out.mkdir()
    (out / "notes.txt").write_text("keep me", encoding="utf-8")
    train_model(split, tiny(), out)
    assert (out / "notes.txt").read_text() == "keep me"


@needs_torch
@pytest.mark.parametrize("bad", [None, "", "   "])
def test_output_dir_must_be_explicit(split, bad):
    with pytest.raises(ValueError, match="output_dir must be given explicitly"):
        train_model(split, tiny(), bad)


@needs_torch
def test_output_dir_that_is_a_file_is_rejected(split, tmp_path):
    f = tmp_path / "afile"
    f.write_text("x", encoding="utf-8")
    with pytest.raises(ValueError, match="not a directory"):
        train_model(split, tiny(), f)
    assert f.read_text() == "x"


# ================================================================ load_trained_model
@pytest.fixture()
def copy_of_run(trained, tmp_path):
    dst = tmp_path / "copy"
    shutil.copytree(trained.output_dir, dst)
    return dst


@needs_torch
@pytest.mark.parametrize("model_type", ["gru", "lstm"])
def test_load_round_trip_restores_model_scaler_and_metadata(split, tmp_path, model_type):
    res = train_model(split, tiny(model_type=model_type, num_layers=2, dropout=0.1), tmp_path / "run")
    loaded = load_trained_model(res.output_dir)
    assert loaded.metadata == read_meta(res.output_dir)
    assert loaded.scaler.to_dict() == res.scaler.to_dict()
    assert type(loaded.model.rnn).__name__ == model_type.upper() and not loaded.model.training
    saved = torch.load(res.model_path, weights_only=True)["state_dict"]
    for k, v in loaded.model.state_dict().items():
        torch.testing.assert_close(v, saved[k], rtol=0, atol=0)
    x = torch.randn(3, split.train.history_steps, split.train.n_features)
    assert tuple(loaded.model(x).shape) == (3,)


@needs_torch
def test_load_accepts_string_path_and_is_repeatable(trained, split):
    a = load_trained_model(str(trained.output_dir))
    b = load_trained_model(trained.output_dir)
    ds = SequenceDataset(a.scaler.transform(split.validation))
    np.testing.assert_array_equal(train_mod.predict_scaled(a.model, ds), train_mod.predict_scaled(b.model, ds))


@needs_torch
@pytest.mark.parametrize("missing", [MODEL_FILE, SCALER_FILE, METADATA_FILE])
def test_load_rejects_missing_files(copy_of_run, missing):
    (copy_of_run / missing).unlink()
    with pytest.raises(FileNotFoundError, match=missing.replace(".", r"\.")):
        load_trained_model(copy_of_run)


@needs_torch
def test_load_rejects_a_directory_that_does_not_exist(tmp_path):
    with pytest.raises(FileNotFoundError):
        load_trained_model(tmp_path / "nothing_here")


@needs_torch
def test_load_rejects_invalid_json_wrong_schema_and_unsupported_version(copy_of_run):
    meta = read_meta(copy_of_run)
    (copy_of_run / METADATA_FILE).write_text("{not json", encoding="utf-8")
    with pytest.raises(ValueError, match="not valid JSON"):
        load_trained_model(copy_of_run)
    write_meta(copy_of_run, [1, 2, 3])
    with pytest.raises(ValueError, match="not a forecast-model metadata"):
        load_trained_model(copy_of_run)
    write_meta(copy_of_run, {**meta, "schema": "something.else"})
    with pytest.raises(ValueError, match="not a forecast-model metadata"):
        load_trained_model(copy_of_run)
    write_meta(copy_of_run, {k: v for k, v in meta.items() if k != "schema"})
    with pytest.raises(ValueError, match="not a forecast-model metadata"):
        load_trained_model(copy_of_run)
    for version in (2, 0, None, "1"):
        write_meta(copy_of_run, {**meta, "version": version})
        with pytest.raises(ValueError, match="unsupported model metadata version"):
            load_trained_model(copy_of_run)
    write_meta(copy_of_run, meta)
    assert load_trained_model(copy_of_run).metadata == meta  # the untouched metadata is accepted again


@needs_torch
@pytest.mark.parametrize(
    "key,value",
    [
        ("feature_names", ["a", "b", "c"]),
        ("target_column", "temperature_c"),
        ("interval_seconds", 30),
        ("history_steps", 99),
        ("horizon_steps", 99),
    ],
)
def test_load_rejects_metadata_incompatible_with_the_scaler(copy_of_run, key, value):
    meta = read_meta(copy_of_run)
    meta["data"][key] = value
    write_meta(copy_of_run, meta)
    with pytest.raises(ValueError, match=r"scaler\.json does not match metadata\.json") as exc:
        load_trained_model(copy_of_run)
    assert key in str(exc.value)


@needs_torch
def test_load_rejects_a_scaler_from_another_run(copy_of_run, tmp_path):
    """A scaler fitted on 30 s data cannot be paired with a model trained on 60 s data."""
    other_split = split_by_experiment(build(daily(IDS6, rows=80), interval=30))
    other_scaler = SequenceScaler.fit_train(other_split.train)
    assert other_scaler.interval_seconds == 30
    other_scaler.save(copy_of_run / SCALER_FILE)
    with pytest.raises(ValueError, match=r"scaler\.json does not match metadata\.json") as exc:
        load_trained_model(copy_of_run)
    assert "interval_seconds" in str(exc.value)


@needs_torch
def test_load_rejects_model_weights_that_do_not_fit_the_metadata(copy_of_run):
    meta = read_meta(copy_of_run)
    meta["model"]["hidden_size"] += 5
    write_meta(copy_of_run, meta)
    with pytest.raises(RuntimeError, match="size mismatch"):
        load_trained_model(copy_of_run)
    meta = read_meta(copy_of_run)
    meta["model"]["hidden_size"] -= 5
    meta["model"]["type"] = "lstm"  # GRU weights cannot be loaded into an LSTM
    write_meta(copy_of_run, meta)
    with pytest.raises(RuntimeError):
        load_trained_model(copy_of_run)


class Evil:  # module level so that it can be pickled
    pass


@needs_torch
def test_load_refuses_pickled_objects_in_model_file(copy_of_run):
    torch.save({"state_dict": Evil()}, copy_of_run / MODEL_FILE)
    with pytest.raises(Exception, match="(?i)weights|unpickl|Evil|global"):
        load_trained_model(copy_of_run)


@needs_torch
@pytest.mark.parametrize("missing", ["data", "model"])
def test_load_gives_a_clear_error_for_metadata_missing_required_sections(copy_of_run, missing):
    meta = read_meta(copy_of_run)
    del meta[missing]
    write_meta(copy_of_run, meta)
    with pytest.raises(ValueError):
        load_trained_model(copy_of_run)


# ================================================================ inputs are not mutated
@needs_torch
def test_split_sources_and_config_are_not_mutated(tmp_path):
    split = make_split()
    frame = make_frame(daily(IDS6))
    frame_before = frame.copy()
    snaps = {n: seq_snapshot(getattr(split, n)) for n in ("train", "validation", "test")}
    report_repr = repr(split.report)
    cfg = tiny()
    cfg_before = copy.deepcopy(dataclasses.asdict(cfg))
    fields_before = tuple(id(f) for f in split)
    res = train_model(split, cfg, tmp_path / "run")
    res.summary()
    for name, snap in snaps.items():
        assert_seq_unchanged(getattr(split, name), snap)  # unscaled values, same names, same times
    assert repr(split.report) == report_repr
    assert dataclasses.asdict(cfg) == cfg_before
    assert isinstance(split, SplitResult) and tuple(id(f) for f in split) == fields_before
    pd.testing.assert_frame_equal(frame, frame_before)


@needs_torch
def test_returned_metadata_is_independent_of_the_run_directory(trained):
    meta = trained.metadata
    meta_copy = copy.deepcopy(meta)
    assert read_meta(trained.output_dir) == json.loads(json.dumps(meta_copy))


@needs_torch
def test_training_inputs_stay_unscaled_after_training(split, tmp_path):
    before = split.train.X.copy(), split.validation.X.copy()
    train_model(split, tiny(), tmp_path / "run")
    np.testing.assert_array_equal(split.train.X, before[0])
    np.testing.assert_array_equal(split.validation.X, before[1])
    assert abs(float(split.train.X.mean())) > 1.0  # still raw sensor units, not z-scores


# ================================================================ invalid input
@needs_torch
def test_rejects_non_split_and_non_config_arguments(split, tmp_path):
    with pytest.raises(TypeError, match="SplitResult"):
        train_model(split.train, tiny(), tmp_path / "a")
    with pytest.raises(TypeError, match="SplitResult"):
        train_model(None, tiny(), tmp_path / "b")
    with pytest.raises(TypeError, match="TrainConfig"):
        train_model(split, {"seed": 0}, tmp_path / "c")
    assert list(tmp_path.iterdir()) == []


@needs_torch
@pytest.mark.parametrize("part", ["train", "validation"])
def test_rejects_empty_training_or_validation_sets(split, tmp_path, part):
    seq = getattr(split, part)
    empty = seq.subset(np.zeros(len(seq), dtype=bool))
    with pytest.raises(ValueError, match="empty"):
        train_model(split._replace(**{part: empty}), tiny(), tmp_path / "run")
    assert not (tmp_path / "run").exists()


@needs_torch
@pytest.mark.parametrize("part", ["train", "validation"])
@pytest.mark.parametrize("field", ["X", "y"])
@pytest.mark.parametrize("bad", [np.nan, np.inf])
def test_rejects_non_finite_data(split, tmp_path, part, field, bad):
    seq = getattr(split, part)
    arr = getattr(seq, field).copy()
    arr.reshape(-1)[3] = bad
    with pytest.raises(ValueError, match=f"{field} contains NaN or infinite"):
        train_model(split._replace(**{part: dataclasses.replace(seq, **{field: arr})}), tiny(), tmp_path / "run")
    assert not (tmp_path / "run").exists()


@needs_torch
def test_rejects_timezone_naive_times_and_misaligned_arrays(split, tmp_path):
    naive = dataclasses.replace(split.validation, origin_times=split.validation.origin_times.tz_localize(None))
    with pytest.raises(ValueError, match="timezone-aware"):
        train_model(split._replace(validation=naive), tiny(), tmp_path / "a")
    short = dataclasses.replace(split.train, y=split.train.y[:-1])
    with pytest.raises(ValueError, match="not aligned"):
        train_model(split._replace(train=short), tiny(), tmp_path / "b")


@needs_torch
@pytest.mark.parametrize(
    "change",
    [
        dict(feature_names=None),  # filled in below: renamed features
        dict(target_column="temperature_c"),
        dict(interval_seconds=30),
        dict(history_steps=2),
    ],
)
def test_incompatible_validation_metadata_is_rejected(split, tmp_path, change):
    val = split.validation
    if "feature_names" in change:
        change = dict(feature_names=tuple(f"renamed_{n}" for n in val.feature_names))
    bad = dataclasses.replace(val, **change)
    with pytest.raises(ValueError):
        train_model(split._replace(validation=bad), tiny(), tmp_path / "run")
    assert not any((tmp_path / "run").glob("*")) if (tmp_path / "run").exists() else True


@needs_torch
def test_cuda_request_without_cuda_is_a_clear_error(split, tmp_path):
    if torch.cuda.is_available():
        pytest.skip("CUDA is available here, so this error path cannot be exercised")
    with pytest.raises(ValueError, match="CUDA is not available"):
        train_model(split, tiny(device="cuda"), tmp_path / "run")
    assert not (tmp_path / "run").exists()


# ================================================================ command line
def write_clean_csv(path, specs):
    df = make_frame(specs)
    df["timestamp"] = df["timestamp"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    df.to_csv(path, index=False)


@needs_torch
def test_cli_trains_and_writes_artifacts(tmp_path, capsys):
    csv = tmp_path / "clean_real.csv"
    write_clean_csv(csv, daily(IDS6))
    out = tmp_path / "model"
    rc = train_mod.main([
        "--clean-csv", str(csv), "--output-dir", str(out), "--history", "3min", "--horizon", "3min",
        "--hidden-size", "8", "--max-epochs", "3", "--patience", "3", "--learning-rate", "0.01", "--seed", "1",
    ])
    captured = capsys.readouterr()
    assert rc == 0, captured.err
    assert {p.name for p in out.iterdir()} == ARTIFACTS
    assert "Test set not used" in captured.out
    assert read_meta(out)["seed"] == 1
    # a second run into the same directory is refused with exit code 2 unless --overwrite is given
    args = ["--clean-csv", str(csv), "--output-dir", str(out), "--history", "3min", "--horizon", "3min",
            "--hidden-size", "8", "--max-epochs", "2"]
    assert train_mod.main(args) == 2 and "already contains" in capsys.readouterr().err
    assert train_mod.main(args + ["--overwrite"]) == 0


@needs_torch
def test_cli_refuses_purely_synthetic_data(tmp_path, capsys):
    csv = tmp_path / "SYNTHETIC_clean.csv"
    write_clean_csv(csv, daily([f"SYNTH-{i}" for i in range(6)]))
    out = tmp_path / "model"
    rc = train_mod.main(["--clean-csv", str(csv), "--output-dir", str(out), "--history", "3min", "--horizon", "3min"])
    assert rc == 2 and capsys.readouterr().err.startswith("error:")
    assert not out.exists()