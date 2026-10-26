"""Helpers for Quill Delta documents, the storage format for chapter content.

A Delta is a list of ops like {"insert": "text", "attributes": {...}}. In a
document, every line (paragraph, heading, list item) ends with a "\\n" insert;
block formatting such as {"header": 1} sits on that newline. Embeds (images)
are inserts whose value is a dict rather than a string.
"""

EMPTY_DOCUMENT = [{"insert": "\n"}]


def empty_document():
    return list(EMPTY_DOCUMENT)


def _op(text, attrs):
    op = {"insert": text}
    if attrs:
        op["attributes"] = attrs
    return op


def validate_ops(ops):
    """Raise ValueError unless ops is a well-formed insert-only Delta."""
    if not isinstance(ops, list):
        raise ValueError("Content must be a list of Delta ops.")
    for op in ops:
        if not isinstance(op, dict) or "insert" not in op:
            raise ValueError("Every op must be an object with an 'insert' key.")
        if set(op) - {"insert", "attributes"}:
            raise ValueError("Only 'insert' and 'attributes' are allowed in stored documents.")
        if not isinstance(op["insert"], (str, dict)):
            raise ValueError("'insert' must be a string or an embed object.")
        if isinstance(op["insert"], dict):
            _validate_embed(op["insert"])
        if "attributes" in op and not isinstance(op["attributes"], dict):
            raise ValueError("'attributes' must be an object.")


def _validate_embed(embed):
    """Only image embeds with a plain http(s) URL (no data: or javascript: URLs)."""
    if set(embed) != {"image"} or not isinstance(embed["image"], str):
        raise ValueError("Only image embeds are supported.")
    url = embed["image"]
    if len(url) > 1000 or not url.startswith(("https://", "http://", "/api/media/")):
        raise ValueError("Images must be uploaded (pasted image data isn't allowed).")


def normalize(ops):
    """Return ops guaranteed to end with a newline, as Quill requires."""
    if not ops:
        return list(EMPTY_DOCUMENT)
    last = ops[-1].get("insert")
    if isinstance(last, str) and last.endswith("\n"):
        return ops
    return [*ops, {"insert": "\n"}]


def plain_text(ops):
    return "".join(op["insert"] if isinstance(op.get("insert"), str) else " " for op in ops or [])


BOLD_HEADING_MAX_WORDS = 15


def headings(ops):
    """Titles, subtitles and sections in order: [{"level": 1, "text": "Part One"}, ...].

    A line counts when it uses Heading 1-3, or when the whole line is bold and short
    (authors often bold a title instead of using a heading style); those are level 2.
    """
    out, runs = [], []
    for op in ops or []:
        insert, attrs = op.get("insert"), op.get("attributes") or {}
        if not isinstance(insert, str):
            runs.append(("￼", {}))  # a picture on the line: not a title
            continue
        parts = insert.split("\n")
        for i, part in enumerate(parts):
            if part:
                runs.append((part, attrs))
            if i < len(parts) - 1:
                text = "".join(t for t, _ in runs).strip()
                level = attrs.get("header")
                written = [a for t, a in runs if t.strip()]
                bold_line = bool(written) and all(a.get("bold") for a in written)
                if text and "￼" not in text and not attrs.get("list"):
                    if level in (1, 2, 3):
                        out.append({"level": level, "text": text[:200]})
                    elif bold_line and len(text.split()) <= BOLD_HEADING_MAX_WORDS:
                        out.append({"level": 2, "text": text[:200]})
                runs = []
    return out


def word_count(ops):
    return len(plain_text(ops).split())


def paragraphs_to_ops(paragraphs):
    """Build a Delta from [(runs, block_attrs)] where runs is [(text, inline_attrs)].

    A run's text may also be an embed such as {"image": url}.
    """
    ops = []
    for runs, block_attrs in paragraphs:
        for text, attrs in runs:
            if isinstance(text, dict):
                ops.append(_op(text, attrs or None))
            elif text:
                ops.append(_op(text.replace("\n", " "), attrs or None))
        ops.append(_op("\n", block_attrs or None))
    return normalize(ops)
