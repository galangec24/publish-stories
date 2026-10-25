import { AlertTriangle, CheckCircle2, FileText, FileType2, Tags, UploadCloud, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { Field, GenreChips, NumberStepper, useToast } from '../../components/ui'
import { api, ApiError } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'

const ACCEPT = '.docx,.md,.markdown,.txt'

const toggleIn = (set, id) => {
  const next = new Set(set)
  next.has(id) ? next.delete(id) : next.add(id)
  return next
}

/** Upload many manuscripts at once with batch and per-file genre tags. */
export function BulkImport() {
  const toast = useToast()
  const genres = useAsync(() => api.get('admin/genres/'), [])
  const columns = useAsync(() => api.get('admin/columns/'), [])
  const [files, setFiles] = useState([]) // { file, title, genreIds: Set | null }
  const [batchGenres, setBatchGenres] = useState(new Set())
  const [columnId, setColumnId] = useState('')
  const [price, setPrice] = useState('0')
  const [freeChapters, setFreeChapters] = useState('1')
  const [publish, setPublish] = useState(false)
  const [createMissing, setCreateMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [result, setResult] = useState(null)
  const [editing, setEditing] = useState(null) // index of file whose genres are being edited
  const input = useRef()

  function addFiles(list) {
    const ok = [...list].filter((f) => /\.(docx|md|markdown|txt)$/i.test(f.name))
    if (ok.length < list.length) toast('Only .docx, .md and .txt files can be imported.')
    setFiles((current) => [
      ...current,
      ...ok.filter((f) => !current.some((c) => c.file.name === f.name)).map((file) => ({ file, title: '', genreIds: null })),
    ])
    setResult(null)
  }

  async function upload() {
    const form = new FormData()
    files.forEach(({ file }) => form.append('files', file))
    form.append('genre_ids', [...batchGenres].join(','))
    if (columnId) form.append('column_id', columnId)
    form.append('price', price || '0')
    form.append('free_chapters', freeChapters || '0')
    form.append('status', publish ? 'published' : 'draft')
    form.append('create_missing_genres', String(createMissing))
    form.append(
      'manifest',
      JSON.stringify(
        files.map((f) => ({
          filename: f.file.name,
          ...(f.title.trim() && { title: f.title.trim() }),
          ...(f.genreIds && { genre_ids: [...f.genreIds] }),
        })),
      ),
    )
    setBusy(true)
    try {
      const data = await api.upload('admin/stories/import/', form)
      setResult(data)
      setFiles((fs) => fs.filter((f) => !data.results.some((r) => r.ok && r.filename === f.file.name)))
    } catch (e) {
      if (e instanceof ApiError && e.body?.results) setResult(e.body)
      else toast(e, 'error')
    } finally {
      setBusy(false)
    }
  }

  const genreName = Object.fromEntries((genres.data || []).map((g) => [g.id, g.name]))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Bulk import</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Each file becomes a story. Word <em>Heading 1</em> paragraphs, Markdown <code># </code>headings, or lines like
          &ldquo;Chapter 1&rdquo; / &ldquo;Kabanata 1&rdquo; in text files start new chapters. Markdown front matter (title,
          author, synopsis, genres) is read automatically.
        </p>
      </div>

      <section className="card space-y-5 p-5">
        <h2 className="font-semibold">Applies to every file</h2>
        <div>
          <p className="mb-2 text-sm font-medium">Genre tags</p>
          <GenreChips genres={genres.data || []} selected={batchGenres} onToggle={(id) => setBatchGenres((s) => toggleIn(s, id))} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Column">
            <select className="input" value={columnId} onChange={(e) => setColumnId(e.target.value)}>
              <option value="">Standalone</option>
              {(columns.data || []).map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </Field>
          <Field label="Price (₱)" hint="0 = free · min ₱20">
            <NumberStepper value={price} onChange={setPrice} min={0} step={1} prefix="₱" label="price" />
          </Field>
          <Field label="Free chapters" hint="0 = none">
            <NumberStepper value={freeChapters} onChange={setFreeChapters} min={0} max={50} label="free chapters" />
          </Field>
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
          Publish immediately <span className="text-muted">(otherwise drafts for review in the Studio)</span>
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
          Create genres named in front matter if they don&apos;t exist
        </label>
      </section>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          addFiles(e.dataTransfer.files)
        }}
        onClick={() => input.current.click()}
        className={`grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed p-10 text-center transition ${
          dragging ? 'border-brand bg-brand/10' : 'border-line hover:border-muted'
        }`}
      >
        <div>
          <UploadCloud className="mx-auto h-10 w-10 text-brand" />
          <p className="mt-2 font-semibold">Drop manuscripts here or click to choose</p>
          <p className="text-sm text-muted">.docx, .md, .txt · up to 50 files · 10 MB each</p>
        </div>
        <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
      </div>

      {files.length > 0 && (
        <section className="card divide-y divide-line">
          {files.map((f, i) => (
            <div key={f.file.name} className="flex flex-wrap items-center gap-3 p-4">
              {f.file.name.endsWith('.docx') ? <FileType2 className="h-6 w-6 text-sky-400" /> : <FileText className="h-6 w-6 text-muted" />}
              <div className="min-w-0 flex-1">
                <input
                  className="input !py-1.5"
                  placeholder="Title (blank = from file)"
                  value={f.title}
                  onChange={(e) => setFiles((fs) => fs.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                />
                <p className="mt-1 truncate text-xs text-muted">
                  {f.file.name} · Genres: {f.genreIds ? [...f.genreIds].map((id) => genreName[id]).join(', ') || 'none' : 'batch'}
                </p>
              </div>
              <button className="btn-ghost !py-1.5" onClick={() => setEditing(i)}><Tags className="h-4 w-4" /> Genres</button>
              <button className="px-2 text-xl text-muted hover:text-red-400" title="Remove" onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <div className="flex items-center justify-between p-4">
            <span className="text-sm text-muted">{files.length} file{files.length === 1 ? '' : 's'} ready</span>
            <button className="btn-primary" disabled={busy} onClick={upload}>
              {busy ? 'Importing…' : `Import ${files.length} stor${files.length === 1 ? 'y' : 'ies'}`}
            </button>
          </div>
        </section>
      )}

      {result && (
        <section className="card p-5">
          <h2 className="font-semibold">
            Imported {result.created} · failed {result.failed}
          </h2>
          <ul className="mt-3 divide-y divide-line">
            {result.results.map((r) => (
              <li key={r.filename} className="flex items-start gap-3 py-3">
                {r.ok ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" /> : <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />}
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">{r.ok ? `${r.title}` : r.filename}</p>
                  {r.ok ? (
                    <p className="text-muted">
                      {r.filename} · {r.chapters} chapters · {r.word_count} words · {r.status}
                      {r.genres.length ? ` · ${r.genres.join(', ')}` : ''}
                    </p>
                  ) : (
                    <p className="text-red-400">{typeof r.error === 'string' ? r.error : JSON.stringify(r.error)}</p>
                  )}
                  {r.warnings?.map((w) => (
                    <p key={w} className="flex items-center gap-1 text-amber-500"><AlertTriangle className="h-3.5 w-3.5" /> {w}</p>
                  ))}
                </div>
                {r.ok && (
                  <Link className="btn-ghost !py-1" to={`/admin/stories/${r.story_id}`}>
                    Open in Studio
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing !== null && files[editing] && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setEditing(null)}>
          <div className="card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-xl">Genres for {files[editing].file.name}</h2>
            <div className="mt-4">
              <GenreChips
                genres={genres.data || []}
                selected={files[editing].genreIds || batchGenres}
                onToggle={(id) =>
                  setFiles((fs) =>
                    fs.map((x, j) => (j === editing ? { ...x, genreIds: toggleIn(x.genreIds || batchGenres, id) } : x)),
                  )
                }
              />
            </div>
            <div className="mt-6 flex justify-between">
              <button
                className="btn-ghost"
                onClick={() => {
                  setFiles((fs) => fs.map((x, j) => (j === editing ? { ...x, genreIds: null } : x)))
                  setEditing(null)
                }}
              >
                Use batch genres
              </button>
              <button className="btn-primary" onClick={() => setEditing(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
