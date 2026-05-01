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


def _preprocess_face(img: Image.Image) -> Image.Image:
    """Normalize the image for consistent embedding extraction.
    
    - Center-crop to focus on face region (middle 70%)
    - Resize to standard size
    - Histogram equalization for lighting normalization
    """
    w, h = img.size

    # Center crop — faces are typically centered in webcam captures
    crop_ratio = 0.7
    cw, ch = int(w * crop_ratio), int(h * crop_ratio)
    left = (w - cw) // 2
    top = (h - ch) // 2
    img = img.crop((left, top, left + cw, top + ch))

    # Resize to standard size
    img = img.resize((128, 128), Image.Resampling.LANCZOS)

    # Histogram equalization on grayscale for lighting normalization
    gray = img.convert("L")
    arr = np.array(gray, dtype=np.float32)
    
    # Simple histogram equalization
    hist, bins = np.histogram(arr.flatten(), bins=256, range=(0, 256))
    cdf = hist.cumsum()
    cdf_min = cdf[cdf > 0].min()
    total = arr.size
    # Normalize CDF to 0-255
    cdf_normalized = ((cdf - cdf_min) / (total - cdf_min) * 255).astype(np.uint8)
    equalized = cdf_normalized[arr.astype(np.uint8).flatten()].reshape(arr.shape)
    
    return Image.fromarray(equalized.astype(np.uint8), mode="L")


def _compute_face_embedding(img: Image.Image) -> list[float]:
    """Compute a robust perceptual embedding from a face image.
    
    Designed for stability across different lighting conditions and
    minor angle changes. Uses histogram-heavy features which are
    naturally invariant to brightness/contrast shifts.
    
    Produces a 384-dim embedding for cosine similarity comparison.
    """
    gray = _preprocess_face(img)
    arr = np.array(gray, dtype=np.float32)
    embedding = []

    # 1. Coarse structure (8x8 = 64 features)
    #    Captures overall face shape/layout
    small = np.array(gray.resize((8, 8), Image.Resampling.LANCZOS), dtype=np.float32)
    small = (small - small.mean()) / (small.std() + 1e-8)
    embedding.extend(small.flatten().tolist())

    # 2. Regional histograms — 4x4 grid, 16 bins each (256 features)
    #    Most robust feature — invariant to exact pixel positions
    block_h, block_w = arr.shape[0] // 4, arr.shape[1] // 4
    for row in range(4):
        for col in range(4):
            block = arr[row*block_h:(row+1)*block_h, col*block_w:(col+1)*block_w]
            hist, _ = np.histogram(block, bins=16, range=(0, 256))
            hist = hist.astype(np.float32)
            hist = hist / (hist.sum() + 1e-8)
            embedding.extend(hist.tolist())

    # 3. Gradient orientation histograms — similar to simplified HOG (64 features)
    #    Captures edges/structure, robust to lighting
    resized = np.array(gray.resize((32, 32), Image.Resampling.LANCZOS), dtype=np.float32)
    dx = np.diff(resized, axis=1)  # horizontal gradients
    dy = np.diff(resized, axis=0)  # vertical gradients
    # Compute magnitude and orientation on overlapping region
    min_h = min(dx.shape[0], dy.shape[0])
    min_w = min(dx.shape[1], dy.shape[1])
    dx_c = dx[:min_h, :min_w]
    dy_c = dy[:min_h, :min_w]
    magnitude = np.sqrt(dx_c**2 + dy_c**2)
    orientation = np.arctan2(dy_c, dx_c)  # -pi to pi

    # 4x4 blocks, 4 orientation bins each = 64 features
    bh, bw = min_h // 4, min_w // 4
    for row in range(4):
        for col in range(4):
            m_block = magnitude[row*bh:(row+1)*bh, col*bw:(col+1)*bw]
            o_block = orientation[row*bh:(row+1)*bh, col*bw:(col+1)*bw]
            hist, _ = np.histogram(o_block, bins=4, range=(-np.pi, np.pi), weights=m_block)
            hist = hist.astype(np.float32)
            hist = hist / (hist.sum() + 1e-8)
            embedding.extend(hist.tolist())

    return embedding  # Total: 64 + 256 + 64 = 384 dimensions


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

        # Handle dimension mismatch (old 512-dim vs new 384-dim embeddings)
        if stored.shape[0] != live.shape[0]:
            print(f"⚠️ Embedding dimension mismatch: stored={stored.shape[0]}, live={live.shape[0]}. Re-registration needed.")
            return FaceVerifyResponse(verified=False)

        # Cosine similarity
        cosine_sim = float(np.dot(stored, live) / (np.linalg.norm(stored) * np.linalg.norm(live) + 1e-8))
        distance = 1 - cosine_sim
        # Perceptual embeddings have higher variance than neural ones — lenient threshold
        verified = distance < 0.70

        print(f"🔍 Face verify: cosine_sim={cosine_sim:.4f}, distance={distance:.4f}, verified={verified}")

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
