from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.db.seed import seed_database
from app.db.session import AsyncSessionLocal, init_db
from app.models.schemas import HealthResponse
from app.routers import dag, pipelines, sessions, stream, templates, uploads


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
    Path(settings.ARTIFACT_DIR).mkdir(parents=True, exist_ok=True)
    await init_db()
    async with AsyncSessionLocal() as db:
        await seed_database(db)
    yield


app = FastAPI(title="Anomalistral API", version="0.1.0", lifespan=lifespan)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions.router, prefix="/api")
app.include_router(pipelines.router, prefix="/api")
app.include_router(stream.router, prefix="/api")
app.include_router(uploads.router, prefix="/api")
app.include_router(dag.router, prefix="/api")
app.include_router(templates.router, prefix="/api")


@app.get("/api/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    return HealthResponse(status="ok", version="0.1.0")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
