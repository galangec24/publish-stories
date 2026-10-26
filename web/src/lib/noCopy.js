// Readers can't select, copy, cut or drag the site's text (PC and phone). Form fields still
// work normally, so a payment reference or a comment can be typed or pasted in.
const EDITABLE = 'input, textarea, select, [contenteditable="true"], .ql-editor'

function inField(target) {
  return Boolean(target?.closest?.(EDITABLE))
}

export function startNoCopy() {
  document.body.classList.add('no-copy')
  const block = (e) => {
    if (!inField(e.target)) e.preventDefault()
  }
  const onKey = (e) => {
    const key = e.key?.toLowerCase()
    if ((e.ctrlKey || e.metaKey) && ['c', 'x', 'a'].includes(key) && !inField(e.target)) e.preventDefault()
  }
  const events = ['copy', 'cut', 'contextmenu', 'selectstart', 'dragstart']
  events.forEach((name) => document.addEventListener(name, block))
  document.addEventListener('keydown', onKey)
  return () => {
    document.body.classList.remove('no-copy')
    events.forEach((name) => document.removeEventListener(name, block))
    document.removeEventListener('keydown', onKey)
  }
}
