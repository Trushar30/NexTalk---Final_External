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


# ─── HuggingFace Inference API ──
HF_API_TOKEN = os.getenv("HF_API_TOKEN", "")
HF_API_URL = "https://api-inference.huggingface.co/models/unitary/toxic-bert"

# Expose for readiness check
classifier = "api-only"


def _check_via_huggingface_api(content: str) -> dict:
    """Call HuggingFace Inference API for toxicity check."""
    headers = {}
    if HF_API_TOKEN:
        headers["Authorization"] = f"Bearer {HF_API_TOKEN}"

    response = http_requests.post(
        HF_API_URL,
        headers=headers,
        json={
            "inputs": content[:512],
            "options": {
                "wait_for_model": True,
            },
        },
        timeout=30,
    )

    if response.status_code == 503:
        data = response.json()
        raise Exception(f"HF model loading: {data.get('error', 'unavailable')}")

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


@router.post("/check", response_model=ToxicCheckResponse)
async def check_toxicity(request: ToxicCheckRequest):
    """Check if a message contains toxic content using HuggingFace Inference API."""
    # Check cache
    cache_key = request.content[:256]
    if cache_key in _cache:
        return ToxicCheckResponse(**_cache[cache_key])

    try:
        result = _check_via_huggingface_api(request.content)
        _cache[cache_key] = result
        return ToxicCheckResponse(**result)
    except Exception as e:
        print(f"⚠️ HF API failed: {e}")
        # Fallback: return safe (non-toxic) to not block messages
        return ToxicCheckResponse(isToxic=False, score=0.0, categories=[])
