import os
import re
from fastapi import APIRouter
from pydantic import BaseModel
from cachetools import TTLCache

router = APIRouter()

# ─── Cache: same conversation → same summary for 10 minutes ──
_cache = TTLCache(maxsize=100, ttl=600)

# ─── HuggingFace client (optional enhancement) ──
HF_API_TOKEN = os.getenv("HF_API_TOKEN", "")
_client = None

# Expose for readiness check
summarizer = "built-in"


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


# ─── Built-in Extractive Summarizer (no ML, no API) ──────

# Common stop words to ignore when scoring
_STOP_WORDS = frozenset([
    "i", "me", "my", "we", "our", "you", "your", "he", "she", "it", "they",
    "them", "his", "her", "its", "this", "that", "the", "a", "an", "is", "am",
    "are", "was", "were", "be", "been", "being", "have", "has", "had", "do",
    "does", "did", "will", "would", "could", "should", "can", "may", "might",
    "shall", "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
    "into", "about", "like", "after", "between", "through", "during", "before",
    "above", "below", "up", "down", "out", "off", "over", "under", "again",
    "then", "once", "here", "there", "when", "where", "why", "how", "all",
    "each", "every", "both", "few", "more", "most", "other", "some", "such",
    "no", "not", "only", "same", "so", "than", "too", "very", "just", "don",
    "now", "and", "but", "or", "if", "because", "until", "while", "what",
    "which", "who", "whom", "ok", "okay", "yes", "no", "yeah", "yep", "nah",
    "lol", "haha", "hmm", "oh", "ah", "hey", "hi", "hello", "bye", "thanks",
    "thank", "please", "sorry", "gonna", "gotta", "wanna", "got", "get",
    "let", "know", "think", "go", "going", "come", "see", "look", "say",
    "said", "tell", "make", "take", "want", "need", "use", "try", "also",
    "well", "back", "even", "still", "way", "thing", "much", "right",
])


def _tokenize(text: str) -> list[str]:
    """Simple word tokenizer."""
    return re.findall(r'[a-zA-Z]+', text.lower())


def _extractive_summarize(text: str, max_sentences: int = 5) -> str:
    """Extractive summarization using word frequency scoring.
    
    Algorithm:
    1. Split into sentences
    2. Compute word frequency (excluding stop words)
    3. Score each sentence by sum of word frequencies
    4. Return top-scored sentences in original order
    """
    # Split into lines (each line is a message)
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    
    if len(lines) <= 3:
        return text
    
    # Extract content after "sender: " prefix
    contents = []
    for line in lines:
        # Remove "Sender: " prefix for scoring
        parts = line.split(": ", 1)
        content = parts[1] if len(parts) > 1 else parts[0]
        contents.append(content)
    
    # Compute word frequencies (excluding stop words and very short words)
    word_freq: dict[str, int] = {}
    for content in contents:
        words = _tokenize(content)
        for word in words:
            if word not in _STOP_WORDS and len(word) > 2:
                word_freq[word] = word_freq.get(word, 0) + 1
    
    if not word_freq:
        # Fallback if all words are stop words
        return ". ".join(contents[:max_sentences])
    
    # Score each message by sum of its word frequencies
    scored = []
    for i, (line, content) in enumerate(zip(lines, contents)):
        words = _tokenize(content)
        score = sum(word_freq.get(w, 0) for w in words if w not in _STOP_WORDS)
        # Boost longer messages slightly (they tend to be more informative)
        if len(words) > 5:
            score *= 1.2
        # Slight boost for messages with question marks (topics of discussion)
        if "?" in content:
            score *= 1.3
        scored.append((i, line, score))
    
    # Sort by score, take top N
    scored.sort(key=lambda x: x[2], reverse=True)
    top = scored[:max_sentences]
    
    # Re-sort by original position to maintain conversation flow
    top.sort(key=lambda x: x[0])
    
    # Build summary
    summary_parts = []
    for _, line, _ in top:
        # Clean up the line
        parts = line.split(": ", 1)
        if len(parts) > 1:
            sender = parts[0].strip()
            content = parts[1].strip()
            summary_parts.append(f"{sender}: {content}")
        else:
            summary_parts.append(line)
    
    summary = " | ".join(summary_parts)
    
    # Add topic keywords
    top_words = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)[:5]
    if top_words:
        topics = ", ".join(w for w, _ in top_words)
        summary = f"Topics: {topics}. — {summary}"
    
    return summary


def _summarize_via_huggingface(text: str) -> str:
    """Try HuggingFace API if token is available."""
    client = _get_client()
    if not client:
        raise Exception("No HF API token configured")
    
    result = client.summarization(
        text[:4000],
        model="facebook/bart-large-cnn",
    )
    if hasattr(result, 'summary_text'):
        return result.summary_text
    if isinstance(result, dict):
        return result.get('summary_text', '')
    return str(result) if result else ''


@router.post("", response_model=SummarizeResponse)
async def summarize_conversation(request: SummarizeRequest):
    """Summarize a list of conversation messages.
    
    Strategy:
    1. Check cache
    2. Try HuggingFace API (if token available)
    3. Fall back to built-in extractive summarizer (always works)
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

    # Try HF API first (if token is set)
    if HF_API_TOKEN:
        try:
            summary = _summarize_via_huggingface(text)
            if summary:
                _cache[cache_key] = summary
                return SummarizeResponse(summary=summary)
        except Exception as e:
            print(f"⚠️ HF API failed: {e}, using built-in summarizer")

    # Built-in extractive summarizer (always works, no API needed)
    summary = _extractive_summarize(text)
    _cache[cache_key] = summary
    return SummarizeResponse(summary=summary)
