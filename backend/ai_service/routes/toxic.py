import os
from fastapi import APIRouter
from pydantic import BaseModel
from cachetools import TTLCache
from huggingface_hub import InferenceClient

router = APIRouter()

# ─── Cache: same message text → same result for 5 minutes ──
_cache = TTLCache(maxsize=500, ttl=300)

# ─── HuggingFace Inference Client ──
HF_API_TOKEN = os.getenv("HF_API_TOKEN", "")
_client = None

# Expose for readiness check
classifier = "api-only"


def _get_client() -> InferenceClient:
    """Get or create HuggingFace InferenceClient."""
    global _client
    if _client is None:
        _client = InferenceClient(token=HF_API_TOKEN if HF_API_TOKEN else None)
    return _client


class ToxicCheckRequest(BaseModel):
    content: str


class ToxicCheckResponse(BaseModel):
    isToxic: bool
    score: float
    categories: list[str]


def _check_via_huggingface(content: str) -> dict:
    """Call HuggingFace Inference API for toxicity check using the official client."""
    client = _get_client()
    results = client.text_classification(
        content[:512],
        model="unitary/toxic-bert",
    )

    # results is a list of ClassificationOutput objects
    if isinstance(results, list) and len(results) > 0:
        toxic_labels = {}
        max_score = 0.0

        for r in results:
            label = r.label if hasattr(r, 'label') else r.get('label', '')
            score = r.score if hasattr(r, 'score') else r.get('score', 0.0)
            max_score = max(max_score, score)
            if score > 0.5:
                toxic_labels[label] = score

        is_toxic = any(
            label in ["toxic", "severe_toxic", "threat", "insult", "obscene"]
            for label in toxic_labels
        )

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
        result = _check_via_huggingface(request.content)
        _cache[cache_key] = result
        return ToxicCheckResponse(**result)
    except Exception as e:
        print(f"⚠️ HF API failed: {e}")
        # Fallback: return safe (non-toxic) to not block messages
        return ToxicCheckResponse(isToxic=False, score=0.0, categories=[])
