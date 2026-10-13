"""Tests for ml/evaluate.py (held-out test evaluation of a saved model next to the baselines).

Everything here uses tiny, generated fixtures. Experiment ids such as "E1".."E6" are plain test
labels for generated numbers, NOT real measurements, and "SYNTH-..." ids exercise the
synthetic-data restriction. No result in this file says anything about how well a model works on
real sensor data.

Most tests do not need PyTorch: they hand `evaluate_loaded_model` a `LoadedModel` whose
predictions are injected (known errors in ORIGINAL units, converted to scaled units with the real
scaler), so the metric maths, inverse scaling, metadata checks and the synthetic-data rejection
are tested independently of any trained network. Tests that need a real trained model are skipped
(with a reason) only when PyTorch cannot be imported.
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
from ml import evaluate as ev  # noqa: E402
from ml import train as train_mod  # noqa: E402
from ml.baselines import data_origin, regression_metrics  # noqa: E402
from ml.dataset import SequenceDataset, torch_available  # noqa: E402
from ml.evaluate import EvaluationReport, evaluate_loaded_model, evaluate_saved_model  # noqa: E402
from ml.scaling import SequenceScaler  # noqa: E402
from ml.sequences import build_sequences  # noqa: E402
from ml.splits import SplitResult, split_by_experiment  # noqa: E402
from ml.train import METADATA_FILE, LoadedModel, TrainConfig, load_trained_model, train_model  # noqa: E402

PROJECT_ROOT = Path(__file__).resolve().parents[1]
START = pd.Timestamp("2026-01-05T08:00:00Z")
DAY = pd.Timedelta(days=1)
IDS6 = ["E1", "E2", "E3", "E4", "E5", "E6"]  # train E1-E4, validation E5, test E6
IDS10 = [f"X{i:02d}" for i in range(10)]  # train X00-X05, validation X06 X07, test X08 X09

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


def constant_target_split(value=500.0):
    """Like IDS6, but the test experiment E6 has a constant mq135_raw (R^2 is undefined there)."""
    df = make_frame(daily(IDS6))
    df.loc[df["experiment_id"] == "E6", "mq135_raw"] = value
    return split_by_experiment(build_sequences(df, "3min", "3min", interval_seconds=60))


def tiny(**kw):
    args = dict(seed=0, hidden_size=8, batch_size=32, max_epochs=4, patience=3, learning_rate=1e-2)
    args.update(kw)
    return TrainConfig(**args)


def ids_of(seq):
    return sorted(set(map(str, seq.experiment_ids)))


def make_metadata(split, *, model_type="gru"):
    """A metadata dict shaped like ml.train's, derived from the split the 'model' was trained on."""
    s = split.train
    return {
        "schema": train_mod.SCHEMA_NAME,
        "version": train_mod.SCHEMA_VERSION,
        "model": {"type": model_type, "n_features": s.n_features, "hidden_size": 8, "num_layers": 1, "dropout": 0.0},
        "data": {
            "feature_names": list(s.feature_names),
            "target_column": s.target_column,
            "interval_seconds": int(s.interval_seconds),
            "history_steps": int(s.history_steps),
            "history_seconds": int(s.history_seconds),
            "horizon_steps": int(s.horizon_steps),
            "horizon_seconds": int(s.horizon_seconds),
            "stride_steps": int(s.stride_steps),
        },
        "experiments": {
            "train": ids_of(s),
            "validation": ids_of(split.validation),
            "test": sorted(map(str, split.report.test.experiment_ids)),
        },
        "data_origin": {
            "training": data_origin(ids_of(s)),
            "validation": data_origin(ids_of(split.validation)),
            "synthetic_in_training": data_origin(ids_of(s)) != "real",
        },
        "training": {"test_set_used": False},
    }


def fake_loaded(split, *, meta=None, scaler=None):
    scaler = scaler or SequenceScaler.fit_train(split.train)  # fitted on TRAIN, like train_model does
    return LoadedModel(model=object(), scaler=scaler, metadata=meta if meta is not None else make_metadata(split))


def inject_predictions(monkeypatch, scaler, make_original_units):
    """Make evaluate_loaded_model use predictions we choose, given in ORIGINAL units.

    `make_original_units(y_true)` returns the predictions; they are converted to the model's scaled
    units with the real scaler, exactly what a network trained on scaled targets would output.
    """
    monkeypatch.setattr(ev, "require_torch", lambda: None)

    def fake_predict(model, dataset, **kwargs):
        y_true = scaler.inverse_transform_y(dataset.y).astype(np.float64)
        return scaler.transform_y(make_original_units(y_true))

    monkeypatch.setattr(ev, "predict_scaled", fake_predict)


def run_injected(monkeypatch, split, make_original_units, *, meta=None, scaler=None, **kw):
    loaded = fake_loaded(split, meta=meta, scaler=scaler)
    inject_predictions(monkeypatch, loaded.scaler, make_original_units)
    return evaluate_loaded_model(loaded, split, model_dir="fake_run", **kw)


def errors_like(y, lo=-6.0, hi=9.0):
    """A deterministic, non-symmetric, non-constant error pattern."""
    return np.linspace(lo, hi, len(y)) + 0.5 * np.sin(np.arange(len(y)))


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


@pytest.fixture(scope="module")
def split():
    return make_split()


@pytest.fixture(scope="module")
def split10():
    return make_split(IDS10)


def sha_tree(root):
    root = Path(root)
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(root.rglob("*")) if p.is_file()}


# ================================================================ metric calculations
def test_mae_rmse_r2_match_independent_numpy_calculation(monkeypatch, split):
    y = split.test.y.astype(np.float64)
    err = errors_like(y)
    rep = run_injected(monkeypatch, split, lambda t: t + err)
    m = rep.model.overall
    assert m.n_windows == len(y) == rep.n_test_windows
    assert m.mae == pytest.approx(np.mean(np.abs(err)), rel=1e-3)
    assert m.rmse == pytest.approx(np.sqrt(np.mean(err**2)), rel=1e-3)
    assert m.r2 == pytest.approx(1 - np.sum(err**2) / np.sum((y - y.mean()) ** 2), abs=1e-4)
    assert m.r2_note is None
    # the same code path as the baselines: identical to ml.baselines.regression_metrics on the same arrays
    ref = regression_metrics(y, y + err)
    assert (m.mae, m.rmse) == pytest.approx((ref.mae, ref.rmse), rel=1e-3)


def test_rmse_is_never_below_mae_and_equals_mae_for_constant_absolute_error(monkeypatch, split):
    y = split.test.y.astype(np.float64)
    sign = np.where(np.arange(len(y)) % 2 == 0, 1.0, -1.0)
    rep = run_injected(monkeypatch, split, lambda t: t + 4.0 * sign)
    assert rep.model.overall.mae == pytest.approx(4.0, abs=1e-3)
    assert rep.model.overall.rmse == pytest.approx(4.0, abs=1e-3)
    rep2 = run_injected(monkeypatch, split, lambda t: t + errors_like(t))
    assert rep2.model.overall.rmse >= rep2.model.overall.mae


def test_perfect_predictions_give_zero_error_and_r2_one(monkeypatch, split):
    rep = run_injected(monkeypatch, split, lambda t: t.copy())
    m = rep.model.overall
    assert m.mae < 1e-3 and m.rmse < 1e-3 and m.r2 == pytest.approx(1.0, abs=1e-6)


def test_predicting_the_test_mean_gives_r2_zero(monkeypatch, split):
    rep = run_injected(monkeypatch, split, lambda t: np.full_like(t, t.mean()))
    assert rep.model.overall.r2 == pytest.approx(0.0, abs=1e-4)


def test_per_experiment_and_macro_metrics_with_two_test_experiments(monkeypatch, split10):
    assert ids_of(split10.test) == ["X08", "X09"]
    y = split10.test.y.astype(np.float64)
    ids = np.asarray(split10.test.experiment_ids).astype(str)
    err = np.where(ids == "X08", 2.0, 8.0) * np.where(np.arange(len(y)) % 2 == 0, 1.0, -1.0)
    rep = run_injected(monkeypatch, split10, lambda t: t + err)
    per = {e.experiment_id: e for e in rep.model.per_experiment}
    assert list(per) == ["X08", "X09"] == list(rep.test_experiments)
    assert per["X08"].metrics.mae == pytest.approx(2.0, abs=1e-3)
    assert per["X09"].metrics.mae == pytest.approx(8.0, abs=1e-3)
    assert per["X08"].metrics.n_windows + per["X09"].metrics.n_windows == len(y)
    assert rep.model.macro_mae == pytest.approx(5.0, abs=1e-3)  # every experiment weighs the same
    n8, n9 = per["X08"].metrics.n_windows, per["X09"].metrics.n_windows
    assert rep.model.overall.mae == pytest.approx((2.0 * n8 + 8.0 * n9) / (n8 + n9), abs=1e-3)  # pooled
    assert all(e.data_origin == "real" for e in per.values())


# ---------------------------------------------------------------- R^2 for a constant target
def test_r2_is_undefined_not_nan_for_a_constant_test_target(monkeypatch):
    sp = constant_target_split(500.0)
    y = sp.test.y.astype(np.float64)
    assert np.ptp(y) == 0.0
    rep = run_injected(monkeypatch, sp, lambda t: t + 3.0)
    for ev_ in (rep.model, rep.persistence, rep.training_mean):
        assert ev_.overall.r2 is None and "constant" in ev_.overall.r2_note
        assert np.isfinite(ev_.overall.mae) and np.isfinite(ev_.overall.rmse)
        assert all(e.metrics.r2 is None for e in ev_.per_experiment)
    assert rep.model.overall.mae == pytest.approx(3.0, abs=1e-3)
    text = rep.summary()
    assert "nan" not in text.lower() and "inf" not in text.lower() and "n/a" in text
    d = rep.to_dict()
    json.dumps(d, allow_nan=False)  # R^2 is null, never NaN
    assert d["results"]["model"]["overall"]["r2"] is None and "constant" in d["results"]["model"]["overall"]["r2_note"]


def test_r2_is_defined_for_a_varying_test_target(monkeypatch, split):
    rep = run_injected(monkeypatch, split, lambda t: t + errors_like(t))
    assert all(isinstance(e.overall.r2, float) and np.isfinite(e.overall.r2) for e in rep.evaluations())


# ================================================================ inverse scaling
def test_predictions_are_converted_back_to_original_units(monkeypatch, split):
    """An offset of exactly one target std in scaled units is one std in original units."""
    scaler = SequenceScaler.fit_train(split.train)
    std = scaler.target_stats.scale
    assert std > 10  # raw sensor scale, far from 1: a missing inverse transform could not hide

    loaded = fake_loaded(split, scaler=scaler)
    monkeypatch.setattr(ev, "require_torch", lambda: None)
    monkeypatch.setattr(ev, "predict_scaled", lambda model, dataset, **k: dataset.y + np.float32(1.0))
    rep = evaluate_loaded_model(loaded, split, model_dir="fake_run")
    assert rep.model.overall.mae == pytest.approx(std, rel=1e-3)
    assert rep.model.overall.rmse == pytest.approx(std, rel=1e-3)
    np.testing.assert_allclose(rep.model.predictions.y_pred - rep.model.predictions.y_true, std, rtol=1e-3)


def test_forgetting_the_inverse_transform_would_be_caught_by_the_numbers(monkeypatch, split):
    """A 'model' that outputs raw sensor values instead of scaled ones is wildly wrong once inverted."""
    loaded = fake_loaded(split)
    monkeypatch.setattr(ev, "require_torch", lambda: None)
    monkeypatch.setattr(ev, "predict_scaled", lambda model, dataset, **k: split.test.y.astype(np.float32))
    rep = evaluate_loaded_model(loaded, split, model_dir="fake_run")
    assert rep.model.overall.mae > 100 * rep.persistence.overall.mae


def test_targets_and_predictions_in_the_report_are_original_units(monkeypatch, split):
    rep = run_injected(monkeypatch, split, lambda t: t + 1.0)
    p = rep.model.predictions
    assert p.units == "original" and rep.units == "original sensor units"
    np.testing.assert_allclose(p.y_true, split.test.y, rtol=1e-6)
    assert p.y_true.min() > 100  # raw mq135 values (hundreds), not z-scores
    assert list(p.experiment_ids) == list(split.test.experiment_ids)
    assert p.origin_times.equals(split.test.origin_times) and p.target_times.equals(split.test.target_times)


def test_inconsistent_inverse_scaling_is_refused(monkeypatch, split):
    loaded = fake_loaded(split)
    inject_predictions(monkeypatch, loaded.scaler, lambda t: t)
    real = SequenceScaler.inverse_transform_y
    calls = []

    def broken(self, values):
        calls.append(1)
        out = real(self, values)
        return out + 50.0 if len(calls) == 3 else out  # the round-trip check of the targets (3rd call: the fake predictor makes the 1st) is off

    monkeypatch.setattr(SequenceScaler, "inverse_transform_y", broken)
    with pytest.raises(RuntimeError, match="inverse target scaling"):
        evaluate_loaded_model(loaded, split, model_dir="fake_run")


# ================================================================ baselines are reused and correct
def test_persistence_and_training_mean_baselines_match_independent_values(monkeypatch, split):
    rep = run_injected(monkeypatch, split, lambda t: t + 1.0)
    y, y0 = split.test.y.astype(np.float64), split.test.target_at_origin.astype(np.float64)
    assert rep.persistence.overall.mae == pytest.approx(np.mean(np.abs(y - y0)), rel=1e-6)
    assert rep.persistence.overall.rmse == pytest.approx(np.sqrt(np.mean((y - y0) ** 2)), rel=1e-6)
    train_mean = float(np.mean(split.train.y.astype(np.float64)))
    assert rep.training_mean_value == pytest.approx(train_mean, rel=1e-9)
    assert rep.training_mean.overall.mae == pytest.approx(np.mean(np.abs(y - train_mean)), rel=1e-6)
    assert rep.persistence.baseline == "persistence" and rep.training_mean.baseline == "training_mean"
    assert rep.model.baseline == "gru" and rep.model.set_name == rep.persistence.set_name == "test"


def test_training_mean_uses_training_data_only(monkeypatch):
    base, extreme = make_split(), make_split(factors={"E5": 1000.0, "E6": -500.0})
    a = run_injected(monkeypatch, base, lambda t: t, scaler=SequenceScaler.fit_train(base.train))
    b = run_injected(monkeypatch, extreme, lambda t: t, scaler=SequenceScaler.fit_train(base.train))
    assert a.training_mean_value == b.training_mean_value == pytest.approx(float(np.mean(base.train.y.astype(np.float64))), rel=1e-9)


def test_skill_scores_compare_model_with_baselines(monkeypatch, split):
    rep = run_injected(monkeypatch, split, lambda t: t + errors_like(t, -2, 3))
    for name, base in (("persistence", rep.persistence), ("training_mean", rep.training_mean)):
        assert rep.mae_skill(name) == pytest.approx((base.overall.mae - rep.model.overall.mae) / base.overall.mae)
        assert rep.rmse_skill(name) == pytest.approx((base.overall.rmse - rep.model.overall.rmse) / base.overall.rmse)
    with pytest.raises(KeyError, match="unknown baseline"):
        rep.mae_skill("oracle")


def test_skill_is_none_when_the_baseline_has_zero_error(monkeypatch):
    sp = constant_target_split(500.0)  # persistence predicts a constant target perfectly
    rep = run_injected(monkeypatch, sp, lambda t: t + 3.0)
    assert rep.persistence.overall.mae == 0.0
    assert rep.mae_skill("persistence") is None and rep.rmse_skill("persistence") is None
    assert "n/a (baseline error is 0)" in rep.summary()


# ================================================================ report content, honesty, ids, origin
def test_report_preserves_ids_origins_and_settings(monkeypatch, split10):
    rep = run_injected(monkeypatch, split10, lambda t: t + 1.0)
    assert isinstance(rep, EvaluationReport)
    assert rep.test_experiments == ("X08", "X09") and all(type(e) is str for e in rep.test_experiments)
    assert rep.train_experiments == tuple(f"X{i:02d}" for i in range(6))
    assert rep.validation_experiments == ("X06", "X07")
    assert rep.test_origin == "real" and rep.training_origin == "real"
    assert (rep.interval_seconds, rep.history_steps, rep.horizon_steps) == (60, 3, 3)
    assert rep.model_type == "gru" and rep.model_dir == Path("fake_run")
    assert all(e.data_origin == "real" for e in rep.evaluations())
    assert not set(rep.test_experiments) & set(rep.train_experiments)


def test_target_is_identified_as_raw_sensor_response_not_ppm_co2_or_aqi(monkeypatch, split):
    rep = run_injected(monkeypatch, split, lambda t: t + 1.0)
    assert rep.target_column == "mq135_raw"
    for text in (rep.target_description, rep.summary(), " ".join(rep.caveats)):
        assert "raw" in text and "not ppm" in text.replace("not ppm,", "not ppm") or "not ppm" in text
    assert "not ppm, not CO2 concentration, not AQI" in rep.target_description
    assert any("not ppm, CO2 concentration or AQI" in c for c in rep.caveats)
    assert "original sensor units" in rep.summary()
    # nothing claims real-world performance
    assert "real-world performance" not in rep.summary().lower().replace("not real-world performance", "")
    assert "this test split only" in rep.summary()


def test_caveat_about_few_test_experiments_and_none_for_many(monkeypatch, split, split10):
    one = run_injected(monkeypatch, split, lambda t: t + 1.0)
    assert any("only 1 test experiment" in c for c in one.caveats)
    two = run_injected(monkeypatch, split10, lambda t: t + 1.0)
    assert any("only 2 test experiment" in c for c in two.caveats)
    many = make_split([f"Y{i:02d}" for i in range(15)])
    assert len(ids_of(many.test)) >= ev.MIN_RECOMMENDED_TEST_EXPERIMENTS
    rep = run_injected(monkeypatch, many, lambda t: t + 1.0)
    assert not any("test experiment" in c for c in rep.caveats)


def test_to_dict_is_json_serialisable_and_complete(monkeypatch, split10):
    rep = run_injected(monkeypatch, split10, lambda t: t + errors_like(t))
    d = json.loads(json.dumps(rep.to_dict(), allow_nan=False))
    assert d["schema"] == "airq.model_evaluation" and d["version"] == 1
    assert d["target"]["column"] == "mq135_raw" and "not ppm" in d["target"]["description"]
    assert d["experiments"] == {
        "train": list(rep.train_experiments), "validation": ["X06", "X07"], "test": ["X08", "X09"],
    }
    assert d["data_origin"] == {"test": "real", "training": "real"}
    assert set(d["results"]) == {"model", "persistence", "training_mean"}
    assert [e["experiment_id"] for e in d["results"]["model"]["per_experiment"]] == ["X08", "X09"]
    assert set(d["model_vs_baselines"]) == {"persistence", "training_mean"}
    assert d["training_mean_value"] == pytest.approx(rep.training_mean_value)
    assert d["caveats"] == list(rep.caveats)


def test_summary_lists_model_and_both_baselines(monkeypatch, split):
    text = run_injected(monkeypatch, split, lambda t: t + 1.0).summary()
    for token in ("[gru]", "[persistence]", "[training_mean]", "MAE=", "RMSE=", "R2=", "E6", "model vs persistence", "model vs training_mean"):
        assert token in text


# ================================================================ synthetic data
def test_synthetic_test_data_is_rejected(monkeypatch, split):
    synth_test = build(daily(["SYNTH-T"]))
    with pytest.raises(ValueError, match="synthetic") as exc:
        run_injected(monkeypatch, split._replace(test=synth_test), lambda t: t)
    assert "SYNTH-T" in str(exc.value) and "genuine test set" in str(exc.value)


def test_partly_synthetic_test_data_is_rejected(monkeypatch, split):
    mixed_test = build(daily(["E6", "SYNTH-T"]))
    with pytest.raises(ValueError, match=r"synthetic experiments \['SYNTH-T'\]"):
        run_injected(monkeypatch, split._replace(test=mixed_test), lambda t: t)


def test_synthetic_test_is_rejected_even_if_the_metadata_claims_it(monkeypatch, split):
    synth_test = build(daily(["SYNTH-T"]))
    bad_split = split._replace(test=synth_test, report=dataclasses.replace(split.report, test=dataclasses.replace(split.report.test, experiment_ids=("SYNTH-T",))))
    meta = make_metadata(split)
    meta["experiments"]["test"] = ["SYNTH-T"]
    with pytest.raises(ValueError, match="synthetic"):
        run_injected(monkeypatch, bad_split, lambda t: t, meta=meta)


def test_synthetic_training_data_is_labelled_not_hidden(monkeypatch):
    mixed = make_split(IDS6 + ["SYNTH-A"])
    assert "SYNTH-A" in ids_of(mixed.train)
    rep = run_injected(monkeypatch, mixed, lambda t: t + 1.0)
    assert rep.test_origin == "real" and rep.training_origin == "mixed"
    assert rep.model.training_origin == "mixed" and rep.training_mean.training_origin == "mixed"
    assert any("synthetic" in c and "trained with" in c for c in rep.caveats)
    assert "mixed" in rep.summary() and "SYNTH-A" in rep.summary()
    assert rep.to_dict()["data_origin"] == {"test": "real", "training": "mixed"}


def test_training_origin_must_match_the_saved_run(monkeypatch):
    mixed = make_split(IDS6 + ["SYNTH-A"])
    meta = make_metadata(mixed)
    meta["data_origin"]["training"] = "real"  # the run claims real training data, but the split has synthetic
    with pytest.raises(ValueError, match="training data origin"):
        run_injected(monkeypatch, mixed, lambda t: t, meta=meta)


# ================================================================ metadata / experiment compatibility
@pytest.mark.parametrize("name,ids", [("train", ["E1", "E2"]), ("validation", ["E1"]), ("test", ["E5"]), ("test", ["E6", "E2"])])
def test_experiment_ids_must_match_the_saved_run(monkeypatch, split, name, ids):
    meta = make_metadata(split)
    meta["experiments"][name] = ids
    with pytest.raises(ValueError, match="does not match the experiments recorded") as exc:
        run_injected(monkeypatch, split, lambda t: t, meta=meta)
    assert name in str(exc.value)


def test_declared_test_experiments_must_match_the_test_data(monkeypatch, split):
    info = dataclasses.replace(split.report.test, experiment_ids=("E5",))
    wrong = split._replace(report=dataclasses.replace(split.report, test=info))
    with pytest.raises(ValueError, match="split.report declares"):
        run_injected(monkeypatch, wrong, lambda t: t, meta=make_metadata(split))


@pytest.mark.parametrize(
    "key,value",
    [
        ("feature_names", ["a", "b"]),
        ("target_column", "temperature_c"),
        ("interval_seconds", 30),
        ("history_steps", 7),
        ("horizon_steps", 7),
    ],
)
def test_data_layout_must_match_the_saved_metadata(monkeypatch, split, key, value):
    meta = make_metadata(split)
    meta["data"][key] = value
    with pytest.raises(ValueError, match="not compatible with the saved model") as exc:
        run_injected(monkeypatch, split, lambda t: t, meta=meta)
    assert key in str(exc.value)


def test_a_scaler_for_a_different_layout_is_rejected(monkeypatch, split):
    other = split_by_experiment(build(daily(IDS6, rows=80), interval=30))
    with pytest.raises(ValueError, match="not compatible with the saved scaler"):
        run_injected(monkeypatch, split, lambda t: t, scaler=SequenceScaler.fit_train(other.train))


@pytest.mark.parametrize("bad", [True, None, "no", 1])
def test_a_run_that_used_the_test_set_is_not_a_held_out_evaluation(monkeypatch, split, bad):
    meta = make_metadata(split)
    meta["training"]["test_set_used"] = bad
    with pytest.raises(ValueError, match="test set was unused"):
        run_injected(monkeypatch, split, lambda t: t, meta=meta)


@pytest.mark.parametrize(
    "section,key",
    [("experiments", None), ("data_origin", None), ("training", None), ("model", None),
     ("experiments", "test"), ("data_origin", "training"), ("training", "test_set_used"), ("model", "type")],
)
def test_missing_metadata_entries_give_a_clear_error(monkeypatch, split, section, key):
    meta = make_metadata(split)
    if key is None:
        del meta[section]
    else:
        del meta[section][key]
    with pytest.raises(ValueError, match="missing entries needed for evaluation") as exc:
        run_injected(monkeypatch, split, lambda t: t, meta=meta)
    assert section in str(exc.value) and (key is None or key in str(exc.value))


@pytest.mark.parametrize("bad", [[], "E6", [1, 2], None])
def test_malformed_experiment_lists_in_metadata_are_rejected(monkeypatch, split, bad):
    meta = make_metadata(split)
    meta["experiments"]["test"] = bad
    with pytest.raises(ValueError, match="non-empty list of experiment ids"):
        run_injected(monkeypatch, split, lambda t: t, meta=meta)


# ================================================================ invalid inputs
def test_rejects_wrong_argument_types(monkeypatch, split):
    loaded = fake_loaded(split)
    inject_predictions(monkeypatch, loaded.scaler, lambda t: t)
    with pytest.raises(TypeError, match="SplitResult"):
        evaluate_loaded_model(loaded, split.test)
    with pytest.raises(TypeError, match="SplitResult"):
        evaluate_loaded_model(loaded, None)
    with pytest.raises(TypeError, match="LoadedModel"):
        evaluate_loaded_model({"model": 1}, split)


@pytest.mark.parametrize("bad", [0, -3, 2.5, "8", None, True])
def test_rejects_invalid_batch_size(monkeypatch, split, bad):
    loaded = fake_loaded(split)
    inject_predictions(monkeypatch, loaded.scaler, lambda t: t)
    with pytest.raises(ValueError, match="batch_size"):
        evaluate_loaded_model(loaded, split, batch_size=bad)


def test_rejects_empty_test_set(monkeypatch, split):
    empty = split.test.subset(np.zeros(len(split.test), dtype=bool))
    with pytest.raises(ValueError, match="empty"):
        run_injected(monkeypatch, split._replace(test=empty), lambda t: t)


def test_rejects_empty_training_set(monkeypatch, split):
    empty = split.train.subset(np.zeros(len(split.train), dtype=bool))
    loaded = fake_loaded(split)
    inject_predictions(monkeypatch, loaded.scaler, lambda t: t)
    with pytest.raises(ValueError, match="empty"):
        evaluate_loaded_model(loaded, split._replace(train=empty))


@pytest.mark.parametrize("part", ["train", "test"])
@pytest.mark.parametrize("field", ["X", "y", "target_at_origin"])
@pytest.mark.parametrize("bad", [np.nan, np.inf])
def test_rejects_non_finite_data(monkeypatch, split, part, field, bad):
    seq = getattr(split, part)
    arr = getattr(seq, field).copy()
    arr.reshape(-1)[2] = bad
    broken = dataclasses.replace(seq, **{field: arr})
    with pytest.raises(ValueError, match=f"{field} contains NaN or infinite"):
        run_injected(monkeypatch, split._replace(**{part: broken}), lambda t: t, scaler=SequenceScaler.fit_train(split.train))


def test_rejects_timezone_naive_and_misaligned_test_data(monkeypatch, split):
    naive = dataclasses.replace(split.test, target_times=split.test.target_times.tz_localize(None))
    with pytest.raises(ValueError, match="timezone-aware"):
        run_injected(monkeypatch, split._replace(test=naive), lambda t: t, scaler=SequenceScaler.fit_train(split.train))
    short = dataclasses.replace(split.test, y=split.test.y[:-1])
    with pytest.raises(ValueError, match="not aligned"):
        run_injected(monkeypatch, split._replace(test=short), lambda t: t, scaler=SequenceScaler.fit_train(split.train))
    wrong_shape = dataclasses.replace(split.test, X=split.test.X[:, :, 0])
    with pytest.raises(ValueError, match=r"shape \(N, T, F\)"):
        run_injected(monkeypatch, split._replace(test=wrong_shape), lambda t: t, scaler=SequenceScaler.fit_train(split.train))


def test_non_finite_model_predictions_are_refused(monkeypatch, split):
    loaded = fake_loaded(split)
    monkeypatch.setattr(ev, "require_torch", lambda: None)
    monkeypatch.setattr(ev, "predict_scaled", lambda model, dataset, **k: np.full(len(dataset), np.nan, dtype=np.float32))
    with pytest.raises(ValueError, match="NaN or infinite"):  # SequenceScaler.inverse_transform_y refuses them
        evaluate_loaded_model(loaded, split)


def test_model_predictions_with_the_wrong_length_are_refused(monkeypatch, split):
    loaded = fake_loaded(split)
    monkeypatch.setattr(ev, "require_torch", lambda: None)
    monkeypatch.setattr(ev, "predict_scaled", lambda model, dataset, **k: np.zeros(len(dataset) - 1, dtype=np.float32))
    with pytest.raises(ValueError):
        evaluate_loaded_model(loaded, split)


# ================================================================ no fitting, no mutation, test data only used for scoring
def test_nothing_is_fitted_or_trained_during_evaluation(monkeypatch, split):
    loaded = fake_loaded(split)  # fitted BEFORE the guards below are installed
    inject_predictions(monkeypatch, loaded.scaler, lambda t: t + 1.0)

    def forbidden(*a, **k):
        raise AssertionError("evaluation must not fit a scaler")

    monkeypatch.setattr(SequenceScaler, "fit_train", classmethod(forbidden))
    monkeypatch.setattr(SequenceScaler, "fit_from_split", classmethod(forbidden))
    rep = evaluate_loaded_model(loaded, split, model_dir="fake_run")
    assert rep.n_test_windows == len(split.test)
    src = Path(ev.__file__).read_text(encoding="utf-8")
    for token in ("fit_train(", "fit_from_split(", "optimizer", "backward(", ".step(", "load_state_dict"):
        assert token not in src.split('"""', 2)[2], f"{token} must not appear in ml/evaluate.py outside its docstring"


def test_inputs_are_not_mutated(monkeypatch):
    sp = make_split()
    snaps = {n: snapshot(getattr(sp, n)) for n in ("train", "validation", "test")}
    loaded = fake_loaded(sp)
    meta_before, scaler_before = copy.deepcopy(loaded.metadata), loaded.scaler.to_dict()
    report_repr = repr(sp.report)
    inject_predictions(monkeypatch, loaded.scaler, lambda t: t + errors_like(t))
    evaluate_loaded_model(loaded, sp, model_dir="fake_run").summary()
    for name, snap in snaps.items():
        assert_unchanged(getattr(sp, name), snap)  # still unscaled, same ids and times
    assert loaded.metadata == meta_before and loaded.scaler.to_dict() == scaler_before
    assert repr(sp.report) == report_repr and isinstance(sp, SplitResult)


def test_the_test_set_is_only_scored_never_used_to_fit_anything(monkeypatch):
    """Extreme test values move the test metrics, but not the scaler, the training mean or the model inputs' statistics."""
    base = make_split()
    extreme = make_split(factors={"E6": 1000.0})
    scaler = SequenceScaler.fit_train(base.train)
    a = run_injected(monkeypatch, base, lambda t: t + 2.0, scaler=scaler)
    b = run_injected(monkeypatch, extreme, lambda t: t + 2.0, scaler=scaler)
    assert a.training_mean_value == b.training_mean_value
    assert scaler.to_dict() == SequenceScaler.fit_train(base.train).to_dict()
    assert a.persistence.overall.mae != b.persistence.overall.mae  # the test windows really differ


# ================================================================ PyTorch missing
def test_saving_free_import_and_missing_torch_error_in_process(monkeypatch, split, tmp_path):
    monkeypatch.setattr(ds_mod, "torch", None)
    monkeypatch.setattr(ds_mod, "_TORCH_IMPORT_ERROR", "ModuleNotFoundError: No module named 'torch'")
    with pytest.raises(ImportError, match="pip install torch"):
        evaluate_saved_model(split, tmp_path / "run")
    with pytest.raises(ImportError, match="pip install torch"):
        evaluate_loaded_model(fake_loaded(split), split)
    assert list(tmp_path.iterdir()) == []


def test_cli_without_torch_exits_2_with_install_advice(monkeypatch, capsys, tmp_path):
    monkeypatch.setattr(ds_mod, "torch", None)
    out = tmp_path / "report.json"
    rc = ev.main(["--clean-csv", str(tmp_path / "nope.csv"), "--model-dir", str(tmp_path / "run"), "--output-json", str(out)])
    err = capsys.readouterr().err
    assert rc == 2 and err.startswith("error:") and "pip install torch" in err
    assert not out.exists()


def test_import_works_without_torch_in_a_fresh_interpreter():
    code = f"""
import sys
sys.path.insert(0, {str(PROJECT_ROOT)!r})
sys.modules['torch'] = None   # `import torch` now raises ImportError
import ml.evaluate as e
assert e.EvaluationReport is not None
try:
    e.evaluate_saved_model(None, 'nowhere')
except ImportError as exc:
    assert 'pip install torch' in str(exc)
else:
    raise SystemExit('no ImportError')
assert e.main(['--clean-csv', 'x.csv', '--model-dir', 'm']) == 2
print('OK')
"""
    r = subprocess.run([sys.executable, "-I", "-c", textwrap.dedent(code)], capture_output=True, text=True, cwd=str(PROJECT_ROOT), timeout=120)
    assert r.returncode == 0, r.stderr
    assert r.stdout.strip().endswith("OK")


# ================================================================ with a real saved model (needs PyTorch)
@pytest.fixture(scope="module")
def run_dir(split, tmp_path_factory):
    if not torch_available():
        pytest.skip("PyTorch is not installed / importable here")
    out = tmp_path_factory.mktemp("evalrun") / "run"
    train_model(split, tiny(max_epochs=5, patience=5), out)
    return out


@pytest.fixture()
def run_copy(run_dir, tmp_path):
    dst = tmp_path / "copy"
    shutil.copytree(run_dir, dst)
    return dst


def read_meta(out):
    return json.loads((Path(out) / METADATA_FILE).read_text(encoding="utf-8"))


def write_meta(out, meta):
    (Path(out) / METADATA_FILE).write_text(json.dumps(meta), encoding="utf-8")


@needs_torch
def test_end_to_end_report_matches_a_manual_computation(split, run_dir):
    rep = evaluate_saved_model(split, run_dir)
    loaded = load_trained_model(run_dir)
    ds = SequenceDataset(loaded.scaler.transform(split.test))
    manual = loaded.scaler.inverse_transform_y(train_mod.predict_scaled(loaded.model, ds)).astype(np.float64)
    ref = regression_metrics(split.test.y.astype(np.float64), manual)
    assert rep.model.overall.mae == pytest.approx(ref.mae, rel=1e-9)
    assert rep.model.overall.rmse == pytest.approx(ref.rmse, rel=1e-9)
    assert rep.model.overall.r2 == pytest.approx(ref.r2, rel=1e-9)
    np.testing.assert_allclose(rep.model.predictions.y_pred, manual, rtol=0, atol=1e-9)
    assert rep.model_type == "gru" and rep.test_experiments == ("E6",) and rep.train_experiments == ("E1", "E2", "E3", "E4")
    assert rep.test_origin == "real" and rep.training_origin == "real" and rep.n_test_windows == len(split.test)
    assert np.isfinite([e.overall.mae for e in rep.evaluations()]).all()
    assert "[gru]" in rep.summary()


@needs_torch
def test_end_to_end_is_deterministic_and_batch_size_independent(split, run_dir):
    a = evaluate_saved_model(split, run_dir)
    b = evaluate_saved_model(split, run_dir, batch_size=5)
    assert a.model.overall.mae == pytest.approx(b.model.overall.mae, rel=1e-5)
    np.testing.assert_allclose(a.model.predictions.y_pred, b.model.predictions.y_pred, atol=1e-3)
    assert a.persistence.overall == b.persistence.overall and a.training_mean_value == b.training_mean_value


@needs_torch
def test_lstm_run_can_be_evaluated_too(split, tmp_path):
    train_model(split, tiny(model_type="lstm", max_epochs=3), tmp_path / "lstm")
    rep = evaluate_saved_model(split, tmp_path / "lstm")
    assert rep.model_type == "lstm" and rep.model.baseline == "lstm"


@needs_torch
def test_evaluation_leaves_the_saved_run_untouched(split, run_dir):
    before = sha_tree(run_dir)
    evaluate_saved_model(split, run_dir)
    assert sha_tree(run_dir) == before  # no files written or changed: weights, scaler and metadata are as saved


@needs_torch
def test_evaluation_does_not_need_or_use_validation_arrays(split, run_dir):
    # Only the validation experiment IDS are compared with the metadata. A validation set whose
    # X and y arrays have been emptied (ids kept) must therefore give exactly the same report.
    ids_only = dataclasses.replace(split.validation, X=split.validation.X[:0], y=split.validation.y[:0])
    full = evaluate_saved_model(split, run_dir)
    rep = evaluate_saved_model(split._replace(validation=ids_only), run_dir)
    assert rep.validation_experiments == ("E5",)
    assert rep.model.overall == full.model.overall and rep.training_mean_value == full.training_mean_value


@needs_torch
def test_missing_run_files_are_reported(split, run_copy):
    (run_copy / "scaler.json").unlink()
    with pytest.raises(FileNotFoundError, match="scaler.json"):
        evaluate_saved_model(split, run_copy)
    with pytest.raises(FileNotFoundError):
        evaluate_saved_model(split, run_copy.parent / "nothing_here")


@needs_torch
def test_metadata_problems_in_a_saved_run_are_clear_errors(split, run_copy):
    meta = read_meta(run_copy)
    cases = [
        ("training", {"test_set_used": True}, "test set was unused"),
    ]
    for section, patch, message in cases:
        bad = copy.deepcopy(meta)
        bad[section].update(patch)
        write_meta(run_copy, bad)
        with pytest.raises(ValueError, match=message):
            evaluate_saved_model(split, run_copy)
    bad = copy.deepcopy(meta)
    del bad["experiments"]
    write_meta(run_copy, bad)
    with pytest.raises(ValueError, match="missing entries needed for evaluation"):
        evaluate_saved_model(split, run_copy)
    bad = copy.deepcopy(meta)
    del bad["data"]  # reported by ml.train.load_trained_model
    write_meta(run_copy, bad)
    with pytest.raises(ValueError, match="missing required entries"):
        evaluate_saved_model(split, run_copy)
    bad = copy.deepcopy(meta)
    bad["data"]["history_steps"] = 99  # scaler.json no longer matches
    write_meta(run_copy, bad)
    with pytest.raises(ValueError, match="does not match metadata.json"):
        evaluate_saved_model(split, run_copy)
    write_meta(run_copy, meta)
    assert evaluate_saved_model(split, run_copy).n_test_windows == len(split.test)  # the intact copy still works


@needs_torch
def test_a_different_split_than_the_one_used_for_training_is_rejected(run_dir):
    other = make_split(IDS6 + ["E7"])  # one more experiment: the test/validation assignment changes
    with pytest.raises(ValueError, match="does not match the experiments recorded"):
        evaluate_saved_model(other, run_dir)


@needs_torch
def test_data_with_another_history_than_the_model_was_trained_on_is_rejected(run_dir):
    other = split_by_experiment(build(daily(IDS6), history="4min", horizon="3min"))
    with pytest.raises(ValueError, match="not compatible with the saved model"):
        evaluate_saved_model(other, run_dir)


@needs_torch
def test_synthetic_test_data_is_rejected_with_a_real_saved_run(split, run_dir):
    with pytest.raises(ValueError, match="synthetic"):
        evaluate_saved_model(split._replace(test=build(daily(["SYNTH-T"]))), run_dir)


@needs_torch
def test_run_trained_with_synthetic_data_is_evaluated_and_labelled(tmp_path):
    mixed = make_split(IDS6 + ["SYNTH-A"])
    train_model(mixed, tiny(max_epochs=2), tmp_path / "mixed", allow_synthetic_in_training=True)
    rep = evaluate_saved_model(mixed, tmp_path / "mixed")
    assert rep.test_origin == "real" and rep.training_origin == "mixed"
    assert any("synthetic" in c for c in rep.caveats)


# ---------------------------------------------------------------- command line
def write_clean_csv(path, specs):
    df = make_frame(specs)
    df["timestamp"] = df["timestamp"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    df.to_csv(path, index=False)


@needs_torch
def test_cli_evaluates_and_writes_json_only_when_asked(run_dir, tmp_path, capsys):
    csv = tmp_path / "clean.csv"
    write_clean_csv(csv, daily(IDS6))
    before = sha_tree(run_dir)

    assert ev.main(["--clean-csv", str(csv), "--model-dir", str(run_dir)]) == 0
    out = capsys.readouterr().out
    assert "[gru]" in out and "[persistence]" in out and "not ppm" in out
    assert not list(tmp_path.glob("*.json"))  # nothing written without --output-json

    report = tmp_path / "report.json"
    assert ev.main(["--clean-csv", str(csv), "--model-dir", str(run_dir), "--output-json", str(report)]) == 0
    d = json.loads(report.read_text(encoding="utf-8"))
    assert d["schema"] == "airq.model_evaluation" and d["experiments"]["test"] == ["E6"]
    assert d["data_origin"] == {"test": "real", "training": "real"}
    assert not list(tmp_path.glob("*.tmp"))

    capsys.readouterr()
    assert ev.main(["--clean-csv", str(csv), "--model-dir", str(run_dir), "--output-json", str(report)]) == 2
    assert "already exists" in capsys.readouterr().err
    assert ev.main(["--clean-csv", str(csv), "--model-dir", str(run_dir), "--output-json", str(report), "--overwrite"]) == 0
    assert sha_tree(run_dir) == before  # the model directory is never modified


@needs_torch
def test_cli_matches_the_python_api(run_dir, split, tmp_path):
    csv = tmp_path / "clean.csv"
    write_clean_csv(csv, daily(IDS6))
    report = tmp_path / "r.json"
    assert ev.main(["--clean-csv", str(csv), "--model-dir", str(run_dir), "--output-json", str(report)]) == 0
    d = json.loads(report.read_text(encoding="utf-8"))
    api = evaluate_saved_model(split, run_dir)
    assert d["results"]["model"]["overall"]["mae"] == pytest.approx(api.model.overall.mae, rel=1e-6)
    assert d["results"]["persistence"]["overall"]["mae"] == pytest.approx(api.persistence.overall.mae, rel=1e-9)


@needs_torch
def test_cli_rejects_a_different_split_missing_files_and_synthetic_data(run_dir, tmp_path, capsys):
    csv = tmp_path / "clean.csv"
    write_clean_csv(csv, daily(IDS6))
    capsys.readouterr()
    rc = ev.main(["--clean-csv", str(csv), "--model-dir", str(run_dir), "--train-fraction", "0.4", "--val-fraction", "0.3", "--test-fraction", "0.3"])
    assert rc == 2 and "does not match the experiments recorded" in capsys.readouterr().err

    assert ev.main(["--clean-csv", str(csv), "--model-dir", str(tmp_path / "missing")]) == 2
    assert "not found" in capsys.readouterr().err

    synth = tmp_path / "SYNTHETIC_clean.csv"
    write_clean_csv(synth, daily([f"SYNTH-{i}" for i in range(6)]))
    assert ev.main(["--clean-csv", str(synth), "--model-dir", str(run_dir)]) == 2
    assert capsys.readouterr().err.startswith("error:")
