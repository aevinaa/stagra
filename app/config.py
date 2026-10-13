import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

# Override with e.g. AIRQ_DATABASE_URL=sqlite:///./other.db
DATABASE_URL = os.getenv("AIRQ_DATABASE_URL", f"sqlite:///{DATA_DIR / 'airq.db'}")
