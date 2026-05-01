from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from transformers import pipeline

router = APIRouter()


class ToxicCheckRequest(BaseModel):
    content: str


class ToxicCheckResponse(BaseModel):
    isToxic: bool
    score: float
    categories: list[str]


# Load classifier at startup
try:
    classifier = pipeline(
        "text-classification",
        model="unitary/toxic-bert",
        top_k=None,
    )
    print("✅ Toxic classifier loaded")
except Exception as e:
    print(f"⚠️ Failed to load toxic classifier: {e}")
    classifier = None


@router.post("/check", response_model=ToxicCheckResponse)
async def check_toxicity(request: ToxicCheckRequest):
    """Check if a message contains toxic content."""
    if not classifier:
        raise HTTPException(status_code=503, detail="Toxic classifier not available")

    try:
        results = classifier(request.content[:512])[0]  # Limit input length

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

        return ToxicCheckResponse(
            isToxic=is_toxic,
            score=round(max_score, 4),
            categories=list(toxic_labels.keys()),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Toxic check failed: {str(e)}")
