import dataclasses

import pytest

np = pytest.importorskip("numpy")
pd = pytest.importorskip("pandas")

from ml import baselines as bl  # noqa: E402
from ml.baselines import (  # noqa: E402
    PERSISTENCE,
    TRAINING_MEAN,
    BaselineEvaluation,
    BaselinePredictions,
    BaselineReport,
    RegressionMetrics,
    TrainingMean,
    data_origin,
    evaluate_baselines,
    evaluate_persistence,
    evaluate_training_mean,
    fit_training_mean,
    fit_training_mean_from_split,
    predict_persistence,
    predict_training_mean,
    regression_metrics,
    score_predictions,
)
from ml.preprocess import SYNTHETIC_PREFIX  # noqa: E402
from ml.scaling import SequenceScaler  # noqa: E402
from ml.sequences import build_sequences  # noqa: E402
from ml.splits import SplitResult, split_by_experiment  # noqa: E402

START = pd.Timestamp("2026-01-05T08:00:00Z")
DAY = pd.Timedelta(days=1)


# ---------------------------------------------------------------- fixtures
def make_frame(specs, interval=60, seed=0):
    """Cleaned-data frame (like ml.preprocess output) with deterministic, non-trivial values.

    specs: (experiment_id, start, rows[, factor]); `factor` multiplies the three sensor channels.
    """
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


def build(specs, interval=60, history="3min", horizon="3min", seed=0, **kw):
    df = make_frame(specs, interval, seed)
    return df, build_sequences(df, history, horizon, interval_seconds=interval, **kw)


def daily(ids, rows=40, factors=None):
    factors = factors or {}
    return [(e, START + i * DAY, rows, factors.get(e, 1.0)) for i, e in enumerate(ids)]


IDS6 = ["E1", "E2", "E3", "E4", "E5", "E6"]  # train E1-E4, validation E5, test E6
IDS10 = [f"X{i:02d}" for i in range(10)]  # train X00-X05, validation X06 X07, test X08 X09


@pytest.fixture(scope="module")
def split():
    _, seq = build(daily(IDS6))
    return split_by_experiment(seq)


@pytest.fixture(scope="module")
def split10():
    _, seq = build(daily(IDS10))
    return split_by_experiment(seq)


@pytest.fixture(scope="module")
def scaler(split):
    return SequenceScaler.fit_from_split(split)


@pytest.fixture(scope="module")
def scaled_split(split, scaler):
    return split._replace(
        train=scaler.transform(split.train),
        validation=scaler.transform(split.validation),
        test=scaler.transform(split.test),
    )


def ref_metrics(t, p):
    """Independent reference for MAE, RMSE, R^2."""
    t, p = np.asarray(t, float), np.asarray(p, float)
    err = p - t
    r2 = 1 - (err**2).sum() / ((t - t.mean()) ** 2).sum()
    return np.abs(err).mean(), np.sqrt((err**2).mean()), r2


def snapshot(seq):
    return (
        seq.X.copy(), seq.y.copy(), seq.target_at_origin.copy(), list(seq.experiment_ids),
        seq.origin_times.copy(), seq.target_times.copy(), seq.feature_names, seq.target_column,
    )


def assert_unchanged(seq, snap):
    X, y, o, ids, ot, tt, names, target = snap
    np.testing.assert_array_equal(seq.X, X)
    np.testing.assert_array_equal(seq.y, y)
    np.testing.assert_array_equal(seq.target_at_origin, o)
    assert list(seq.experiment_ids) == ids
    assert seq.origin_times.equals(ot) and seq.target_times.equals(tt)
    assert seq.feature_names == names and seq.target_column == target


# ---------------------------------------------------------------- 1. persistence
def test_persistence_predicts_the_value_at_the_origin(split):
    for name in ("validation", "test"):
        seq = getattr(split, name)
        pred = predict_persistence(seq, set_name=name)
        np.testing.assert_array_equal(pred.y_pred, seq.target_at_origin.astype(np.float64))
        np.testing.assert_array_equal(pred.y_true, seq.y.astype(np.float64))
        mq = seq.feature_names.index("mq135_raw")
        np.testing.assert_array_equal(pred.y_pred, seq.X[:, -1, mq].astype(np.float64))
        assert pred.baseline == PERSISTENCE and pred.set_name == name
        assert pred.units == "original" and pred.target_column == "mq135_raw"
        assert pred.training_origin is None
        assert len(pred) == len(seq)


def test_persistence_error_is_the_change_over_the_horizon(split):
    seq = split.validation
    ev = evaluate_persistence(seq)
    change = np.abs(seq.y.astype(np.float64) - seq.target_at_origin.astype(np.float64))
    assert ev.overall.mae == pytest.approx(change.mean())
    assert ev.overall.rmse == pytest.approx(np.sqrt((change**2).mean()))


@pytest.mark.parametrize("interval, history", [(10, "1min"), (60, "5min")])
def test_persistence_at_10_and_60_second_sampling(interval, history):
    _, seq = build(daily(["A", "B"], rows=120), interval=interval, history=history, horizon=history)
    pred = predict_persistence(seq)
    np.testing.assert_array_equal(pred.y_pred, seq.target_at_origin.astype(np.float64))


# ---------------------------------------------------------------- 2./3. training mean
def test_training_mean_uses_only_training_targets(split):
    model = fit_training_mean_from_split(split)
    assert model.mean == pytest.approx(split.train.y.astype(np.float64).mean())
    assert model.experiments == ("E1", "E2", "E3", "E4")
    assert model.n_windows == len(split.train)
    assert (model.target_column, model.interval_seconds) == ("mq135_raw", 60)
    assert (model.history_steps, model.horizon_steps) == (split.train.history_steps, split.train.horizon_steps)
    # the mean differs from what validation / test targets would give
    assert model.mean != pytest.approx(split.validation.y.astype(np.float64).mean(), rel=1e-6)
    assert model.mean != pytest.approx(split.test.y.astype(np.float64).mean(), rel=1e-6)


def test_training_mean_predictions_are_that_constant(split):
    model = fit_training_mean(split.train)
    for name in ("validation", "test"):
        seq = getattr(split, name)
        pred = predict_training_mean(model, seq, set_name=name)
        np.testing.assert_array_equal(pred.y_pred, np.full(len(seq), model.mean))
        np.testing.assert_array_equal(pred.y_true, seq.y.astype(np.float64))
        assert pred.baseline == TRAINING_MEAN
        assert pred.training_origin == "real"


def test_fit_from_split_equals_fit_on_the_training_subset(split):
    assert fit_training_mean_from_split(split) == fit_training_mean(split.train)


def test_validation_and_test_targets_cannot_influence_the_training_mean():
    _, seq = build(daily(IDS6))
    _, extreme = build(daily(IDS6, factors={"E5": 1000.0, "E6": -500.0}))
    a = fit_training_mean_from_split(split_by_experiment(seq))
    split_extreme = split_by_experiment(extreme)
    b = fit_training_mean_from_split(split_extreme)
    assert a == b
    assert split_extreme.validation.y.max() > 100 * split_extreme.train.y.max()  # sanity: really extreme
    # evaluating on the extreme sets does not change the fitted mean
    evaluate_training_mean(b, split_extreme.validation, set_name="validation")
    evaluate_training_mean(b, split_extreme.test, set_name="test")
    assert fit_training_mean_from_split(split_extreme) == a
    # while a change in the training data does change it
    _, shifted = build(daily(IDS6, factors={"E1": 2.0}))
    assert fit_training_mean_from_split(split_by_experiment(shifted)).mean != pytest.approx(a.mean)


def test_evaluate_baselines_fits_the_mean_on_train_only():
    _, seq = build(daily(IDS6))
    _, extreme = build(daily(IDS6, factors={"E5": 1000.0, "E6": -500.0}))
    r1 = evaluate_baselines(split_by_experiment(seq), sets=("validation", "test"))
    r2 = evaluate_baselines(split_by_experiment(extreme), sets=("validation", "test"))
    assert r1.training_mean == r2.training_mean


def test_evaluating_on_training_experiments_is_rejected_unless_explicitly_allowed(split):
    model = fit_training_mean_from_split(split)
    with pytest.raises(ValueError, match="not a held-out evaluation"):
        predict_training_mean(model, split.train, set_name="train")
    with pytest.raises(ValueError, match=r"E1"):
        evaluate_training_mean(model, split.train)
    ok = evaluate_training_mean(model, split.train, allow_overlap_with_training=True)
    assert ok.overall.n_windows == len(split.train)


# ---------------------------------------------------------------- 4. metrics
def test_metrics_hand_computed_values():
    m = regression_metrics([1, 2, 3, 4], [1, 2, 4, 6])
    assert isinstance(m, RegressionMetrics)
    assert m.n_windows == 4
    assert m.mae == pytest.approx(0.75)
    assert m.rmse == pytest.approx(np.sqrt(5 / 4))
    assert m.r2 == pytest.approx(0.0)  # SS_res = 5, SS_tot = 5
    assert m.r2_note is None


def test_metrics_perfect_mean_and_worse_than_mean_predictions():
    t = np.array([2.0, 4.0, 6.0, 8.0])
    perfect = regression_metrics(t, t)
    assert (perfect.mae, perfect.rmse, perfect.r2) == (0.0, 0.0, 1.0)
    at_mean = regression_metrics(t, np.full(4, t.mean()))
    assert at_mean.r2 == pytest.approx(0.0)
    worse = regression_metrics(t, t[::-1])
    assert worse.r2 < 0
    assert worse.r2 == pytest.approx(ref_metrics(t, t[::-1])[2])


def test_metrics_match_an_independent_calculation_on_random_data():
    rng = np.random.default_rng(3)
    t = rng.normal(300, 40, 200)
    p = t + rng.normal(5, 12, 200)
    m = regression_metrics(t, p)
    mae, rmse, r2 = ref_metrics(t, p)
    assert (m.mae, m.rmse, m.r2) == (pytest.approx(mae), pytest.approx(rmse), pytest.approx(r2))


def test_r2_is_undefined_not_nan_for_a_constant_target():
    m = regression_metrics([5.0, 5.0, 5.0], [5.0, 6.0, 4.0])
    assert m.r2 is None and "constant" in m.r2_note
    assert m.mae == pytest.approx(2 / 3) and m.rmse == pytest.approx(np.sqrt(2 / 3))
    perfect = regression_metrics([5.0, 5.0], [5.0, 5.0])  # still undefined, not 1.0 or nan
    assert perfect.r2 is None and perfect.mae == 0.0 and perfect.rmse == 0.0
    single = regression_metrics([3.0], [4.0])
    assert single.r2 is None and single.mae == 1.0 and single.n_windows == 1
    for v in (m.mae, m.rmse, perfect.mae, single.rmse):
        assert np.isfinite(v)


def test_metrics_accept_lists_and_reject_bad_arrays():
    assert regression_metrics([1, 2, 3], [1, 2, 3]).r2 == 1.0
    with pytest.raises(ValueError, match="empty"):
        regression_metrics([], [])
    with pytest.raises(ValueError, match="same length"):
        regression_metrics([1, 2, 3], [1, 2])
    with pytest.raises(ValueError, match="1-D"):
        regression_metrics([[1, 2], [3, 4]], [[1, 2], [3, 4]])
    for bad in (np.nan, np.inf, -np.inf):
        with pytest.raises(ValueError, match="finite"):
            regression_metrics([1.0, bad], [1.0, 2.0])
        with pytest.raises(ValueError, match="finite"):
            regression_metrics([1.0, 2.0], [1.0, bad])


# ---------------------------------------------------------------- 5. original units with a scaler
def test_metrics_are_in_original_units_when_a_scaler_is_supplied(split, scaler, scaled_split):
    plain = evaluate_baselines(split, sets=("validation", "test"))
    scaled = evaluate_baselines(scaled_split, scaler=scaler, sets=("validation", "test"))
    assert scaled.training_mean.mean == pytest.approx(plain.training_mean.mean, rel=1e-5)
    for a, b in zip(plain.evaluations, scaled.evaluations):
        assert (a.baseline, a.set_name) == (b.baseline, b.set_name)
        assert b.overall.mae == pytest.approx(a.overall.mae, rel=1e-4)
        assert b.overall.rmse == pytest.approx(a.overall.rmse, rel=1e-4)
        assert b.overall.r2 == pytest.approx(a.overall.r2, rel=1e-3, abs=1e-4)
        assert b.units == "original"
        for ea, eb in zip(a.per_experiment, b.per_experiment):
            assert ea.experiment_id == eb.experiment_id
            assert eb.metrics.mae == pytest.approx(ea.metrics.mae, rel=1e-4)


def test_scaled_predictions_and_targets_are_converted_back(split, scaler, scaled_split):
    seq = split.validation
    p = predict_persistence(scaled_split.validation, scaler=scaler, set_name="validation")
    np.testing.assert_allclose(p.y_true, seq.y, rtol=1e-5, atol=1e-3)
    np.testing.assert_allclose(p.y_pred, seq.target_at_origin, rtol=1e-5, atol=1e-3)
    model = fit_training_mean(scaled_split.train, scaler=scaler)
    q = predict_training_mean(model, scaled_split.validation, scaler=scaler, set_name="validation")
    np.testing.assert_allclose(q.y_true, seq.y, rtol=1e-5, atol=1e-3)
    assert q.y_pred[0] == pytest.approx(split.train.y.astype(np.float64).mean(), rel=1e-5)


def test_scaled_values_without_the_scaler_are_not_in_original_units(split, scaler, scaled_split):
    wrong = evaluate_persistence(scaled_split.validation)  # caller forgot the scaler
    right = evaluate_persistence(scaled_split.validation, scaler=scaler)
    assert wrong.overall.mae < 0.1 * right.overall.mae  # standardised units are far smaller


# ---------------------------------------------------------------- 6./7. overall, per experiment, ids
def test_overall_and_per_experiment_metrics_are_correct(split10):
    val = split10.validation
    assert sorted(set(val.experiment_ids)) == ["X06", "X07"]
    model = fit_training_mean_from_split(split10)
    for ev, pred_all in (
        (evaluate_persistence(val, set_name="validation"), val.target_at_origin.astype(np.float64)),
        (evaluate_training_mean(model, val, set_name="validation"), np.full(len(val), model.mean)),
    ):
        y = val.y.astype(np.float64)
        mae, rmse, r2 = ref_metrics(y, pred_all)
        assert ev.overall.n_windows == len(val)
        assert (ev.overall.mae, ev.overall.rmse, ev.overall.r2) == (
            pytest.approx(mae), pytest.approx(rmse), pytest.approx(r2))
        assert [e.experiment_id for e in ev.per_experiment] == ["X06", "X07"]
        macro_mae, macro_rmse = [], []
        for e in ev.per_experiment:
            m = np.asarray(val.experiment_ids == e.experiment_id)
            emae, ermse, er2 = ref_metrics(y[m], pred_all[m])
            assert e.metrics.n_windows == int(m.sum())
            assert (e.metrics.mae, e.metrics.rmse, e.metrics.r2) == (
                pytest.approx(emae), pytest.approx(ermse), pytest.approx(er2))
            macro_mae.append(emae)
            macro_rmse.append(ermse)
        assert ev.macro_mae == pytest.approx(np.mean(macro_mae))
        assert ev.macro_rmse == pytest.approx(np.mean(macro_rmse))
        # pooled metrics weigh windows, the macro average weighs experiments
        assert sum(e.metrics.n_windows for e in ev.per_experiment) == ev.overall.n_windows


def test_macro_average_weighs_experiments_equally_while_overall_weighs_windows():
    rows = {"X00": 40, "X01": 40, "X02": 40, "X03": 40, "X04": 40, "X05": 40,
            "X06": 25, "X07": 90, "X08": 40, "X09": 40}  # unequal validation experiments
    specs = [(e, START + i * DAY, rows[e]) for i, e in enumerate(IDS10)]
    _, seq = build(specs)
    val = split_by_experiment(seq).validation
    ev = evaluate_persistence(val)
    n6, n7 = (int(np.sum(val.experiment_ids == e)) for e in ("X06", "X07"))
    assert n6 != n7
    maes = [e.metrics.mae for e in ev.per_experiment]
    assert ev.macro_mae == pytest.approx(np.mean(maes))
    assert ev.overall.mae == pytest.approx((maes[0] * n6 + maes[1] * n7) / (n6 + n7))
    assert ev.macro_mae != pytest.approx(ev.overall.mae, rel=1e-6)
    rmses = [e.metrics.rmse for e in ev.per_experiment]
    assert ev.macro_rmse == pytest.approx(np.mean(rmses))
    assert ev.macro_rmse != pytest.approx(ev.overall.rmse, rel=1e-6)


def test_per_experiment_results_are_chronological_whatever_the_window_order(split10):
    val = split10.validation
    shuffled = val.subset(np.random.default_rng(1).permutation(len(val)))
    ev = evaluate_persistence(shuffled)
    assert [e.experiment_id for e in ev.per_experiment] == ["X06", "X07"]
    ref = evaluate_persistence(val)
    assert ev.overall.mae == pytest.approx(ref.overall.mae)
    for a, b in zip(ev.per_experiment, ref.per_experiment):
        assert a.metrics.rmse == pytest.approx(b.metrics.rmse)


def test_constant_target_experiment_has_undefined_r2_but_other_experiments_do_not():
    specs = daily(IDS10)
    df = make_frame(specs)
    df.loc[df["experiment_id"] == "X06", "mq135_raw"] = 400.0
    seq = build_sequences(df, "3min", "3min", interval_seconds=60)
    sp = split_by_experiment(seq)
    ev = evaluate_persistence(sp.validation)
    by_id = {e.experiment_id: e for e in ev.per_experiment}
    assert by_id["X06"].metrics.r2 is None and by_id["X06"].metrics.mae == 0.0
    assert by_id["X07"].metrics.r2 is not None
    assert ev.overall.r2 is not None  # pooled target is not constant
    assert "n/a" in ev.summary()


def test_experiment_ids_and_times_stay_attached_to_predictions(split):
    seq = split.validation
    ev = evaluate_persistence(seq, set_name="validation")
    p = ev.predictions
    assert isinstance(p, BaselinePredictions) and isinstance(ev, BaselineEvaluation)
    assert list(p.experiment_ids) == list(seq.experiment_ids)
    assert p.origin_times.equals(seq.origin_times) and p.target_times.equals(seq.target_times)
    assert p.experiment_ids.shape == p.y_true.shape == p.y_pred.shape
    assert {e.experiment_id for e in ev.per_experiment} == set(map(str, seq.experiment_ids))
    assert score_predictions(p).overall == ev.overall


def test_report_structure_and_default_sets(split):
    report = evaluate_baselines(split)
    assert isinstance(report, BaselineReport) and isinstance(report.training_mean, TrainingMean)
    assert [(e.set_name, e.baseline) for e in report.evaluations] == [
        ("validation", PERSISTENCE), ("validation", TRAINING_MEAN)]
    with pytest.raises(KeyError, match="test"):
        report.get(PERSISTENCE, "test")  # the test set is only evaluated when asked for
    both = evaluate_baselines(split, sets=("test", "validation"))
    assert [(e.set_name, e.baseline) for e in both.evaluations] == [
        ("test", PERSISTENCE), ("test", TRAINING_MEAN), ("validation", PERSISTENCE), ("validation", TRAINING_MEAN)]
    assert both.get(TRAINING_MEAN, "test").set_name == "test"
    assert "training mean of mq135_raw" in both.summary()


# ---------------------------------------------------------------- 8. invalid and empty inputs
def test_empty_and_non_sequence_inputs_are_rejected(split):
    empty = split.validation.subset(np.zeros(len(split.validation), dtype=bool))
    assert len(empty) == 0
    model = fit_training_mean_from_split(split)
    with pytest.raises(ValueError, match="empty"):
        predict_persistence(empty)
    with pytest.raises(ValueError, match="empty"):
        predict_training_mean(model, empty)
    with pytest.raises(ValueError, match="empty"):
        fit_training_mean(empty)
    for bad in (None, {"y": 1}, split.validation.y, [split.validation]):
        with pytest.raises(TypeError, match="SequenceSet"):
            predict_persistence(bad)
        with pytest.raises(TypeError, match="SequenceSet"):
            fit_training_mean(bad)
    with pytest.raises(TypeError, match="SplitResult"):
        evaluate_baselines(split.train)
    with pytest.raises(TypeError, match="SplitResult"):
        fit_training_mean_from_split(split.train)


def test_empty_predictions_cannot_be_scored(split):
    pred = predict_persistence(split.validation)
    empty = dataclasses.replace(pred, y_true=pred.y_true[:0], y_pred=pred.y_pred[:0])
    with pytest.raises(ValueError, match="empty"):
        score_predictions(empty)
    with pytest.raises(TypeError, match="BaselinePredictions"):
        score_predictions(split.validation)


@pytest.mark.parametrize("field", ["y", "target_at_origin", "X"])
@pytest.mark.parametrize("bad", [np.nan, np.inf, -np.inf])
def test_non_finite_values_are_rejected(split, field, bad):
    seq = split.validation
    arr = np.array(getattr(seq, field), copy=True)
    arr.flat[2] = bad
    broken = dataclasses.replace(seq, **{field: arr})
    with pytest.raises(ValueError, match=f"{field} contains NaN or infinite"):
        predict_persistence(broken)
    with pytest.raises(ValueError, match=f"{field} contains NaN or infinite"):
        fit_training_mean(broken)


def test_misaligned_naive_and_inconsistent_arrays_are_rejected(split):
    seq = split.validation
    with pytest.raises(ValueError, match="not aligned"):
        predict_persistence(dataclasses.replace(seq, y=seq.y[:-1]))
    with pytest.raises(ValueError, match="not aligned"):
        predict_persistence(dataclasses.replace(seq, experiment_ids=seq.experiment_ids[:-1]))
    with pytest.raises(ValueError, match="timezone-aware"):
        predict_persistence(dataclasses.replace(seq, origin_times=seq.origin_times.tz_localize(None)))
    with pytest.raises(ValueError, match="shape"):
        predict_persistence(dataclasses.replace(seq, X=seq.X[:, :, 0]))
    shifted = seq.target_at_origin + np.float32(5.0)
    with pytest.raises(ValueError, match="does not match the last input step"):
        predict_persistence(dataclasses.replace(seq, target_at_origin=shifted))


def test_invalid_evaluation_set_selection_is_rejected(split):
    with pytest.raises(ValueError, match="at least one"):
        evaluate_baselines(split, sets=())
    with pytest.raises(ValueError, match=r"unknown evaluation set.*train"):
        evaluate_baselines(split, sets=("train",))
    with pytest.raises(ValueError, match="unknown evaluation set"):
        evaluate_baselines(split, sets=("validation", "holdout"))
    with pytest.raises(ValueError, match="duplicate"):
        evaluate_baselines(split, sets=("test", "test"))


def test_invalid_training_mean_objects_are_rejected(split):
    model = fit_training_mean_from_split(split)
    with pytest.raises(TypeError, match="TrainingMean"):
        predict_training_mean(0.0, split.validation)
    with pytest.raises(TypeError, match="TrainingMean"):
        evaluate_training_mean({"mean": 1.0}, split.validation)
    with pytest.raises(ValueError, match="not finite"):
        predict_training_mean(dataclasses.replace(model, mean=float("nan")), split.validation)
    with pytest.raises(ValueError, match="not finite"):
        predict_training_mean(dataclasses.replace(model, mean=float("inf")), split.validation)


# ---------------------------------------------------------------- 9. incompatible metadata, scalers
def test_training_mean_rejects_sequences_with_different_metadata(split):
    model = fit_training_mean_from_split(split)
    seq = split.validation
    _, other_target = build(daily(["A", "B"]), target_column="temperature_c")  # consistent set, other target
    with pytest.raises(ValueError, match=r"target_column 'temperature_c' != training 'mq135_raw'"):
        predict_training_mean(model, other_target)
    with pytest.raises(ValueError, match="interval_seconds 10 != training 60"):
        predict_training_mean(model, dataclasses.replace(seq, interval_seconds=10))
    with pytest.raises(ValueError, match="history_steps"):
        predict_training_mean(model, dataclasses.replace(seq, history_steps=seq.history_steps + 1))
    _, other_h = build(daily(["A", "B"]), history="5min", horizon="3min")
    with pytest.raises(ValueError, match="history_steps 5 != training 3"):
        predict_training_mean(model, other_h)
    _, other_k = build(daily(["A", "B"]), history="3min", horizon="5min")
    with pytest.raises(ValueError, match="horizon_steps 5 != training 3"):
        predict_training_mean(model, other_k)


def test_several_metadata_mismatches_are_reported_together(split):
    model = fit_training_mean_from_split(split)
    _, other = build(daily(["A", "B"]), horizon="5min", target_column="humidity_percent")
    with pytest.raises(ValueError) as err:
        predict_training_mean(model, other)
    assert "target_column" in str(err.value) and "horizon_steps" in str(err.value)


def test_incompatible_or_invalid_scalers_are_rejected(split, scaler, scaled_split):
    seq = scaled_split.validation
    # not a SequenceScaler at all
    for bad in ("scaler", {"mean": 1}, 1.0):
        with pytest.raises(TypeError, match="SequenceScaler"):
            predict_persistence(seq, scaler=bad)
        with pytest.raises(TypeError, match="SequenceScaler"):
            fit_training_mean(seq, scaler=bad)
    # fitted for a different target column
    _, temp = build(daily(IDS6), target_column="temperature_c")
    temp_scaler = SequenceScaler.fit_from_split(split_by_experiment(temp))
    with pytest.raises(ValueError, match=r"validation data: sequences do not match the scaler.*target_column"):
        predict_persistence(seq, scaler=temp_scaler, set_name="validation")
    # fitted for a different window layout
    _, five = build(daily(IDS6), history="5min", horizon="5min")
    five_scaler = SequenceScaler.fit_from_split(split_by_experiment(five))
    with pytest.raises(ValueError, match="do not match the scaler.*history_steps"):
        evaluate_persistence(seq, scaler=five_scaler)
    with pytest.raises(ValueError, match="do not match the scaler"):
        evaluate_baselines(scaled_split, scaler=five_scaler)
    # feature names differ
    renamed = dataclasses.replace(seq, feature_names=("a",) + tuple(seq.feature_names[1:]))
    with pytest.raises(ValueError, match="feature_names"):
        predict_persistence(renamed, scaler=scaler)


# ---------------------------------------------------------------- 10. no mutation
def test_inputs_and_scaler_are_not_mutated(split, scaler, scaled_split):
    scaler_before = scaler.to_dict()
    snaps = {name: snapshot(getattr(scaled_split, name)) for name in ("train", "validation", "test")}
    report = evaluate_baselines(scaled_split, scaler=scaler, sets=("validation", "test"))
    for name, snap in snaps.items():
        assert_unchanged(getattr(scaled_split, name), snap)
    assert scaler.to_dict() == scaler_before
    assert report.training_mean.n_windows == len(scaled_split.train)

    plain_snaps = {name: snapshot(getattr(split, name)) for name in ("train", "validation", "test")}
    evaluate_baselines(split, sets=("validation", "test"))
    for name, snap in plain_snaps.items():
        assert_unchanged(getattr(split, name), snap)


def test_returned_arrays_do_not_alias_the_inputs(split):
    seq = split.validation
    snap = snapshot(seq)
    pred = predict_persistence(seq)
    pred.y_true[:] = 0.0
    pred.y_pred[:] = 0.0
    pred.experiment_ids[:] = "changed"
    assert_unchanged(seq, snap)
    model = fit_training_mean_from_split(split)
    with pytest.raises(dataclasses.FrozenInstanceError):
        model.mean = 0.0
    with pytest.raises(dataclasses.FrozenInstanceError):
        evaluate_persistence(seq).overall.mae = 0.0


# ---------------------------------------------------------------- 7./11. data origin, synthetic data
def test_data_origin_labels():
    assert data_origin(["E1", "E2"]) == "real"
    assert data_origin([f"{SYNTHETIC_PREFIX}001"]) == "synthetic"
    assert data_origin(np.array(["E1", f"{SYNTHETIC_PREFIX}001", "E2"], dtype=object)) == "mixed"
    with pytest.raises(ValueError, match="empty"):
        data_origin([])


def test_real_evaluation_is_reportable_as_real_world(split):
    ev = evaluate_persistence(split.validation, set_name="validation")
    assert ev.data_origin == "real" and ev.reportable_as_real_world
    assert all(e.data_origin == "real" for e in ev.per_experiment)
    assert "real data" in ev.summary() and "NOT real-world" not in ev.summary()


def test_synthetic_evaluation_is_never_labelled_as_real_world_performance():
    ids = [f"{SYNTHETIC_PREFIX}{i:03d}" for i in range(6)]
    _, seq = build(daily(ids))
    for ev in (
        evaluate_persistence(seq, set_name="validation"),
        evaluate_training_mean(fit_training_mean(seq), seq, set_name="validation", allow_overlap_with_training=True),
    ):
        assert ev.data_origin == "synthetic" and not ev.reportable_as_real_world
        assert all(e.data_origin == "synthetic" for e in ev.per_experiment)
        text = ev.summary()
        assert "SYNTHETIC" in text and "NOT real-world performance" in text
    assert fit_training_mean(seq).data_origin == "synthetic"


def test_mixed_evaluation_data_is_labelled_mixed_and_not_reportable():
    ids = [f"{SYNTHETIC_PREFIX}001", "R1", "R2"]
    _, seq = build(daily(ids))
    ev = evaluate_persistence(seq)
    assert ev.data_origin == "mixed" and not ev.reportable_as_real_world
    assert "MIXED" in ev.summary() and "NOT real-world performance" in ev.summary()
    labels = {e.experiment_id: e.data_origin for e in ev.per_experiment}
    assert labels == {f"{SYNTHETIC_PREFIX}001": "synthetic", "R1": "real", "R2": "real"}
    assert list(labels) == [f"{SYNTHETIC_PREFIX}001", "R1", "R2"]  # chronological, ids kept


def test_synthetic_training_data_is_recorded_but_real_evaluation_stays_real():
    ids = [f"{SYNTHETIC_PREFIX}001", f"{SYNTHETIC_PREFIX}002", "R1", "R2", "R3", "R4", "R5"]
    _, seq = build(daily(ids))
    sp = split_by_experiment(seq)  # synthetic experiments go to train only
    report = evaluate_baselines(sp, sets=("validation", "test"))
    assert report.training_mean.data_origin == "mixed"
    for ev in report.evaluations:
        assert ev.data_origin == "real" and ev.reportable_as_real_world
        if ev.baseline == TRAINING_MEAN:
            assert ev.training_origin == "mixed"
            assert "mean fitted on mixed training data" in ev.summary()
        else:
            assert ev.training_origin is None
    assert "mixed data" in report.summary()


def test_synthetic_experiments_in_a_split_never_appear_in_evaluation_results():
    ids = [f"{SYNTHETIC_PREFIX}001", "R1", "R2", "R3", "R4", "R5"]
    _, seq = build(daily(ids))
    report = evaluate_baselines(split_by_experiment(seq), sets=("validation", "test"))
    for ev in report.evaluations:
        assert not any(e.experiment_id.startswith(SYNTHETIC_PREFIX) for e in ev.per_experiment)
        assert not any(str(i).startswith(SYNTHETIC_PREFIX) for i in ev.predictions.experiment_ids)


# ---------------------------------------------------------------- 12. determinism
def test_results_are_deterministic_across_repeated_runs(split, scaler, scaled_split):
    a = evaluate_baselines(split, sets=("validation", "test"))
    b = evaluate_baselines(split, sets=("validation", "test"))
    assert a.summary() == b.summary()
    assert a.training_mean == b.training_mean
    for x, y in zip(a.evaluations, b.evaluations):
        assert x.overall == y.overall and x.per_experiment == y.per_experiment
        assert (x.macro_mae, x.macro_rmse) == (y.macro_mae, y.macro_rmse)
        np.testing.assert_array_equal(x.predictions.y_pred, y.predictions.y_pred)
        np.testing.assert_array_equal(x.predictions.y_true, y.predictions.y_true)
        assert list(x.predictions.experiment_ids) == list(y.predictions.experiment_ids)
    s1 = evaluate_baselines(scaled_split, scaler=scaler, sets=("validation",))
    s2 = evaluate_baselines(scaled_split, scaler=scaler, sets=("validation",))
    assert s1.summary() == s2.summary()


def test_rebuilding_the_whole_pipeline_gives_identical_numbers():
    reports = []
    for _ in range(2):
        _, seq = build(daily(IDS6))
        sp = split_by_experiment(seq)
        sc = SequenceScaler.fit_from_split(sp)
        scaled = sp._replace(train=sc.transform(sp.train), validation=sc.transform(sp.validation),
                             test=sc.transform(sp.test))
        reports.append(evaluate_baselines(scaled, scaler=sc, sets=("validation", "test")))
    assert reports[0].summary() == reports[1].summary()


def test_module_has_no_training_plotting_or_io_dependencies():
    import ast

    tree = ast.parse(open(bl.__file__, encoding="utf-8").read())
    imported = set()
    calls = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported |= {a.name.split(".")[0] for a in node.names}
        elif isinstance(node, ast.ImportFrom):
            imported.add((node.module or "").split(".")[0])
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            calls.add(node.func.id)
    assert imported <= {"__future__", "math", "dataclasses", "numpy", "ml"}
    assert "open" not in calls