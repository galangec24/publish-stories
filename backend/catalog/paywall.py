"""Server-side paywall. Clients render what they receive and can't unlock anything."""
from payments.access import has_full_access  # noqa: F401  (re-exported for catalog views)


def _chapter(chapter, content, locked):
    return {
        "id": chapter.id,
        "title": chapter.title,
        "order": chapter.order,
        "word_count": chapter.word_count,
        "content": content,
        "locked": locked,
    }


def reader_chapters(story, full_access):
    """Return (chapters, locked) for a reader.

    Without access, the first `free_chapters` chapters are whole and the rest keep
    their titles (so the table of contents still shows) with the content withheld.
    """
    chapters = list(story.chapters.all())
    if full_access:
        return [_chapter(c, c.content, False) for c in chapters], False
    result = [
        _chapter(c, c.content, False) if i < story.free_chapters else _chapter(c, None, True)
        for i, c in enumerate(chapters)
    ]
    return result, len(chapters) > story.free_chapters
