import pytest

np = pytest.importorskip("numpy")
pd = pytest.importorskip("pandas")

from ml import preprocess  # noqa: E402
from ml.preprocess import MAX_GAP_SAMPLES, load_clean_csv, load_csv, main, preprocess as run_preprocess  # noqa: E402


def make_raw(n=10, experiment_id="SYNTH-001", start="2026-01-05T08:00:00Z", interval=60):
    ts = pd.date_range(start, periods=n, freq=f"{interval}s")
    i = np.arange(n)
    return pd.DataFrame(
        {
            "timestamp": list(ts.strftime("%Y-%m-%dT%H:%M:%SZ")),
            "temperature_c": 24.0 + 0.1 * i,
            "humidity_percent": 50.0 + 1.0 * i,
            "mq135_raw": 400 + 10 * i,
            "experiment_id": experiment_id,
            "location": "synthetic_room_a",
            "occupancy": 2,
            "ventilation": "closed",
            "fan": "off",
            "ac": "off",
        }
    )


def test_clean_input_passes_through_unchanged():
    raw = make_raw(10)
    clean, report = run_preprocess(raw)
    assert len(clean) == 10 and report.rows_out == 10
    assert not clean["was_imputed"].any()
    assert list(clean.columns) == preprocess.CLEAN_COLUMNS
    assert str(clean["timestamp"].dt.tz) == "UTC"
    assert clean["occupancy"].dtype.kind == "i"
    assert clean["temperature_c"].tolist() == pytest.approx(raw["temperature_c"].tolist())
    assert clean["mq135_raw"].tolist() == raw["mq135_raw"].tolist()  # raw value, untouched
    assert report.interval_seconds == 60


def test_missing_required_column_raises():
    with pytest.raises(ValueError, match="Missing required columns"):
        run_preprocess(make_raw().drop(columns=["mq135_raw"]))


def test_extra_columns_are_ignored_and_reported():
    raw = make_raw()
    raw["note"] = "x"
    clean, report = run_preprocess(raw)
    assert "note" not in clean.columns
    assert report.ignored_columns == ["note"]


def test_timezone_less_timestamp_is_dropped_not_assumed_utc():
    raw = make_raw(10)
    raw.loc[3, "timestamp"] = "2026-01-05T08:03:00"  # no timezone
    raw.loc[3, "humidity_percent"] = 99.0  # must not leak into the output
    clean, report = run_preprocess(raw)
    assert report.dropped_rows == {"timestamp_without_timezone": 1}
    row3 = clean[clean["timestamp"] == pd.Timestamp("2026-01-05T08:03:00Z")].iloc[0]
    assert row3["humidity_percent"] == pytest.approx(53.0)  # interpolated, not 99
    assert bool(row3["was_imputed"])


def test_offset_timestamp_is_converted_to_utc():
    raw = make_raw(5)
    raw.loc[0, "timestamp"] = "2026-01-05T13:30:00+05:30"  # == 08:00Z
    clean, report = run_preprocess(raw)
    assert clean["timestamp"].iloc[0] == pd.Timestamp("2026-01-05T08:00:00Z")
    assert report.dropped_rows == {}


def test_garbage_timestamp_dropped():
    raw = make_raw(10)
    raw.loc[2, "timestamp"] = "yesterday-ish Z"
    raw.loc[5, "timestamp"] = ""
    _, report = run_preprocess(raw)
    assert report.dropped_rows["timestamp_without_timezone"] == 2


def test_sensor_sentinels_become_missing_and_short_gap_is_interpolated():
    raw = make_raw(10)
    raw.loc[4, "temperature_c"] = -127.0  # DS18B20 disconnected
    clean, report = run_preprocess(raw)
    assert report.invalid_values["temperature_c"] == 1
    assert report.values_imputed == 1
    row = clean.iloc[4]
    assert row["temperature_c"] == pytest.approx(24.4)
    assert bool(row["was_imputed"])
    assert clean["was_imputed"].sum() == 1


@pytest.mark.parametrize(
    "column,bad",
    [("temperature_c", 85.0), ("humidity_percent", 140.0), ("humidity_percent", -3.0), ("mq135_raw", 9000)],
)
def test_out_of_range_values_are_invalid(column, bad):
    raw = make_raw(10)
    raw[column] = raw[column].astype(float)
    raw.loc[4, column] = bad
    clean, report = run_preprocess(raw)
    assert report.invalid_values[column] == 1
    assert bool(clean.iloc[4]["was_imputed"])
    lo, hi = preprocess.VALID_RANGES[column]
    assert clean[column].between(lo, hi).all()


def test_blank_and_text_sensor_values_are_counted_separately():
    raw = make_raw(10).astype({"humidity_percent": object, "mq135_raw": object})
    raw.loc[2, "humidity_percent"] = ""
    raw.loc[6, "humidity_percent"] = "abc"
    clean, report = run_preprocess(raw)
    assert report.missing_values["humidity_percent"] == 1
    assert report.invalid_values["humidity_percent"] == 1
    assert len(clean) == 10 and clean["was_imputed"].sum() == 2


def test_gap_of_exactly_max_samples_is_filled():
    raw = make_raw(30)
    raw.loc[10 : 9 + MAX_GAP_SAMPLES, "temperature_c"] = np.nan
    clean, report = run_preprocess(raw)
    assert len(clean) == 30
    assert report.values_imputed == MAX_GAP_SAMPLES


def test_longer_gap_is_not_filled_and_rows_are_left_out():
    raw = make_raw(30)
    raw.loc[10 : 10 + MAX_GAP_SAMPLES, "temperature_c"] = np.nan  # MAX+1 samples
    clean, report = run_preprocess(raw)
    assert len(clean) == 30 - (MAX_GAP_SAMPLES + 1)
    assert report.values_imputed == 0
    assert report.rows_dropped_unfillable == MAX_GAP_SAMPLES + 1
    assert not clean["was_imputed"].any()


def test_missing_reading_row_is_regularized_and_interpolated():
    raw = make_raw(10).drop(index=5)
    clean, report = run_preprocess(raw)
    assert len(clean) == 10
    assert report.gap_rows_created == 1
    row = clean.iloc[5]
    assert bool(row["was_imputed"])
    assert row["temperature_c"] == pytest.approx(24.5)
    assert row["ventilation"] == "closed" and row["occupancy"] == 2  # context carried forward


def test_long_missing_stretch_leaves_a_gap_in_time():
    raw = make_raw(30).drop(index=range(10, 20))
    clean, report = run_preprocess(raw)
    assert len(clean) == 20
    steps = clean["timestamp"].diff().dropna().dt.total_seconds()
    assert steps.max() == 11 * 60  # the gap is preserved, not bridged


def test_unsorted_rows_are_sorted_and_duplicates_removed():
    raw = make_raw(10)
    raw = pd.concat([raw, raw.iloc[[3]]]).sample(frac=1, random_state=0)
    clean, report = run_preprocess(raw)
    assert report.duplicates_removed == 1
    assert len(clean) == 10
    assert clean["timestamp"].is_monotonic_increasing


@pytest.mark.parametrize(
    "column,bad,reason",
    [
        ("ventilation", "ajar", "invalid_ventilation"),
        ("fan", "auto", "invalid_fan"),
        ("ac", "maybe", "invalid_ac"),
        ("occupancy", -1, "invalid_occupancy"),
        ("occupancy", 2.5, "invalid_occupancy"),
        ("occupancy", "many", "invalid_occupancy"),
        ("experiment_id", "", "missing_experiment_id"),
        ("experiment_id", "   ", "missing_experiment_id"),
        ("location", "", "missing_location"),
    ],
)
def test_invalid_context_drops_the_row(column, bad, reason):
    raw = make_raw(10).astype({column: object})
    raw.loc[0, column] = bad  # first row, so nothing is interpolated back in
    clean, report = run_preprocess(raw)
    assert report.dropped_rows == {reason: 1}
    assert len(clean) == 9


def test_text_fields_are_stripped_and_case_insensitive():
    raw = make_raw(5)
    raw["ventilation"] = ["Open", " CLOSED ", "open", "closed", "OPEN"]
    raw["fan"] = ["ON", "off", "On", "oFF", "on"]
    clean, report = run_preprocess(raw)
    assert report.dropped_rows == {}
    assert clean["ventilation"].tolist() == ["open", "closed", "open", "closed", "open"]
    assert clean["fan"].tolist() == ["on", "off", "on", "off", "on"]


def test_blank_ac_is_allowed_and_stays_missing():
    raw = make_raw(10)
    raw["ac"] = ""
    clean, report = run_preprocess(raw)
    assert len(clean) == 10 and report.dropped_rows == {}
    assert clean["ac"].isna().all()


def test_experiments_are_cleaned_independently():
    a = make_raw(10, experiment_id="EXP-A")
    b = make_raw(10, experiment_id="EXP-B")
    a.loc[9, "temperature_c"] = -127.0  # trailing edge of A: cannot be interpolated
    clean, report = run_preprocess(pd.concat([a, b], ignore_index=True))
    counts = clean["experiment_id"].value_counts()
    assert counts["EXP-A"] == 9 and counts["EXP-B"] == 10
    assert report.experiments == 2
    assert clean.groupby("experiment_id")["timestamp"].apply(lambda s: s.is_monotonic_increasing).all()


def test_interval_is_inferred_or_given():
    raw = make_raw(10, interval=30)
    clean, report = run_preprocess(raw)
    assert report.interval_seconds == 30 and len(clean) == 10
    merged, report60 = run_preprocess(raw, interval_seconds=60)
    assert report60.interval_seconds == 60 and len(merged) == 5


def test_synthetic_data_is_flagged_in_the_report():
    _, report = run_preprocess(make_raw(10, experiment_id="SYNTH-007"))
    assert report.synthetic_experiments == 1
    assert "SYNTHETIC" in report.summary()
    _, real = run_preprocess(make_raw(10, experiment_id="EXP-1"))
    assert real.synthetic_experiments == 0
    assert "SYNTHETIC" not in real.summary()


def test_no_valid_rows_raises():
    raw = make_raw(5)
    raw["ventilation"] = "ajar"
    with pytest.raises(ValueError, match="No valid rows"):
        run_preprocess(raw)


def test_cli_roundtrip_and_error_codes(tmp_path):
    src = tmp_path / "SYNTHETIC_in.csv"
    out = tmp_path / "clean.csv"
    make_raw(20).to_csv(src, index=False)
    assert main(["--input", str(src), "--output", str(out)]) == 0
    back = load_clean_csv(out)
    assert len(back) == 20
    assert str(back["timestamp"].dt.tz) == "UTC"
    assert main(["--input", str(tmp_path / "missing.csv")]) == 1


def test_load_clean_csv_rejects_timezone_less_files(tmp_path):
    p = tmp_path / "naive.csv"
    raw = make_raw(5)
    raw["timestamp"] = raw["timestamp"].str.rstrip("Z")
    raw.to_csv(p, index=False)
    with pytest.raises(ValueError, match="timezone"):
        load_clean_csv(p)


def test_load_csv_reads_everything_as_text(tmp_path):
    p = tmp_path / "raw.csv"
    make_raw(3).to_csv(p, index=False)
    df = load_csv(p)
    assert all(df[c].dtype == df["timestamp"].dtype for c in preprocess.COLUMNS)