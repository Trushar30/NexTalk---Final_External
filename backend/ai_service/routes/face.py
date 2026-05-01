import io
import os
import numpy as np
import json
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from PIL import Image

router = APIRouter()

# Maximum upload size: 2MB
MAX_IMAGE_SIZE = 2 * 1024 * 1024

# ─── HuggingFace client for emotion detection only ──
HF_API_TOKEN = os.getenv("HF_API_TOKEN", "")
_client = None


def _get_hf_client():
    """Lazy-load HF client (only needed for emotion detection)."""
    global _client
    if _client is None:
        from huggingface_hub import InferenceClient
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


async def load_image(image: UploadFile) -> Image.Image:
    """Load an uploaded image with size validation."""
    contents = await image.read()

    if len(contents) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Image too large. Maximum size is {MAX_IMAGE_SIZE // (1024*1024)}MB"
        )

    try:
        img = Image.open(io.BytesIO(contents)).convert("RGB")

        # Resize if too large
        max_dim = 640
        if max(img.size) > max_dim:
            ratio = max_dim / max(img.size)
            new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)

        return img
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image: {str(e)}")


def _image_to_bytes(img: Image.Image) -> bytes:
    """Convert PIL Image to JPEG bytes."""
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _compute_face_embedding(img: Image.Image) -> list[float]:
    """Compute a perceptual embedding from a face image using Pillow.
    
    Uses a multi-scale approach combining:
    1. DCT-like hash (resized grayscale pixel values)
    2. Edge/gradient features
    3. Regional intensity histograms
    
    This is lightweight (no ML model needed) and produces a 512-dim
    embedding suitable for cosine similarity comparison.
    """
    embedding = []

    # 1. Grayscale pixel grid (16x16 = 256 features)
    gray = img.convert("L")
    small = gray.resize((16, 16), Image.Resampling.LANCZOS)
    pixels = np.array(small, dtype=np.float32).flatten()
    pixels = (pixels - pixels.mean()) / (pixels.std() + 1e-8)
    embedding.extend(pixels.tolist())

    # 2. Horizontal & vertical gradients (15x16 + 16x15 = 480 → take 128 via downscale)
    arr = np.array(gray.resize((32, 32), Image.Resampling.LANCZOS), dtype=np.float32)
    dx = np.diff(arr, axis=1)  # 32x31
    dy = np.diff(arr, axis=0)  # 31x32
    # Downsample gradients to 8x8 each = 128 features
    dx_small = np.array(Image.fromarray(dx).resize((8, 8), Image.Resampling.LANCZOS))
    dy_small = np.array(Image.fromarray(dy).resize((8, 8), Image.Resampling.LANCZOS))
    grad_features = np.concatenate([dx_small.flatten(), dy_small.flatten()])
    grad_features = (grad_features - grad_features.mean()) / (grad_features.std() + 1e-8)
    embedding.extend(grad_features.tolist())

    # 3. Regional histograms — divide into 4x4 grid, 8 bins each (128 features)
    arr_full = np.array(gray.resize((64, 64), Image.Resampling.LANCZOS), dtype=np.float32)
    block_h, block_w = 16, 16
    for row in range(4):
        for col in range(4):
            block = arr_full[row*block_h:(row+1)*block_h, col*block_w:(col+1)*block_w]
            hist, _ = np.histogram(block, bins=8, range=(0, 256))
            hist = hist.astype(np.float32)
            hist = hist / (hist.sum() + 1e-8)
            embedding.extend(hist.tolist())

    return embedding  # Total: 256 + 128 + 128 = 512 dimensions


def _get_emotion(image_bytes: bytes) -> dict:
    """Detect emotion via HuggingFace Inference API."""
    try:
        client = _get_hf_client()
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
    except Exception as e:
        print(f"⚠️ Emotion detection via HF failed: {e}")

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
    """Extract face embedding for a user using perceptual hashing."""
    try:
        img = await load_image(image)
        embedding = _compute_face_embedding(img)
        return FaceRegisterResponse(success=True, embedding=embedding)
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Face registration error: {e}")
        raise HTTPException(status_code=500, detail=f"Face registration failed: {str(e)}")


@router.post("/verify", response_model=FaceVerifyResponse)
async def verify_face(
    userId: str = Form(...),
    image: UploadFile = File(...),
    storedEmbedding: str = Form(None),
):
    """Verify face identity using perceptual embedding comparison + detect mood."""
    if not storedEmbedding:
        raise HTTPException(status_code=400, detail="Stored embedding is required for verification")

    try:
        img = await load_image(image)

        # Step 1: Identity verification via perceptual embedding
        live_embedding = _compute_face_embedding(img)
        stored = np.array(json.loads(storedEmbedding))
        live = np.array(live_embedding)

        # Cosine similarity
        cosine_sim = np.dot(stored, live) / (np.linalg.norm(stored) * np.linalg.norm(live) + 1e-8)
        distance = 1 - cosine_sim
        # Perceptual hash threshold is more lenient than neural embeddings
        verified = distance < 0.45

        if not verified:
            return FaceVerifyResponse(verified=False)

        # Step 2: Emotion detection (via HF API, graceful fallback)
        image_bytes = _image_to_bytes(img)
        emotion_data = _get_emotion(image_bytes)
        dominant = emotion_data["dominant_emotion"]
        mood = EMOTION_TO_MOOD.get(dominant, "NEUTRAL")
        confidence = emotion_data["confidence"]

        return FaceVerifyResponse(
            verified=True,
            mood=mood,
            confidence=round(confidence, 2),
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Face verification error: {e}")
        raise HTTPException(status_code=500, detail=f"Face verification failed: {str(e)}")


@router.post("/emotion")
async def detect_emotion(image: UploadFile = File(...)):
    """Detect emotion from a face image via HuggingFace API."""
    try:
        img = await load_image(image)
        image_bytes = _image_to_bytes(img)
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
