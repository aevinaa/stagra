import dataclasses

import pytest

np = pytest.importorskip("numpy")
pd = pytest.importorskip("pandas")

from ml import generate_data  # noqa: E402
from ml.features import build_features  # noqa: E402
from ml.preprocess import preprocess  # noqa: E402
from ml.sequences import DEFAULT_INPUT_COLUMNS, SequenceSet, build_sequences  # noqa: E402

START = pd.Timestamp("2026-01-05T08:00:00Z")


def make_clean(n=200, interval=60, experiment_id="EXP-A", start=START, mq0=100.0):
    """Cleaned-data frame (like ml.preprocess output) with ramp values.

    mq135_raw at row j is mq0 + j, so alignment of inputs and targets can be checked exactly.
    """
    j = np.arange(n)
    return pd.DataFrame(
        {
            "timestamp": pd.date_range(start, periods=n, freq=f"{interval}s"),
            "experiment_id": experiment_id,
            "location": "room",
            "temperature_c": 20.0 + 0.001 * j,
            "humidity_percent": 40.0 + 0.002 * j,
            "mq135_raw": mq0 + j,
            "occupancy": (j // 20) % 4,
            "ventilation": np.where((j // 30) % 2 == 0, "closed", "open"),
            "fan": np.where((j // 50) % 2 == 0, "off", "on"),
            "ac": np.where(j < n // 2, None, "on"),  # blank (= not recorded) in the first half
            "was_imputed": False,
        }
    )


def mq_index(seq):
    return seq.feature_names.index("mq135_raw")


def origin_rows(seq, interval, start=START):
    """Row number (counted from `start`) of each sequence's origin."""
    return np.array([int((t - start).total_seconds() // interval) for t in seq.origin_times])


def origin_set(seq):
    return set(zip(seq.experiment_ids, seq.origin_times))


def reference_origins(df, n, k, stride, interval):
    """Independent reference: origins for which EVERY timestamp from first input to target exists."""
    found = set()
    for exp, g in df.groupby("experiment_id"):
        times = list(g["timestamp"])
        have = set(times)
        for idx in range(n - 1, len(times), stride):
            t = times[idx]
            needed = [t + pd.Timedelta(seconds=m * interval) for m in range(-(n - 1), k + 1)]
            if all(x in have for x in needed):
                found.add((exp, t))
    return found


# ---------------------------------------------------------------- 1. shapes, 3. both sampling intervals
@pytest.mark.parametrize("interval,n,k", [(10, 60, 60), (60, 10, 10)])
def test_default_10min_history_and_horizon_shapes(interval, n, k):
    rows = n + k + 40
    s = build_sequences(make_clean(rows, interval))
    assert (s.interval_seconds, s.history_steps, s.horizon_steps, s.stride_steps) == (interval, n, k, 1)
    assert s.history_seconds == 600 and s.horizon_seconds == 600
    count = rows - n - k + 1
    assert len(s) == count
    assert s.X.shape == (count, n, 8) and s.n_features == 8
    assert s.y.shape == (count,) and s.target_at_origin.shape == (count,)
    assert s.experiment_ids.shape == (count,)
    assert len(s.origin_times) == len(s.target_times) == count
    assert s.X.dtype == np.float32 and s.y.dtype == np.float32 and s.target_at_origin.dtype == np.float32
    assert s.feature_names == DEFAULT_INPUT_COLUMNS
    assert s.target_column == "mq135_raw"
    assert s.report.kept == count and s.report.candidate_windows == count
    assert np.isfinite(s.X).all() and np.isfinite(s.y).all()


def test_interval_is_inferred_or_given():
    df = make_clean(200, 10)
    inferred = build_sequences(df)
    given = build_sequences(df, interval_seconds=10)
    assert inferred.interval_seconds == given.interval_seconds == 10
    assert np.array_equal(inferred.X, given.X) and np.array_equal(inferred.y, given.y)


def test_duration_that_does_not_divide_the_interval_is_rounded_and_reported():
    s = build_sequences(make_clean(300, 11))  # 600 s / 11 s = 54.5 -> 55 samples
    assert (s.history_steps, s.horizon_steps) == (55, 55)
    assert s.history_seconds == 605 and s.horizon_seconds == 605


# ---------------------------------------------------------------- 2. alignment of history and target
@pytest.mark.parametrize("interval", [10, 60])
def test_inputs_end_at_origin_and_target_is_one_horizon_later(interval):
    df = make_clean(400, interval)
    s = build_sequences(df)
    n, k, i = s.history_steps, s.horizon_steps, mq_index(s)
    for r in range(len(s)):
        row = int((s.origin_times[r] - START).total_seconds() // interval)
        assert np.array_equal(s.X[r, :, i], 100.0 + np.arange(row - n + 1, row + 1))  # oldest first
        assert s.y[r] == 100.0 + row + k
        assert s.target_at_origin[r] == 100.0 + row
    assert (s.target_times - s.origin_times == pd.Timedelta(minutes=10)).all()
    assert s.origin_times[0] - START == pd.Timedelta(seconds=(n - 1) * interval)
    assert str(s.origin_times.tz) == "UTC" and str(s.target_times.tz) == "UTC"
    assert s.target_times[-1] == df["timestamp"].iloc[-1]  # the last `horizon` never becomes an origin


def test_target_is_the_raw_value_without_transformation():
    s = build_sequences(make_clean(100, 60))
    assert np.array_equal(np.unique(s.y), 100.0 + np.arange(100)[19:])


def test_context_features_are_encoded_like_ml_features():
    df = make_clean(100, 60)
    s = build_sequences(df, history="2min", horizon="1min")
    names = s.feature_names
    last = s.X[:, -1, :]  # the origin step
    j = origin_rows(s, 60)
    assert np.array_equal(last[:, names.index("occupancy")], ((j // 20) % 4).astype(float))
    assert np.array_equal(last[:, names.index("ventilation_open")], ((j // 30) % 2 == 1).astype(float))
    assert np.array_equal(last[:, names.index("fan_on")], ((j // 50) % 2 == 1).astype(float))
    assert np.array_equal(last[:, names.index("ac_on")], (j >= 50).astype(float))
    assert np.array_equal(last[:, names.index("ac_recorded")], (j >= 50).astype(float))  # blank before


def test_context_encoding_matches_the_feature_pipeline():
    clean, _ = preprocess(generate_data.generate(n_experiments=3, hours=3.0, seed=1, fault_rate=0.02))
    from_clean = build_sequences(clean)
    from_features = build_sequences(build_features(clean))  # already encoded columns, no raw ones
    a = {(e, t): x for e, t, x in zip(from_clean.experiment_ids, from_clean.origin_times, from_clean.X)}
    b = {(e, t): x for e, t, x in zip(from_features.experiment_ids, from_features.origin_times, from_features.X)}
    assert len(b) > 0 and set(b) <= set(a)
    for key, x in b.items():
        assert np.array_equal(a[key], x)
    assert from_features.report.kept_with_imputed is None  # the features output has no was_imputed


# ---------------------------------------------------------------- 4. configurable history, horizon, stride, target, inputs
def test_custom_history_horizon_stride_and_target():
    df = make_clean(300, 10)
    s = build_sequences(df, history="5min", horizon="2min", stride="1min", target_column="temperature_c")
    assert (s.history_steps, s.horizon_steps, s.stride_steps) == (30, 12, 6)
    assert s.X.shape[1] == 30 and s.target_column == "temperature_c"
    rows = origin_rows(s, 10)
    assert rows[0] == 29 and np.all(np.diff(rows) == 6)  # first full history, then every 6th row
    assert len(s) == len(range(29, 300 - 12, 6))
    assert np.allclose(s.y, 20.0 + 0.001 * (rows + 12), atol=1e-4)
    assert np.allclose(s.target_at_origin, 20.0 + 0.001 * rows, atol=1e-4)


def test_other_numeric_targets_and_plain_numbers_mean_seconds():
    df = make_clean(300, 10)
    h = build_sequences(df, target_column="humidity_percent")
    assert np.allclose(h.y, 40.0 + 0.002 * (origin_rows(h, 10) + 60), atol=1e-3)
    assert build_sequences(df, history=300, horizon=120).history_steps == 30
    occ = build_sequences(df, target_column="occupancy")  # context columns are numeric too
    assert occ.y.shape == (len(occ),)


@pytest.mark.parametrize("stride,steps", [(None, 1), ("2min", 2), (120, 2), ("3min", 3)])
def test_stride_spaces_the_origins(stride, steps):
    s = build_sequences(make_clean(100, 60), history="3min", horizon="2min", stride=stride)
    rows = origin_rows(s, 60)
    assert s.stride_steps == steps and rows[0] == 2
    assert np.all(np.diff(rows) == steps)
    assert len(s) == len(range(2, 100 - 2, steps))


def test_input_columns_selection():
    df = make_clean(100, 60)
    s = build_sequences(df, input_columns=["mq135_raw", "fan_on"])
    assert s.feature_names == ("mq135_raw", "fan_on") and s.X.shape[2] == 2
    assert build_sequences(df, input_columns="humidity_percent").X.shape[2] == 1
    only_target_free = build_sequences(df, input_columns=["temperature_c"], target_column="mq135_raw")
    assert only_target_free.X.shape[2] == 1 and only_target_free.target_column == "mq135_raw"


def test_output_is_ordered_by_experiment_then_time():
    a, b = make_clean(40, 60, "A"), make_clean(40, 60, "B", mq0=900.0)
    s = build_sequences(pd.concat([b, a], ignore_index=True), history="3min", horizon="2min")
    ids = list(s.experiment_ids)
    assert ids == sorted(ids)
    for exp in ("A", "B"):
        assert s.origin_times[s.experiment_ids == exp].is_monotonic_increasing


# ---------------------------------------------------------------- 5. experiment boundaries
def test_sequences_never_mix_experiments_even_when_timestamps_touch():
    a = make_clean(60, 60, "A", START, mq0=100.0)
    b = make_clean(60, 60, "B", START + pd.Timedelta(minutes=60), mq0=5000.0)  # starts right after A ends
    s = build_sequences(pd.concat([a, b], ignore_index=True), history="3min", horizon="2min")
    per_experiment = 60 - 3 - 2 + 1
    assert len(s) == 2 * per_experiment  # one merged series would give 2 * 60 - 5 + 1
    i = mq_index(s)
    for exp, base in (("A", 100.0), ("B", 5000.0)):
        mine = s.experiment_ids == exp
        assert mine.sum() == per_experiment
        assert ((s.X[mine][:, :, i] >= base) & (s.X[mine][:, :, i] < base + 60)).all()
        assert ((s.y[mine] >= base) & (s.y[mine] < base + 60)).all()


def test_interleaved_rows_and_row_order_do_not_matter():
    a, b = make_clean(40, 60, "A"), make_clean(40, 60, "B", mq0=900.0)
    interleaved = pd.concat([a, b]).sort_values("timestamp", kind="stable").reset_index(drop=True)
    s1 = build_sequences(interleaved, history="3min", horizon="2min")
    s2 = build_sequences(pd.concat([b, a], ignore_index=True), history="3min", horizon="2min")
    assert np.array_equal(s1.X, s2.X) and np.array_equal(s1.y, s2.y)
    assert list(s1.experiment_ids) == list(s2.experiment_ids)


def test_each_experiment_contributes_its_own_count():
    df = pd.concat([make_clean(100, 60, "E1"), make_clean(60, 60, "E2")], ignore_index=True)
    s = build_sequences(df)  # 10 + 10 steps
    assert (s.experiment_ids == "E1").sum() == 100 - 20 + 1
    assert (s.experiment_ids == "E2").sum() == 60 - 20 + 1


# ---------------------------------------------------------------- 6. time gaps
def test_gap_blocks_exactly_the_windows_that_span_it():
    df = make_clean(100, 60).drop(index=[50]).reset_index(drop=True)  # row 50 missing
    s = build_sequences(df, history="3min", horizon="2min")  # 3 input steps, target 2 steps later
    got = set(origin_rows(s, 60))
    spanning = {r for r in range(2, 98) if 50 in range(r - 2, r + 3)}
    assert got == set(range(2, 98)) - spanning
    assert s.report.dropped_gap > 0 and np.isfinite(s.X).all()


def test_gap_between_origin_and_target_also_drops_the_window():
    df = make_clean(100, 60).drop(index=[50]).reset_index(drop=True)  # row 50 missing
    s = build_sequences(df, history="3min", horizon="5min")  # window of origin r covers rows r-2 .. r+5
    got = set(origin_rows(s, 60))
    assert 47 not in got  # inputs 45..47 are intact and the target (row 52) exists, but the gap lies between them
    assert 45 not in got  # its target would be row 50, which does not exist
    assert got.isdisjoint(range(45, 53))  # every window touching row 50, as input, gap or target
    assert {44, 53} <= got  # the windows just before and just after are untouched


@pytest.mark.parametrize("interval", [10, 60])
@pytest.mark.parametrize("stride", [None, "2min"])
def test_random_gaps_match_an_independent_reference(interval, stride):
    rng = np.random.default_rng(interval)
    n = k = 600 // interval
    drop = 0.04 if interval == 60 else 0.008  # a 120-sample window must have a fair chance to survive
    frames, lookup = [], {}
    for e in range(3):
        d = make_clean(n + k + 150, interval, f"E{e}", START + pd.Timedelta(hours=e), mq0=1000.0 * (e + 1))
        d = d[rng.random(len(d)) > drop].reset_index(drop=True)
        lookup.update({(r.experiment_id, r.timestamp): r.mq135_raw for r in d.itertuples()})
        frames.append(d)
    df = pd.concat(frames, ignore_index=True)
    s = build_sequences(df, stride=stride)
    step = 1 if stride is None else 120 // interval
    assert origin_set(s) == reference_origins(df, n, k, step, interval)
    i = mq_index(s)
    for r in range(len(s)):
        exp, t = s.experiment_ids[r], s.origin_times[r]
        want = [lookup[(exp, t - pd.Timedelta(seconds=m * interval))] for m in range(n - 1, -1, -1)]
        assert s.X[r, :, i].tolist() == want
        assert s.y[r] == lookup[(exp, t + pd.Timedelta(seconds=k * interval))]
    rep = s.report
    assert rep.candidate_windows == rep.kept + rep.dropped_gap + rep.dropped_missing + rep.dropped_imputed
    assert rep.dropped_gap > 0 and rep.kept > 0  # a real mix of valid and gap-spanning windows


def test_regular_gaps_leave_no_sequence():
    df = make_clean(100, 60).drop(index=range(5, 100, 10)).reset_index(drop=True)  # a gap every 10 rows
    s = build_sequences(df)  # needs 20 consecutive rows
    assert len(s) == 0 and s.report.dropped_gap == s.report.candidate_windows > 0


# ---------------------------------------------------------------- 7. missing values and insufficient data
def test_missing_input_value_drops_the_windows_containing_it():
    df = make_clean(200, 60)
    baseline = build_sequences(df)
    df.loc[100, "mq135_raw"] = np.nan
    s = build_sequences(df)
    assert s.report.dropped_missing == 10 + 1  # 10 windows contain row 100, 1 has it as target
    assert len(s) == len(baseline) - 11
    assert np.isfinite(s.X).all() and np.isfinite(s.y).all()


def test_missing_target_outside_the_inputs_and_non_input_columns():
    df = make_clean(200, 60)
    df.loc[100, "mq135_raw"] = np.nan
    df.loc[10, "location"] = None  # not an input: no effect
    s = build_sequences(df, input_columns=["temperature_c"])
    assert s.report.dropped_missing == 2  # origin 100 (value at origin) and origin 90 (target)
    assert np.isfinite(s.y).all() and np.isfinite(s.target_at_origin).all()


def test_infinite_values_count_as_missing():
    df = make_clean(100, 60)
    df.loc[50, "humidity_percent"] = np.inf
    assert build_sequences(df, history="3min", horizon="2min").report.dropped_missing == 3


def test_unknown_context_value_drops_windows_instead_of_guessing():
    df = make_clean(100, 60)
    df.loc[50, "ventilation"] = "ajar"
    s = build_sequences(df, history="3min", horizon="2min")
    assert s.report.dropped_missing == 3  # origins 50, 51, 52 contain row 50
    assert not ({50, 51, 52} & set(origin_rows(s, 60)))


def test_blank_ac_is_not_missing():
    df = make_clean(100, 60)
    df["ac"] = None
    s = build_sequences(df)
    assert s.report.dropped_missing == 0
    assert (s.X[:, :, s.feature_names.index("ac_recorded")] == 0).all()


def test_interpolated_values_are_counted_and_can_be_excluded():
    df = make_clean(200, 60)
    df.loc[100, "was_imputed"] = True
    keep = build_sequences(df)
    assert keep.report.kept_with_imputed == 11 and keep.report.dropped_imputed == 0
    strict = build_sequences(df, exclude_imputed=True)
    assert strict.report.dropped_imputed == 11 and len(strict) == len(keep) - 11
    assert strict.report.kept_with_imputed == 0
    without_column = df.drop(columns="was_imputed")
    assert build_sequences(without_column).report.kept_with_imputed is None
    with pytest.raises(ValueError, match="was_imputed"):
        build_sequences(without_column, exclude_imputed=True)


def test_exactly_enough_rows_gives_one_sequence_one_row_less_gives_none():
    assert len(build_sequences(make_clean(20, 60))) == 1  # history 10 + horizon 10 rows
    short = build_sequences(make_clean(19, 60))
    assert len(short) == 0 and short.report.too_short_experiments == ("EXP-A",)


def test_insufficient_data_returns_empty_arrays_with_the_right_shapes():
    s = build_sequences(make_clean(15, 60))
    assert len(s) == 0
    assert s.X.shape == (0, 10, 8) and s.y.shape == (0,) and s.target_at_origin.shape == (0,)
    assert s.experiment_ids.shape == (0,)
    assert len(s.origin_times) == len(s.target_times) == 0 and str(s.origin_times.tz) == "UTC"
    with pytest.raises(ValueError, match="No sequences"):
        build_sequences(make_clean(15, 60), allow_empty=False)


def test_short_experiment_is_skipped_and_the_others_are_kept():
    df = pd.concat([make_clean(100, 60, "LONG"), make_clean(15, 60, "SHORT")], ignore_index=True)
    s = build_sequences(df)
    assert set(s.experiment_ids) == {"LONG"}
    assert s.report.too_short_experiments == ("SHORT",)
    assert s.report.experiments == 2 and s.report.experiments_with_sequences == 1


# ---------------------------------------------------------------- 8. rejected input and invalid settings
def test_timezone_naive_timestamps_are_rejected_not_assumed_utc():
    naive = make_clean(100, 60)
    naive["timestamp"] = naive["timestamp"].dt.tz_localize(None)
    with pytest.raises(ValueError, match="timezone"):
        build_sequences(naive)
    as_text = make_clean(100, 60)
    as_text["timestamp"] = as_text["timestamp"].astype(str)
    with pytest.raises(ValueError, match="timezone"):
        build_sequences(as_text)


def test_timestamps_must_be_strictly_chronological_within_each_experiment():
    df = make_clean(100, 60)
    with pytest.raises(ValueError, match="strictly increasing"):
        build_sequences(df.sample(frac=1, random_state=0).reset_index(drop=True))
    duplicated = pd.concat([df, df.iloc[[5]]], ignore_index=True).sort_values("timestamp", kind="stable")
    with pytest.raises(ValueError, match="strictly increasing"):
        build_sequences(duplicated)
    missing_time = df.copy()
    missing_time.loc[3, "timestamp"] = pd.NaT
    with pytest.raises(ValueError, match="missing"):
        build_sequences(missing_time)


def test_other_timezones_are_converted_to_utc():
    df = make_clean(100, 60)
    local = df.copy()
    local["timestamp"] = local["timestamp"].dt.tz_convert("Asia/Kolkata")
    a, b = build_sequences(df), build_sequences(local)
    assert a.origin_times.equals(b.origin_times) and str(b.origin_times.tz) == "UTC"


def test_mixed_or_wrong_sampling_intervals_are_rejected():
    mixed = pd.concat([make_clean(100, 10, "A"), make_clean(100, 60, "B")], ignore_index=True)
    with pytest.raises(ValueError, match="not sampled"):
        build_sequences(mixed, history="1min", horizon="1min")
    with pytest.raises(ValueError, match="not sampled"):
        build_sequences(make_clean(100, 60), interval_seconds=10)


@pytest.mark.parametrize(
    "kwargs",
    [
        dict(history="0s"),
        dict(history="5"),  # no unit
        dict(history=-60),
        dict(history="soon"),
        dict(history=True),
        dict(history="1min"),  # one sample at 60 s; a sequence needs 2
        dict(horizon="0min"),
        dict(horizon="30s"),  # half a sample at 60 s
        dict(stride="0s"),
        dict(stride="soon"),
        dict(stride="30s"),
        dict(target_column="nope"),
        dict(target_column="location"),  # not numeric
        dict(target_column=""),
        dict(target_column=None),
        dict(input_columns=[]),
        dict(input_columns=["nope"]),
        dict(input_columns=["location"]),
        dict(input_columns=["mq135_raw", "mq135_raw"]),
        dict(input_columns=[1]),
        dict(interval_seconds=0),
        dict(interval_seconds=10.5),
        dict(interval_seconds=True),
        dict(interval_seconds="10"),
        dict(max_rounding_error=1.0),
        dict(max_rounding_error=-0.1),
    ],
)
def test_invalid_settings_raise(kwargs):
    with pytest.raises(ValueError):
        build_sequences(make_clean(100, 60), **kwargs)


def test_invalid_data_raises():
    with pytest.raises(TypeError):
        build_sequences([1, 2, 3])
    with pytest.raises(ValueError, match="no rows"):
        build_sequences(make_clean(10).iloc[0:0])
    with pytest.raises(ValueError, match="Missing required columns"):
        build_sequences(make_clean(100).drop(columns="experiment_id"))
    with pytest.raises(ValueError, match="experiment_id"):
        build_sequences(make_clean(100).assign(experiment_id=None))
    with pytest.raises(ValueError, match="'fan'"):
        build_sequences(make_clean(100).drop(columns="fan"))


# ---------------------------------------------------------------- 9. no future-data leakage
def test_inputs_contain_nothing_after_the_origin():
    df = make_clean(300, 60)
    cut = 200
    changed = df.copy()
    future = changed.index > cut
    changed.loc[future, ["temperature_c", "humidity_percent", "mq135_raw"]] += 1000.0
    changed.loc[future, "fan"] = np.where(df.loc[future, "fan"] == "on", "off", "on")
    changed.loc[future, "ventilation"] = np.where(df.loc[future, "ventilation"] == "open", "closed", "open")
    changed.loc[future, "occupancy"] = 9
    a, b = build_sequences(df), build_sequences(changed)
    assert a.origin_times.equals(b.origin_times)  # which sequences exist does not depend on values
    t_cut = df["timestamp"].iloc[cut]
    past = np.asarray(a.origin_times <= t_cut)
    assert past.sum() > 100
    assert np.array_equal(a.X[past], b.X[past])  # every origin up to the cut sees identical inputs
    assert np.array_equal(a.target_at_origin[past], b.target_at_origin[past])
    assert not np.array_equal(a.X[~past], b.X[~past])
    before_cut = np.asarray(a.target_times <= t_cut)
    assert np.array_equal(a.y[before_cut], b.y[before_cut])  # only targets after the cut changed


def test_changing_one_row_only_touches_the_sequences_that_use_it():
    df = make_clean(200, 60)
    row = 120
    changed = df.copy()
    changed.loc[row, "mq135_raw"] = 99999.0
    a, b = build_sequences(df), build_sequences(changed)
    rows = origin_rows(a, 60)
    assert set(rows[np.any(a.X != b.X, axis=(1, 2))]) == set(range(row, row + 10))  # row is an input
    assert set(rows[a.y != b.y]) == {row - 10}  # exactly one window has it as target
    assert set(rows[a.target_at_origin != b.target_at_origin]) == {row}


def test_no_input_step_is_later_than_the_origin_or_as_late_as_the_target():
    s = build_sequences(make_clean(200, 10))
    assert (s.target_times > s.origin_times).all()
    assert (s.X[:, -1, mq_index(s)] == s.target_at_origin).all()  # the newest input is the origin itself
    assert (s.X[:, :, mq_index(s)].max(axis=1) < s.y).all()  # ramp: no input is as late as the target


def test_interpolated_values_are_the_only_documented_way_to_see_the_future():
    # ml.preprocess interpolates towards the NEXT real reading, so exclude_imputed=True must
    # leave only sequences whose inputs and target are all real readings.
    raw = generate_data.generate(n_experiments=3, hours=4.0, interval_seconds=60, seed=7, fault_rate=0.03)
    clean, _ = preprocess(raw)
    loose = build_sequences(clean)
    strict = build_sequences(clean, exclude_imputed=True)
    assert origin_set(strict) <= origin_set(loose)
    assert strict.report.dropped_imputed == loose.report.kept_with_imputed > 0
    imputed = {(r.experiment_id, r.timestamp): r.was_imputed for r in clean.itertuples()}
    for exp, t in origin_set(strict):
        assert not any(imputed[(exp, t - pd.Timedelta(minutes=m))] for m in range(10))
        assert not imputed[(exp, t + pd.Timedelta(minutes=10))]


# ---------------------------------------------------------------- result object and pipeline
def test_input_frame_is_not_modified_and_outputs_are_independent_copies():
    df = make_clean(100, 60)
    before = df.copy(deep=True)
    s = build_sequences(df)
    pd.testing.assert_frame_equal(df, before)
    kept = s.X.copy()
    df.loc[:, "mq135_raw"] = -1.0
    assert np.array_equal(s.X, kept)
    again = build_sequences(before)
    assert np.array_equal(again.X, s.X) and np.array_equal(again.y, s.y)


def test_subset_keeps_all_arrays_aligned():
    s = build_sequences(make_clean(100, 60))
    later = np.asarray(s.origin_times >= s.origin_times[40])
    t = s.subset(later)
    assert len(t) == later.sum()
    assert t.X.shape[0] == len(t.y) == len(t.target_at_origin) == len(t.experiment_ids) == len(t.origin_times)
    assert np.array_equal(t.X, s.X[later]) and t.origin_times.equals(s.origin_times[later])
    assert t.target_times.equals(s.target_times[later])
    assert len(s.subset(np.array([2, 0]))) == 2 and len(s.subset([])) == 0
    with pytest.raises(ValueError):
        s.subset(np.ones(3, dtype=bool))
    with pytest.raises(ValueError):
        s.subset(np.array([0.5]))


def test_result_has_no_labels_or_categories():
    names = {f.name.lower() for f in dataclasses.fields(SequenceSet)}
    assert not any(word in name for name in names for word in ("level", "category", "label", "class", "aqi", "risk"))


def test_synthetic_data_is_flagged_in_the_report():
    synthetic = build_sequences(make_clean(100, 60, experiment_id="SYNTH-001"))
    assert synthetic.report.synthetic_experiments == 1 and "SYNTHETIC" in synthetic.describe()
    real = build_sequences(make_clean(100, 60, experiment_id="EXP-1"))
    assert real.report.synthetic_experiments == 0 and "SYNTHETIC" not in real.describe()
    assert "X shape" in real.describe()


@pytest.mark.parametrize("interval,hours", [(60, 4.0), (10, 2.0)])
def test_end_to_end_with_generator_and_preprocess(interval, hours):
    raw = generate_data.generate(n_experiments=3, hours=hours, interval_seconds=interval, seed=7, fault_rate=0.03)
    clean, report = preprocess(raw)
    assert report.interval_seconds == interval
    s = build_sequences(clean)
    steps = 600 // interval
    assert s.X.shape[1] == steps and len(s) > 0
    assert np.isfinite(s.X).all() and np.isfinite(s.y).all()
    assert set(s.experiment_ids) <= set(clean["experiment_id"])
    assert origin_set(s) == reference_origins(clean, steps, steps, 1, interval)
    assert s.report.synthetic_experiments == 3