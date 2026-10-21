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
        if "attributes" in op and not isinstance(op["attributes"], dict):
            raise ValueError("'attributes' must be an object.")


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


def word_count(ops):
    return len(plain_text(ops).split())


def _has_content(ops, start):
    for op in ops[start:]:
        insert = op.get("insert")
        if not isinstance(insert, str) or insert.strip():
            return True
    return False


def truncate_paragraphs(ops, limit):
    """Keep the first `limit` non-empty lines of a Delta.

    Returns (kept_ops, paragraphs_used, truncated) where `truncated` is True
    when meaningful content was cut off.
    """
    if limit <= 0:
        return [], 0, _has_content(ops, 0)

    kept, count, line_has_text = [], 0, False
    for index, op in enumerate(ops):
        insert, attrs = op.get("insert"), op.get("attributes")
        if not isinstance(insert, str):
            kept.append(op)
            line_has_text = True
            continue
        pieces = insert.split("\n")
        buffer = []
        for i, piece in enumerate(pieces):
            if piece:
                buffer.append(piece)
                if piece.strip():
                    line_has_text = True
            if i == len(pieces) - 1:
                break
            buffer.append("\n")
            if line_has_text:
                count += 1
            line_has_text = False
            if count >= limit:
                kept.append(_op("".join(buffer), attrs))
                rest = "\n".join(pieces[i + 1 :])
                truncated = bool(rest.strip()) or _has_content(ops, index + 1)
                return kept, count, truncated
        if buffer:
            kept.append(_op("".join(buffer), attrs))
    return normalize(kept), count, False


def paragraphs_to_ops(paragraphs):
    """Build a Delta from [(runs, block_attrs)] where runs is [(text, inline_attrs)]."""
    ops = []
    for runs, block_attrs in paragraphs:
        for text, attrs in runs:
            if text:
                ops.append(_op(text.replace("\n", " "), attrs or None))
        ops.append(_op("\n", block_attrs or None))
    return normalize(ops)
