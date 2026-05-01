"""
AI Cloner — Analyse a user's communication style and predict their reply.

Strategy:
1. Build a "style profile" from the target user's message history
2. Try HuggingFace text-generation API for a natural prediction
3. Fall back to a built-in template engine (always works, no API needed)
"""

import os
import re
import random
from collections import Counter
from fastapi import APIRouter
from pydantic import BaseModel
from cachetools import TTLCache

router = APIRouter()

# ─── Cache (same input → same prediction for 5 min) ──────
_cache = TTLCache(maxsize=200, ttl=300)

# ─── HuggingFace client ──────────────────────────────────
HF_API_TOKEN = os.getenv("HF_API_TOKEN", "")
_client = None


def _get_client():
    """Lazy-load HuggingFace InferenceClient."""
    global _client
    if _client is None and HF_API_TOKEN:
        try:
            from huggingface_hub import InferenceClient
            _client = InferenceClient(token=HF_API_TOKEN)
        except Exception:
            pass
    return _client


# ─── Request / Response Models ────────────────────────────

class CloneRequest(BaseModel):
    message: str                     # The incoming message to predict a reply for
    target_history: list[str]        # Target user's past messages (plain text)
    target_mood: str = "neutral"     # Target user's current mood
    target_name: str = "User"        # Target user's display name


class StyleProfile(BaseModel):
    avg_length: float
    emoji_frequency: float
    favorite_emojis: list[str]
    punctuation_style: str
    capitalization: str
    vocabulary_level: str
    greeting_style: str
    mood: str
    slang_level: str
    response_patterns: list[str]


class CloneResponse(BaseModel):
    prediction: str
    style_profile: StyleProfile
    confidence: float
    method: str  # "ai" or "template"


# ─── Emoji Detection ─────────────────────────────────────

# Common emoji patterns (covers most text-based and Unicode emoji)
_EMOJI_RE = re.compile(
    "["
    "\U0001F600-\U0001F64F"  # emoticons
    "\U0001F300-\U0001F5FF"  # symbols & pictographs
    "\U0001F680-\U0001F6FF"  # transport & map
    "\U0001F1E0-\U0001F1FF"  # flags
    "\U00002702-\U000027B0"
    "\U000024C2-\U0001F251"
    "\U0001f900-\U0001f9FF"  # supplemental
    "\U0001FA00-\U0001FA6F"  # chess symbols
    "\U0001FA70-\U0001FAFF"  # symbols ext
    "\U00002600-\U000026FF"  # misc symbols
    "]+",
    flags=re.UNICODE,
)

# Text-based emoticons
_TEXT_EMOTICONS = re.compile(
    r'(?:[:;][-~]?[)D(P/\\|])|'
    r'(?:<3)|'
    r'(?:xD|XD)|'
    r'(?:\^\^)|'
    r'(?::\))|'
    r'(?:;\))|'
    r'(?::P)|'
    r'(?::D)'
)

# Common slang/abbreviation patterns
_SLANG_WORDS = frozenset([
    "lol", "lmao", "rofl", "omg", "brb", "gtg", "idk", "imo", "tbh", "ngl",
    "fr", "frfr", "ong", "smh", "fyi", "btw", "irl", "dm", "rn", "nvm",
    "wyd", "hmu", "ily", "ikr", "istg", "slay", "vibe", "lowkey", "highkey",
    "deadass", "bet", "cap", "nocap", "sus", "bussin", "fam", "bruh", "bro",
    "sis", "yall", "gonna", "wanna", "gotta", "kinda", "sorta", "tho",
    "nah", "yep", "yea", "yeah", "ya", "haha", "hehe", "lolol", "xd",
])


def _extract_emojis(text: str) -> list[str]:
    """Extract all emoji from text."""
    found = _EMOJI_RE.findall(text)
    text_emojis = _TEXT_EMOTICONS.findall(text)
    return found + text_emojis


# ─── Style Profile Builder ───────────────────────────────

def _build_style_profile(messages: list[str], mood: str) -> StyleProfile:
    """Analyse message history to extract communication patterns."""

    if not messages:
        return StyleProfile(
            avg_length=20.0, emoji_frequency=0.0, favorite_emojis=[],
            punctuation_style="normal", capitalization="lowercase",
            vocabulary_level="casual", greeting_style="hey",
            mood=mood, slang_level="low", response_patterns=[],
        )

    # ── Length analysis ──
    lengths = [len(m.split()) for m in messages]
    avg_length = sum(lengths) / len(lengths) if lengths else 20.0

    # ── Emoji analysis ──
    all_emojis = []
    for m in messages:
        all_emojis.extend(_extract_emojis(m))

    emoji_count = len(all_emojis)
    emoji_freq = emoji_count / len(messages) if messages else 0.0
    emoji_counter = Counter(all_emojis)
    fav_emojis = [e for e, _ in emoji_counter.most_common(5)]

    # ── Punctuation analysis ──
    exclamation_count = sum(m.count("!") for m in messages)
    question_count = sum(m.count("?") for m in messages)
    ellipsis_count = sum(m.count("...") for m in messages)
    total_msgs = len(messages)

    if exclamation_count / total_msgs > 1.5:
        punct_style = "enthusiastic"
    elif question_count / total_msgs > 0.8:
        punct_style = "inquisitive"
    elif ellipsis_count / total_msgs > 0.5:
        punct_style = "trailing"
    else:
        punct_style = "normal"

    # ── Capitalization analysis ──
    caps_msgs = sum(1 for m in messages if m == m.upper() and len(m) > 3)
    lower_msgs = sum(1 for m in messages if m == m.lower())

    if caps_msgs / total_msgs > 0.3:
        cap_style = "ALL CAPS"
    elif lower_msgs / total_msgs > 0.7:
        cap_style = "lowercase"
    else:
        cap_style = "normal"

    # ── Vocabulary level ──
    all_words = " ".join(messages).lower().split()
    unique_ratio = len(set(all_words)) / len(all_words) if all_words else 0

    if unique_ratio > 0.7:
        vocab_level = "advanced"
    elif unique_ratio > 0.4:
        vocab_level = "moderate"
    else:
        vocab_level = "casual"

    # ── Slang level ──
    slang_count = sum(1 for w in all_words if w in _SLANG_WORDS)
    slang_ratio = slang_count / len(all_words) if all_words else 0

    if slang_ratio > 0.15:
        slang_level = "high"
    elif slang_ratio > 0.05:
        slang_level = "moderate"
    else:
        slang_level = "low"

    # ── Greeting style ──
    greetings = []
    greeting_patterns = {
        "hey": ["hey", "heyo", "heyy"],
        "hi": ["hi", "hii", "hiii"],
        "hello": ["hello", "hellooo"],
        "yo": ["yo", "yoo", "yooo"],
        "sup": ["sup", "wassup", "whatsup", "what's up"],
    }
    for m in messages[:20]:  # check first 20 messages
        first_word = m.lower().split()[0] if m.split() else ""
        for style, patterns in greeting_patterns.items():
            if first_word in patterns:
                greetings.append(style)
                break

    greeting_style = Counter(greetings).most_common(1)[0][0] if greetings else "hey"

    # ── Response patterns (common first words / phrases) ──
    first_words = []
    for m in messages:
        words = m.strip().split()
        if words:
            first_words.append(words[0].lower())

    response_patterns = [w for w, _ in Counter(first_words).most_common(5)]

    return StyleProfile(
        avg_length=round(avg_length, 1),
        emoji_frequency=round(emoji_freq, 2),
        favorite_emojis=fav_emojis,
        punctuation_style=punct_style,
        capitalization=cap_style,
        vocabulary_level=vocab_level,
        greeting_style=greeting_style,
        mood=mood,
        slang_level=slang_level,
        response_patterns=response_patterns,
    )


# ─── HuggingFace AI Prediction ───────────────────────────

def _predict_via_huggingface(message: str, history: list[str], profile: StyleProfile, name: str) -> str:
    """Use HuggingFace text generation to predict a reply."""
    client = _get_client()
    if not client:
        raise Exception("No HF client")

    # Build a rich prompt that captures the user's style
    style_desc = (
        f"You are roleplaying as {name}. "
        f"Their communication style: "
        f"Average message length ~{profile.avg_length:.0f} words. "
        f"Emoji usage: {'frequent' if profile.emoji_frequency > 0.5 else 'occasional' if profile.emoji_frequency > 0.1 else 'rare'}. "
        f"Favorite emojis: {', '.join(profile.favorite_emojis[:3]) if profile.favorite_emojis else 'none'}. "
        f"Punctuation style: {profile.punctuation_style}. "
        f"Capitalization: {profile.capitalization}. "
        f"Vocabulary: {profile.vocabulary_level}. "
        f"Slang usage: {profile.slang_level}. "
        f"Current mood: {profile.mood}. "
        f"They often start messages with: {', '.join(profile.response_patterns[:3]) if profile.response_patterns else 'varied'}."
    )

    # Include recent history for context
    recent = history[-10:] if len(history) > 10 else history
    history_text = "\n".join(f"- {m}" for m in recent)

    prompt = (
        f"<s>[INST] {style_desc}\n\n"
        f"Here are some of {name}'s recent messages for context:\n{history_text}\n\n"
        f"Someone just sent this message to {name}: \"{message}\"\n\n"
        f"Write a short, natural reply exactly as {name} would write it. "
        f"Match their exact style, length, emoji usage, and mood. "
        f"Only output the reply text, nothing else. [/INST]"
    )

    result = client.text_generation(
        prompt,
        model="mistralai/Mistral-7B-Instruct-v0.3",
        max_new_tokens=150,
        temperature=0.7,
        top_p=0.9,
        repetition_penalty=1.1,
    )

    return result.strip() if isinstance(result, str) else str(result).strip()


# ─── Built-in Template Prediction ────────────────────────

# Mood-based response templates
_MOOD_TEMPLATES = {
    "happy": [
        "haha {response} 😄",
        "omg yes! {response} 🥳",
        "{response}!! that's awesome",
        "yesss {response} 💯",
        "lol {response} 😂",
    ],
    "calm": [
        "{response}",
        "hmm {response}",
        "yeah, {response}",
        "sure, {response} 🙂",
        "that makes sense. {response}",
    ],
    "focused": [
        "{response}.",
        "got it. {response}",
        "right, {response}",
        "okay {response}",
        "{response} — let me think about that",
    ],
    "stressed": [
        "ugh {response}",
        "man... {response}",
        "idk {response} 😩",
        "{response} honestly",
        "bruh {response}",
    ],
    "excited": [
        "YOOO {response}!! 🔥",
        "OMG {response} 🚀",
        "no way!! {response}",
        "LETS GOO {response} 💪",
        "{response}!!! this is insane",
    ],
    "neutral": [
        "{response}",
        "yeah {response}",
        "oh okay, {response}",
        "hmm {response}",
        "alright, {response}",
    ],
    "angry": [
        "{response} smh",
        "bruh. {response}",
        "nah {response} 😤",
        "seriously? {response}",
        "{response}. whatever",
    ],
    "sad": [
        "{response} 😔",
        "yeah... {response}",
        "idk man, {response}",
        "{response} i guess",
        "hmm {response} 💙",
    ],
}

# Context-aware response generators based on message intent
_INTENT_RESPONSES = {
    "question": [
        "hmm let me think... probably {topic}",
        "I'd say {topic}",
        "good question, {topic} I think",
        "{topic} for sure",
        "honestly? {topic}",
    ],
    "greeting": [
        "heyyy",
        "yo what's up",
        "heyy 👋",
        "hiiii",
        "sup!",
    ],
    "opinion": [
        "I think {topic}",
        "imo {topic}",
        "tbh {topic}",
        "ngl {topic}",
        "I feel like {topic}",
    ],
    "agreement": [
        "facts",
        "exactly!!",
        "fr fr",
        "yeahh 100%",
        "that's what I'm saying",
    ],
    "info": [
        "oh interesting, {topic}",
        "oh really? that's cool",
        "wait really? {topic}",
        "no way, {topic}",
        "huh, {topic}",
    ],
}


def _detect_intent(message: str) -> str:
    """Detect the intent/type of the incoming message."""
    msg = message.lower().strip()

    if msg.endswith("?") or any(msg.startswith(w) for w in ["what", "how", "why", "when", "where", "who", "which", "can", "do", "did", "is", "are", "will", "would", "should"]):
        return "question"

    if any(msg.startswith(w) for w in ["hey", "hi", "hello", "yo", "sup", "what's up", "wassup"]):
        return "greeting"

    if any(w in msg for w in ["think", "opinion", "feel", "believe", "prefer"]):
        return "opinion"

    if any(w in msg for w in ["right", "exactly", "true", "agree", "same", "yes"]):
        return "agreement"

    return "info"


def _extract_topic(message: str) -> str:
    """Extract the main topic/subject from a message for template filling."""
    # Remove common filler words and extract key content
    words = message.lower().split()
    filler = {"the", "a", "an", "is", "are", "was", "were", "do", "does", "did",
              "what", "how", "why", "i", "you", "we", "they", "it", "that", "this",
              "can", "will", "would", "should", "could", "about", "think", "know"}
    key_words = [w for w in words if w not in filler and len(w) > 2]
    if key_words:
        return " ".join(key_words[:4])
    return "that"


def _template_predict(message: str, profile: StyleProfile) -> str:
    """Generate a prediction using the built-in template engine."""

    intent = _detect_intent(message)
    mood = profile.mood.lower()
    topic = _extract_topic(message)

    # Get intent-specific response
    intent_templates = _INTENT_RESPONSES.get(intent, _INTENT_RESPONSES["info"])
    base_response = random.choice(intent_templates).format(topic=topic)

    # Apply mood overlay
    mood_templates = _MOOD_TEMPLATES.get(mood, _MOOD_TEMPLATES["neutral"])
    styled = random.choice(mood_templates).format(response=base_response)

    # Apply capitalization style
    if profile.capitalization == "lowercase":
        styled = styled.lower()
    elif profile.capitalization == "ALL CAPS":
        styled = styled.upper()

    # Add emojis if the user uses them frequently
    if profile.emoji_frequency > 0.3 and profile.favorite_emojis:
        if not any(e in styled for e in profile.favorite_emojis):
            styled += " " + random.choice(profile.favorite_emojis)

    # Adjust length to match user's style
    words = styled.split()
    target_len = int(profile.avg_length)
    if len(words) > target_len + 5:
        styled = " ".join(words[:target_len])
    elif len(words) < target_len - 5 and profile.avg_length > 15:
        # Add filler that matches their style
        fillers = {
            "high": ["fr", "ngl", "lowkey", "tbh"],
            "moderate": ["honestly", "like", "basically"],
            "low": ["I think", "actually", "well"],
        }
        extra = random.choice(fillers.get(profile.slang_level, fillers["low"]))
        styled = f"{extra} {styled}"

    # Apply punctuation style
    if profile.punctuation_style == "enthusiastic" and "!" not in styled:
        styled = styled.rstrip(".") + "!!"
    elif profile.punctuation_style == "trailing" and "..." not in styled:
        styled = styled.rstrip(".!?") + "..."

    return styled


# ─── Confidence Scorer ────────────────────────────────────

def _compute_confidence(history_count: int, method: str) -> float:
    """Estimate prediction confidence based on available data."""
    # More messages = better style analysis
    base = min(history_count / 50, 1.0) * 0.6  # up to 60% from data volume
    method_bonus = 0.25 if method == "ai" else 0.10  # AI model bonus
    variety_bonus = 0.15  # assume reasonable variety
    return round(min(base + method_bonus + variety_bonus, 0.95), 2)


# ─── Main Route ──────────────────────────────────────────

@router.post("/predict", response_model=CloneResponse)
async def predict_reply(request: CloneRequest):
    """Predict how a user would reply to a message based on their style."""

    # Check cache
    cache_key = hash(f"{request.message}:{len(request.target_history)}:{request.target_mood}")
    if cache_key in _cache:
        return _cache[cache_key]

    # Build style profile
    profile = _build_style_profile(request.target_history, request.target_mood)

    # Try HuggingFace API first
    method = "template"
    prediction = ""

    if HF_API_TOKEN:
        try:
            prediction = _predict_via_huggingface(
                request.message,
                request.target_history,
                profile,
                request.target_name,
            )
            method = "ai"
        except Exception as e:
            print(f"⚠️ HF clone prediction failed: {e}, using template engine")

    # Fallback to template engine
    if not prediction:
        prediction = _template_predict(request.message, profile)
        method = "template"

    confidence = _compute_confidence(len(request.target_history), method)

    response = CloneResponse(
        prediction=prediction,
        style_profile=profile,
        confidence=confidence,
        method=method,
    )

    _cache[cache_key] = response
    return response
