import 'quill/dist/quill.core.css'

import Quill from 'quill'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { Field, GenreChips, Spinner, useToast } from '../../components/ui'
import { api, ApiError } from '../../lib/api'
import { wordCount } from '../../lib/delta'

const AUTOSAVE_MS = 2000

/**
 * Word-style editor for one story.
 *
 *  title bar   story title · Draft/Published · save status · Story settings · Publish
 *  ribbon      Home | Insert | View | Review tabs with grouped commands
 *  body        navigation pane (chapters + headings) │ paper page with the editor
 *  status bar  chapter n of m · words · zoom
 */
export function StoryStudio() {
  const { id } = useParams()
  const toast = useToast()
  const editorEl = useRef(null)
  const quill = useRef(null)
  const chapterRef = useRef({ id: null, revision: 1 })
  const timer = useRef()
  const dirtyRef = useRef(false)

  const [story, setStory] = useState(null)
  const [chapters, setChapters] = useState([])
  const [genres, setGenres] = useState([])
  const [columns, setColumns] = useState([])
  const [chapterId, setChapterId] = useState(null)
  const [saveState, setSaveState] = useState('saved') // saved | dirty | saving | error
  const [format, setFormat] = useState({})
  const [tab, setTab] = useState('home')
  const [navOpen, setNavOpen] = useState(() => window.innerWidth >= 900)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [headings, setHeadings] = useState([])
  const [words, setWords] = useState(0)
  const [conflict, setConflict] = useState(null)
  const [dialog, setDialog] = useState(null) // { title, label, value, resolve }

  const ask = (title, label, value = '') => new Promise((resolve) => setDialog({ title, label, value, resolve }))

  // ------------------------------------------------------------ editor setup
  useEffect(() => {
    // Own host element per mount so StrictMode's double effect doesn't stack two editors.
    const host = document.createElement('div')
    editorEl.current.appendChild(host)
    const q = new Quill(host, {
      placeholder: 'Start writing your story…',
      modules: { toolbar: false, history: { delay: 1000, maxStack: 500, userOnly: true } },
    })
    quill.current = q
    const refreshUi = () => {
      setFormat(q.getSelection() ? q.getFormat() : {})
    }
    q.on('selection-change', refreshUi)
    q.on('text-change', (_delta, _old, source) => {
      refreshUi()
      setHeadings(extractHeadings(q.getContents().ops))
      setWords(wordCount(q.getText()))
      if (source !== 'user') return
      dirtyRef.current = true
      setSaveState('dirty')
      clearTimeout(timer.current)
      timer.current = setTimeout(() => save(), AUTOSAVE_MS)
    })
    return () => {
      clearTimeout(timer.current)
      host.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ------------------------------------------------------------------- data
  const reloadStory = useCallback(async () => {
    const data = await api.get(`admin/stories/${id}/`)
    setStory(data)
    setChapters(data.chapters)
    return data
  }, [id])

  useEffect(() => {
    Promise.all([reloadStory(), api.get('admin/genres/'), api.get('admin/columns/')])
      .then(([data, g, c]) => {
        setGenres(g)
        setColumns(c)
        if (data.chapters.length) openChapter(data.chapters[0].id, true)
      })
      .catch((e) => toast(e, 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Warn before leaving with unsaved edits; Ctrl+S / Ctrl+F shortcuts.
  useEffect(() => {
    const beforeUnload = (e) => {
      if (dirtyRef.current) e.preventDefault()
    }
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault()
        save()
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        find()
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      window.removeEventListener('keydown', onKey)
    }
  })

  async function save() {
    const { id: chId, revision } = chapterRef.current
    if (!chId || !quill.current) return true
    clearTimeout(timer.current)
    dirtyRef.current = false
    setSaveState('saving')
    try {
      const data = await api.patch(`admin/chapters/${chId}/`, { content: quill.current.getContents().ops, revision })
      chapterRef.current.revision = data.revision
      setChapters((list) => list.map((c) => (c.id === chId ? { ...c, ...pick(data) } : c)))
      setSaveState(dirtyRef.current ? 'dirty' : 'saved')
      return true
    } catch (e) {
      dirtyRef.current = true
      setSaveState('error')
      if (e instanceof ApiError && e.status === 409) {
        setConflict(e.body.current)
        return false
      }
      toast(`Not saved: ${e.message}`, 'error')
      return false
    }
  }

  const flush = async () => (dirtyRef.current ? save() : true)

  async function openChapter(chId, force = false) {
    if (!force && chId === chapterRef.current.id) return
    if (!(await flush())) return
    try {
      const data = await api.get(`admin/chapters/${chId}/`)
      chapterRef.current = { id: chId, revision: data.revision }
      quill.current.setContents(data.content, 'silent')
      quill.current.history.clear()
      setHeadings(extractHeadings(data.content))
      setWords(wordCount(quill.current.getText()))
      setChapterId(chId)
      setSaveState('saved')
      dirtyRef.current = false
    } catch (e) {
      toast(e, 'error')
    }
  }

  async function resolveConflict(keepMine) {
    const current = conflict
    setConflict(null)
    chapterRef.current.revision = current.revision
    if (keepMine) {
      await save()
    } else {
      dirtyRef.current = false
      await openChapter(current.id, true)
    }
  }

  // --------------------------------------------------------------- chapters
  async function addChapter({ order, content, title } = {}) {
    const name = title ?? (await ask('New chapter', 'Chapter title', `Chapter ${chapters.length + 1}`))
    if (!name) return
    try {
      const created = await api.post(`admin/stories/${id}/chapters/`, {
        title: name,
        ...(order !== undefined && { order }),
        ...(content && { content }),
      })
      await reloadStory()
      await openChapter(created.id)
    } catch (e) {
      toast(e, 'error')
    }
  }

  async function renameChapter(ch) {
    const name = await ask('Rename chapter', 'Chapter title', ch.title)
    if (!name) return
    const isCurrent = ch.id === chapterRef.current.id
    if (isCurrent && !(await flush())) return
    try {
      const data = await api.patch(`admin/chapters/${ch.id}/`, {
        title: name,
        revision: isCurrent ? chapterRef.current.revision : ch.revision,
      })
      if (isCurrent) chapterRef.current.revision = data.revision
      setChapters((list) => list.map((c) => (c.id === ch.id ? { ...c, ...pick(data) } : c)))
    } catch (e) {
      toast(e, 'error')
    }
  }

  async function deleteChapter(ch) {
    if (!window.confirm(`Delete "${ch.title}"? Its text will be removed permanently.`)) return
    try {
      await api.delete(`admin/chapters/${ch.id}/`)
      const wasCurrent = ch.id === chapterRef.current.id
      if (wasCurrent) {
        dirtyRef.current = false
        chapterRef.current = { id: null, revision: 1 }
      }
      const data = await reloadStory()
      if (wasCurrent && data.chapters.length) await openChapter(data.chapters[0].id, true)
    } catch (e) {
      toast(e, 'error')
    }
  }

  const dragFrom = useRef(null)
  async function dropChapter(toIndex) {
    const from = dragFrom.current
    dragFrom.current = null
    if (from === null || from === toIndex) return
    const list = [...chapters]
    list.splice(toIndex, 0, list.splice(from, 1)[0])
    setChapters(list)
    try {
      await api.post(`admin/stories/${id}/chapters/reorder/`, { order: list.map((c) => c.id) })
    } catch (e) {
      toast(e, 'error')
      reloadStory()
    }
  }

  /** Insert ▸ Split here: everything after the cursor becomes a new chapter. */
  async function splitHere() {
    const q = quill.current
    const sel = q.getSelection(true)
    const length = q.getLength()
    if (!sel || sel.index <= 0 || sel.index >= length - 1) {
      toast('Put the cursor inside the text where the new chapter should start.')
      return
    }
    const title = await ask('Split chapter', 'Title of the new chapter', `Chapter ${chapters.length + 1}`)
    if (!title) return
    const tail = q.getContents(sel.index, length - sel.index).ops
    q.deleteText(sel.index, length - 1 - sel.index, 'user')
    if (!(await save())) return
    const position = chapters.findIndex((c) => c.id === chapterRef.current.id)
    await addChapter({ order: position + 1, content: tail, title })
  }

  // ------------------------------------------------------------------ story
  async function publish(on) {
    if (!(await flush())) return
    try {
      const data = await api.post(`admin/stories/${id}/${on ? 'publish' : 'unpublish'}/`)
      setStory(data)
      toast(on ? 'Published. Readers can see it now.' : 'Moved back to drafts.')
    } catch (e) {
      toast(e, 'error')
    }
  }

  async function saveSettings(changes) {
    try {
      setStory(await api.patch(`admin/stories/${id}/`, changes))
      toast('Story settings saved.')
    } catch (e) {
      toast(e, 'error')
    }
  }

  async function uploadCover(file) {
    const form = new FormData()
    form.append('cover_image', file)
    try {
      setStory(await api.upload(`admin/stories/${id}/`, form, 'PATCH'))
    } catch (e) {
      toast(e, 'error')
    }
  }

  // ---------------------------------------------------------------- editing
  const q = () => quill.current
  const toggle = (name, value = true) => {
    const current = q().getFormat()
    q().format(name, current[name] === value ? false : value, 'user')
    setFormat(q().getFormat())
  }
  const setHeader = (level) => {
    q().format('header', level || false, 'user')
    setFormat(q().getFormat())
  }
  const clearFormatting = () => {
    const sel = q().getSelection(true)
    if (sel) q().removeFormat(sel.index, Math.max(sel.length, 1), 'user')
  }
  const sceneBreak = () => {
    const sel = q().getSelection(true)
    const index = sel ? sel.index : q().getLength() - 1
    q().insertText(index, '\n* * *\n', 'user')
    q().formatLine(index + 1, 5, 'align', 'center', 'user')
    q().setSelection(index + 7, 0, 'user')
  }
  const jumpTo = (offset) => {
    q().setSelection(offset, 0, 'user')
    q().scrollSelectionIntoView?.()
  }
  async function find() {
    const term = await ask('Find', 'Text to find')
    if (!term) return
    const text = q().getText().toLowerCase()
    const start = (q().getSelection(true)?.index ?? 0) + 1
    let at = text.indexOf(term.toLowerCase(), start)
    if (at < 0) at = text.indexOf(term.toLowerCase())
    if (at < 0) return toast(`No matches for "${term}" in this chapter.`)
    q().setSelection(at, term.length, 'user')
    q().scrollSelectionIntoView?.()
  }
  function showWordCount() {
    const text = q().getText()
    const paragraphs = text.split('\n').filter((l) => l.trim()).length
    const total = chapters.reduce((sum, c) => sum + (c.word_count || 0), 0)
    window.alert(
      `This chapter: ${wordCount(text)} words, ${text.replace(/\n/g, '').length} characters, ${paragraphs} paragraphs\n` +
        `Whole story (last saved): ${total} words in ${chapters.length} chapters\n` +
        `Readers who haven't paid see the first ${story.preview_page_count} paragraphs.`,
    )
  }

  // --------------------------------------------------------------------- UI
  const saveLabel = {
    saved: 'All changes saved',
    dirty: 'Unsaved changes',
    saving: 'Saving…',
    error: 'Not saved: press Ctrl+S',
  }[saveState]
  const published = story?.status === 'published'
  const chapterIndex = chapters.findIndex((c) => c.id === chapterId)

  return (
    <div className="flex h-dvh flex-col bg-bg">
      {/* Title bar */}
      <header className="flex items-center gap-3 border-b border-line bg-surface px-3 py-2">
        <Link to="/admin" className="btn-ghost !px-2.5 !py-1.5" onClick={(e) => dirtyRef.current && !window.confirm('Leave with unsaved changes?') && e.preventDefault()}>
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg leading-tight">{story?.title || '…'}</p>
          <p className="text-xs text-muted">
            {published ? 'Published' : 'Draft'} · <span className={saveState === 'error' ? 'text-red-400' : ''}>{saveLabel}</span>
          </p>
        </div>
        <button className="btn-ghost !py-1.5" onClick={() => setSettingsOpen(true)}>
          ⚙ <span className="hidden sm:inline">Story settings</span>
        </button>
        {published ? (
          <button className="btn-ghost !py-1.5" onClick={() => publish(false)}>
            Unpublish
          </button>
        ) : (
          <button className="btn-primary !py-1.5" onClick={() => publish(true)}>
            Publish
          </button>
        )}
      </header>

      {/* Ribbon */}
      <div className="border-b border-line bg-surface-2/60">
        <div className="flex gap-1 px-2 pt-1 text-sm">
          {['home', 'insert', 'view', 'review'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-t-lg px-3 py-1.5 capitalize ${tab === t ? 'bg-surface font-semibold text-brand' : 'text-muted hover:text-ink'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex min-h-[64px] items-stretch gap-0 overflow-x-auto bg-surface px-2 py-1.5">
          {tab === 'home' && (
            <>
              <Group label="History">
                <Tool title="Undo (Ctrl+Z)" onClick={() => q().history.undo()}>↶</Tool>
                <Tool title="Redo (Ctrl+Y)" onClick={() => q().history.redo()}>↷</Tool>
              </Group>
              <Group label="Font">
                <Tool title="Bold (Ctrl+B)" active={format.bold} onClick={() => toggle('bold')}><b>B</b></Tool>
                <Tool title="Italic (Ctrl+I)" active={format.italic} onClick={() => toggle('italic')}><i className="font-serif">I</i></Tool>
                <Tool title="Underline (Ctrl+U)" active={format.underline} onClick={() => toggle('underline')}><u>U</u></Tool>
                <Tool title="Strikethrough" active={format.strike} onClick={() => toggle('strike')}><s>S</s></Tool>
                <Tool title="Clear formatting" onClick={clearFormatting}>⌫</Tool>
              </Group>
              <Group label="Paragraph">
                <Tool title="Bullets" active={format.list === 'bullet'} onClick={() => toggle('list', 'bullet')}>•≡</Tool>
                <Tool title="Numbering" active={format.list === 'ordered'} onClick={() => toggle('list', 'ordered')}>1.≡</Tool>
                <Tool title="Quote" active={format.blockquote} onClick={() => toggle('blockquote')}>❝</Tool>
                <Tool title="Align left" active={!format.align} onClick={() => q().format('align', false, 'user')}>⇤</Tool>
                <Tool title="Center" active={format.align === 'center'} onClick={() => toggle('align', 'center')}>↔</Tool>
                <Tool title="Align right" active={format.align === 'right'} onClick={() => toggle('align', 'right')}>⇥</Tool>
                <Tool title="Justify" active={format.align === 'justify'} onClick={() => toggle('align', 'justify')}>☰</Tool>
              </Group>
              <Group label="Styles">
                {[
                  [0, 'Normal', 'text-sm'],
                  [1, 'Heading 1', 'font-display text-lg'],
                  [2, 'Heading 2', 'font-display text-base'],
                  [3, 'Heading 3', 'font-display text-sm font-semibold'],
                ].map(([level, label, cls]) => (
                  <button
                    key={level}
                    onClick={() => setHeader(level)}
                    className={`mx-0.5 w-24 rounded-lg border px-2 py-1 text-left ${cls} ${
                      (format.header || 0) === level ? 'border-brand bg-brand/10' : 'border-line hover:bg-surface-2'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </Group>
              <Group label="Save">
                <Tool title="Save now (Ctrl+S)" onClick={save}>💾</Tool>
              </Group>
            </>
          )}
          {tab === 'insert' && (
            <>
              <Group label="Chapters">
                <Big icon="＋" label="New chapter" onClick={() => addChapter()} />
                <Big icon="✂" label="Split here" onClick={splitHere} />
              </Group>
              <Group label="Text">
                <Big icon="⁂" label="Scene break" onClick={sceneBreak} />
              </Group>
            </>
          )}
          {tab === 'view' && (
            <>
              <Group label="Show">
                <Big icon="▤" label="Navigation pane" active={navOpen} onClick={() => setNavOpen((o) => !o)} />
              </Group>
              <Group label="Zoom">
                <Tool title="Zoom out" onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.1).toFixed(1)))}>－</Tool>
                <button className="px-2 text-sm" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
                <Tool title="Zoom in" onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(1)))}>＋</Tool>
              </Group>
              <Group label="Preview">
                <Big
                  icon="📖"
                  label="Open as reader"
                  onClick={async () => {
                    await flush()
                    window.open(`/stories/${story.slug}`, '_blank')
                  }}
                />
              </Group>
            </>
          )}
          {tab === 'review' && (
            <Group label="Proofing">
              <Big icon="🔍" label="Find (Ctrl+F)" onClick={find} />
              <Big icon="#" label="Word count" onClick={showWordCount} />
            </Group>
          )}
        </div>
      </div>

      {/* Navigation pane + page */}
      <div className="flex min-h-0 flex-1">
        {navOpen && (
          <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-surface">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-sm font-semibold">Navigation</span>
              <button className="rounded-lg px-2 text-lg text-muted hover:text-ink" title="New chapter" onClick={() => addChapter()}>
                ＋
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-4">
              {chapters.map((c, i) => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={() => (dragFrom.current = i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => dropChapter(i)}
                >
                  <div
                    className={`group flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-sm ${
                      c.id === chapterId ? 'bg-brand/15 font-semibold' : 'hover:bg-surface-2'
                    }`}
                    onClick={() => openChapter(c.id)}
                  >
                    <span className="cursor-grab text-muted" title="Drag to reorder">⋮⋮</span>
                    <span className="min-w-0 flex-1 truncate">{c.title || 'Untitled'}</span>
                    <span className="text-[10px] text-muted">{c.word_count}</span>
                    <button className="hidden px-1 text-muted group-hover:block hover:text-ink" title="Rename" onClick={(e) => { e.stopPropagation(); renameChapter(c) }}>✎</button>
                    <button className="hidden px-1 text-muted group-hover:block hover:text-red-400" title="Delete" onClick={(e) => { e.stopPropagation(); deleteChapter(c) }}>×</button>
                  </div>
                  {c.id === chapterId &&
                    headings.map((h, j) => (
                      <button
                        key={j}
                        onClick={() => jumpTo(h.offset)}
                        className="block w-full truncate py-0.5 pr-2 text-left text-xs text-muted hover:text-ink"
                        style={{ paddingLeft: 28 + (h.level - 1) * 12 }}
                      >
                        {h.text}
                      </button>
                    ))}
                </div>
              ))}
            </div>
          </aside>
        )}

        <div className="min-w-0 flex-1 overflow-y-auto bg-bg-2 px-3 py-6" onClick={(e) => e.target === e.currentTarget && q().focus()}>
          {!story && <Spinner />}
          <div
            className="studio-page mx-auto rounded-sm bg-page shadow-[0_10px_40px_-10px_rgba(0,0,0,0.45)]"
            style={{ maxWidth: 816 * zoom, padding: `${64 * zoom}px ${Math.min(96, 72 * zoom)}px`, fontSize: `${zoom}rem` }}
          >
            <div ref={editorEl} />
          </div>
        </div>
      </div>

      {/* Status bar */}
      <footer className="flex items-center gap-4 border-t border-line bg-surface px-3 py-1 text-xs text-muted">
        <span>Chapter {chapterIndex + 1} of {chapters.length}</span>
        <span>{words.toLocaleString()} words</span>
        <span className="hidden sm:inline">Story: {(story?.word_count || 0).toLocaleString()} words</span>
        <span className="ml-auto hidden sm:inline">{saveLabel}</span>
        <input type="range" min="0.7" max="2" step="0.1" value={zoom} onChange={(e) => setZoom(+e.target.value)} className="w-28 accent-[var(--brand)]" />
        <span className="w-10">{Math.round(zoom * 100)}%</span>
      </footer>

      {settingsOpen && story && (
        <SettingsDrawer
          story={story}
          genres={genres}
          columns={columns}
          onClose={() => setSettingsOpen(false)}
          onSave={saveSettings}
          onUploadCover={uploadCover}
        />
      )}

      {conflict && (
        <Modal title="Chapter changed elsewhere">
          <p className="text-sm text-muted">
            Someone else saved this chapter while you were editing. Keep your version (overwrites theirs) or load theirs (discards your unsaved changes)?
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => resolveConflict(false)}>Load theirs</button>
            <button className="btn-primary" onClick={() => resolveConflict(true)}>Keep mine</button>
          </div>
        </Modal>
      )}

      {dialog && <PromptModal {...dialog} onDone={(v) => { dialog.resolve(v); setDialog(null) }} />}
    </div>
  )
}

const pick = (d) => ({ title: d.title, word_count: d.word_count, revision: d.revision })

function extractHeadings(ops) {
  const result = []
  let offset = 0
  let lineStart = 0
  let line = ''
  for (const op of ops || []) {
    if (typeof op.insert !== 'string') {
      offset += 1
      continue
    }
    for (const ch of op.insert) {
      if (ch === '\n') {
        const level = op.attributes?.header
        if (level && line.trim()) result.push({ text: line.trim(), level, offset: lineStart })
        line = ''
        lineStart = offset + 1
      } else {
        line += ch
      }
      offset += 1
    }
  }
  return result
}

function Group({ label, children }) {
  return (
    <div className="flex shrink-0 flex-col items-center border-r border-line px-2 last:border-r-0">
      <div className="flex flex-1 items-center">{children}</div>
      <span className="mt-0.5 text-[10px] tracking-wide text-muted uppercase">{label}</span>
    </div>
  )
}

function Tool({ title, active, onClick, children }) {
  return (
    <button
      title={title}
      aria-label={title}
      aria-pressed={!!active}
      onMouseDown={(e) => e.preventDefault()} // keep the editor selection
      onClick={onClick}
      className={`mx-0.5 grid h-8 min-w-8 place-items-center rounded-md px-1.5 text-sm transition ${
        active ? 'bg-brand/20 text-brand' : 'hover:bg-surface-2'
      }`}
    >
      {children}
    </button>
  )
}

function Big({ icon, label, onClick, active }) {
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`mx-0.5 flex flex-col items-center rounded-lg px-3 py-1 text-xs ${active ? 'bg-brand/15' : 'hover:bg-surface-2'}`}
    >
      <span className="text-xl leading-6">{icon}</span>
      {label}
    </button>
  )
}

function Modal({ title, children }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="card w-full max-w-md animate-float-up p-6">
        <h2 className="font-display text-xl">{title}</h2>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  )
}

function PromptModal({ title, label, value, onDone }) {
  const [text, setText] = useState(value)
  return (
    <Modal title={title}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onDone(text.trim())
        }}
      >
        <Field label={label}>
          <input className="input" autoFocus value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => onDone(null)}>Cancel</button>
          <button className="btn-primary">OK</button>
        </div>
      </form>
    </Modal>
  )
}

function SettingsDrawer({ story, genres, columns, onClose, onSave, onUploadCover }) {
  const [form, setForm] = useState({
    title: story.title,
    author_name: story.author_name,
    synopsis: story.synopsis,
    price: story.price,
    preview_page_count: story.preview_page_count,
    column_id: story.column?.id ?? '',
  })
  const [genreIds, setGenreIds] = useState(new Set(story.genres.map((g) => g.id)))
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <aside className="h-full w-full max-w-md overflow-y-auto border-l border-line bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Story settings</h2>
          <button className="text-2xl text-muted hover:text-ink" onClick={onClose}>×</button>
        </div>
        <div className="mt-6 space-y-4">
          <Field label="Title"><input className="input" value={form.title} onChange={set('title')} /></Field>
          <Field label="Author"><input className="input" value={form.author_name} onChange={set('author_name')} /></Field>
          <Field label="Synopsis"><textarea className="input" rows={4} value={form.synopsis} onChange={set('synopsis')} /></Field>
          <div className="flex items-center gap-3">
            {story.cover_image && <img src={story.cover_image} alt="" className="h-20 rounded shadow" />}
            <label className="btn-ghost cursor-pointer">
              Upload cover
              <input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && onUploadCover(e.target.files[0])} />
            </label>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Genres</p>
            <GenreChips
              genres={genres}
              selected={genreIds}
              onToggle={(gid) =>
                setGenreIds((s) => {
                  const n = new Set(s)
                  n.has(gid) ? n.delete(gid) : n.add(gid)
                  return n
                })
              }
            />
          </div>
          <Field label="Column">
            <select className="input" value={form.column_id} onChange={set('column_id')}>
              <option value="">Standalone (no column)</option>
              {columns.map((c) => (
                <option key={c.id} value={c.id}>{c.title}{c.is_public ? ' (public, free)' : ''}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price (₱)" hint="0 = free · min ₱20">
              <input className="input" type="number" min="0" step="0.01" value={form.price} onChange={set('price')} />
            </Field>
            <Field label="Free preview" hint="paragraphs">
              <input className="input" type="number" min="0" value={form.preview_page_count} onChange={set('preview_page_count')} />
            </Field>
          </div>
          <button
            className="btn-primary w-full"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await onSave({
                ...form,
                price: form.price === '' ? '0' : String(form.price),
                preview_page_count: Number(form.preview_page_count) || 0,
                column_id: form.column_id === '' ? null : Number(form.column_id),
                genre_ids: [...genreIds],
              })
              setBusy(false)
            }}
          >
            {busy ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </aside>
    </div>
  )
}
