from contextlib import asynccontextmanager
from fastapi import FastAPI
from app import models  # noqa: F401  (registers tables on Base)
from app.database import Base, engine
from app.routers import decision_support, forecast, readings, telemetry, model_comparison
from fastapi.middleware.cors import CORSMiddleware

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    yield

app = FastAPI(title="Indoor Air Quality API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, 
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000",], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(readings.router)
app.include_router(telemetry.router)
app.include_router(telemetry.system_router)
app.include_router(decision_support.router)
app.include_router(forecast.router)
app.include_router(model_comparison.router)