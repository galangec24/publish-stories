"""Turn uploaded manuscripts (.docx, .md, .txt) into stories made of Delta chapters.

Chapter boundaries:
  .docx  "Heading 1" paragraphs (the "Title" style becomes the story title)
  .md    "# " headings; optional front matter between --- lines supplies
         title, author, synopsis and genres (comma separated)
  .txt   lines such as "Chapter 3", "Kabanata 3", "Part II" or "Bahagi 2"
Text before the first boundary becomes an opening chapter. Chapters without
a title are named "Chapter N".
"""
import io
import re
from dataclasses import dataclass, field
from pathlib import PurePath

from . import delta

SUPPORTED_EXTENSIONS = {".docx", ".md", ".markdown", ".txt"}
SCENE_BREAK = [([("* * *", None)], {"align": "center"})]


class ManuscriptError(Exception):
    pass


@dataclass
class ImportedChapter:
    title: str
    content: list


@dataclass
class ImportedStory:
    title: str
    synopsis: str = ""
    author_name: str = ""
    genres: list = field(default_factory=list)
    chapters: list = field(default_factory=list)


class _Builder:
    """Accumulates paragraphs and splits them into chapters."""

    def __init__(self):
        self.chapters = [["", []]]

    def start_chapter(self, title):
        self.chapters.append([title.strip(), []])

    def add(self, runs, block_attrs=None):
        self.chapters[-1][1].append((runs, block_attrs))

    def build(self):
        result = []
        for title, paragraphs in self.chapters:
            has_text = any(text.strip() for runs, _ in paragraphs for text, _ in runs)
            if not has_text and not title:
                continue
            result.append(ImportedChapter(title=title, content=delta.paragraphs_to_ops(paragraphs)))
        for n, chapter in enumerate(result, start=1):
            chapter.title = chapter.title or f"Chapter {n}"
        return result or [ImportedChapter(title="Chapter 1", content=delta.empty_document())]


def import_manuscript(filename, data):
    ext = PurePath(filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise ManuscriptError(f"Unsupported file type '{ext}'. Use .docx, .md or .txt.")
    fallback_title = PurePath(filename).stem.replace("_", " ").replace("-", " ").strip().title() or "Untitled"
    if ext == ".docx":
        story = _import_docx(data)
    else:
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = data.decode("cp1252", errors="replace")
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        story = _import_markdown(text) if ext in {".md", ".markdown"} else _import_text(text)
    story.title = (story.title or fallback_title).strip()[:200]
    return story


# --- .docx -----------------------------------------------------------------

_DOCX_ALIGN = {1: "center", 2: "right", 3: "justify"}


def _import_docx(data):
    try:
        import docx
    except ImportError as exc:  # pragma: no cover - dependency is in requirements.txt
        raise ManuscriptError("python-docx is not installed") from exc
    try:
        document = docx.Document(io.BytesIO(data))
    except Exception as exc:
        raise ManuscriptError("Could not read this .docx file. Is it a valid Word document?") from exc

    story = ImportedStory(title=(document.core_properties.title or "").strip())
    story.author_name = (document.core_properties.author or "").strip()
    builder = _Builder()
    for paragraph in document.paragraphs:
        style = (paragraph.style.name if paragraph.style is not None else "") or ""
        text = paragraph.text.strip()
        if style == "Title":
            if text and not story.title:
                story.title = text
            continue
        if style == "Subtitle" and text and not story.synopsis:
            story.synopsis = text
            continue
        if style == "Heading 1":
            builder.start_chapter(text)
            continue

        block = {}
        heading = re.match(r"Heading ([2-3])$", style)
        if heading:
            block["header"] = int(heading.group(1))
        elif style.startswith("List Number"):
            block["list"] = "ordered"
        elif style.startswith("List Bullet") or _has_numbering(paragraph):
            block["list"] = "bullet"
        elif style in {"Quote", "Intense Quote"}:
            block["blockquote"] = True
        if paragraph.alignment is not None and int(paragraph.alignment) in _DOCX_ALIGN:
            block["align"] = _DOCX_ALIGN[int(paragraph.alignment)]

        runs = []
        for run in paragraph.runs:
            attrs = {}
            if run.bold:
                attrs["bold"] = True
            if run.italic:
                attrs["italic"] = True
            if run.underline:
                attrs["underline"] = True
            if run.font is not None and run.font.strike:
                attrs["strike"] = True
            runs.append((run.text, attrs))
        if not text and not block:
            continue  # Word uses empty paragraphs for spacing; Delta lines don't need them.
        builder.add(runs, block)
    story.chapters = builder.build()
    return story


def _has_numbering(paragraph):
    p_pr = paragraph._p.pPr
    return p_pr is not None and p_pr.numPr is not None


# --- Markdown --------------------------------------------------------------

_INLINE = re.compile(r"(\*\*[^*]+?\*\*|__[^_]+?__|~~[^~]+?~~|\*[^*\s][^*]*?\*|_[^_\s][^_]*?_)")


def _inline_runs(text):
    runs = []
    for piece in _INLINE.split(text):
        if not piece:
            continue
        if piece[:2] in ("**", "__") and len(piece) > 4:
            runs.append((piece[2:-2], {"bold": True}))
        elif piece.startswith("~~") and len(piece) > 4:
            runs.append((piece[2:-2], {"strike": True}))
        elif piece[0] in "*_" and piece[-1] == piece[0] and len(piece) > 2:
            runs.append((piece[1:-1], {"italic": True}))
        else:
            runs.append((piece, None))
    return runs


def _parse_front_matter(text, story):
    match = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not match:
        return text
    for line in match.group(1).splitlines():
        key, _, value = line.partition(":")
        key, value = key.strip().lower(), value.strip().strip("\"'")
        if key == "title":
            story.title = value
        elif key in {"author", "author_name"}:
            story.author_name = value
        elif key in {"synopsis", "description", "summary"}:
            story.synopsis = value
        elif key in {"genres", "genre", "tags"}:
            story.genres = [g.strip().strip("[]\"'") for g in value.strip("[]").split(",") if g.strip()]
    return text[match.end() :]


def _import_markdown(text):
    story = ImportedStory(title="")
    text = _parse_front_matter(text, story)
    builder = _Builder()
    paragraph = []

    def flush():
        if paragraph:
            builder.add(_inline_runs(" ".join(paragraph)))
            paragraph.clear()

    for raw in text.split("\n"):
        line = raw.strip()
        if not line:
            flush()
            continue
        if line.startswith("# "):
            flush()
            builder.start_chapter(line[2:])
            continue
        heading = re.match(r"^(#{2,3})\s+(.*)$", line)
        bullet = re.match(r"^[-*+]\s+(.*)$", line)
        ordered = re.match(r"^\d+[.)]\s+(.*)$", line)
        if heading:
            flush()
            builder.add(_inline_runs(heading.group(2)), {"header": len(heading.group(1))})
        elif re.match(r"^(\*\s*){3,}$|^(-\s*){3,}$|^(_\s*){3,}$", line):
            flush()
            for runs, attrs in SCENE_BREAK:
                builder.add(runs, attrs)
        elif bullet:
            flush()
            builder.add(_inline_runs(bullet.group(1)), {"list": "bullet"})
        elif ordered:
            flush()
            builder.add(_inline_runs(ordered.group(1)), {"list": "ordered"})
        elif line.startswith(">"):
            flush()
            builder.add(_inline_runs(line.lstrip("> ")), {"blockquote": True})
        else:
            paragraph.append(line)
    flush()
    story.chapters = builder.build()
    return story


# --- Plain text ------------------------------------------------------------

_CHAPTER_LINE = re.compile(r"^(chapter|kabanata|part|bahagi|prologue|epilogue)\b.{0,70}$", re.I)


def _import_text(text):
    story = ImportedStory(title="")
    lines = text.split("\n")
    if lines and lines[0].lower().startswith("title:"):
        story.title = lines.pop(0).split(":", 1)[1].strip()
    builder = _Builder()
    for block in re.split(r"\n\s*\n", "\n".join(lines)):
        block_lines = [line.strip() for line in block.split("\n") if line.strip()]
        if not block_lines:
            continue
        if _CHAPTER_LINE.match(block_lines[0]):
            builder.start_chapter(block_lines.pop(0))
            if not block_lines:
                continue
        if all(set(line) <= set("*-_ ") for line in block_lines):
            for runs, attrs in SCENE_BREAK:
                builder.add(runs, attrs)
            continue
        builder.add([(" ".join(block_lines), None)])
    story.chapters = builder.build()
    return story
