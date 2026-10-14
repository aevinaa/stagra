from pathlib import Path
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error
from ml.preprocess import load_clean_csv

CSV = "data/processed/final_clean.csv"
HORIZON_STEPS = 12  # 1 minute at 5-second intervals
LAGS = [0, 1, 3, 6, 12, 24]  # current, 5s, 15s, 30s, 1m, 2m ago
FEATURES = ["temperature_c", "humidity_percent", "mq135_raw"]
SPLITS = {
    "train": ["HW-002", "HW-003"],
    "validation": ["HW-004"],
    "test": ["HW-005"],
}

df = load_clean_csv(CSV)
data = {}

for exp_id, group in df.groupby("experiment_id", sort=False):
    group = group.sort_values("timestamp").reset_index(drop=True)
    X, y, baseline, valid = [], [], [], []

    for i in range(max(LAGS), len(group) - HORIZON_STEPS):
        # Avoid interpolated readings in both input history and target.
        window = group.iloc[i - max(LAGS):i + HORIZON_STEPS + 1]
        if window["was_imputed"].astype(bool).any():
            continue

        row = []
        for lag in LAGS:
            row.extend(group.loc[i - lag, FEATURES].astype(float).tolist())

        X.append(row)
        y.append(float(group.loc[i + HORIZON_STEPS, "mq135_raw"]))
        baseline.append(float(group.loc[i, "mq135_raw"]))

    data[exp_id] = (
        np.asarray(X, dtype=float),
        np.asarray(y, dtype=float),
        np.asarray(baseline, dtype=float),
    )

def combine(ids):
    parts = [data[e] for e in ids if e in data and len(data[e][1])]
    if not parts:
        raise ValueError(f"No valid windows for experiments {ids}")
    return tuple(np.concatenate([p[j] for p in parts], axis=0) for j in range(3))

X_train, y_train, _ = combine(SPLITS["train"])
X_val, y_val, _ = combine(SPLITS["validation"])
X_test, y_test, persistence = combine(SPLITS["test"])

print("Valid windows:", len(y_train), "train,", len(y_val), "validation,", len(y_test), "test")

best = None
for leaf in [2, 5, 10, 20]:
    model = RandomForestRegressor(
        n_estimators=300,
        min_samples_leaf=leaf,
        max_features=1.0,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)
    pred_val = model.predict(X_val)
    mae = mean_absolute_error(y_val, pred_val)
    rmse = np.sqrt(mean_squared_error(y_val, pred_val))
    print(f"leaf={leaf}: validation MAE={mae:.3f}, RMSE={rmse:.3f}")
    if best is None or mae < best[0]:
        best = (mae, leaf)

final_model = RandomForestRegressor(
    n_estimators=300,
    min_samples_leaf=best[1],
    max_features=1.0,
    random_state=42,
    n_jobs=-1,
)
# Fit on training experiments only; validation selects the leaf size.
final_model.fit(X_train, y_train)
pred_test = final_model.predict(X_test)

print("\nHeld-out HW-005 results (raw MQ135 units)")
for name, pred in [("Random Forest", pred_test), ("Persistence", persistence)]:
    print(
        f"{name}: MAE={mean_absolute_error(y_test, pred):.3f}, "
        f"RMSE={np.sqrt(mean_squared_error(y_test, pred)):.3f}"
    )
print("\nNote: these results are exploratory; the test session has already informed horizon selection.")
