import io
import os
import numpy as np
import json
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from PIL import Image

router = APIRouter()

# Lazy-load DeepFace to avoid import errors if not installed
deepface = None


def get_deepface():
    global deepface
    if deepface is None:
        try:
            from deepface import DeepFace
            deepface = DeepFace
            print("✅ DeepFace loaded")
        except ImportError:
            raise HTTPException(
                status_code=503,
                detail="DeepFace is not installed. Install with: pip install deepface"
            )
    return deepface


# In-memory store removed - embeddings stored in MongoDB


EMOTION_TO_MOOD = {
    "happy": "HAPPY",
    "sad": "SAD",
    "angry": "ANGRY",
    "fear": "STRESSED",
    "surprise": "EXCITED",
    "disgust": "STRESSED",
    "neutral": "NEUTRAL",
}


async def load_image(image: UploadFile) -> np.ndarray:
    """Load an uploaded image into a numpy array."""
    contents = await image.read()
    img = Image.open(io.BytesIO(contents)).convert("RGB")
    return np.array(img)


class FaceRegisterResponse(BaseModel):
    success: bool
    embedding: list[float] | None = None


class FaceVerifyResponse(BaseModel):
    verified: bool
    mood: str | None = None
    confidence: float = 0.0


@router.post("/register", response_model=FaceRegisterResponse)
async def register_face(
    userId: str = Form(...),
    image: UploadFile = File(...),
):
    """Extract and store face embedding for a user."""
    DeepFace = get_deepface()

    try:
        img = await load_image(image)
        embeddings = DeepFace.represent(img, model_name="Facenet512", enforce_detection=True)

        if not embeddings:
            raise HTTPException(status_code=400, detail="No face detected in the image")

        embedding = embeddings[0]["embedding"]
        return FaceRegisterResponse(success=True, embedding=embedding)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Face detection failed: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Face registration failed: {str(e)}")


@router.post("/verify", response_model=FaceVerifyResponse)
async def verify_face(
    userId: str = Form(...),
    image: UploadFile = File(...),
    storedEmbedding: str = Form(None),
):
    """Verify face identity and detect mood/emotion."""
    DeepFace = get_deepface()

    if not storedEmbedding:
        raise HTTPException(status_code=400, detail="Stored embedding is required for verification")

    try:
        img = await load_image(image)

        # Step 1: Identity verification
        live_embeddings = DeepFace.represent(img, model_name="Facenet512", enforce_detection=True)
        if not live_embeddings:
            return FaceVerifyResponse(verified=False)

        stored = np.array(json.loads(storedEmbedding))
        live = np.array(live_embeddings[0]["embedding"])

        # Cosine distance (Facenet512 threshold is typically around 0.3)
        cosine_sim = np.dot(stored, live) / (np.linalg.norm(stored) * np.linalg.norm(live))
        distance = 1 - cosine_sim
        verified = distance < 0.3

        if not verified:
            return FaceVerifyResponse(verified=False)

        # Step 2: Emotion detection
        analysis = DeepFace.analyze(img, actions=["emotion"], enforce_detection=False)
        dominant_emotion = analysis[0]["dominant_emotion"]
        mood = EMOTION_TO_MOOD.get(dominant_emotion, "NEUTRAL")
        confidence = analysis[0]["emotion"].get(dominant_emotion, 0.0)

        return FaceVerifyResponse(
            verified=True,
            mood=mood,
            confidence=round(confidence, 2),
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Face verification failed: {str(e)}")


@router.post("/emotion")
async def detect_emotion(image: UploadFile = File(...)):
    """Detect emotion from a face image without identity verification."""
    DeepFace = get_deepface()

    try:
        img = await load_image(image)
        analysis = DeepFace.analyze(img, actions=["emotion"], enforce_detection=False)
        dominant_emotion = analysis[0]["dominant_emotion"]
        mood = EMOTION_TO_MOOD.get(dominant_emotion, "NEUTRAL")

        return {
            "mood": mood,
            "emotion": dominant_emotion,
            "confidence": round(analysis[0]["emotion"].get(dominant_emotion, 0.0), 2),
            "all_emotions": {k: round(v, 2) for k, v in analysis[0]["emotion"].items()},
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Emotion detection failed: {str(e)}")
