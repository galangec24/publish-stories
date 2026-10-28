"""The outside services: ElevenLabs (voice), HeyGen (presenter video) and Claude (reel scripts).

Keys live in Render → Environment: ELEVENLABS_API_KEY (+ optional ELEVENLABS_VOICE_ID),
HEYGEN_API_KEY and ANTHROPIC_API_KEY. A missing key turns that feature off with a clear message.
"""
import base64

import anthropic
import requests
from django.conf import settings
from django.core.cache import cache


class ProviderError(Exception):
    pass


def _json(response, service):
    try:
        data = response.json()
    except ValueError:
        data = {}
    if response.status_code >= 300:
        detail = data.get("detail") or data.get("error") or data.get("message") or response.text[:200]
        if isinstance(detail, dict):
            detail = detail.get("message") or detail.get("status") or str(detail)
        raise ProviderError(f"{service}: {detail} ({response.status_code})")
    return data


# ---------- ElevenLabs: the word-for-word reading ----------

ELEVENLABS = "https://api.elevenlabs.io/v1"
ELEVENLABS_MODEL = "eleven_multilingual_v2"  # up to 10,000 characters per request


def _eleven_headers():
    if not settings.ELEVENLABS_API_KEY:
        raise ProviderError("The AI voice isn't set up (ELEVENLABS_API_KEY in Render).")
    return {"xi-api-key": settings.ELEVENLABS_API_KEY}


def narration_voice():
    """The voice set in ELEVENLABS_VOICE_ID, or else the first voice on the ElevenLabs account."""
    if settings.ELEVENLABS_VOICE_ID:
        return settings.ELEVENLABS_VOICE_ID
    voice = cache.get("ai:eleven-voice")
    if voice:
        return voice
    try:
        response = requests.get(f"{ELEVENLABS}/voices", headers=_eleven_headers(), timeout=20)
    except requests.RequestException as exc:
        raise ProviderError(f"ElevenLabs: {exc}") from exc
    voices = _json(response, "ElevenLabs").get("voices") or []
    if not voices:
        raise ProviderError("ElevenLabs: the account has no voices. Add one in ElevenLabs → Voices.")
    cache.set("ai:eleven-voice", voices[0]["voice_id"], 3600)
    return voices[0]["voice_id"]


def speak(text, voice_id, previous_text="", next_text=""):
    """Read `text` aloud. Returns (mp3 bytes, [(start, end) per character of `text`])."""
    body = {"text": text, "model_id": ELEVENLABS_MODEL}
    if previous_text:
        body["previous_text"] = previous_text  # keeps the tone continuous across pieces
    if next_text:
        body["next_text"] = next_text
    try:
        response = requests.post(
            f"{ELEVENLABS}/text-to-speech/{voice_id}/with-timestamps",
            params={"output_format": "mp3_44100_128"},
            json=body,
            headers=_eleven_headers(),
            timeout=180,
        )
    except requests.RequestException as exc:
        raise ProviderError(f"ElevenLabs: {exc}") from exc
    data = _json(response, "ElevenLabs")
    alignment = data.get("alignment") or {}
    starts = alignment.get("character_start_times_seconds") or []
    ends = alignment.get("character_end_times_seconds") or []
    return base64.b64decode(data["audio_base64"]), list(zip(starts, ends))


# ---------- HeyGen: the presenter video ----------

HEYGEN = "https://api.heygen.com/v3"


def _heygen_headers():
    if not settings.HEYGEN_API_KEY:
        raise ProviderError("AI video isn't set up (HEYGEN_API_KEY in Render).")
    return {"x-api-key": settings.HEYGEN_API_KEY}


def presenters():
    """HeyGen's ready-made human presenters (public studio avatars), for the picker in Studio."""
    found = cache.get("ai:heygen-presenters")
    if found is not None:
        return found
    found, token = [], None
    for _ in range(4):  # up to 200 presenters
        params = {"avatar_type": "studio_avatar", "ownership": "public", "limit": 50}
        if token:
            params["token"] = token
        try:
            response = requests.get(f"{HEYGEN}/avatars/looks", params=params, headers=_heygen_headers(), timeout=20)
        except requests.RequestException as exc:
            raise ProviderError(f"HeyGen: {exc}") from exc
        data = _json(response, "HeyGen")
        found += [
            {"id": look["id"], "name": look.get("name") or "", "gender": look.get("gender") or "", "image": look.get("preview_image_url") or ""}
            for look in data.get("data") or []
        ]
        token = data.get("next_token")
        if not data.get("has_more") or not token:
            break
    cache.set("ai:heygen-presenters", found, 6 * 3600)
    return found


def start_video(script, avatar_id, title):
    """Ask HeyGen to record `script` as a vertical video. Returns HeyGen's video id."""
    body = {
        "type": "avatar",
        "avatar_id": avatar_id,
        "script": script,  # spoken in the presenter's own voice
        "aspect_ratio": "9:16",
        "resolution": "720p",
        "title": title[:100],
    }
    try:
        response = requests.post(f"{HEYGEN}/videos", json=body, headers=_heygen_headers(), timeout=60)
    except requests.RequestException as exc:
        raise ProviderError(f"HeyGen: {exc}") from exc
    return _json(response, "HeyGen")["data"]["video_id"]


def video_state(video_id):
    """{"status": pending|processing|completed|failed, "video_url", "thumbnail_url", "duration", "error"}"""
    try:
        response = requests.get(f"{HEYGEN}/videos/{video_id}", headers=_heygen_headers(), timeout=20)
    except requests.RequestException as exc:
        raise ProviderError(f"HeyGen: {exc}") from exc
    data = _json(response, "HeyGen").get("data") or {}
    return {
        "status": data.get("status"),
        "video_url": data.get("video_url"),
        "thumbnail_url": data.get("thumbnail_url"),
        "duration": data.get("duration") or 0,
        "error": data.get("failure_message") or data.get("failure_code") or "",
    }


def download(url):
    try:
        response = requests.get(url, timeout=180)
    except requests.RequestException as exc:
        raise ProviderError(f"Download failed: {exc}") from exc
    if response.status_code >= 300:
        raise ProviderError(f"Download failed ({response.status_code})")
    return response.content


# ---------- Claude: the reel script ----------

SCRIPT_MODEL = "claude-opus-5-5"

SCRIPT_SYSTEM = """You write the spoken script for a short vertical video (a "reel") that introduces one chapter of a story on Publish Stories, a reading site for Filipino stories.

A presenter reads your script aloud to camera, so write only the words to be spoken:
- English, warm and conversational, 110 to 150 words (about 45 to 60 seconds).
- Open with a hook from the chapter, set up its situation and the people in it, and build curiosity.
- Never reveal how the chapter ends or any twist; stop at a question or moment of suspense.
- Close by inviting the viewer to read the chapter on Publish Stories.
- Plain sentences only: no headings, stage directions, emojis, hashtags, quotation marks around the whole script, or notes to the presenter.
- If the chapter is written in Filipino or Taglish, still write the script in English."""


def write_reel_script(story, chapter, chapter_number, text):
    if not settings.ANTHROPIC_API_KEY:
        raise ProviderError("AI scripts aren't set up (ANTHROPIC_API_KEY in Render).")
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    details = [f"Story: {story.title}"]
    if story.author_name:
        details.append(f"Author: {story.author_name}")
    if story.synopsis:
        details.append(f"Synopsis: {story.synopsis}")
    details.append(f"Chapter {chapter_number}: {chapter.title or 'Untitled'}")
    prompt = "\n".join(details) + f"\n\n<chapter>\n{text}\n</chapter>\n\nWrite the reel script for this chapter."
    try:
        response = client.beta.messages.create(
            model=SCRIPT_MODEL,
            max_tokens=16000,
            output_config={"effort": "low"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            system=SCRIPT_SYSTEM,
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.RateLimitError as exc:
        raise ProviderError("Claude is busy right now. Try again in a minute.") from exc
    except anthropic.APIStatusError as exc:
        raise ProviderError(f"Claude: {exc.message} ({exc.status_code})") from exc
    except anthropic.APIConnectionError as exc:
        raise ProviderError("Couldn't reach Claude. Try again.") from exc
    if response.stop_reason == "refusal":
        raise ProviderError("Claude couldn't write a script for this chapter. Write one yourself below.")
    script = "".join(block.text for block in response.content if block.type == "text").strip()
    if not script:
        raise ProviderError("Claude returned an empty script. Try again.")
    return script
