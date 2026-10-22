"""Turn uploaded manuscripts (.docx, .md, .txt) into stories made of Delta chapters.

How chapters are split (`split`):
  auto           the natural break for each format: Word "Heading 1", Markdown "# ",
                 and lines like "Chapter 3" / "Kabanata 3" / "Part II" in text files
  headings       Word "Heading 1" / Markdown "# " only
  chapter_lines  paragraphs that look like "Chapter 3", "Kabanata 3", "Part II",
                 "Bahagi 2", "Prologue", "Epilogue" (any format)
  page_breaks    Word page breaks (.docx only)
  none           everything in one chapter
Headings that don't start a chapter are kept as headings in the text.

Word pictures are kept as images on their own line (saved through `save_image`,
which returns the image URL; without it, as in a preview, they are only counted).
The "Title" style becomes the story title; Markdown front matter between ---
lines supplies title, author, synopsis and genres. Text before the first break
becomes an opening chapter, and untitled chapters are named "Chapter N".
"""
import io
import re
from dataclasses import dataclass, field
from pathlib import PurePath

from . import delta

SUPPORTED_EXTENSIONS = {".docx", ".md", ".markdown", ".txt"}
SPLIT_MODES = ("auto", "headings", "chapter_lines", "page_breaks", "none")
SCENE_BREAK = [([("* * *", None)], {"align": "center"})]
MAX_IMAGES = 60
_CHAPTER_LINE = re.compile(r"^(chapter|kabanata|part|bahagi|prologue|epilogue)\b.{0,70}$", re.I)


class ManuscriptError(Exception):
    pass


@dataclass
class ImportedChapter:
    title: str
    content: list
    images: int = 0


@dataclass
class ImportedStory:
    title: str
    synopsis: str = ""
    author_name: str = ""
    genres: list = field(default_factory=list)
    chapters: list = field(default_factory=list)
    image_count: int = 0


def is_chapter_line(text):
    return bool(_CHAPTER_LINE.match(text.strip()))


class _Builder:
    """Accumulates paragraphs and splits them into chapters according to `split`."""

    def __init__(self, split):
        self.split = split
        self.chapters = [["", [], 0]]  # [title, paragraphs, pictures counted but not stored]

    def start_chapter(self, title):
        self.chapters.append([title.strip(), [], 0])

    def note_image(self):
        """A picture seen during a preview: counted, not inserted."""
        self.chapters[-1][2] += 1

    def add(self, runs, block_attrs=None):
        self.chapters[-1][1].append((runs, block_attrs))

    def heading(self, text, natural):
        """A top-level heading. `natural` = this format's own chapter marker."""
        if self.split == "headings" or (self.split == "auto" and natural):
            self.start_chapter(text)
        elif self.split == "chapter_lines" and is_chapter_line(text):
            self.start_chapter(text)
        else:
            self.add([(text, None)], {"header": 1})

    def paragraph(self, runs, block_attrs=None, text=""):
        """A normal paragraph; in chapter_lines mode a "Chapter 3" line starts a chapter."""
        if self.split == "chapter_lines" and text and is_chapter_line(text) and not block_attrs:
            self.start_chapter(text)
        else:
            self.add(runs, block_attrs)

    def page_break(self):
        if self.split == "page_breaks" and (self.chapters[-1][1] or self.chapters[-1][2]):
            self.start_chapter("")

    def build(self):
        result = []
        for title, paragraphs, counted in self.chapters:
            has_content = counted or any(
                isinstance(text, dict) or text.strip() for runs, _ in paragraphs for text, _ in runs
            )
            if not has_content and not title:
                continue
            images = counted + sum(1 for runs, _ in paragraphs for text, _ in runs if isinstance(text, dict))
            result.append(ImportedChapter(title=title, content=delta.paragraphs_to_ops(paragraphs), images=images))
        for n, chapter in enumerate(result, start=1):
            chapter.title = chapter.title or f"Chapter {n}"
        return result or [ImportedChapter(title="Chapter 1", content=delta.empty_document())]


def import_manuscript(filename, data, split="auto", save_image=None):
    ext = PurePath(filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise ManuscriptError(f"Unsupported file type '{ext}'. Use .docx, .md or .txt.")
    if split not in SPLIT_MODES:
        raise ManuscriptError(f"Unknown chapter split '{split}'.")
    fallback_title = PurePath(filename).stem.replace("_", " ").replace("-", " ").strip().title() or "Untitled"
    if ext == ".docx":
        story = _import_docx(data, split, save_image)
    else:
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = data.decode("cp1252", errors="replace")
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        story = _import_markdown(text, split) if ext in {".md", ".markdown"} else _import_text(text, split)
    story.title = (story.title or fallback_title).strip()[:200]
    story.image_count = sum(c.images for c in story.chapters)
    return story


# --- .docx -----------------------------------------------------------------

_DOCX_ALIGN = {1: "center", 2: "right", 3: "justify"}
_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
_R_EMBED = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed"


def _run_images(run):
    """Relationship ids of pictures inside a run (inline or floating)."""
    return [blip.get(_R_EMBED) for blip in run._r.iter("{http://schemas.openxmlformats.org/drawingml/2006/main}blip") if blip.get(_R_EMBED)]


def _run_has_page_break(run):
    return any(br.get(f"{_W}type") == "page" for br in run._r.iter(f"{_W}br"))


def _import_docx(data, split, save_image):
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
    builder = _Builder(split)
    parts = document.part.related_parts
    images_seen = 0

    for paragraph in document.paragraphs:
        style = (paragraph.style.name if paragraph.style is not None else "") or ""
        text = paragraph.text.strip()
        p_pr = paragraph._p.pPr
        if p_pr is not None and p_pr.find(f"{_W}pageBreakBefore") is not None:
            builder.page_break()
        if style == "Title":
            if text and not story.title:
                story.title = text
            continue
        if style == "Subtitle" and text and not story.synopsis:
            story.synopsis = text
            continue
        if style == "Heading 1" and text:
            builder.heading(text, natural=True)
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

        runs, pictures, breaks_after = [], [], False
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
            if run.text:
                runs.append((run.text, attrs))
            for rel_id in _run_images(run):
                if images_seen >= MAX_IMAGES or rel_id not in parts:
                    continue
                images_seen += 1
                if save_image is None:
                    pictures.append(None)  # preview: count only
                    continue
                url = save_image(parts[rel_id].blob)
                if url:
                    pictures.append(url)
            if _run_has_page_break(run):
                breaks_after = True

        if text or block:
            builder.paragraph(runs, block, text if not block else "")
        # Pictures go on their own centred line after the paragraph's text.
        for url in pictures:
            if url is None:
                builder.note_image()
            else:
                builder.add([({"image": url}, None)], {"align": "center"})
        if breaks_after:
            builder.page_break()
    story.chapters = builder.build()
    return story


def _has_numbering(paragraph):
    p_pr = paragraph._p.pPr
    return p_pr is not None and p_pr.numPr is not None


# --- Markdown --------------------------------------------------------------

_INLINE = re.compile(r"(\*\*[^*]+?\*\*|__[^_]+?__|~~[^~]+?~~|\*[^*\s][^*]*?\*|_[^_\s][^_]*?_)")
_MD_IMAGE = re.compile(r"^!\[[^\]]*\]\((https?://[^)\s]+)\)$")


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


def _import_markdown(text, split):
    story = ImportedStory(title="")
    text = _parse_front_matter(text, story)
    builder = _Builder(split)
    paragraph = []

    def flush():
        if paragraph:
            joined = " ".join(paragraph)
            builder.paragraph(_inline_runs(joined), None, joined)
            paragraph.clear()

    for raw in text.split("\n"):
        line = raw.strip()
        if not line:
            flush()
            continue
        if line.startswith("# "):
            flush()
            builder.heading(line[2:], natural=True)
            continue
        image = _MD_IMAGE.match(line)
        heading = re.match(r"^(#{2,3})\s+(.*)$", line)
        bullet = re.match(r"^[-*+]\s+(.*)$", line)
        ordered = re.match(r"^\d+[.)]\s+(.*)$", line)
        if image:
            flush()
            builder.add([({"image": image.group(1)}, None)], {"align": "center"})
        elif heading:
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


def _import_text(text, split):
    story = ImportedStory(title="")
    lines = text.split("\n")
    if lines and lines[0].lower().startswith("title:"):
        story.title = lines.pop(0).split(":", 1)[1].strip()
    builder = _Builder(split)
    for block in re.split(r"\n\s*\n", "\n".join(lines)):
        block_lines = [line.strip() for line in block.split("\n") if line.strip()]
        if not block_lines:
            continue
        if is_chapter_line(block_lines[0]):
            title = block_lines.pop(0)
            if split in ("auto", "chapter_lines"):
                builder.start_chapter(title)
            else:
                builder.add([(title, None)], {"header": 2})
            if not block_lines:
                continue
        if all(set(line) <= set("*-_ ") for line in block_lines):
            for runs, attrs in SCENE_BREAK:
                builder.add(runs, attrs)
            continue
        builder.add([(" ".join(block_lines), None)])
    story.chapters = builder.build()
    return story
