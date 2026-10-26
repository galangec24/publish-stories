import { Check, ChevronDown, Lock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

/**
 * "Jump to" menu: chapters with their sections. Drawn inside the page (not the browser's own
 * dropdown, which opens as a separate window where the screenshot guard can't see key presses
 * or the Snipping Tool taking focus).
 *
 * `items`: [{ key, label, level (0 = chapter), locked, read, current, onPick }]
 */
export function JumpMenu({ label, items }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const box = useRef(null)
  const list = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => !box.current?.contains(e.target) && setOpen(false)
    document.addEventListener('pointerdown', close)
    setActive(Math.max(0, items.findIndex((i) => i.current)))
    return () => document.removeEventListener('pointerdown', close)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open && active >= 0) list.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  function pick(item) {
    setOpen(false)
    item.onPick()
  }

  function onKeyDown(e) {
    if (!open && ['ArrowDown', 'Enter', ' '].includes(e.key)) {
      e.preventDefault()
      setOpen(true)
    } else if (open && e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, items.length - 1))
    } else if (open && e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (open && e.key === 'Enter' && items[active]) {
      e.preventDefault()
      pick(items[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={box} className="relative mb-3 flex items-center gap-2 text-sm">
      <span className="shrink-0 text-muted">Jump to</span>
      <button
        type="button"
        className="input flex !py-2 items-center justify-between gap-2 text-left"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul ref={list} role="listbox" className="card absolute top-full right-0 left-14 z-30 mt-1 max-h-80 overflow-y-auto p-1 shadow-2xl">
          {items.map((item, i) => (
            <li key={item.key} role="option" aria-selected={item.current}>
              <button
                type="button"
                onClick={() => pick(item)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-2 rounded-lg py-1.5 pr-3 text-left transition ${i === active ? 'bg-surface-2' : ''} ${
                  item.current ? 'text-brand' : item.level ? 'text-muted' : 'text-ink'
                } ${item.level ? 'text-xs' : 'font-semibold'}`}
                style={{ paddingLeft: 10 + item.level * 14 }}
              >
                {!item.level && (
                  <span className="grid w-4 shrink-0 place-items-center">
                    {item.locked ? (
                      <Lock className="h-3.5 w-3.5 text-amber-400" />
                    ) : item.read ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : null}
                  </span>
                )}
                <span className="truncate">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
