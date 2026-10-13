import dataclasses
import math
from collections import Counter

import pytest

np = pytest.importorskip("numpy")
pd = pytest.importorskip("pandas")

from ml.preprocess import SYNTHETIC_PREFIX  # noqa: E402
from ml.sequences import SequenceReport, SequenceSet, build_sequences  # noqa: E402
from ml.splits import (  # noqa: E402
    MIN_REAL_EXPERIMENTS,
    SPLIT_NAMES,
    SplitReport,
    SplitResult,
    split_by_experiment,
)

START = pd.Timestamp("2026-01-05T08:00:00Z")
DAY = pd.Timedelta(days=1)


# ---------------------------------------------------------------- fixtures
def make_frame(specs, interval=60):
    """Cleaned-data frame (like ml.preprocess output). specs: (experiment_id, start, rows).

    mq135_raw of experiment number p (position in specs) at row j is 1000 * p + j.
    """
    parts = []
    for pos, (exp_id, start, rows) in enumerate(specs):
        j = np.arange(rows)
        parts.append(
            pd.DataFrame(
                {
                    "timestamp": pd.date_range(start, periods=rows, freq=f"{interval}s"),
                    "experiment_id": exp_id,
                    "location": "room",
                    "temperature_c": 20.0 + 0.001 * j,
                    "humidity_percent": 40.0 + 0.002 * j,
                    "mq135_raw": 1000.0 * pos + j,
                    "occupancy": (j // 20) % 4,
                    "ventilation": np.where((j // 30) % 2 == 0, "closed", "open"),
                    "fan": np.where((j // 50) % 2 == 0, "off", "on"),
                    "ac": "on",
                    "was_imputed": False,
                }
            )
        )
    return pd.concat(parts, ignore_index=True)


def build(specs, interval=60, history="3min", horizon="3min"):
    df = make_frame(specs, interval)
    return df, build_sequences(df, history, horizon, interval_seconds=interval)


def daily_specs(ids, rows=20, first_start=START):
    """One experiment per day, in the order given (so list order == chronological order)."""
    return [(e, first_start + i * DAY, rows) for i, e in enumerate(ids)]


def experiments_of(seq):
    return set(map(str, seq.experiment_ids))


def sample_times(seq):
    """Every (experiment, timestamp) used as an input or a target by the sequences."""
    step = pd.Timedelta(seconds=seq.interval_seconds)
    out = set()
    for exp, origin, target in zip(seq.experiment_ids, seq.origin_times, seq.target_times):
        for m in range(seq.history_steps):
            out.add((exp, origin - m * step))
        out.add((exp, target))
    return out


def window_keys(seq):
    return set(zip(map(str, seq.experiment_ids), seq.origin_times))


def first_inputs(seq):
    return seq.origin_times - pd.Timedelta(seconds=(seq.history_steps - 1) * seq.interval_seconds)


# Contiguous A -> B -> C layout where the gap between one experiment's last sample and the next
# experiment's first sample is exactly 60 s, so purge counts can be worked out by hand.
GAP = 60


def three_experiments(interval, rows):
    span = (rows - 1) * pd.Timedelta(seconds=interval)
    gap = pd.Timedelta(seconds=GAP)
    a = START
    b = a + span + gap
    c = b + span + gap
    return [("A", a, rows), ("B", b, rows), ("C", c, rows)]


@pytest.fixture(scope="module")
def six():
    ids = ["E-c", "E-a", "E-f", "E-b", "E-e", "E-d"]  # chronological order != alphabetical order
    df, seq = build(daily_specs(ids))
    return ids, df, seq


# ---------------------------------------------------------------- disjointness and ordering
def test_experiments_are_disjoint_and_cover_everything(six):
    ids, _, seq = six
    train, val, test, report = split_by_experiment(seq)
    sets = [experiments_of(train), experiments_of(val), experiments_of(test)]
    assert sets[0].isdisjoint(sets[1]) and sets[0].isdisjoint(sets[2]) and sets[1].isdisjoint(sets[2])
    assert sets[0] | sets[1] | sets[2] == set(ids)
    assert len(train) + len(val) + len(test) == len(seq) == report.total_windows


def test_ordered_by_earliest_timestamp_not_by_id(six):
    ids, _, seq = six
    train, val, test, report = split_by_experiment(seq)
    # 6 real experiments with 0.6 / 0.2 / 0.2 -> 4 / 1 / 1, earliest first
    assert experiments_of(train) == set(ids[:4])
    assert experiments_of(val) == {ids[4]}
    assert experiments_of(test) == {ids[5]}
    assert report.train.experiment_ids == tuple(ids[:4])
    assert report.validation.experiment_ids == (ids[4],)
    assert report.test.experiment_ids == (ids[5],)


def test_splits_are_strictly_chronological(six):
    _, _, seq = six
    train, val, test, _ = split_by_experiment(seq)
    assert train.target_times.max() < first_inputs(val).min()
    assert val.target_times.max() < first_inputs(test).min()


def test_report_start_and_end_match_the_data(six):
    _, _, seq = six
    train, val, test, report = split_by_experiment(seq)
    for subset, info in ((train, report.train), (val, report.validation), (test, report.test)):
        assert info.start == first_inputs(subset).min()
        assert info.end == subset.target_times.max()


def test_input_order_does_not_change_the_assignment(six):
    _, _, seq = six
    shuffled = seq.subset(np.random.default_rng(0).permutation(len(seq)))
    a = split_by_experiment(seq)
    b = split_by_experiment(shuffled)
    for x, y in zip(a[:3], b[:3]):
        assert window_keys(x) == window_keys(y)
    assert a.report == b.report


# ---------------------------------------------------------------- proportions and determinism
@pytest.mark.parametrize(
    "n_exp, fractions, expected",
    [
        (10, (0.6, 0.2, 0.2), (6, 2, 2)),
        (10, (0.7, 0.15, 0.15), (6, 2, 2)),  # 1.5 rounds half up to 2
        (4, (0.6, 0.2, 0.2), (2, 1, 1)),
        (3, (0.6, 0.2, 0.2), (1, 1, 1)),
        (20, (0.5, 0.25, 0.25), (10, 5, 5)),
        (5, (0.2, 0.4, 0.4), (1, 2, 2)),
        (8, (0.5, 0.3, 0.2), (4, 2, 2)),
    ],
)
def test_configurable_proportions(n_exp, fractions, expected):
    ids = [f"E{i:02d}" for i in range(n_exp)]
    _, seq = build(daily_specs(ids))
    tf, vf, ef = fractions
    train, val, test, report = split_by_experiment(seq, train_fraction=tf, val_fraction=vf, test_fraction=ef)
    counts = tuple(len(r.experiment_ids) for r in report.splits)
    assert counts == expected
    assert (len(experiments_of(train)), len(experiments_of(val)), len(experiments_of(test))) == expected
    assert report.train.experiment_ids == tuple(ids[: expected[0]])
    assert report.test.experiment_ids == tuple(ids[-expected[2] :])
    assert report.fractions == fractions


def test_deterministic_output(six):
    _, _, seq = six
    a = split_by_experiment(seq, purge_seconds=300)
    b = split_by_experiment(seq, purge_seconds=300)
    assert a.report == b.report
    for x, y in zip(a[:3], b[:3]):
        np.testing.assert_array_equal(x.X, y.X)
        np.testing.assert_array_equal(x.y, y.y)
        assert list(x.experiment_ids) == list(y.experiment_ids)
        assert x.origin_times.equals(y.origin_times)


def test_result_is_a_named_tuple_and_report_is_frozen(six):
    _, _, seq = six
    result = split_by_experiment(seq)
    train, val, test, report = result
    assert isinstance(result, SplitResult) and isinstance(report, SplitReport)
    assert result.train is train and result.validation is val and result.test is test
    assert tuple(SPLIT_NAMES) == ("train", "validation", "test")
    with pytest.raises(dataclasses.FrozenInstanceError):
        report.total_windows = 0


def test_input_is_not_modified(six):
    _, _, seq = six
    X, y, ids, origin = seq.X.copy(), seq.y.copy(), list(seq.experiment_ids), seq.origin_times.copy()
    split_by_experiment(seq, purge_seconds=120)
    np.testing.assert_array_equal(seq.X, X)
    np.testing.assert_array_equal(seq.y, y)
    assert list(seq.experiment_ids) == ids
    assert seq.origin_times.equals(origin)


def test_works_with_a_stale_or_default_sequence_report(six):
    _, _, seq = six
    stale = dataclasses.replace(seq, report=SequenceReport())
    result = split_by_experiment(stale)
    assert result.report.total_windows == len(seq)
    assert result.report.windows_retained == len(seq)


# ---------------------------------------------------------------- alignment of the subsets
def test_arrays_stay_aligned_in_every_subset(six):
    ids, _, seq = six
    spec_pos = {e: i for i, e in enumerate(ids)}  # make_frame numbers experiments by spec order
    mq = seq.feature_names.index("mq135_raw")
    for subset in split_by_experiment(seq)[:3]:
        n = len(subset)
        assert subset.X.shape == (n, seq.history_steps, seq.n_features)
        assert len(subset.y) == len(subset.target_at_origin) == len(subset.experiment_ids) == n
        assert len(subset.origin_times) == len(subset.target_times) == n
        np.testing.assert_array_equal(subset.X[:, -1, mq], subset.target_at_origin)
        np.testing.assert_array_equal(subset.y - subset.target_at_origin, seq.horizon_steps)
        gaps = (subset.target_times - subset.origin_times).total_seconds()
        np.testing.assert_array_equal(gaps, seq.horizon_seconds)
        # the ramp encodes the experiment (1000 * position) so a mixed-up row would be caught
        owner = np.array([spec_pos[e] for e in subset.experiment_ids])
        np.testing.assert_array_equal(np.floor(subset.y / 1000).astype(int), owner)
        assert subset.feature_names == seq.feature_names
        assert subset.interval_seconds == seq.interval_seconds
        assert subset.history_steps == seq.history_steps


def test_every_window_lands_in_exactly_one_split_without_purge(six):
    _, _, seq = six
    train, val, test, _ = split_by_experiment(seq)
    keys = [window_keys(s) for s in (train, val, test)]
    assert sum(len(k) for k in keys) == len(window_keys(seq))
    assert keys[0] | keys[1] | keys[2] == window_keys(seq)


# ---------------------------------------------------------------- purge buffer
@pytest.mark.parametrize("interval, rows", [(60, 20), (10, 100)])
@pytest.mark.parametrize(
    "purge, expected_dropped",
    [
        (0, {60: 0, 10: 0}),
        (GAP, {60: 0, 10: 0}),  # a window exactly `purge` seconds away is kept
        (GAP + 1, {60: 1, 10: 1}),
        (2 * GAP, {60: 1, 10: 6}),  # units are seconds: 120 s is 1 step at 60 s but 6 at 10 s
        (GAP + 150, {60: 3, 10: 15}),
    ],
)
def test_purge_is_in_seconds_at_10_and_60_second_sampling(interval, rows, purge, expected_dropped):
    df, seq = build(three_experiments(interval, rows), interval)
    train, val, test, report = split_by_experiment(seq, purge_seconds=purge)
    want = expected_dropped[interval]
    per_exp = Counter(map(str, seq.experiment_ids))
    assert report.train.windows_dropped_purge == 0
    assert report.validation.windows_dropped_purge == want
    assert report.test.windows_dropped_purge == want
    assert len(train) == per_exp["A"]
    assert len(val) == per_exp["B"] - want
    assert len(test) == per_exp["C"] - want
    assert report.windows_dropped_purge == 2 * want
    assert report.purge_seconds == purge and report.interval_seconds == interval


@pytest.mark.parametrize("interval, rows", [(60, 20), (10, 100)])
def test_purge_matches_an_independent_calculation_from_the_raw_data(interval, rows):
    specs = three_experiments(interval, rows)
    df, seq = build(specs, interval)
    purge = 200
    train, val, test, _ = split_by_experiment(seq, purge_seconds=purge)
    last = df.groupby("experiment_id")["timestamp"].max()
    step = pd.Timedelta(seconds=interval)
    n = seq.history_steps
    for name, subset, earlier in (("B", val, ["A"]), ("C", test, ["A", "B"])):
        prev_end = max(last[e] for e in earlier)
        expected = {
            (name, o)
            for o in seq.origin_times[np.asarray(seq.experiment_ids == name)]
            if (o - (n - 1) * step) - prev_end >= pd.Timedelta(seconds=purge)
        }
        assert window_keys(subset) == expected
        if len(subset):
            gap = (first_inputs(subset) - prev_end).total_seconds()
            assert gap.min() >= purge


def test_purge_never_trims_the_earlier_split(six):
    _, _, seq = six
    plain = split_by_experiment(seq)
    purged = split_by_experiment(seq, purge_seconds=3600)
    assert window_keys(purged.train) == window_keys(plain.train)


def test_purge_off_by_default_drops_nothing(six):
    _, _, seq = six
    report = split_by_experiment(seq).report
    assert report.purge_seconds == 0
    assert report.windows_dropped_purge == 0
    assert all(not s.fully_purged_experiments for s in report.splits)


def test_fully_purged_experiment_is_reported_not_hidden():
    ids = [f"E{i}" for i in range(10)]  # 6 train, 2 validation, 2 test
    specs = daily_specs(ids)
    train_end = specs[5][1] + 19 * pd.Timedelta(seconds=60)
    specs[6] = (ids[6], train_end + pd.Timedelta(seconds=60), 20)  # right after train: all purged
    df, seq = build(specs)
    per_exp = Counter(map(str, seq.experiment_ids))
    train, val, test, report = split_by_experiment(seq, purge_seconds=3600)
    assert report.validation.experiment_ids == (ids[6], ids[7])
    assert report.validation.fully_purged_experiments == (ids[6],)
    assert report.validation.windows_dropped_purge == per_exp[ids[6]]
    assert report.validation.windows_retained == per_exp[ids[7]]
    assert experiments_of(val) == {ids[7]}
    assert report.test.windows_dropped_purge == 0


def test_purge_that_empties_a_split_raises():
    _, seq = build(three_experiments(60, 20), 60)
    with pytest.raises(ValueError, match="validation split has no windows.*purg"):
        split_by_experiment(seq, purge_seconds=10 * 24 * 3600)


def test_no_shared_samples_when_purged_and_overlapping_experiments_are_handled():
    # three experiments of 40 min that overlap in time: starts 10 minutes apart
    step = pd.Timedelta(minutes=10)
    specs = [("A", START, 40), ("B", START + step, 40), ("C", START + 2 * step, 40)]
    df, seq = build(specs, 60, "5min", "5min")
    raw_times = {e: set(g["timestamp"]) for e, g in df.groupby("experiment_id")}

    # Without a purge the later splits really do reuse the same clock times as train ...
    _, val0, _, _ = split_by_experiment(seq)
    assert {t for _, t in sample_times(val0)} & raw_times["A"]

    # ... with purge_seconds > 0, no timestamp of a later split is at or before the end of an earlier one
    train, val, test, report = split_by_experiment(seq, purge_seconds=1)
    train_times = {t for _, t in sample_times(train)} | raw_times["A"]
    val_times = {t for _, t in sample_times(val)}
    test_times = {t for _, t in sample_times(test)}
    assert train_times.isdisjoint(val_times)
    assert train_times.isdisjoint(test_times)
    assert val_times.isdisjoint(raw_times["A"])
    assert val_times.isdisjoint(train_times | test_times)
    assert test_times.isdisjoint(raw_times["A"] | raw_times["B"])
    assert min(val_times) > max(raw_times["A"])
    assert min(test_times) > max(raw_times["A"] | raw_times["B"])
    assert len(val) >= 1 and len(test) >= 1
    assert report.validation.windows_dropped_purge > 0 and report.test.windows_dropped_purge > 0


def test_no_shared_samples_between_experiments_even_without_purge(six):
    _, _, seq = six
    train, val, test, _ = split_by_experiment(seq)
    a, b, c = sample_times(train), sample_times(val), sample_times(test)
    assert a.isdisjoint(b) and a.isdisjoint(c) and b.isdisjoint(c)


# ---------------------------------------------------------------- accounting
def test_retained_and_dropped_windows_add_up():
    df, seq = build(three_experiments(10, 100), 10)
    per_exp = Counter(map(str, seq.experiment_ids))
    train, val, test, report = split_by_experiment(seq, purge_seconds=150)
    assert report.total_windows == len(seq) == sum(per_exp.values())
    assert report.windows_retained == len(train) + len(val) + len(test)
    assert report.windows_retained + report.windows_dropped_purge == report.total_windows
    for info, subset in zip(report.splits, (train, val, test)):
        assert info.windows_retained == len(subset)
        assert info.windows_total == sum(per_exp[e] for e in info.experiment_ids)
    assert report.history_seconds == 180 and report.horizon_seconds == 180


def test_summary_mentions_every_experiment_and_the_purge():
    _, seq = build(three_experiments(60, 20), 60)
    text = split_by_experiment(seq, purge_seconds=90).report.summary()
    for token in ("A", "B", "C", "purge 90 s", "train", "validation", "test"):
        assert token in text


# ---------------------------------------------------------------- synthetic data
def synth(i):
    return f"{SYNTHETIC_PREFIX}{i:03d}"


@pytest.mark.parametrize("synthetic_first", [False, True])
def test_synthetic_experiments_only_ever_go_to_train(synthetic_first):
    real = ["R1", "R2", "R3", "R4", "R5"]
    fake = [synth(1), synth(2)]
    if synthetic_first:
        ids = fake + real
    else:
        ids = real + fake  # synthetic would be the 'latest' experiments and land in test by time
    _, seq = build(daily_specs(ids))
    train, val, test, report = split_by_experiment(seq)
    for subset in (val, test):
        assert not any(e.startswith(SYNTHETIC_PREFIX) for e in experiments_of(subset))
    assert set(fake) <= experiments_of(train)
    assert report.synthetic_experiments == tuple(fake)
    # proportions use the 5 real experiments only: 3 / 1 / 1 (synthetic ones are extra, in train)
    assert experiments_of(val) == {"R4"} and experiments_of(test) == {"R5"}
    assert experiments_of(train) == {"R1", "R2", "R3"} | set(fake)
    assert not any(e.startswith(SYNTHETIC_PREFIX) for e in report.validation.experiment_ids + report.test.experiment_ids)
    assert len(train) + len(val) + len(test) == len(seq)


def test_synthetic_experiments_do_not_count_for_the_purge():
    # a synthetic experiment dated just before validation must not trigger purging
    real = [("R1", START, 20), ("R2", START + 10 * DAY, 20), ("R3", START + 20 * DAY, 20)]
    fake = [(synth(1), START + 10 * DAY - pd.Timedelta(minutes=30), 20)]
    _, seq = build(real + fake)
    _, _, _, report = split_by_experiment(seq, purge_seconds=3600)
    assert report.windows_dropped_purge == 0


def test_only_synthetic_experiments_are_rejected():
    _, seq = build(daily_specs([synth(i) for i in range(6)]))
    with pytest.raises(ValueError, match="real experiments"):
        split_by_experiment(seq)


def test_too_few_real_experiments_with_many_synthetic_is_rejected():
    _, seq = build(daily_specs(["R1", "R2"] + [synth(i) for i in range(5)]))
    with pytest.raises(ValueError, match="at least 3 real experiments.*2 real and 5 synthetic"):
        split_by_experiment(seq)


# ---------------------------------------------------------------- invalid input and insufficient data
@pytest.mark.parametrize(
    "kwargs",
    [
        dict(train_fraction=0.5, val_fraction=0.3, test_fraction=0.3),  # sums to 1.1
        dict(train_fraction=0.5, val_fraction=0.2, test_fraction=0.2),  # sums to 0.9
        dict(train_fraction=0.0, val_fraction=0.5, test_fraction=0.5),
        dict(train_fraction=1.0, val_fraction=0.0, test_fraction=0.0),
        dict(train_fraction=-0.2, val_fraction=0.6, test_fraction=0.6),
        dict(train_fraction=float("nan"), val_fraction=0.5, test_fraction=0.5),
        dict(train_fraction=float("inf"), val_fraction=0.5, test_fraction=0.5),
        dict(train_fraction="0.6", val_fraction=0.2, test_fraction=0.2),
        dict(train_fraction=True, val_fraction=0.2, test_fraction=0.2),
        dict(train_fraction=0.6, val_fraction=None, test_fraction=0.2),
    ],
)
def test_invalid_fractions_are_rejected(six, kwargs):
    _, _, seq = six
    with pytest.raises(ValueError, match="fraction"):
        split_by_experiment(seq, **kwargs)


@pytest.mark.parametrize("purge", [-1, -0.001, float("nan"), float("inf"), "60", None, True])
def test_invalid_purge_is_rejected(six, purge):
    _, _, seq = six
    with pytest.raises(ValueError, match="purge_seconds"):
        split_by_experiment(seq, purge_seconds=purge)


def test_fraction_sum_tolerates_float_noise(six):
    _, _, seq = six
    split_by_experiment(seq, train_fraction=0.1 + 0.2 + 0.3, val_fraction=0.2, test_fraction=0.2)


@pytest.mark.parametrize("n_exp", [1, 2])
def test_too_few_experiments(n_exp):
    assert MIN_REAL_EXPERIMENTS == 3
    _, seq = build(daily_specs([f"E{i}" for i in range(n_exp)]))
    with pytest.raises(ValueError, match="at least 3 real experiments"):
        split_by_experiment(seq)


def test_fractions_that_leave_no_room_for_train_are_rejected():
    _, seq = build(daily_specs([f"E{i}" for i in range(4)]))
    with pytest.raises(ValueError, match="too few.*leaving 0 for train"):
        split_by_experiment(seq, train_fraction=0.2, val_fraction=0.4, test_fraction=0.4)


def test_empty_sequence_set_is_rejected():
    short = make_frame([("E1", START, 5), ("E2", START + DAY, 5), ("E3", START + 2 * DAY, 5)])
    seq = build_sequences(short, "3min", "3min", interval_seconds=60, allow_empty=True)
    assert len(seq) == 0
    with pytest.raises(ValueError, match="no sequences"):
        split_by_experiment(seq)


def test_experiments_without_windows_are_not_invented():
    # one experiment is too short to produce any window; it simply is not part of the split
    specs = daily_specs(["E1", "E2", "E3", "E4"]) + [("TINY", START + 9 * DAY, 4)]
    _, seq = build(specs)
    assert "TINY" not in experiments_of(seq)
    result = split_by_experiment(seq)
    assert all("TINY" not in r.experiment_ids for r in result.report.splits)


def test_not_a_sequence_set_is_rejected():
    with pytest.raises(TypeError, match="SequenceSet"):
        split_by_experiment({"X": 1})


def test_timezone_naive_times_are_rejected(six):
    _, _, seq = six
    naive = dataclasses.replace(seq, origin_times=seq.origin_times.tz_localize(None))
    with pytest.raises(ValueError, match="timezone-aware"):
        split_by_experiment(naive)


def test_misaligned_arrays_are_rejected(six):
    _, _, seq = six
    broken = dataclasses.replace(seq, y=seq.y[:-1])
    with pytest.raises(ValueError, match="not aligned"):
        split_by_experiment(broken)


def test_result_types_and_dtypes(six):
    _, _, seq = six
    train, val, test, _ = split_by_experiment(seq)
    for subset in (train, val, test):
        assert isinstance(subset, SequenceSet)
        assert subset.X.dtype == np.float32
        assert subset.origin_times.tz is not None
        assert math.isfinite(float(subset.y.sum()))