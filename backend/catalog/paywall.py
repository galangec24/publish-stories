"""Server-side paywall. Clients render what they receive and can't unlock anything."""
from payments.models import Subscription

from .delta import truncate_paragraphs


def has_full_access(user, story):
    if story.is_free:
        return True
    if not user or not user.is_authenticated:
        return False
    if user.is_admin:
        return True
    return Subscription.objects.filter(user=user, story=story, status=Subscription.Status.PAID).exists()


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

    Locked readers get the first `preview_page_count` paragraphs counted across
    chapters in order. Chapters past the preview keep their titles (so the
    table of contents still shows) but their content is withheld.
    """
    chapters = list(story.chapters.all())
    if full_access:
        return [_chapter(c, c.content, False) for c in chapters], False

    budget, result, locked = story.preview_page_count, [], False
    for chapter in chapters:
        if budget > 0:
            ops, used, truncated = truncate_paragraphs(chapter.content, budget)
            budget -= used
            result.append(_chapter(chapter, ops, truncated))
            locked = locked or truncated
        else:
            has_text = chapter.word_count > 0
            result.append(_chapter(chapter, None, has_text))
            locked = locked or has_text
    return result, locked
