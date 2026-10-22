// Reading fonts an author can choose. `id` is what the API stores for the
// story's default font; `family` is the CSS font name, which is also what the
// editor stores for fonts applied to selected text.
export const FONTS = [
  { id: 'literata', label: 'Literata', family: 'Literata', kind: 'Serif · easy on the eyes' },
  { id: 'lora', label: 'Lora', family: 'Lora', kind: 'Serif · warm, literary' },
  { id: 'merriweather', label: 'Merriweather', family: 'Merriweather', kind: 'Serif · sturdy, screen-friendly' },
  { id: 'playfair', label: 'Playfair Display', family: 'Playfair Display', kind: 'Serif · elegant, dramatic' },
  { id: 'source_serif', label: 'Source Serif', family: 'Source Serif 4', kind: 'Serif · classic book' },
  { id: 'inter', label: 'Inter', family: 'Inter', kind: 'Sans-serif · modern, clean' },
  { id: 'nunito', label: 'Nunito', family: 'Nunito', kind: 'Sans-serif · rounded, friendly' },
]

export const FONT_FAMILIES = FONTS.map((f) => f.family)

/** CSS font-family stack for a story's default font id. */
export function fontStack(id) {
  const font = FONTS.find((f) => f.id === id) || FONTS[0]
  const serif = !font.kind.startsWith('Sans')
  return `'${font.family}', ${serif ? 'Georgia, serif' : 'system-ui, sans-serif'}`
}

/** Sizes for selected text in the Studio (stored as e.g. "20px"). */
export const TEXT_SIZES = ['14px', '16px', '18px', '20px', '24px', '28px', '32px', '40px']

/** Allowed image widths in stories (stored on the image as "50%"). */
export const IMAGE_WIDTHS = [
  { value: '33%', label: 'Small' },
  { value: '50%', label: 'Medium' },
  { value: '75%', label: 'Large' },
  { value: '100%', label: 'Full width' },
]

// Fonts for the story title and chapter titles (id stored as story.title_font).
export const TITLE_FONTS = [
  { id: 'fraunces', label: 'Fraunces', family: 'Fraunces' },
  { id: 'playfair', label: 'Playfair Display', family: 'Playfair Display' },
  { id: 'lora', label: 'Lora', family: 'Lora' },
  { id: 'merriweather', label: 'Merriweather', family: 'Merriweather' },
  { id: 'literata', label: 'Literata', family: 'Literata' },
  { id: 'source_serif', label: 'Source Serif', family: 'Source Serif 4' },
  { id: 'inter', label: 'Inter', family: 'Inter' },
  { id: 'nunito', label: 'Nunito', family: 'Nunito' },
]

export function titleStack(id) {
  const font = TITLE_FONTS.find((f) => f.id === id) || TITLE_FONTS[0]
  return `'${font.family}', Georgia, serif`
}
