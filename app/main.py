from contextlib import asynccontextmanager
from fastapi import FastAPI
from app import models  # noqa: F401  (registers tables on Base)
from app.database import Base, engine
from app.routers import decision_support, readings, telemetry

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    yield

app = FastAPI(title="Indoor Air Quality API", lifespan=lifespan)
app.include_router(readings.router)
app.include_router(telemetry.router)
app.include_router(telemetry.system_router)
app.include_router(decision_support.router)