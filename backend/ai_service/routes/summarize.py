import os
import requests as http_requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from cachetools import TTLCache

router = APIRouter()

# ─── Cache: same conversation → same summary for 10 minutes ──
_cache = TTLCache(maxsize=100, ttl=600)


class SummarizeRequest(BaseModel):
    messages: list[dict]


class SummarizeResponse(BaseModel):
    summary: str


# ─── HuggingFace Inference API ──
HF_API_TOKEN = os.getenv("HF_API_TOKEN", "")
HF_API_URL = "https://api-inference.huggingface.co/models/facebook/bart-large-cnn"

# Expose for readiness check
summarizer = "api-only"


def _format_messages(messages: list[dict]) -> str:
    """Format message list into a single text string."""
    return "\n".join(
        f"{m.get('sender', 'Unknown')}: {m.get('content', '')}"
        for m in messages
        if m.get("content")
    )


def _summarize_via_huggingface_api(text: str) -> str:
    """Call HuggingFace Inference API for summarization."""
    headers = {}
    if HF_API_TOKEN:
        headers["Authorization"] = f"Bearer {HF_API_TOKEN}"

    response = http_requests.post(
        HF_API_URL,
        headers=headers,
        json={
            "inputs": text[:4000],
            "parameters": {
                "max_length": 130,
                "min_length": 30,
                "do_sample": False,
            },
            "options": {
                "wait_for_model": True,  # Wait if model is cold-starting on HF
            },
        },
        timeout=60,
    )

    if response.status_code == 503:
        data = response.json()
        raise Exception(f"HF model loading: {data.get('error', 'unavailable')}")

    response.raise_for_status()
    data = response.json()

    if isinstance(data, list) and len(data) > 0:
        return data[0].get("summary_text", text[:200])
    return text[:200]


@router.post("", response_model=SummarizeResponse)
async def summarize_conversation(request: SummarizeRequest):
    """Summarize a list of conversation messages using HuggingFace Inference API."""
    text = _format_messages(request.messages)

    if not text:
        return SummarizeResponse(summary="No messages to summarize.")

    if len(text) < 100:
        return SummarizeResponse(summary=text)

    # Check cache
    cache_key = hash(text[:500])
    if cache_key in _cache:
        return SummarizeResponse(summary=_cache[cache_key])

    try:
        summary = _summarize_via_huggingface_api(text)
        _cache[cache_key] = summary
        return SummarizeResponse(summary=summary)
    except Exception as e:
        print(f"⚠️ HF API failed: {e}")
        # Fallback: return truncated text
        fallback = text[:200] + "..."
        return SummarizeResponse(summary=fallback)
