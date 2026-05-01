import os
import time
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    print("🚀 NexTalk AI Service starting up...")
    start = time.time()

    # Import routes (lightweight — no model loading, API-only)
    from routes.toxic import router as toxic_router  # noqa: F401
    from routes.face import router as face_router  # noqa: F401
    from routes.summarize import router as summarize_router  # noqa: F401

    elapsed = time.time() - start
    print(f"✅ AI Service ready in {elapsed:.1f}s (API-only mode, no local models)")
    yield
    print("👋 AI Service shutting down...")


app = FastAPI(
    title="NexTalk AI Service",
    version="1.1.0",
    lifespan=lifespan,
)

# CORS — allow the Node.js backend to call this service
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

AI_SERVICE_SECRET = os.getenv("AI_SERVICE_SECRET", "")


def verify_service_secret(x_service_secret: str = Header(default="")):
    """Verify internal service-to-service authentication."""
    if AI_SERVICE_SECRET and x_service_secret != AI_SERVICE_SECRET:
        raise HTTPException(status_code=403, detail="Invalid service secret")


# Import and register routes
from routes.toxic import router as toxic_router
from routes.face import router as face_router
from routes.summarize import router as summarize_router

app.include_router(toxic_router, prefix="/toxic", tags=["Toxicity"])
app.include_router(face_router, prefix="/face", tags=["Face Auth"])
app.include_router(summarize_router, prefix="/summarize", tags=["Summarization"])


@app.get("/health")
async def health():
    """Health check endpoint for Render / monitoring."""
    return {
        "status": "ok",
        "service": "nextalk-ai",
        "mode": "api-only",
        "uptime": int(time.time()),
    }


@app.get("/ready")
async def ready():
    """Readiness check — all models are API-based, always ready."""
    return {
        "status": "ok",
        "models": {
            "toxic_classifier": "huggingface-api",
            "summarizer": "huggingface-api",
            "face_embedding": "huggingface-api",
            "emotion_detection": "huggingface-api",
        },
    }
