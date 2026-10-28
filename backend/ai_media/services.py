"""Making narrations and reels. Both take a while, so they run in the background and the
Studio polls for the result."""
import hashlib
import re
import threading

from django.db import close_old_connections, connection

from catalog import delta

from . import providers, storage
from .models import ChapterNarration, ChapterReel, Status

PIECE_CHARS = 4000  # characters per ElevenLabs request (its limit is 10,000)
CONTEXT_CHARS = 300  # text passed before/after a piece so the voice flows across pieces


def chapter_text(chapter):
    """The chapter as the reader sees it, as plain text (headings, paragraphs; pictures dropped)."""
    text = delta.plain_text(chapter.content)
    return re.sub(r"[ \t]+", " ", text).strip()


def source_hash(text, voice_id):
    return hashlib.sha256(f"{voice_id}\n{text}".encode()).hexdigest()


def split_pieces(text, limit=PIECE_CHARS):
    """Cut at paragraph ends (or sentence ends inside a very long paragraph) into pieces under `limit`."""
    pieces, current = [], ""
    for paragraph in text.split("\n"):
        while len(paragraph) > limit:
            cut = max(paragraph.rfind(". ", 0, limit), paragraph.rfind("? ", 0, limit), paragraph.rfind("! ", 0, limit))
            cut = cut + 1 if cut > 0 else paragraph.rfind(" ", 0, limit)
            if cut <= 0:
                cut = limit
            if current:
                pieces.append(current)
                current = ""
            pieces.append(paragraph[:cut].strip())
            paragraph = paragraph[cut:].strip()
        candidate = f"{current}\n{paragraph}" if current else paragraph
        if len(candidate) > limit and current:
            pieces.append(current)
            current = paragraph
        else:
            current = candidate
    if current.strip():
        pieces.append(current)
    return [p for p in (piece.strip() for piece in pieces) if p]


def word_timings(text, char_times):
    """[[word, start, end], ...] from per-character times."""
    words = []
    for match in re.finditer(r"\S+", text):
        first, last = match.start(), match.end() - 1
        if last >= len(char_times):
            break
        words.append([match.group(), round(char_times[first][0], 2), round(char_times[last][1], 2)])
    return words


def build_narration(narration_id):
    """Read the chapter aloud piece by piece, store the audio, and keep each word's timing."""
    narration = ChapterNarration.objects.select_related("chapter").get(pk=narration_id)
    old_keys = [s.get("key") for s in narration.segments]
    try:
        text = chapter_text(narration.chapter)
        if not text:
            raise providers.ProviderError("This chapter has no text to read.")
        voice = providers.narration_voice()
        pieces = split_pieces(text)
        segments = []
        for i, piece in enumerate(pieces):
            before = pieces[i - 1][-CONTEXT_CHARS:] if i else ""
            after = pieces[i + 1][:CONTEXT_CHARS] if i + 1 < len(pieces) else ""
            audio, char_times = providers.speak(piece, voice, before, after)
            words = word_timings(piece, char_times)
            key = storage.save(audio, "audio/mpeg", ".mp3")
            segments.append({"key": key, "duration": words[-1][2] if words else 0, "words": words})
        narration.segments = segments
        narration.source_hash = source_hash(text, voice)
        narration.voice_id = voice
        narration.characters = sum(len(p) for p in pieces)
        narration.status = Status.READY
        narration.error = ""
        narration.save()
        storage.delete(*old_keys)  # the previous reading, if this was a redo
    except (providers.ProviderError, storage.StorageError) as exc:
        narration.status = Status.FAILED
        narration.error = str(exc)
        narration.save(update_fields=["status", "error", "updated_at"])


def _in_background(target, *args):
    def run():
        close_old_connections()
        try:
            target(*args)
        finally:
            connection.close()

    threading.Thread(target=run, daemon=True).start()


def start_narration(chapter, background=True):
    narration, _ = ChapterNarration.objects.get_or_create(chapter=chapter)
    narration.status = Status.WORKING
    narration.error = ""
    narration.save(update_fields=["status", "error", "updated_at"])
    if background:
        _in_background(build_narration, narration.pk)
    else:
        build_narration(narration.pk)
    narration.refresh_from_db()
    return narration


def narration_is_current(narration):
    if narration.status != Status.READY:
        return False
    return narration.source_hash == source_hash(chapter_text(narration.chapter), narration.voice_id)


def refresh_reel(reel):
    """Check a reel HeyGen is still recording; once it's done, keep a copy in our storage
    (HeyGen's download links expire)."""
    if reel.status != Status.WORKING or not reel.provider_video_id:
        return reel
    try:
        state = providers.video_state(reel.provider_video_id)
        if state["status"] == "failed":
            reel.status = Status.FAILED
            reel.error = state["error"] or "HeyGen couldn't make this video."
        elif state["status"] == "completed" and state["video_url"]:
            video_key = storage.save(providers.download(state["video_url"]), "video/mp4", ".mp4")
            thumb_key = ""
            if state["thumbnail_url"]:
                try:
                    thumb_key = storage.save(providers.download(state["thumbnail_url"]), "image/jpeg", ".jpg")
                except (providers.ProviderError, storage.StorageError):
                    pass  # the video matters; the still image is a nicety
            storage.delete(reel.video_key, reel.thumbnail_key)
            reel.video_key, reel.thumbnail_key = video_key, thumb_key
            reel.duration = state["duration"]
            reel.status = Status.READY
            reel.error = ""
        else:
            return reel
    except (providers.ProviderError, storage.StorageError) as exc:
        reel.error = str(exc)  # stays "being made"; the next check tries again
    reel.save()
    return reel


def refresh_working_reels():
    for reel in ChapterReel.objects.filter(status=Status.WORKING):
        refresh_reel(reel)
