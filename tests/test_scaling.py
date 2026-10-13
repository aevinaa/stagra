import dataclasses
import json

import pytest

np = pytest.importorskip("numpy")
pd = pytest.importorskip("pandas")

from ml.features import CONTEXT_FEATURES  # noqa: E402
from ml.preprocess import SYNTHETIC_PREFIX  # noqa: E402
from ml.scaling import (  # noqa: E402
    SCALED_COLUMNS,
    SCHEMA_NAME,
    SCHEMA_VERSION,
    ChannelStats,
    SequenceScaler,
)
from ml.sequences import SequenceSet, build_sequences  # noqa: E402
from ml.splits import split_by_experiment  # noqa: E402

START = pd.Timestamp("2026-01-05T08:00:00Z")
DAY = pd.Timedelta(days=1)
SENSORS = list(SCALED_COLUMNS)


# ---------------------------------------------------------------- fixtures
def make_frame(specs, interval=60, seed=0):
    """Cleaned-data frame (like ml.preprocess output) with deterministic, non-trivial sensor values.

    specs: (experiment_id, start, rows) or (experiment_id, start, rows, factor); `factor`
    multiplies the three sensor channels (used to make extreme validation / test data).
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


IDS = ["E1", "E2", "E3", "E4", "E5", "E6"]  # 6 experiments -> train E1-E4, validation E5, test E6


@pytest.fixture(scope="module")
def data():
    df, seq = build(daily(IDS))
    split = split_by_experiment(seq)
    return df, seq, split


def idx(seq, name):
    return seq.feature_names.index(name)


def unique_rows_used(df, experiments, horizon_steps):
    """Independent reference: rows of the raw frame that are inputs of some window.

    With no gaps every row except the last `horizon_steps` of an experiment is an input of some
    window (those last rows only appear as targets).
    """
    parts = []
    for e in experiments:
        g = df[df["experiment_id"] == e].sort_values("timestamp")
        parts.append(g.iloc[: len(g) - horizon_steps])
    return pd.concat(parts)


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


# ---------------------------------------------------------------- statistics: training data only
def test_statistics_match_an_independent_calculation_on_training_experiments(data):
    df, _, split = data
    scaler = SequenceScaler.fit_from_split(split)
    rows = unique_rows_used(df, ["E1", "E2", "E3", "E4"], split.train.horizon_steps)
    for name in SENSORS:
        st = scaler.stats(name)
        assert st.mean == pytest.approx(rows[name].mean(), rel=1e-5)
        assert st.std == pytest.approx(rows[name].std(ddof=0), rel=1e-5)
        assert st.scale == st.std and not st.zero_variance
    assert scaler.fit_info.n_observations == len(rows)
    assert scaler.fit_info.experiments == ("E1", "E2", "E3", "E4")
    assert scaler.fit_info.synthetic_experiments == ()


def test_fit_from_split_equals_fit_train_on_the_training_subset(data):
    _, _, split = data
    assert SequenceScaler.fit_from_split(split) == SequenceScaler.fit_train(split.train)


def test_extreme_validation_and_test_values_do_not_change_the_statistics():
    _, seq = build(daily(IDS))
    _, extreme = build(daily(IDS, factors={"E5": 1000.0, "E6": -500.0}))
    a = SequenceScaler.fit_from_split(split_by_experiment(seq))
    split_extreme = split_by_experiment(extreme)
    b = SequenceScaler.fit_from_split(split_extreme)
    assert a == b
    # sanity: the extreme data really is extreme
    assert split_extreme.validation.X[:, :, 2].max() > 100 * split_extreme.train.X[:, :, 2].max()
    # and transforming it leaves the fitted statistics alone
    before = b.to_dict()
    out = b.transform(split_extreme.validation)
    assert b.to_dict() == before
    assert np.all(np.isfinite(out.X)) and np.all(np.isfinite(out.y))


def test_scaler_is_immutable_so_transform_cannot_refit(data):
    _, _, split = data
    scaler = SequenceScaler.fit_from_split(split)
    with pytest.raises(dataclasses.FrozenInstanceError):
        scaler.channels = ()
    with pytest.raises(dataclasses.FrozenInstanceError):
        scaler.target_column = "temperature_c"
    assert not hasattr(scaler, "fit")
    before = scaler.to_dict()
    scaler.transform(split.validation)
    scaler.transform(split.test)
    scaler.inverse_transform(split.test)
    assert scaler.to_dict() == before


def test_fit_from_split_requires_a_split_result(data):
    _, seq, split = data
    with pytest.raises(TypeError, match="SplitResult"):
        SequenceScaler.fit_from_split(split.train)
    with pytest.raises(TypeError, match="SplitResult"):
        SequenceScaler.fit_from_split(seq)


def test_training_only_means_validation_data_is_not_standardised_to_zero_mean(data):
    _, _, split = data
    scaler = SequenceScaler.fit_from_split(split)
    mq = idx(split.train, "mq135_raw")
    train_mean = scaler.transform(split.train).X[:, :, mq].mean()
    test_mean = scaler.transform(split.test).X[:, :, mq].mean()
    assert abs(train_mean) < abs(test_mean)  # the ramp drifts: later experiments differ from train


def test_scaled_training_observations_have_zero_mean_and_unit_std(data):
    df, seq, split = data
    scaler = SequenceScaler.fit_from_split(split)
    train = scaler.transform(split.train)
    # unique observations again: first window of each experiment plus the last step of every later window
    for name in SENSORS:
        j = idx(train, name)
        vals = []
        for e in ["E1", "E2", "E3", "E4"]:
            m = np.asarray(train.experiment_ids == e)
            sub = train.X[m][:, :, j]  # windows are chronological per experiment, stride 1
            vals.append(sub[0])
            vals.extend(sub[1:, -1:].ravel()[:, None])
        flat = np.concatenate([np.ravel(v) for v in vals])
        assert flat.mean() == pytest.approx(0.0, abs=1e-5)
        assert flat.std() == pytest.approx(1.0, abs=1e-5)


# ---------------------------------------------------------------- overlapping windows
def test_overlapping_windows_do_not_overweight_repeated_readings():
    # One experiment: the first 5 readings are huge, the rest are 0. Early readings sit in few
    # windows, later ones in many, so a naive window-weighted mean is very different.
    rows = 60
    df = make_frame([("E1", START, rows)])
    df["mq135_raw"] = 0.0
    df.loc[:4, "mq135_raw"] = 1000.0
    seq = build_sequences(df, "10min", "10min", interval_seconds=60)  # 10 / 10 steps, stride 1
    assert seq.history_steps == 10 and len(seq) > 1
    scaler = SequenceScaler.fit_train(seq)
    used = rows - seq.horizon_steps  # rows that are inputs of at least one window
    expected_mean = 5 * 1000.0 / used
    naive_mean = float(seq.X[:, :, idx(seq, "mq135_raw")].mean())
    assert scaler.stats("mq135_raw").mean == pytest.approx(expected_mean)
    assert scaler.stats("mq135_raw").mean != pytest.approx(naive_mean, rel=0.05)
    assert scaler.fit_info.n_observations == used
    assert scaler.fit_info.n_window_samples == len(seq) * seq.history_steps > used


def test_each_reading_counts_once_for_any_stride():
    df = make_frame([("E1", START, 80)])
    full = build_sequences(df, "3min", "3min", interval_seconds=60)
    strided = build_sequences(df, "3min", "3min", interval_seconds=60, stride="1min")
    sparse = build_sequences(df, "3min", "3min", interval_seconds=60, stride="3min")
    a, b = SequenceScaler.fit_train(full), SequenceScaler.fit_train(strided)
    assert a == b
    c = SequenceScaler.fit_train(sparse)  # non-overlapping windows: every sample is a distinct reading
    assert c.fit_info.n_observations == c.fit_info.n_window_samples == len(sparse) * 3
    assert a.fit_info.n_observations == 80 - 3


def test_same_timestamp_in_different_experiments_counts_separately():
    # two experiments recorded at the same clock times: (experiment, timestamp) keys are different
    specs = [("E1", START, 30, 1.0), ("E2", START, 30, 1.0)]
    df, seq = build(specs)
    scaler = SequenceScaler.fit_train(seq)
    assert scaler.fit_info.n_observations == 2 * (30 - seq.horizon_steps)
    rows = unique_rows_used(df, ["E1", "E2"], seq.horizon_steps)
    assert scaler.stats("temperature_c").mean == pytest.approx(rows["temperature_c"].mean(), rel=1e-5)


def test_inconsistent_repeated_readings_are_rejected(data):
    _, seq, _ = data
    bad_X = seq.X.copy()
    bad_X[1, 0, idx(seq, "mq135_raw")] += 5.0  # same reading as window 0, step 1, but different value
    with pytest.raises(ValueError, match="different values"):
        SequenceScaler.fit_train(dataclasses.replace(seq, X=bad_X))


@pytest.mark.parametrize("interval, history", [(10, "1min"), (60, "5min")])
def test_works_at_10_and_60_second_sampling(interval, history):
    df, seq = build(daily(["E1", "E2"], rows=120), interval=interval, history=history, horizon=history)
    scaler = SequenceScaler.fit_train(seq)
    assert scaler.interval_seconds == interval
    assert scaler.fit_info.n_observations == 2 * (120 - seq.horizon_steps)
    rows = unique_rows_used(df, ["E1", "E2"], seq.horizon_steps)
    assert scaler.stats("mq135_raw").mean == pytest.approx(rows["mq135_raw"].mean(), rel=1e-5)


# ---------------------------------------------------------------- what is (not) scaled
def test_only_sensor_channels_are_scaled_context_flags_are_unchanged(data):
    _, _, split = data
    scaler = SequenceScaler.fit_from_split(split)
    assert scaler.scaled_columns == tuple(SCALED_COLUMNS)
    for subset in (split.train, split.validation, split.test):
        out = scaler.transform(subset)
        for name in CONTEXT_FEATURES:
            j = idx(subset, name)
            np.testing.assert_array_equal(out.X[:, :, j], subset.X[:, :, j])
        for name in SENSORS:
            j = idx(subset, name)
            assert not np.array_equal(out.X[:, :, j], subset.X[:, :, j])


def test_scaled_values_follow_the_formula(data):
    _, _, split = data
    scaler = SequenceScaler.fit_from_split(split)
    out = scaler.transform(split.test)
    for name in SENSORS:
        st, j = scaler.stats(name), idx(split.test, name)
        expected = (split.test.X[:, :, j].astype(np.float64) - st.mean) / st.scale
        np.testing.assert_allclose(out.X[:, :, j], expected, rtol=1e-5, atol=1e-5)


def test_only_present_sensor_channels_are_scaled():
    df, seq = build(daily(["E1", "E2"]), input_columns=["temperature_c", "mq135_raw", "occupancy"])
    scaler = SequenceScaler.fit_train(seq)
    assert scaler.scaled_columns == ("temperature_c", "mq135_raw")
    out = scaler.transform(seq)
    np.testing.assert_array_equal(out.X[:, :, 2], seq.X[:, :, 2])


# ---------------------------------------------------------------- target handling
def test_target_is_scaled_with_its_matching_channel(data):
    _, _, split = data
    scaler = SequenceScaler.fit_from_split(split)
    st = scaler.stats("mq135_raw")
    assert scaler.target_stats == st
    out = scaler.transform(split.validation)
    mq = idx(split.validation, "mq135_raw")
    np.testing.assert_allclose(out.y, (split.validation.y - st.mean) / st.scale, rtol=1e-5, atol=1e-5)
    np.testing.assert_allclose(out.target_at_origin, out.X[:, -1, mq], rtol=1e-5, atol=1e-5)
    # y and the last input (the target at the origin) are scaled consistently
    np.testing.assert_allclose(
        out.y - out.target_at_origin, (split.validation.y - split.validation.target_at_origin) / st.scale,
        rtol=1e-4, atol=1e-4,
    )


@pytest.mark.parametrize("target", ["temperature_c", "humidity_percent"])
def test_other_sensor_targets_use_their_own_statistics(target):
    df, seq = build(daily(["E1", "E2", "E3"]), target_column=target)
    scaler = SequenceScaler.fit_train(seq)
    assert scaler.target_column == target and scaler.target_stats.name == target
    out = scaler.transform(seq)
    st = scaler.stats(target)
    np.testing.assert_allclose(out.y, (seq.y - st.mean) / st.scale, rtol=1e-5, atol=1e-5)
    np.testing.assert_allclose(scaler.inverse_transform_y(out.y), seq.y, rtol=1e-5, atol=1e-4)


def test_unsupported_target_configurations_are_rejected_clearly():
    _, seq = build(daily(["E1", "E2"]), target_column="occupancy")  # a context flag, not a sensor channel
    with pytest.raises(ValueError, match="unsupported target_column 'occupancy'"):
        SequenceScaler.fit_train(seq)
    # a sensor target that is not among the input features: no statistics to scale it with
    _, seq2 = build(daily(["E1", "E2"]), input_columns=["temperature_c", "humidity_percent", "occupancy"])
    assert seq2.target_column == "mq135_raw"
    with pytest.raises(ValueError, match="not among the input features"):
        SequenceScaler.fit_train(seq2)


def test_no_scaled_channel_among_the_features_is_rejected():
    _, seq = build(daily(["E1", "E2"]), input_columns=["occupancy", "fan_on"])
    with pytest.raises(ValueError, match="none of the scaled channels"):
        SequenceScaler.fit_train(seq)


# ---------------------------------------------------------------- zero variance
def test_zero_variance_channels_stay_finite():
    df = make_frame(daily(["E1", "E2", "E3"]))
    df["temperature_c"] = 21.5  # constant sensor
    df["mq135_raw"] = 0.1  # constant, and not exactly representable
    seq = build_sequences(df, "3min", "3min", interval_seconds=60)
    scaler = SequenceScaler.fit_train(seq)
    for name in ("temperature_c", "mq135_raw"):
        st = scaler.stats(name)
        assert st.zero_variance and st.scale == 1.0 and st.std == 0.0
    assert not scaler.stats("humidity_percent").zero_variance
    out = scaler.transform(seq)
    assert np.all(np.isfinite(out.X)) and np.all(np.isfinite(out.y)) and np.all(np.isfinite(out.target_at_origin))
    np.testing.assert_allclose(out.X[:, :, idx(seq, "temperature_c")], 0.0, atol=1e-6)
    np.testing.assert_allclose(out.y, 0.0, atol=1e-5)  # constant target is centred, not blown up
    np.testing.assert_allclose(scaler.inverse_transform(out).X, seq.X, rtol=1e-5, atol=1e-5)
    # new data from a different distribution only shifts; it cannot create inf / NaN
    shifted = dataclasses.replace(seq, X=seq.X + np.float32(7.0), y=seq.y + np.float32(7.0))
    moved = scaler.transform(shifted)
    assert np.all(np.isfinite(moved.X)) and np.all(np.isfinite(moved.y))


def test_training_set_with_a_single_window_is_finite():
    df = make_frame([("E1", START, 7)])
    seq = build_sequences(df, "3min", "3min", interval_seconds=60)
    one = seq.subset(np.array([0]))  # one window: 3 readings
    scaler = SequenceScaler.fit_train(one)
    assert scaler.fit_info.n_observations == 3
    assert np.all(np.isfinite(scaler.transform(one).X))


# ---------------------------------------------------------------- round trips
def test_transform_inverse_round_trip_restores_the_data(data):
    _, _, split = data
    scaler = SequenceScaler.fit_from_split(split)
    for subset in (split.train, split.validation, split.test):
        back = scaler.inverse_transform(scaler.transform(subset))
        np.testing.assert_allclose(back.X, subset.X, rtol=1e-5, atol=1e-4)
        np.testing.assert_allclose(back.y, subset.y, rtol=1e-5, atol=1e-4)
        np.testing.assert_allclose(back.target_at_origin, subset.target_at_origin, rtol=1e-5, atol=1e-4)
        for name in CONTEXT_FEATURES:
            j = idx(subset, name)
            np.testing.assert_array_equal(back.X[:, :, j], subset.X[:, :, j])


def test_inverse_transform_y_for_predictions(data):
    _, _, split = data
    scaler = SequenceScaler.fit_from_split(split)
    scaled = scaler.transform(split.test)
    restored = scaler.inverse_transform_y(scaled.y)
    np.testing.assert_allclose(restored, split.test.y, rtol=1e-5, atol=1e-4)
    assert restored.shape == scaled.y.shape and restored.dtype == np.float32
    np.testing.assert_allclose(scaler.transform_y(split.test.y), scaled.y, rtol=1e-6, atol=1e-6)
    # scalars, lists and 2-D arrays keep their shape
    assert scaler.inverse_transform_y(0.0).shape == ()
    assert scaler.inverse_transform_y([0.0, 1.0]).shape == (2,)
    assert scaler.inverse_transform_y(np.zeros((4, 3))).shape == (4, 3)
    assert float(scaler.inverse_transform_y(0.0)) == pytest.approx(scaler.target_stats.mean, rel=1e-6)
    assert float(scaler.inverse_transform_y(1.0)) == pytest.approx(
        scaler.target_stats.mean + scaler.target_stats.scale, rel=1e-6
    )


def test_y_transform_helpers_reject_non_finite_values(data):
    _, _, split = data
    scaler = SequenceScaler.fit_from_split(split)
    for bad in (float("nan"), float("inf"), [1.0, float("-inf")]):
        with pytest.raises(ValueError, match="NaN or infinite"):
            scaler.inverse_transform_y(bad)
        with pytest.raises(ValueError, match="NaN or infinite"):
            scaler.transform_y(bad)


# ---------------------------------------------------------------- shapes, metadata, no mutation
def test_transform_preserves_shapes_dtypes_and_metadata(data):
    _, _, split = data
    scaler = SequenceScaler.fit_from_split(split)
    for subset in (split.train, split.validation, split.test):
        out = scaler.transform(subset)
        assert isinstance(out, SequenceSet) and out is not subset
        assert out.X.shape == subset.X.shape and out.X.dtype == np.float32
        assert out.y.shape == subset.y.shape and out.y.dtype == np.float32
        assert out.target_at_origin.shape == subset.target_at_origin.shape
        assert out.feature_names == subset.feature_names
        assert out.target_column == subset.target_column
        assert list(out.experiment_ids) == list(subset.experiment_ids)
        assert out.origin_times.equals(subset.origin_times) and out.target_times.equals(subset.target_times)
        assert (out.interval_seconds, out.history_steps, out.horizon_steps, out.stride_steps) == (
            subset.interval_seconds, subset.history_steps, subset.horizon_steps, subset.stride_steps)
        assert out.report is subset.report
        assert not np.shares_memory(out.X, subset.X)


def test_inputs_are_not_mutated(data):
    _, _, split = data
    for subset in (split.train, split.validation, split.test):
        snap = snapshot(subset)
        scaler = SequenceScaler.fit_train(split.train)
        scaled = scaler.transform(subset)
        scaler.inverse_transform(scaled)
        scaler.transform_y(subset.y)
        assert_unchanged(subset, snap)


def test_scaled_output_does_not_alias_context_columns_of_the_input(data):
    _, _, split = data
    scaler = SequenceScaler.fit_from_split(split)
    out = scaler.transform(split.test)
    original = split.test.X.copy()
    out.X[:] = 0
    np.testing.assert_array_equal(split.test.X, original)


# ---------------------------------------------------------------- save / load
def test_save_load_round_trip(data, tmp_path):
    _, _, split = data
    scaler = SequenceScaler.fit_from_split(split)
    path = scaler.save(tmp_path / "nested" / "scaler.json")
    assert path.exists()
    loaded = SequenceScaler.load(path)
    assert loaded == scaler  # exact, including float statistics
    np.testing.assert_array_equal(loaded.transform(split.test).X, scaler.transform(split.test).X)
    np.testing.assert_array_equal(loaded.transform(split.test).y, scaler.transform(split.test).y)


def test_saved_json_contains_the_required_metadata(data, tmp_path):
    _, _, split = data
    scaler = SequenceScaler.fit_from_split(split)
    doc = json.loads(scaler.save(tmp_path / "s.json").read_text())
    assert doc["schema"] == SCHEMA_NAME and doc["version"] == SCHEMA_VERSION
    assert doc["feature_names"] == list(split.train.feature_names)
    assert doc["target_column"] == "mq135_raw"
    assert doc["interval_seconds"] == split.train.interval_seconds
    assert doc["history_steps"] == split.train.history_steps
    assert doc["horizon_steps"] == split.train.horizon_steps
    assert set(doc["channels"]) == set(SENSORS)
    for entry in doc["channels"].values():
        assert set(entry) == {"mean", "std", "scale", "zero_variance"}
    assert doc["fit"]["experiments"] == ["E1", "E2", "E3", "E4"]
    assert doc["fit"]["n_observations"] == scaler.fit_info.n_observations


def test_synthetic_training_experiments_are_recorded_in_the_fit_info():
    synth = f"{SYNTHETIC_PREFIX}001"
    _, seq = build(daily([synth, "R1"]))
    scaler = SequenceScaler.fit_train(seq)
    assert scaler.fit_info.synthetic_experiments == (synth,)
    assert scaler.fit_info.experiments == tuple(sorted([synth, "R1"]))


def test_loaded_scaler_still_checks_compatibility(data, tmp_path):
    _, _, split = data
    loaded = SequenceScaler.load(SequenceScaler.fit_from_split(split).save(tmp_path / "s.json"))
    other = dataclasses.replace(split.test, target_column="temperature_c")
    with pytest.raises(ValueError, match="target_column"):
        loaded.transform(other)


def _doc(data, tmp_path):
    _, _, split = data
    return json.loads(SequenceScaler.fit_from_split(split).save(tmp_path / "ok.json").read_text())


@pytest.mark.parametrize(
    "mutate, message",
    [
        (lambda d: d.update(schema="something.else"), "not a sequence-scaler file"),
        (lambda d: d.update(version=SCHEMA_VERSION + 1), "unsupported scaler version"),
        (lambda d: d.update(version="1"), "unsupported scaler version"),
        (lambda d: d.pop("feature_names"), "missing keys"),
        (lambda d: d.pop("channels"), "missing keys"),
        (lambda d: d.update(feature_names=[]), "feature_names"),
        (lambda d: d.update(feature_names=["a", "a"]), "duplicates"),
        (lambda d: d.update(interval_seconds=0), "interval_seconds"),
        (lambda d: d.update(history_steps=2.5), "history_steps"),
        (lambda d: d.update(horizon_steps=True), "horizon_steps"),
        (lambda d: d.update(target_column="occupancy"), "unsupported target_column"),
        (lambda d: d["channels"].pop("mq135_raw"), "no statistics stored for target_column"),
        (lambda d: d["channels"]["mq135_raw"].update(scale=0.0), "scale > 0"),
        (lambda d: d["channels"]["mq135_raw"].update(scale=-1.0), "scale > 0"),
        (lambda d: d["channels"]["mq135_raw"].update(mean="x"), "non-numeric"),
        (lambda d: d["channels"]["mq135_raw"].pop("std"), "needs mean, std, scale"),
        (lambda d: d["channels"].update(occupancy={"mean": 0, "std": 1, "scale": 1, "zero_variance": False}),
         "not a scalable sensor channel"),
        (lambda d: d["channels"].update(pressure={"mean": 0, "std": 1, "scale": 1, "zero_variance": False}),
         "not in feature_names"),
        (lambda d: d.pop("fit"), "missing keys"),
        (lambda d: d["fit"].pop("n_observations"), "invalid fit information"),
    ],
)
def test_load_rejects_invalid_or_incompatible_files(data, tmp_path, mutate, message):
    doc = _doc(data, tmp_path)
    mutate(doc)
    path = tmp_path / "bad.json"
    path.write_text(json.dumps(doc))
    with pytest.raises(ValueError, match=message):
        SequenceScaler.load(path)


@pytest.mark.parametrize("token", ["NaN", "Infinity", "-Infinity"])
def test_load_rejects_non_finite_json_constants(data, tmp_path, token):
    doc = _doc(data, tmp_path)
    text = json.dumps(doc).replace(json.dumps(doc["channels"]["mq135_raw"]["scale"]), token, 1)
    path = tmp_path / "bad.json"
    path.write_text(text)
    with pytest.raises(ValueError, match="non-finite"):
        SequenceScaler.load(path)


def test_load_rejects_malformed_json_and_non_objects(tmp_path):
    bad = tmp_path / "bad.json"
    bad.write_text("{not json")
    with pytest.raises(ValueError, match="not valid JSON"):
        SequenceScaler.load(bad)
    bad.write_text("[1, 2, 3]")
    with pytest.raises(ValueError, match="JSON object"):
        SequenceScaler.load(bad)
    with pytest.raises(FileNotFoundError):
        SequenceScaler.load(tmp_path / "missing.json")


# ---------------------------------------------------------------- compatibility errors
def test_feature_name_mismatch_is_rejected(data):
    _, _, split = data
    scaler = SequenceScaler.fit_from_split(split)
    renamed = dataclasses.replace(split.test, feature_names=("a",) + tuple(split.test.feature_names[1:]))
    with pytest.raises(ValueError, match="feature_names"):
        scaler.transform(renamed)
    with pytest.raises(ValueError, match="feature_names"):
        scaler.inverse_transform(renamed)
    reordered = dataclasses.replace(split.test, feature_names=tuple(reversed(split.test.feature_names)))
    with pytest.raises(ValueError, match="feature_names"):
        scaler.transform(reordered)


def test_target_column_mismatch_is_rejected(data):
    _, _, split = data
    scaler = SequenceScaler.fit_from_split(split)
    other = dataclasses.replace(split.test, target_column="temperature_c")
    with pytest.raises(ValueError, match=r"target_column 'temperature_c' != fitted 'mq135_raw'"):
        scaler.transform(other)


def test_interval_history_and_horizon_mismatches_are_rejected(data):
    _, _, split = data
    scaler = SequenceScaler.fit_from_split(split)
    _, other_interval = build(daily(["E1", "E2"], rows=120), interval=10, history="3min", horizon="3min")
    with pytest.raises(ValueError, match="interval_seconds"):
        scaler.transform(other_interval)
    _, other_history = build(daily(["E1", "E2"]), history="5min", horizon="3min")
    with pytest.raises(ValueError, match="history_steps 5 != fitted 3"):
        scaler.transform(other_history)
    _, other_horizon = build(daily(["E1", "E2"]), history="3min", horizon="5min")
    with pytest.raises(ValueError, match="horizon_steps 5 != fitted 3"):
        scaler.transform(other_horizon)


def test_several_mismatches_are_reported_together(data):
    _, _, split = data
    scaler = SequenceScaler.fit_from_split(split)
    other = dataclasses.replace(split.test, target_column="humidity_percent", horizon_steps=9)
    with pytest.raises(ValueError) as err:
        scaler.transform(other)
    assert "target_column" in str(err.value) and "horizon_steps" in str(err.value)


def test_stride_difference_is_allowed(data):
    _, _, split = data
    scaler = SequenceScaler.fit_from_split(split)
    other = dataclasses.replace(split.test, stride_steps=5)
    scaler.transform(other)


# ---------------------------------------------------------------- empty / invalid training data
def test_empty_training_data_is_rejected():
    short = make_frame([("E1", START, 4), ("E2", START + DAY, 4)])
    empty = build_sequences(short, "3min", "3min", interval_seconds=60, allow_empty=True)
    assert len(empty) == 0
    with pytest.raises(ValueError, match="empty training set"):
        SequenceScaler.fit_train(empty)


def test_non_sequence_set_training_data_is_rejected(data):
    _, seq, _ = data
    for bad in (None, {"X": 1}, seq.X, [seq]):
        with pytest.raises(TypeError, match="SequenceSet"):
            SequenceScaler.fit_train(bad)


@pytest.mark.parametrize("bad_value", [np.nan, np.inf, -np.inf])
def test_non_finite_training_values_are_rejected(data, bad_value):
    _, seq, _ = data
    for field in ("X", "y", "target_at_origin"):
        arr = np.array(getattr(seq, field), copy=True)
        arr.flat[3] = bad_value
        with pytest.raises(ValueError, match=f"{field} contains NaN or infinite"):
            SequenceScaler.fit_train(dataclasses.replace(seq, **{field: arr}))


def test_misshapen_or_misaligned_training_data_is_rejected(data):
    _, seq, _ = data
    with pytest.raises(ValueError, match="not aligned"):
        SequenceScaler.fit_train(dataclasses.replace(seq, y=seq.y[:-1]))
    with pytest.raises(ValueError, match="not aligned"):
        SequenceScaler.fit_train(dataclasses.replace(seq, experiment_ids=seq.experiment_ids[:-1]))
    with pytest.raises(ValueError, match="shape"):
        SequenceScaler.fit_train(dataclasses.replace(seq, X=seq.X[:, :, 0]))
    with pytest.raises(ValueError, match="features"):
        SequenceScaler.fit_train(dataclasses.replace(seq, X=seq.X[:, :, :-1]))
    with pytest.raises(ValueError, match="time steps"):
        SequenceScaler.fit_train(dataclasses.replace(seq, X=seq.X[:, :-1, :]))


def test_timezone_naive_times_are_rejected(data):
    _, seq, _ = data
    naive = dataclasses.replace(seq, origin_times=seq.origin_times.tz_localize(None))
    with pytest.raises(ValueError, match="timezone-aware"):
        SequenceScaler.fit_train(naive)


def test_transform_rejects_non_finite_or_invalid_input(data):
    _, _, split = data
    scaler = SequenceScaler.fit_from_split(split)
    bad = np.array(split.test.X, copy=True)
    bad[0, 0, 0] = np.nan
    with pytest.raises(ValueError, match="NaN or infinite"):
        scaler.transform(dataclasses.replace(split.test, X=bad))
    with pytest.raises(TypeError, match="SequenceSet"):
        scaler.transform(split.test.X)


# ---------------------------------------------------------------- no NaN / inf introduced
def test_no_nan_or_inf_is_introduced(data):
    _, _, split = data
    scaler = SequenceScaler.fit_from_split(split)
    for subset in (split.train, split.validation, split.test):
        out = scaler.transform(subset)
        back = scaler.inverse_transform(out)
        for seq in (out, back):
            assert np.all(np.isfinite(seq.X))
            assert np.all(np.isfinite(seq.y))
            assert np.all(np.isfinite(seq.target_at_origin))


def test_channel_stats_are_plain_finite_floats(data):
    _, _, split = data
    scaler = SequenceScaler.fit_from_split(split)
    for c in scaler.channels:
        assert isinstance(c, ChannelStats)
        assert all(isinstance(v, float) and np.isfinite(v) for v in (c.mean, c.std, c.scale))
        assert c.scale > 0
    assert "mq135_raw" in scaler.describe()
    with pytest.raises(KeyError):
        scaler.stats("occupancy")