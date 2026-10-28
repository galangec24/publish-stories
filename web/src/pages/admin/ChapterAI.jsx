import { AudioLines, Check, Clapperboard, LoaderCircle, RefreshCw, Sparkles, Trash2, TriangleAlert, WandSparkles } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Modal } from '../../components/Modal'
import { useToast } from '../../components/ui'
import { api } from '../../lib/api'

const SERVICE_KEYS = {
  voice: 'ELEVENLABS_API_KEY',
  video: 'HEYGEN_API_KEY',
  script: 'ANTHROPIC_API_KEY',
  storage: 'SUPABASE_URL and SUPABASE_SERVICE_KEY',
}

/** Story Studio → AI: the word-for-word AI reading and the one-minute presenter reel for one chapter. */
export function ChapterAI({ chapter, number, onClose, beforeRun }) {
  const toast = useToast()
  const [state, setState] = useState(null)
  const [presenters, setPresenters] = useState(null)
  const [presenterError, setPresenterError] = useState('')
  const [script, setScript] = useState('')
  const [avatarId, setAvatarId] = useState('')
  const [busy, setBusy] = useState('')

  const load = () =>
    api.get(`admin/chapters/${chapter.id}/ai/`).then((s) => {
      setState(s)
      return s
    })

  useEffect(() => {
    load()
      .then((s) => {
        setScript(s.reel?.script || '')
        setAvatarId(s.reel?.avatar_id || s.last_presenter || '')
        if (s.services.video) {
          api.get('admin/ai/presenters/').then(setPresenters).catch((e) => setPresenterError(e.message))
        }
      })
      .catch((e) => toast(e, 'error'))
  }, [chapter.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // While something is being made, check every few seconds.
  const working = state?.narration?.status === 'working' || state?.reel?.status === 'working'
  useEffect(() => {
    if (!working) return
    const t = setInterval(() => load().catch(() => {}), 5000)
    return () => clearInterval(t)
  }, [working]) // eslint-disable-line react-hooks/exhaustive-deps

  async function run(label, fn) {
    setBusy(label)
    try {
      if (beforeRun && !(await beforeRun())) return
      await fn()
    } catch (e) {
      toast(e, 'error')
    } finally {
      setBusy('')
    }
  }

  const makeReading = () => run('reading', async () => setState(await api.post(`admin/chapters/${chapter.id}/ai/narration/`)))
  const removeReading = () =>
    window.confirm('Remove the AI reading of this chapter?') &&
    run('reading', async () => {
      await api.delete(`admin/chapters/${chapter.id}/ai/narration/`)
      await load()
    })
  const draftScript = () =>
    run('script', async () => {
      const { script: text } = await api.post(`admin/chapters/${chapter.id}/ai/reel/script/`)
      setScript(text)
    })
  const makeVideo = () =>
    window.confirm('Record this reel with HeyGen? It uses your HeyGen credits.') &&
    run('video', async () => setState(await api.post(`admin/chapters/${chapter.id}/ai/reel/`, { script, avatar_id: avatarId })))
  const setPublished = (published) => run('publish', async () => setState(await api.patch(`admin/chapters/${chapter.id}/ai/reel/`, { published })))
  const removeReel = () =>
    window.confirm('Remove this reel? It disappears from the Reels tab.') &&
    run('video', async () => {
      await api.delete(`admin/chapters/${chapter.id}/ai/reel/`)
      await load()
    })

  const missing = state ? Object.entries(state.services).filter(([, ok]) => !ok).map(([k]) => SERVICE_KEYS[k]) : []
  const narration = state?.narration
  const reel = state?.reel
  const words = script.trim() ? script.trim().split(/\s+/).length : 0

  return (
    <Modal open onClose={onClose} icon={Sparkles} title="AI voice & reel" subtitle={`Chapter ${number}: ${chapter.title || 'Untitled'}`} size="max-w-2xl">
      {!state ? (
        <div className="grid place-items-center py-10">
          <LoaderCircle className="h-6 w-6 animate-spin text-muted" />
        </div>
      ) : (
        <div className="space-y-6">
          {missing.length > 0 && (
            <p className="flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>
                Not set up yet: <b>{missing.join(', ')}</b>. Add {missing.length > 1 ? 'them' : 'it'} in Render → your API service →
                Environment, then reopen this window.
              </span>
            </p>
          )}

          {/* AI reading */}
          <section className="rounded-2xl border border-line p-4">
            <h3 className="flex items-center gap-2 font-semibold">
              <AudioLines className="h-5 w-5 text-brand" /> AI reading
              <StatusChip status={narration?.status} stale={narration && !narration.current} />
            </h3>
            <p className="mt-1 text-sm text-muted">
              A natural English voice reads this chapter word for word. Readers press <b>Listen</b> and each word lights up as it is read.
              Locked chapters stay locked. Uses the saved chapter text.
            </p>
            {narration?.status === 'ready' && !narration.current && (
              <p className="mt-2 text-sm text-amber-500">The chapter changed since this reading was made. Remake it to match.</p>
            )}
            {narration?.status === 'failed' && <p className="mt-2 text-sm text-red-400">{narration.error}</p>}
            {narration?.status === 'ready' && (
              <p className="mt-2 text-xs text-muted">{narration.characters.toLocaleString()} characters read.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="btn-primary !py-2"
                disabled={Boolean(busy) || narration?.status === 'working' || !state.services.voice || !state.services.storage}
                onClick={makeReading}
              >
                {narration?.status === 'working' || busy === 'reading' ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : narration?.status === 'ready' ? (
                  <RefreshCw className="h-4 w-4" />
                ) : (
                  <AudioLines className="h-4 w-4" />
                )}
                {narration?.status === 'working' ? 'Reading the chapter…' : narration?.status === 'ready' ? 'Remake reading' : 'Make reading'}
              </button>
              {narration && narration.status !== 'working' && (
                <button className="btn-ghost !py-2" disabled={Boolean(busy)} onClick={removeReading}>
                  <Trash2 className="h-4 w-4" /> Remove
                </button>
              )}
            </div>
          </section>

          {/* Reel */}
          <section className="rounded-2xl border border-line p-4">
            <h3 className="flex items-center gap-2 font-semibold">
              <Clapperboard className="h-5 w-5 text-brand" /> Chapter reel
              <StatusChip status={reel?.status} />
              {reel?.published && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">In Reels</span>}
            </h3>
            <p className="mt-1 text-sm text-muted">
              A human-looking AI presenter introduces this chapter in a vertical video of about one minute, shown in the Reels tab.
            </p>

            {reel?.status === 'ready' && reel.video_url && (
              <div className="mt-3 flex flex-wrap items-start gap-4">
                <video src={reel.video_url} poster={reel.thumbnail_url || undefined} controls playsInline className="aspect-[9/16] w-40 rounded-xl bg-black" />
                <div className="min-w-0 flex-1 space-y-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" checked={reel.published} disabled={Boolean(busy)} onChange={(e) => setPublished(e.target.checked)} />
                    Show in the Reels tab
                  </label>
                  <button className="btn-ghost !py-1.5 text-sm" disabled={Boolean(busy)} onClick={removeReel}>
                    <Trash2 className="h-4 w-4" /> Remove reel
                  </button>
                </div>
              </div>
            )}
            {reel?.status === 'working' && (
              <p className="mt-3 flex items-center gap-2 rounded-xl bg-surface-2 p-3 text-sm">
                <LoaderCircle className="h-4 w-4 animate-spin text-brand" /> HeyGen is recording the video. This usually takes a few minutes; you can
                close this window and come back.
              </p>
            )}
            {reel?.error && reel.status !== 'ready' && <p className="mt-2 text-sm text-red-400">{reel.error}</p>}

            <p className="mt-4 mb-1.5 text-sm font-medium">Presenter</p>
            {presenterError && <p className="text-sm text-red-400">{presenterError}</p>}
            {state.services.video && !presenters && !presenterError && <LoaderCircle className="h-5 w-5 animate-spin text-muted" />}
            {presenters && (
              <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto rounded-xl border border-line p-2">
                {presenters.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    title={p.name}
                    onClick={() => setAvatarId(p.id)}
                    className={`relative w-20 overflow-hidden rounded-lg border-2 text-left ${avatarId === p.id ? 'border-brand' : 'border-transparent hover:border-line'}`}
                  >
                    {p.image ? (
                      <img src={p.image} alt="" loading="lazy" className="aspect-square w-full bg-surface-2 object-cover object-top" />
                    ) : (
                      <span className="block aspect-square w-full bg-surface-2" />
                    )}
                    <span className="block truncate px-1 py-0.5 text-[10px]">{p.name}</span>
                    {avatarId === p.id && <Check className="absolute top-1 right-1 h-4 w-4 rounded-full bg-brand p-0.5 text-white" />}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 mb-1.5 flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Script</span>
              <button className="btn-ghost !px-2.5 !py-1 text-xs" disabled={Boolean(busy) || !state.services.script} onClick={draftScript}>
                {busy === 'script' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <WandSparkles className="h-3.5 w-3.5" />}
                {script ? 'Rewrite with AI' : 'Write with AI'}
              </button>
            </div>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              maxLength={1500}
              rows={7}
              placeholder="What the presenter says. Press “Write with AI” for a draft, then edit it."
              className="w-full rounded-xl border border-line bg-surface-2/50 p-3 text-sm leading-relaxed outline-none focus:border-brand"
            />
            <p className="mt-1 text-xs text-muted">
              {words} words · about {Math.round(words / 2.5)} seconds. Aim for 110 to 150 words.
            </p>
            <div className="mt-3 flex justify-end">
              <button
                className="btn-primary"
                disabled={Boolean(busy) || reel?.status === 'working' || !script.trim() || !avatarId || !state.services.video || !state.services.storage}
                onClick={makeVideo}
              >
                {busy === 'video' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
                {reel?.status === 'ready' ? 'Record a new video' : 'Make video'}
              </button>
            </div>
          </section>
        </div>
      )}
    </Modal>
  )
}

function StatusChip({ status, stale }) {
  if (!status || status === 'none') return <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">Not made</span>
  const [label, cls] = {
    working: ['Being made', 'bg-brand/15 text-brand'],
    ready: stale ? ['Out of date', 'bg-amber-500/15 text-amber-500'] : ['Ready', 'bg-emerald-500/15 text-emerald-400'],
    failed: ['Failed', 'bg-red-500/15 text-red-400'],
  }[status]
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
}
