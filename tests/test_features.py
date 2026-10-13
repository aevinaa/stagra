import pytest

np = pytest.importorskip("numpy")
pd = pytest.importorskip("pandas")

from ml import generate_data  # noqa: E402
from ml.features import (  # noqa: E402
    build_features,
    feature_columns,
    format_duration,
    main,
    parse_duration,
    plan_features,
)
from ml.preprocess import SENSOR_COLUMNS, load_clean_csv, preprocess  # noqa: E402

# At the 60 s test grid: lags 1 and 3 samples, windows 3 and 5 samples, diff 1 sample.
SMALL = dict(lags=("1min", "3min"), windows=("3min", "5min"), diffs=("1min",))


def make_clean(n=40, experiment_id="SYNTH-001", start="2026-01-05T08:00:00Z", ac="off", interval=60):
    ts = pd.date_range(start, periods=n, freq=f"{interval}s")
    i = np.arange(n)
    return pd.DataFrame(
        {
            "timestamp": ts,
            "experiment_id": experiment_id,
            "location": "synthetic_room_a",
            "temperature_c": 20.0 + 0.1 * i,
            "humidity_percent": 50.0 + 0.5 * i,
            "mq135_raw": 400.0 + 5.0 * i,
            "occupancy": 2,
            "ventilation": "closed",
            "fan": "off",
            "ac": ac,
        }
    )


# ---------------------------------------------------------------- durations
@pytest.mark.parametrize(
    "value,seconds",
    [
        ("30s", 30),
        ("30 s", 30),
        ("5min", 300),
        ("5 Minutes", 300),
        ("2m", 120),
        ("1h", 3600),
        ("1.5min", 90),
        ("2hours", 7200),
        (45, 45),
        (45.0, 45),
        (np.int64(45), 45),
    ],
)
def test_parse_duration(value, seconds):
    assert parse_duration(value) == seconds


@pytest.mark.parametrize(
    "bad",
    ["5", "abc", "min", "", "0s", "-1min", "0.5s", "5parsecs", 0, -3, 1.5, True, None, float("nan"), float("inf")],
)
def test_parse_duration_rejects_bad_values(bad):
    with pytest.raises(ValueError):
        parse_duration(bad)


@pytest.mark.parametrize(
    "seconds,label", [(30, "30s"), (60, "1min"), (90, "90s"), (300, "5min"), (3600, "1h"), (7200, "2h")]
)
def test_format_duration(seconds, label):
    assert format_duration(seconds) == label


# ---------------------------------------------------------------- duration -> samples
def test_default_plan_at_10s_interval():
    plan = plan_features(10)
    assert [(s.label, s.samples) for s in plan.lags] == [("1min", 6), ("5min", 30), ("15min", 90)]
    assert [(s.label, s.samples) for s in plan.diffs] == [("1min", 6), ("5min", 30)]
    assert [(s.label, s.samples) for s in plan.windows] == [("5min", 30), ("15min", 90), ("30min", 180)]
    assert all(s.effective_seconds == s.seconds for s in plan.lags + plan.diffs + plan.windows)
    assert plan.history_seconds == 179 * 10  # the 180-sample window spans 179 steps


def test_default_plan_at_60s_matches_the_old_sample_counts():
    plan = plan_features(60)
    assert [s.samples for s in plan.lags] == [1, 5, 15]
    assert [s.samples for s in plan.diffs] == [1, 5]
    assert [s.samples for s in plan.windows] == [5, 15, 30]


def test_interval_that_does_not_divide_the_duration_is_rounded_and_reported():
    plan = plan_features(11)  # e.g. a loop that really runs every ~10.8 s
    one_min = plan.lags[0]
    assert (one_min.label, one_min.samples, one_min.effective_seconds) == ("1min", 5, 55)
    assert "really 55s" in plan.describe()


@pytest.mark.parametrize(
    "interval,kwargs,message",
    [
        (60, dict(lags=("30s",)), "cannot be represented"),  # half a sample
        (10, dict(windows=("10s",)), "shorter than"),  # a window needs 2 samples
        (60, dict(lags=("50s", "1min")), "both resolve"),  # both are 1 sample
        (60, dict(lags=("60s", "1min")), "more than once"),
        (60, dict(diffs=()), "at least one"),
    ],
)
def test_unusable_duration_settings_raise(interval, kwargs, message):
    with pytest.raises(ValueError, match=message):
        plan_features(interval, **kwargs)


def test_max_rounding_error_is_configurable():
    plan_features(11)  # 8 % off passes with the default 25 % limit
    with pytest.raises(ValueError, match="cannot be represented"):
        plan_features(11, max_rounding_error=0.05)


@pytest.mark.parametrize("interval", [0, -10, 10.5, True, "10"])
def test_invalid_interval_raises(interval):
    with pytest.raises(ValueError):
        plan_features(interval)


# ---------------------------------------------------------------- feature values
def test_lag_diff_and_rolling_values_are_correct():
    df = make_clean(20)
    f = build_features(df, drop_incomplete=False, **SMALL)
    temp = df["temperature_c"].to_numpy()
    assert f["temperature_c_lag_3min"].iloc[10] == pytest.approx(temp[7])
    assert f["temperature_c_lag_1min"].iloc[10] == pytest.approx(temp[9])
    assert f["temperature_c_diff_1min"].iloc[10] == pytest.approx(0.1)
    assert f["mq135_raw_diff_1min"].iloc[10] == pytest.approx(5.0)
    assert f["temperature_c_roll_mean_5min"].iloc[10] == pytest.approx(temp[6:11].mean())
    assert f["temperature_c_roll_std_5min"].iloc[10] == pytest.approx(temp[6:11].std(ddof=1))
    assert f["humidity_percent_roll_mean_3min"].iloc[10] == pytest.approx(df["humidity_percent"].iloc[8:11].mean())


@pytest.mark.parametrize("interval", [10, 60])
def test_same_config_covers_the_same_real_time_at_any_interval(interval):
    n = 3600 // interval  # one hour of data
    df = make_clean(n, interval=interval)
    df["temperature_c"] = 20.0 + 0.001 * np.arange(n) * interval  # exactly 0.001 C per second
    f = build_features(df, lags=("5min",), diffs=("1min", "5min"), windows=("5min",))
    assert f.attrs["interval_seconds"] == interval
    assert f["temperature_c_diff_1min"].tolist() == pytest.approx([0.06] * len(f))
    assert f["temperature_c_diff_5min"].tolist() == pytest.approx([0.3] * len(f))
    assert (f["temperature_c"] - f["temperature_c_lag_5min"]).tolist() == pytest.approx([0.3] * len(f))
    assert f["timestamp"].iloc[0] - df["timestamp"].iloc[0] == pd.Timedelta(minutes=5)


def test_early_rows_lack_history_and_are_missing():
    f = build_features(make_clean(20), drop_incomplete=False, **SMALL)
    assert f["temperature_c_lag_3min"].iloc[:3].isna().all()
    assert f["temperature_c_lag_3min"].iloc[3:].notna().all()
    assert f["temperature_c_roll_mean_5min"].iloc[:4].isna().all()
    assert f["temperature_c_roll_mean_5min"].iloc[4:].notna().all()


def test_features_do_not_use_future_values():
    df = make_clean(40)
    changed = df.copy()
    changed.loc[30:, SENSOR_COLUMNS] += 1000.0  # alter the future only
    cols = feature_columns(**SMALL)
    a = build_features(df, drop_incomplete=False, **SMALL)[cols]
    b = build_features(changed, drop_incomplete=False, **SMALL)[cols]
    assert a.iloc[:30].equals(b.iloc[:30])
    assert not a.iloc[30:].equals(b.iloc[30:])


def test_features_never_cross_experiments():
    df = pd.concat(
        [make_clean(20, "EXP-A"), make_clean(20, "EXP-B", start="2026-01-05T08:20:00Z")], ignore_index=True
    )
    f = build_features(df, drop_incomplete=False, **SMALL)
    first_rows = f.groupby("experiment_id").head(1)
    assert first_rows["temperature_c_lag_1min"].isna().all()  # B does not see the end of A
    kept = build_features(df, **SMALL)
    assert kept.groupby("experiment_id").size().tolist() == [16, 16]


def test_features_are_missing_where_history_spans_a_gap():
    df = make_clean(40).drop(index=range(15, 20)).reset_index(drop=True)  # 5 samples missing
    f = build_features(df, drop_incomplete=False, **SMALL)
    # position 15 is the first row after the gap
    assert np.isnan(f["temperature_c_lag_1min"].iloc[15])
    assert not np.isnan(f["temperature_c_lag_1min"].iloc[16])
    assert np.isnan(f["temperature_c_lag_3min"].iloc[17])
    assert not np.isnan(f["temperature_c_lag_3min"].iloc[18])
    assert np.isnan(f["temperature_c_diff_1min"].iloc[15])
    assert np.isnan(f["temperature_c_roll_mean_3min"].iloc[16])
    assert not np.isnan(f["temperature_c_roll_mean_3min"].iloc[17])
    assert np.isnan(f["temperature_c_roll_std_5min"].iloc[18])
    assert not np.isnan(f["temperature_c_roll_std_5min"].iloc[19])


def test_gap_blocks_lags_and_windows_at_10s_sampling():
    df = make_clean(100, interval=10).drop(index=range(40, 46)).reset_index(drop=True)  # 1 min gap
    f = build_features(df, drop_incomplete=False, lags=("1min",), diffs=("1min",), windows=("1min",))
    lag = f["temperature_c_lag_1min"]  # 6 samples back
    assert lag.iloc[:6].isna().all()
    assert lag.iloc[6:40].notna().all()
    assert lag.iloc[40:46].isna().all()  # these rows look back across the gap
    assert lag.iloc[46:].notna().all()
    roll = f["temperature_c_roll_mean_1min"]  # 6 samples = 5 steps
    assert roll.iloc[:5].isna().all()
    assert roll.iloc[5:40].notna().all()
    assert roll.iloc[40:45].isna().all()
    assert roll.iloc[45:].notna().all()


# ---------------------------------------------------------------- configuration handling
def test_context_encoding():
    df = make_clean(10, ac="on")
    df["ventilation"] = ["open"] * 5 + ["closed"] * 5
    df["fan"] = ["on"] * 3 + ["off"] * 7
    f = build_features(df, drop_incomplete=False, **SMALL)
    assert f["ventilation_open"].tolist() == [1] * 5 + [0] * 5
    assert f["fan_on"].tolist() == [1] * 3 + [0] * 7
    assert f["ac_on"].eq(1).all() and f["ac_recorded"].eq(1).all()
    assert f["occupancy"].eq(2).all()


def test_ac_not_recorded_is_distinguishable_from_ac_off():
    none = build_features(make_clean(10, ac=None), drop_incomplete=False, **SMALL)
    off = build_features(make_clean(10, ac="off"), drop_incomplete=False, **SMALL)
    assert none["ac_on"].eq(0).all() and none["ac_recorded"].eq(0).all()
    assert off["ac_on"].eq(0).all() and off["ac_recorded"].eq(1).all()


def test_default_output_is_complete_and_has_expected_columns():
    df = pd.concat([make_clean(40, "EXP-A"), make_clean(40, "EXP-B")], ignore_index=True)
    f = build_features(df)
    cols = feature_columns()
    assert len(cols) == 41 and len(set(cols)) == 41
    assert "mq135_raw_lag_5min" in cols and "mq135_raw_roll_std_30min" in cols
    assert set(cols) <= set(f.columns)
    assert not f[cols].isna().any().any()
    assert len(f) == 22  # 40 - 29 warm-up rows (30-sample window at 60 s) per experiment
    assert f.groupby("experiment_id")["timestamp"].min().nunique() == 1


def test_feature_names_do_not_depend_on_the_sampling_interval():
    a = build_features(make_clean(400, interval=10), lags=("1min",), diffs=("1min",), windows=("2min",))
    b = build_features(make_clean(40, interval=60), lags=("1min",), diffs=("1min",), windows=("2min",))
    assert list(a.columns) == list(b.columns)


def test_input_order_does_not_matter():
    df = make_clean(30)
    a = build_features(df, **SMALL)
    b = build_features(df.sample(frac=1, random_state=1), **SMALL)
    pd.testing.assert_frame_equal(a, b)


def test_single_duration_and_plain_seconds_are_accepted():
    df = make_clean(40)
    as_lists = build_features(df, lags=("5min",), diffs=("1min",), windows=("5min",))
    assert as_lists.equals(build_features(df, lags="5min", diffs="1min", windows="5min"))
    assert as_lists.equals(build_features(df, lags=300, diffs=60, windows=300))


def test_interval_is_inferred_from_the_data_or_given():
    df = make_clean(60, interval=10)
    cfg = dict(lags=("1min",), diffs=("1min",), windows=("1min",))
    inferred = build_features(df, **cfg)
    given = build_features(df, interval_seconds=10, **cfg)
    assert inferred.attrs["interval_seconds"] == given.attrs["interval_seconds"] == 10
    assert inferred.equals(given)
    with pytest.raises(ValueError, match="not sampled"):
        build_features(df, interval_seconds=60, lags=("1min",), diffs=("1min",), windows=("2min",))


def test_experiments_with_different_intervals_are_rejected():
    df = pd.concat(
        [make_clean(60, "EXP-A", interval=10), make_clean(60, "EXP-B", interval=60)], ignore_index=True
    )
    with pytest.raises(ValueError, match="not sampled"):
        build_features(df, interval_seconds=10, lags=("1min",), diffs=("1min",), windows=("2min",))


def test_duplicate_timestamps_are_rejected():
    df = make_clean(40)
    df = pd.concat([df, df.iloc[[5]]], ignore_index=True)
    with pytest.raises(ValueError, match="Duplicate"):
        build_features(df)


def test_no_future_target_column_is_created():
    f = build_features(make_clean(40))
    assert not any("target" in c or "label" in c for c in f.columns)


@pytest.mark.parametrize(
    "kwargs",
    [
        dict(lags=()),
        dict(lags=("0s",)),
        dict(lags=(0,)),
        dict(lags=("5",)),
        dict(lags="soon"),
        dict(diffs=(-1,)),
        dict(windows=("1min",)),  # 1 sample at 60 s; a window needs 2
        dict(windows=(2.5,)),
        dict(lags=("30s",)),  # half a sample at 60 s
    ],
)
def test_invalid_parameters_raise(kwargs):
    with pytest.raises(ValueError):
        build_features(make_clean(40), **kwargs)


def test_timezone_less_timestamps_are_rejected():
    df = make_clean(40)
    df["timestamp"] = df["timestamp"].dt.tz_localize(None)
    with pytest.raises(ValueError, match="timezone"):
        build_features(df)


def test_missing_column_raises():
    with pytest.raises(ValueError, match="Missing required columns"):
        build_features(make_clean(40).drop(columns=["fan"]))


def test_too_short_experiments_raise_a_helpful_error():
    with pytest.raises(ValueError, match="complete feature history"):
        build_features(make_clean(10))


# ---------------------------------------------------------------- pipeline
def test_end_to_end_synthetic_pipeline():
    raw = generate_data.generate(n_experiments=3, hours=3.0, seed=1, fault_rate=0.02)
    clean, report = preprocess(raw)
    assert report.synthetic_experiments == 3
    f = build_features(clean)
    cols = feature_columns()
    assert not f[cols].isna().any().any()
    assert str(f["timestamp"].dt.tz) == "UTC"
    assert f["experiment_id"].str.startswith("SYNTH-").all()
    assert f.groupby("experiment_id")["timestamp"].apply(lambda s: s.is_monotonic_increasing).all()
    assert f["mq135_raw"].between(0, 4095).all()  # still the raw value


def test_end_to_end_with_10_second_sampling():
    raw = generate_data.generate(n_experiments=2, hours=2.0, interval_seconds=10, seed=4, fault_rate=0.01)
    clean, report = preprocess(raw)
    assert report.interval_seconds == 10
    f = build_features(clean)
    plan = f.attrs["feature_plan"]
    assert plan.interval_seconds == 10
    assert [s.samples for s in plan.windows] == [30, 90, 180]
    cols = feature_columns()
    assert not f[cols].isna().any().any()
    # nothing is emitted before the longest window (180 samples = 29 min 50 s of history) is full
    first_clean = clean.groupby("experiment_id")["timestamp"].min()
    first_feature = f.groupby("experiment_id")["timestamp"].min()
    assert ((first_feature - first_clean.reindex(first_feature.index)) >= pd.Timedelta(seconds=1790)).all()


def test_cli_roundtrip(tmp_path):
    raw = generate_data.generate(n_experiments=2, hours=2.0, seed=2, fault_rate=0)
    clean, _ = preprocess(raw)
    src = tmp_path / "clean_SYNTHETIC_x.csv"
    out = tmp_path / "features.csv"
    clean.to_csv(src, index=False, date_format="%Y-%m-%dT%H:%M:%SZ")
    assert main(["--input", str(src), "--output", str(out)]) == 0
    back = pd.read_csv(out)
    assert set(feature_columns()) <= set(back.columns)
    assert not back[feature_columns()].isna().any().any()
    assert load_clean_csv(src)["experiment_id"].nunique() == 2
    assert main(["--input", str(tmp_path / "nope.csv")]) == 1


def test_cli_accepts_durations_and_reports_bad_ones(tmp_path, capsys):
    raw = generate_data.generate(n_experiments=2, hours=2.0, seed=2, fault_rate=0)
    clean, _ = preprocess(raw)
    src = tmp_path / "clean_SYNTHETIC_x.csv"
    out = tmp_path / "features.csv"
    clean.to_csv(src, index=False, date_format="%Y-%m-%dT%H:%M:%SZ")

    argv = ["--input", str(src), "--output", str(out)]
    rc = main(argv + ["--lags", "2min", "--diffs", "1min", "--windows", "3min", "10min"])
    assert rc == 0
    assert "sampling interval: 60 s" in capsys.readouterr().out
    back = pd.read_csv(out)
    cols = feature_columns(["2min"], ["3min", "10min"], ["1min"])
    assert set(cols) <= set(back.columns)
    assert "temperature_c_lag_1min" not in back.columns
    assert not back[cols].isna().any().any()

    assert main(argv + ["--lags", "5"]) == 1  # a bare number has no unit
    assert "error:" in capsys.readouterr().err
    assert main(argv + ["--lags", "30s"]) == 1  # half a sample at 60 s
    assert "cannot be represented" in capsys.readouterr().err