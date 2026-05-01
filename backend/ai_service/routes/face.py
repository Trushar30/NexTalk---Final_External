import io
import os
import numpy as np
import json
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from PIL import Image
from huggingface_hub import InferenceClient

router = APIRouter()

# Maximum upload size: 2MB
MAX_IMAGE_SIZE = 2 * 1024 * 1024

# ─── HuggingFace Inference Client ──
HF_API_TOKEN = os.getenv("HF_API_TOKEN", "")
_client = None


def _get_client() -> InferenceClient:
    """Get or create HuggingFace InferenceClient."""
    global _client
    if _client is None:
        _client = InferenceClient(token=HF_API_TOKEN if HF_API_TOKEN else None)
    return _client


EMOTION_TO_MOOD = {
    "happy": "HAPPY",
    "sad": "SAD",
    "angry": "ANGRY",
    "fear": "STRESSED",
    "surprise": "EXCITED",
    "disgust": "STRESSED",
    "neutral": "NEUTRAL",
}


async def load_image_bytes(image: UploadFile) -> bytes:
    """Load an uploaded image with size validation, return raw bytes."""
    contents = await image.read()

    if len(contents) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Image too large. Maximum size is {MAX_IMAGE_SIZE // (1024*1024)}MB"
        )

    try:
        # Validate it's a real image and resize if needed
        img = Image.open(io.BytesIO(contents)).convert("RGB")

        max_dim = 640
        if max(img.size) > max_dim:
            ratio = max_dim / max(img.size)
            new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)

        # Re-encode to JPEG bytes
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        return buf.getvalue()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image: {str(e)}")


def _get_face_embedding(image_bytes: bytes) -> list[float]:
    """Get image embedding via HuggingFace Inference API using CLIP."""
    client = _get_client()
    # Use feature extraction to get embeddings
    result = client.feature_extraction(
        image_bytes,
        model="openai/clip-vit-base-patch32",
    )
    # result is typically a nested list of floats
    if isinstance(result, list):
        # Flatten if needed — CLIP returns [1, 512] or similar
        if isinstance(result[0], list):
            return result[0]
        return result
    if isinstance(result, np.ndarray):
        return result.flatten().tolist()
    raise Exception(f"Unexpected embedding response: {type(result)}")


def _get_emotion(image_bytes: bytes) -> dict:
    """Detect emotion via HuggingFace Inference API."""
    client = _get_client()
    results = client.image_classification(
        image_bytes,
        model="trpakov/vit-face-expression",
    )

    if isinstance(results, list) and len(results) > 0:
        dominant = max(results, key=lambda x: x.score if hasattr(x, 'score') else x.get('score', 0))
        label = dominant.label if hasattr(dominant, 'label') else dominant.get('label', 'neutral')
        score = dominant.score if hasattr(dominant, 'score') else dominant.get('score', 0.0)
        
        all_emotions = {}
        for r in results:
            l = r.label if hasattr(r, 'label') else r.get('label', '')
            s = r.score if hasattr(r, 'score') else r.get('score', 0.0)
            all_emotions[l.lower()] = round(s * 100, 2)

        return {
            "dominant_emotion": label.lower(),
            "confidence": round(score * 100, 2),
            "all_emotions": all_emotions,
        }

    return {"dominant_emotion": "neutral", "confidence": 0.0, "all_emotions": {}}


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
    """Extract face embedding for a user via HuggingFace API."""
    try:
        image_bytes = await load_image_bytes(image)
        embedding = _get_face_embedding(image_bytes)
        return FaceRegisterResponse(success=True, embedding=embedding)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Face registration failed: {str(e)}")


@router.post("/verify", response_model=FaceVerifyResponse)
async def verify_face(
    userId: str = Form(...),
    image: UploadFile = File(...),
    storedEmbedding: str = Form(None),
):
    """Verify face identity and detect mood/emotion via HuggingFace API."""
    if not storedEmbedding:
        raise HTTPException(status_code=400, detail="Stored embedding is required for verification")

    try:
        image_bytes = await load_image_bytes(image)

        # Step 1: Identity verification
        live_embedding = _get_face_embedding(image_bytes)
        stored = np.array(json.loads(storedEmbedding))
        live = np.array(live_embedding)

        # Cosine similarity
        cosine_sim = np.dot(stored, live) / (np.linalg.norm(stored) * np.linalg.norm(live) + 1e-8)
        distance = 1 - cosine_sim
        verified = distance < 0.3

        if not verified:
            return FaceVerifyResponse(verified=False)

        # Step 2: Emotion detection
        try:
            emotion_data = _get_emotion(image_bytes)
            dominant = emotion_data["dominant_emotion"]
            mood = EMOTION_TO_MOOD.get(dominant, "NEUTRAL")
            confidence = emotion_data["confidence"]
        except Exception as e:
            print(f"⚠️ Emotion detection failed: {e}")
            mood = "NEUTRAL"
            confidence = 0.0

        return FaceVerifyResponse(
            verified=True,
            mood=mood,
            confidence=round(confidence, 2),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Face verification failed: {str(e)}")


@router.post("/emotion")
async def detect_emotion(image: UploadFile = File(...)):
    """Detect emotion from a face image via HuggingFace API."""
    try:
        image_bytes = await load_image_bytes(image)
        emotion_data = _get_emotion(image_bytes)

        dominant = emotion_data["dominant_emotion"]
        mood = EMOTION_TO_MOOD.get(dominant, "NEUTRAL")

        return {
            "mood": mood,
            "emotion": dominant,
            "confidence": emotion_data["confidence"],
            "all_emotions": emotion_data["all_emotions"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Emotion detection failed: {str(e)}")
