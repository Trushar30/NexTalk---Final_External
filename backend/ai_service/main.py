import os
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="NexTalk AI Service", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
    return {"status": "ok", "service": "nextalk-ai"}
