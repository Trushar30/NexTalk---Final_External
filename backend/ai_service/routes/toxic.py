import os
import re
from fastapi import APIRouter
from pydantic import BaseModel
from cachetools import TTLCache

router = APIRouter()

# ─── Cache: same message text → same result for 5 minutes ──
_cache = TTLCache(maxsize=500, ttl=300)

# ─── HuggingFace client (optional) ──
HF_API_TOKEN = os.getenv("HF_API_TOKEN", "")
_client = None

# Expose for readiness check
classifier = "built-in"


def _get_client():
    """Get HuggingFace InferenceClient (lazy, optional)."""
    global _client
    if _client is None and HF_API_TOKEN:
        try:
            from huggingface_hub import InferenceClient
            _client = InferenceClient(token=HF_API_TOKEN)
        except Exception:
            pass
    return _client


class ToxicCheckRequest(BaseModel):
    content: str


class ToxicCheckResponse(BaseModel):
    isToxic: bool
    score: float
    categories: list[str]


# ─── Built-in keyword-based toxicity check (no ML, no API) ──────
_TOXIC_PATTERNS: dict[str, list[str]] = {
    "insult": [
        r"\bstupid\b", r"\bidiot\b", r"\bdumb\b", r"\bloser\b", r"\bmoron\b",
        r"\bpathetic\b", r"\bworthless\b", r"\bugly\b", r"\bdisgust",
        r"\btrash\b", r"\bgarbage\b", r"\bscum\b",
    ],
    "threat": [
        r"\bkill\b", r"\bdie\b", r"\bthreat", r"\bhurt\b", r"\bbeat\b",
        r"\bpunch\b", r"\bstab\b", r"\bshoot\b", r"\bbomb\b", r"\bdestroy\b",
        r"\bsmash\b", r"\bharm\b",
    ],
    "obscene": [
        r"\bf+u+c+k+", r"\bsh[i1]+t\b", r"\bass\b", r"\bb[i1]+tch",
        r"\bdamn\b", r"\bhell\b", r"\bcrap\b", r"\bwtf\b", r"\bstfu\b",
    ],
    "toxic": [
        r"\bhate\b", r"\bshut\s*up\b", r"\bgo\s*away\b", r"\bnobody\s*likes",
        r"\bkys\b", r"\bdie\b", r"\bworst\b.*\bever\b",
    ],
}


def _keyword_toxic_check(content: str) -> dict:
    """Check toxicity using keyword/pattern matching.
    
    This is a simple but effective fallback that catches obvious toxic content.
    """
    text = content.lower()
    matched_categories: dict[str, float] = {}
    total_matches = 0

    for category, patterns in _TOXIC_PATTERNS.items():
        for pattern in patterns:
            matches = re.findall(pattern, text)
            if matches:
                match_count = len(matches)
                total_matches += match_count
                # Score increases with more matches
                current = matched_categories.get(category, 0.0)
                matched_categories[category] = min(current + match_count * 0.3, 1.0)

    if not matched_categories:
        return {"isToxic": False, "score": 0.0, "categories": []}

    max_score = max(matched_categories.values())
    # Scale score: 1 match = ~0.5, 2+ matches = 0.7+
    score = min(0.3 + total_matches * 0.2, 1.0)

    return {
        "isToxic": score > 0.4,
        "score": round(score, 4),
        "categories": list(matched_categories.keys()),
    }


def _check_via_huggingface(content: str) -> dict:
    """Try HuggingFace API if token is available."""
    client = _get_client()
    if not client:
        raise Exception("No HF API token configured")

    results = client.text_classification(
        content[:512],
        model="unitary/toxic-bert",
    )

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
    """Check if a message contains toxic content.
    
    Strategy:
    1. Check cache
    2. Try HuggingFace API (if token available)
    3. Fall back to keyword-based check (always works)
    """
    # Check cache
    cache_key = request.content[:256]
    if cache_key in _cache:
        return ToxicCheckResponse(**_cache[cache_key])

    # Try HF API first (if token is set)
    if HF_API_TOKEN:
        try:
            result = _check_via_huggingface(request.content)
            _cache[cache_key] = result
            return ToxicCheckResponse(**result)
        except Exception as e:
            print(f"⚠️ HF API failed: {e}, using keyword checker")

    # Built-in keyword check (always works)
    result = _keyword_toxic_check(request.content)
    _cache[cache_key] = result
    return ToxicCheckResponse(**result)
