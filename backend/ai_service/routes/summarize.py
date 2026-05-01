import os
from fastapi import APIRouter
from pydantic import BaseModel
from cachetools import TTLCache
from huggingface_hub import InferenceClient

router = APIRouter()

# ─── Cache: same conversation → same summary for 10 minutes ──
_cache = TTLCache(maxsize=100, ttl=600)

# ─── HuggingFace Inference Client ──
HF_API_TOKEN = os.getenv("HF_API_TOKEN", "")
_client = None

# Expose for readiness check
summarizer = "api-only"


def _get_client() -> InferenceClient:
    """Get or create HuggingFace InferenceClient."""
    global _client
    if _client is None:
        _client = InferenceClient(token=HF_API_TOKEN if HF_API_TOKEN else None)
    return _client


class SummarizeRequest(BaseModel):
    messages: list[dict]


class SummarizeResponse(BaseModel):
    summary: str


def _format_messages(messages: list[dict]) -> str:
    """Format message list into a single text string."""
    return "\n".join(
        f"{m.get('sender', 'Unknown')}: {m.get('content', '')}"
        for m in messages
        if m.get("content")
    )


def _summarize_via_huggingface(text: str) -> str:
    """Call HuggingFace Inference API for summarization using the official client."""
    client = _get_client()
    result = client.summarization(
        text[:4000],
        model="facebook/bart-large-cnn",
    )
    # result is a SummarizationOutput with a summary_text attribute
    if hasattr(result, 'summary_text'):
        return result.summary_text
    # Fallback for dict-like response
    if isinstance(result, dict):
        return result.get('summary_text', text[:200])
    return str(result) if result else text[:200]


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
        summary = _summarize_via_huggingface(text)
        _cache[cache_key] = summary
        return SummarizeResponse(summary=summary)
    except Exception as e:
        print(f"⚠️ HF API failed: {e}")
        # Fallback: return truncated text
        fallback = text[:200] + "..."
        return SummarizeResponse(summary=fallback)
