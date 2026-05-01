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


# ─── HuggingFace Inference API (primary) ──
HF_API_TOKEN = os.getenv("HF_API_TOKEN", "")
HF_API_URL = "https://api-inference.huggingface.co/models/facebook/bart-large-cnn"

# ─── Local fallback model ──
summarizer = None


def _load_local_summarizer():
    """Lazy-load the local summarization model as fallback."""
    global summarizer
    if summarizer is not None:
        return summarizer
    try:
        from transformers import pipeline
        summarizer = pipeline("summarization", model="facebook/bart-large-cnn")
        print("✅ Local summarizer loaded")
    except Exception as e:
        print(f"⚠️ Local summarizer not available: {e}")
    return summarizer


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
        },
        timeout=30,
    )

    if response.status_code == 503:
        raise Exception("HF model loading, fallback to local")

    response.raise_for_status()
    data = response.json()

    if isinstance(data, list) and len(data) > 0:
        return data[0].get("summary_text", text[:200])
    return text[:200]


def _summarize_via_local_model(text: str) -> str:
    """Use local transformers model for summarization."""
    model = _load_local_summarizer()
    if not model:
        raise Exception("No local model available")

    result = model(
        text[:4000],
        max_length=130,
        min_length=30,
        do_sample=False,
    )
    return result[0]["summary_text"]


@router.post("", response_model=SummarizeResponse)
async def summarize_conversation(request: SummarizeRequest):
    """Summarize a list of conversation messages.
    
    Strategy:
    1. Check cache first
    2. Try HuggingFace Inference API (free, no local model)
    3. Fall back to local model if HF API fails
    """
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
        # Primary: HuggingFace Inference API
        summary = _summarize_via_huggingface_api(text)
        _cache[cache_key] = summary
        return SummarizeResponse(summary=summary)
    except Exception as hf_err:
        print(f"⚠️ HF API failed ({hf_err}), trying local model...")

    try:
        # Fallback: Local model
        summary = _summarize_via_local_model(text)
        _cache[cache_key] = summary
        return SummarizeResponse(summary=summary)
    except Exception as local_err:
        print(f"⚠️ Local model also failed: {local_err}")
        # Ultimate fallback: truncated text
        return SummarizeResponse(summary=text[:200] + "...")
