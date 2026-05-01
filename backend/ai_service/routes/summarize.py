from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from transformers import pipeline

router = APIRouter()


class SummarizeRequest(BaseModel):
    messages: list[dict]


class SummarizeResponse(BaseModel):
    summary: str


# Load summarizer at startup
try:
    summarizer = pipeline("summarization", model="facebook/bart-large-cnn")
    print("✅ Summarizer loaded")
except Exception as e:
    print(f"⚠️ Failed to load summarizer: {e}")
    summarizer = None


@router.post("", response_model=SummarizeResponse)
async def summarize_conversation(request: SummarizeRequest):
    """Summarize a list of conversation messages."""
    if not summarizer:
        raise HTTPException(status_code=503, detail="Summarizer not available")

    try:
        text = "\n".join(
            f"{m.get('sender', 'Unknown')}: {m.get('content', '')}"
            for m in request.messages
            if m.get("content")
        )

        if not text:
            return SummarizeResponse(summary="No messages to summarize.")

        if len(text) < 100:
            return SummarizeResponse(summary=text)

        # Truncate to model's max input (1024 tokens ~ 4000 chars)
        text = text[:4000]

        result = summarizer(
            text,
            max_length=130,
            min_length=30,
            do_sample=False,
        )

        return SummarizeResponse(summary=result[0]["summary_text"])

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Summarization failed: {str(e)}")
