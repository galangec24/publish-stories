// Renders a Quill Delta (the format the Story Studio saves) as React elements.
// Built from elements rather than innerHTML so story text can never inject markup.

import { FONT_FAMILIES, IMAGE_WIDTHS, TEXT_SIZES } from './fonts'

const WIDTHS = IMAGE_WIDTHS.map((w) => w.value)

function splitLines(ops) {
  const lines = []
  let runs = []
  for (const op of ops || []) {
    const { insert, attributes } = op
    if (typeof insert !== 'string') {
      // Images uploaded in the Studio: {insert: {image: url}} on a line of their own.
      if (insert && typeof insert.image === 'string' && /^(https?:\/\/|\/api\/media\/)/.test(insert.image)) {
        runs.push({ image: insert.image, attrs: attributes || {} })
      }
      continue
    }
    const parts = insert.split('\n')
    parts.forEach((part, i) => {
      if (part) runs.push({ text: part, attrs: attributes || {} })
      if (i < parts.length - 1) {
        lines.push({ runs, block: attributes || {} })
        runs = []
      }
    })
  }
  if (runs.length) lines.push({ runs, block: {} })
  return lines
}

function Run({ text, image, attrs }) {
  if (image) {
    const width = WIDTHS.includes(attrs.width) ? attrs.width : undefined
    return <img src={image} alt={attrs.alt || ''} loading="lazy" decoding="async" className="story-image" style={width ? { width } : undefined} />
  }
  let node = text
  if (attrs.bold) node = <strong>{node}</strong>
  if (attrs.italic) node = <em>{node}</em>
  if (attrs.underline) node = <u>{node}</u>
  if (attrs.strike) node = <s>{node}</s>
  // Font and size chosen in the Studio for this text (only known values are applied).
  const font = FONT_FAMILIES.includes(attrs.font) ? `'${attrs.font}', serif` : undefined
  const size = TEXT_SIZES.includes(attrs.size) ? attrs.size : undefined
  if (font || size) node = <span style={{ fontFamily: font, fontSize: size }}>{node}</span>
  if (typeof attrs.link === 'string' && /^https?:\/\//.test(attrs.link)) {
    node = (
      <a href={attrs.link} target="_blank" rel="noreferrer noopener" className="text-brand underline">
        {node}
      </a>
    )
  }
  return node
}

function Line({ line, anchor }) {
  const { header, blockquote, align } = line.block
  const style = align ? { textAlign: align } : undefined
  const content = line.runs.length ? line.runs.map((r, i) => <Run key={i} {...r} />) : <br />
  if (line.runs.length && line.runs.every((r) => r.image)) {
    return (
      <figure className="story-figure" style={{ textAlign: align || 'center' }}>
        {content}
      </figure>
    )
  }
  if (header === 1) return <h1 id={anchor} style={style}>{content}</h1>
  if (header === 2) return <h2 id={anchor} style={style}>{content}</h2>
  if (header === 3) return <h3 id={anchor} style={style}>{content}</h3>
  if (blockquote) return <blockquote id={anchor} style={style}>{content}</blockquote>
  return <p id={anchor} style={style}>{content}</p>
}

/**
 * Is this line a title or section? Heading 1-3, or a short line that is entirely bold
 * (authors often bold a title instead of using a heading style). Returns its level, or 0.
 */
function sectionLevel(line) {
  if (line.block.list || !line.runs.length || line.runs.some((r) => r.image)) return 0
  const text = line.runs.map((r) => r.text || '').join('').trim()
  if (!text) return 0
  if ([1, 2, 3].includes(line.block.header)) return line.block.header
  const written = line.runs.filter((r) => r.text?.trim())
  const bold = written.length > 0 && written.every((r) => r.attrs.bold)
  return bold && text.split(/\s+/).length <= 15 ? 2 : 0
}

/** `fontFamily` / `fontSize` set the story's default reading typography. */
export function DeltaView({ ops, fontFamily, fontSize }) {
  const lines = splitLines(ops)
  const blocks = []
  let section = 0
  for (let i = 0; i < lines.length; i++) {
    const list = lines[i].block.list
    if (list === 'bullet' || list === 'ordered') {
      const items = []
      while (i < lines.length && lines[i].block.list === list) {
        items.push(<li key={i}>{lines[i].runs.map((r, j) => <Run key={j} {...r} />)}</li>)
        i++
      }
      i--
      blocks.push(list === 'bullet' ? <ul key={`l${i}`}>{items}</ul> : <ol key={`l${i}`}>{items}</ol>)
    } else if (lines[i].runs.length || lines[i].block.header) {
      blocks.push(<Line key={i} line={lines[i]} anchor={sectionLevel(lines[i]) ? `sec-${section++}` : undefined} />)
    }
  }
  return (
    <div className="prose-story" style={{ fontFamily, fontSize: fontSize ? `${fontSize}px` : undefined }}>
      {blocks}
    </div>
  )
}

/**
 * Titles, subtitles and sections inside a chapter (Heading 1-3), in order, with the anchor id
 * DeltaView gives each one: [{ id: "sec-0", level: 1, text: "Part One" }, ...].
 */
export function chapterHeadings(ops) {
  const out = []
  for (const line of splitLines(ops)) {
    const level = sectionLevel(line)
    if (level) out.push({ id: `sec-${out.length}`, level, text: line.runs.map((r) => r.text || '').join('').trim() })
  }
  return out
}

/** The chapter as plain text (pictures dropped), e.g. for reading it aloud. */
export function plainText(ops) {
  return (ops || []).map((op) => (typeof op.insert === 'string' ? op.insert : ' ')).join('')
}

export function wordCount(text) {
  return (text.match(/\S+/g) || []).length
}
