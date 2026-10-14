
from fastapi import APIRouter

router = APIRouter(
    prefix="/api/models",
    tags=["model-comparison"],
)


@router.get("/comparison")
def model_comparison():
    return {
        "status": "exploratory",
        "target": "mq135_raw",
        "unit": "raw_sensor_units",
        "forecast_horizon_seconds": 60,
        "lookback_seconds": 180,
        "evaluation_experiment": "HW-005",
        "evaluation_note": (
            "Exploratory evaluation. HW-005 was also used "
            "during forecast horizon and lookback selection; "
            "it is not an untouched final test set."
        ),
        "models": [
            {
                "model_name": "Persistence",
                "mae": 3.333,
                "rmse": 4.850,
            },
            {
                "model_name": "Linear Trend",
                "mae": 2.706,
                "rmse": 3.864,
            },
        ],
    }
