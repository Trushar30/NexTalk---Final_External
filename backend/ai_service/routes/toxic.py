import os
import requests as http_requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from cachetools import TTLCache

router = APIRouter()

# ─── Cache: same message text → same result for 5 minutes ──
_cache = TTLCache(maxsize=500, ttl=300)


class ToxicCheckRequest(BaseModel):
    content: str


class ToxicCheckResponse(BaseModel):
    isToxic: bool
    score: float
    categories: list[str]


# ─── HuggingFace Inference API (primary — no local model needed) ──
HF_API_TOKEN = os.getenv("HF_API_TOKEN", "")
HF_API_URL = "https://api-inference.huggingface.co/models/unitary/toxic-bert"

# ─── Local fallback model ──
classifier = None


def _load_local_classifier():
    """Lazy-load the local toxic-bert model as fallback."""
    global classifier
    if classifier is not None:
        return classifier
    try:
        from transformers import pipeline
        classifier = pipeline(
            "text-classification",
            model="unitary/toxic-bert",
            top_k=None,
        )
        print("✅ Local toxic classifier loaded")
    except Exception as e:
        print(f"⚠️ Local toxic classifier not available: {e}")
    return classifier


def _check_via_huggingface_api(content: str) -> dict:
    """Call HuggingFace Inference API for toxicity check."""
    headers = {}
    if HF_API_TOKEN:
        headers["Authorization"] = f"Bearer {HF_API_TOKEN}"

    response = http_requests.post(
        HF_API_URL,
        headers=headers,
        json={"inputs": content[:512]},
        timeout=15,
    )

    if response.status_code == 503:
        # Model is loading on HF side
        raise Exception("HF model loading, fallback to local")

    response.raise_for_status()
    data = response.json()

    # HF returns [[{label, score}, ...]]
    results = data[0] if isinstance(data, list) and len(data) > 0 else data

    if isinstance(results, list):
        toxic_labels = {
            r["label"]: r["score"]
            for r in results
            if r["score"] > 0.5
        }
        is_toxic = any(
            label in ["toxic", "severe_toxic", "threat", "insult", "obscene"]
            for label in toxic_labels
        )
        max_score = max((r["score"] for r in results), default=0.0)
        return {
            "isToxic": is_toxic,
            "score": round(max_score, 4),
            "categories": list(toxic_labels.keys()),
        }

    return {"isToxic": False, "score": 0.0, "categories": []}


def _check_via_local_model(content: str) -> dict:
    """Use local transformers model for toxicity check."""
    model = _load_local_classifier()
    if not model:
        raise Exception("No local model available")

    results = model(content[:512])[0]
    toxic_labels = {
        r["label"]: r["score"]
        for r in results
        if r["score"] > 0.5
    }
    is_toxic = any(
        label in ["toxic", "severe_toxic", "threat", "insult", "obscene"]
        for label in toxic_labels
    )
    max_score = max((r["score"] for r in results), default=0.0)
    return {
        "isToxic": is_toxic,
        "score": round(max_score, 4),
        "categories": list(toxic_labels.keys()),
    }


@router.post("/check", response_model=ToxicCheckResponse)
async def check_toxicity(request: ToxicCheckRequest):
    """Check if a message contains toxic content.
    
    Strategy:
    1. Check cache first
    2. Try HuggingFace Inference API (free, no local model)
    3. Fall back to local model if HF API fails
    """
    # Check cache
    cache_key = request.content[:256]
    if cache_key in _cache:
        return ToxicCheckResponse(**_cache[cache_key])

    try:
        # Primary: HuggingFace Inference API
        result = _check_via_huggingface_api(request.content)
        _cache[cache_key] = result
        return ToxicCheckResponse(**result)
    except Exception as hf_err:
        print(f"⚠️ HF API failed ({hf_err}), trying local model...")

    try:
        # Fallback: Local model
        result = _check_via_local_model(request.content)
        _cache[cache_key] = result
        return ToxicCheckResponse(**result)
    except Exception as local_err:
        print(f"⚠️ Local model also failed: {local_err}")
        # Ultimate fallback: return safe (non-toxic) to not block messages
        return ToxicCheckResponse(isToxic=False, score=0.0, categories=[])
