import { AudioLines, BookOpenText, Check, Clapperboard, Headphones, LoaderCircle, Play, RefreshCw, Save, Sparkles, Square, Trash2, WandSparkles } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Modal } from '../../components/Modal'
import { useToast } from '../../components/ui'
import { VoiceReel } from '../../components/VoiceReel'
import { DEFAULT_ABOUT } from '../../lib/aboutDefaults'
import { api } from '../../lib/api'
import { unlockSpeech } from '../../lib/deviceVoice'
import { useCachedAsync } from '../../lib/useAsync'

/** A free reel script from the chapter's first lines: about 110 words, cut at a sentence end. */
function openingScript(text, number, storyTitle) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const sentenceEnd = /[.!?…]["'”’)]*$/
  let end = Math.min(words.length, 110)
  for (let i = end; i >= 60; i--) {
    if (sentenceEnd.test(words[i - 1] || '')) {
      end = i
      break
    }
  }
  let opening = words.slice(0, end).join(' ')
  if (end < words.length && !sentenceEnd.test(opening)) opening += '…'
  return `${opening} What happens next? Read Chapter ${number} of ${storyTitle} on Publish Stories.`
}

/** Story Studio → AI: "Listen" and the chapter's reel. Free by default; paid services are optional extras. */
export function ChapterAI({ chapter, number, storyTitle, getText, onClose, beforeRun }) {
  const toast = useToast()
  const about = useCachedAsync('cache:about', () => api.get('about/'), [], DEFAULT_ABOUT)
  const [state, setState] = useState(null)
  const [kind, setKind] = useState('voice')
  const [presenters, setPresenters] = useState(null)
  const [presenterError, setPresenterError] = useState('')
  const [script, setScript] = useState('')
  const [avatarId, setAvatarId] = useState('')
  const [busy, setBusy] = useState('')
  const [previewing, setPreviewing] = useState(false)

  const load = () =>
    api.get(`admin/chapters/${chapter.id}/ai/`).then((s) => {
      setState(s)
      return s
    })

  useEffect(() => {
    load()
      .then((s) => {
        setScript(s.reel?.script || '')
        setKind(s.reel?.kind || 'voice')
        setAvatarId(s.reel?.avatar_id || s.last_presenter || '')
      })
      .catch((e) => toast(e, 'error'))
  }, [chapter.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Presenters are only needed for the paid video style.
  useEffect(() => {
    if (kind !== 'video' || presenters || !state?.services.video) return
    api.get('admin/ai/presenters/').then(setPresenters).catch((e) => setPresenterError(e.message))
  }, [kind, state]) // eslint-disable-line react-hooks/exhaustive-deps

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
    window.confirm('Remove the premium reading? Readers go back to their free device voice.') &&
    run('reading', async () => {
      await api.delete(`admin/chapters/${chapter.id}/ai/narration/`)
      await load()
    })
  const useOpening = () => {
    const text = getText()
    if (!text.trim()) return toast('Write the chapter first; the script is taken from it.', 'error')
    setScript(openingScript(text, number, storyTitle))
  }
  const draftScript = () =>
    run('script', async () => {
      const { script: text } = await api.post(`admin/chapters/${chapter.id}/ai/reel/script/`)
      setScript(text)
    })
  const saveReel = () => {
    if (kind === 'video' && !window.confirm('Record this reel with HeyGen? It uses your HeyGen credits.')) return
    run('reel', async () => {
      const next = await api.post(`admin/chapters/${chapter.id}/ai/reel/`, { kind, script, avatar_id: avatarId })
      setState(next)
      if (kind === 'voice') toast(next.reel.published ? 'Reel saved. It is in the Reels tab.' : 'Reel saved. Tick “Show in the Reels tab” to publish it.')
    })
  }
  const setPublished = (published) => run('publish', async () => setState(await api.patch(`admin/chapters/${chapter.id}/ai/reel/`, { published })))
  const removeReel = () =>
    window.confirm('Remove this reel? It disappears from the Reels tab.') &&
    run('reel', async () => {
      await api.delete(`admin/chapters/${chapter.id}/ai/reel/`)
      await load()
      setScript('')
    })

  const services = state?.services || {}
  const narration = state?.narration
  const reel = state?.reel
  const words = script.trim() ? script.trim().split(/\s+/).length : 0
  const savedScript = reel?.kind === kind && reel?.script === script.trim()

  return (
    <Modal open onClose={onClose} icon={Sparkles} title="Listen & reel" subtitle={`Chapter ${number}: ${chapter.title || 'Untitled'}`} size="max-w-2xl">
      {!state ? (
        <div className="grid place-items-center py-10">
          <LoaderCircle className="h-6 w-6 animate-spin text-muted" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Listen */}
          <section className="rounded-2xl border border-line p-4">
            <h3 className="flex items-center gap-2 font-semibold">
              <Headphones className="h-5 w-5 text-brand" /> Listen
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">Free · on</span>
            </h3>
            <p className="mt-1 text-sm text-muted">
              Every chapter a reader can open has <b>Listen to this chapter</b>. Their own device reads it word for word in English and each word
              lights up as it is read. Nothing to make, nothing to pay.
            </p>

            {(services.voice || narration) && (
              <div className="mt-4 border-t border-line pt-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <AudioLines className="h-4 w-4 text-brand" /> Premium voice (ElevenLabs, optional)
                  <StatusChip status={narration?.status} stale={narration && !narration.current} />
                </p>
                <p className="mt-1 text-xs text-muted">Replaces the device voice with one natural voice for everyone. Uses ElevenLabs credits.</p>
                {narration?.status === 'ready' && !narration.current && (
                  <p className="mt-2 text-sm text-amber-500">The chapter changed since this reading was made. Remake it to match.</p>
                )}
                {narration?.status === 'failed' && <p className="mt-2 text-sm text-red-400">{narration.error}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    className="btn-ghost !py-1.5 text-sm"
                    disabled={Boolean(busy) || narration?.status === 'working' || !services.voice || !services.storage}
                    onClick={makeReading}
                  >
                    {narration?.status === 'working' || busy === 'reading' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    {narration?.status === 'working' ? 'Reading the chapter…' : narration?.status === 'ready' ? 'Remake' : 'Make premium reading'}
                  </button>
                  {narration && narration.status !== 'working' && (
                    <button className="btn-ghost !py-1.5 text-sm" disabled={Boolean(busy)} onClick={removeReading}>
                      <Trash2 className="h-4 w-4" /> Remove
                    </button>
                  )}
                </div>
                {!services.storage && <p className="mt-2 text-xs text-muted">Also needs SUPABASE_URL and SUPABASE_SERVICE_KEY in Render.</p>}
              </div>
            )}
          </section>

          {/* Reel */}
          <section className="rounded-2xl border border-line p-4">
            <h3 className="flex items-center gap-2 font-semibold">
              <Clapperboard className="h-5 w-5 text-brand" /> Chapter reel
              <StatusChip status={reel?.status} />
              {reel?.published && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">In Reels</span>}
            </h3>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <StyleOption
                active={kind === 'voice'}
                onClick={() => setKind('voice')}
                title="Author photo + voice"
                note="Free"
                text="Her About-me photo with the script as captions, read by the viewer's device voice."
              />
              <StyleOption
                active={kind === 'video'}
                onClick={() => services.video && setKind('video')}
                disabled={!services.video}
                title="AI presenter video"
                note="HeyGen · paid"
                text={services.video ? 'A human-looking AI presenter reads the script on video.' : 'Needs HEYGEN_API_KEY in Render.'}
              />
            </div>

            {kind === 'video' && (
              <>
                <p className="mt-4 mb-1.5 text-sm font-medium">Presenter</p>
                {presenterError && <p className="text-sm text-red-400">{presenterError}</p>}
                {!presenters && !presenterError && <LoaderCircle className="h-5 w-5 animate-spin text-muted" />}
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
              </>
            )}

            <div className="mt-4 mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">Script</span>
              <span className="flex gap-1.5">
                <button className="btn-ghost !px-2.5 !py-1 text-xs" disabled={Boolean(busy)} onClick={useOpening}>
                  <BookOpenText className="h-3.5 w-3.5" /> Use the chapter opening
                </button>
                {services.script && (
                  <button className="btn-ghost !px-2.5 !py-1 text-xs" disabled={Boolean(busy)} onClick={draftScript}>
                    {busy === 'script' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <WandSparkles className="h-3.5 w-3.5" />}
                    Write with AI
                  </button>
                )}
              </span>
            </div>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              maxLength={1500}
              rows={6}
              placeholder="What the reel says. Press “Use the chapter opening” to start from the first lines, then edit it."
              className="w-full rounded-xl border border-line bg-surface-2/50 p-3 text-sm leading-relaxed outline-none focus:border-brand"
            />
            <p className="mt-1 text-xs text-muted">
              {words} words · about {Math.round(words / 2.75)} seconds. Aim for 100 to 150 words.
            </p>

            {kind === 'voice' && script.trim() && (
              <div className="mt-3 flex flex-wrap items-start gap-4">
                <div className="relative aspect-[9/16] w-40 overflow-hidden rounded-2xl bg-black">
                  <VoiceReel
                    script={script}
                    color="#6a4ff0"
                    author={{ ...DEFAULT_ABOUT, ...about.data }}
                    title={storyTitle}
                    active={previewing}
                    muted={false}
                  />
                </div>
                <button
                  className="btn-ghost !py-1.5 text-sm"
                  onClick={() => {
                    if (!previewing) unlockSpeech()
                    setPreviewing((p) => !p)
                  }}
                >
                  {previewing ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />} {previewing ? 'Stop preview' : 'Preview'}
                </button>
              </div>
            )}

            {kind === 'video' && reel?.kind === 'video' && reel.status === 'ready' && reel.video_url && (
              <video src={reel.video_url} poster={reel.thumbnail_url || undefined} controls playsInline className="mt-3 aspect-[9/16] w-40 rounded-xl bg-black" />
            )}
            {reel?.status === 'working' && (
              <p className="mt-3 flex items-center gap-2 rounded-xl bg-surface-2 p-3 text-sm">
                <LoaderCircle className="h-4 w-4 animate-spin text-brand" /> HeyGen is recording the video. This usually takes a few minutes; you can
                close this window and come back.
              </p>
            )}
            {reel?.error && reel.status !== 'ready' && <p className="mt-2 text-sm text-red-400">{reel.error}</p>}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                {reel?.status === 'ready' && (
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" checked={reel.published} disabled={Boolean(busy)} onChange={(e) => setPublished(e.target.checked)} />
                    Show in the Reels tab
                  </label>
                )}
                {reel && reel.status !== 'working' && (
                  <button className="btn-ghost !py-1.5 text-sm" disabled={Boolean(busy)} onClick={removeReel}>
                    <Trash2 className="h-4 w-4" /> Remove
                  </button>
                )}
              </div>
              <button
                className="btn-primary"
                disabled={
                  Boolean(busy) ||
                  !script.trim() ||
                  reel?.status === 'working' ||
                  (kind === 'voice' && savedScript) ||
                  (kind === 'video' && (!avatarId || !services.storage))
                }
                onClick={saveReel}
              >
                {busy === 'reel' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : kind === 'voice' ? <Save className="h-4 w-4" /> : <Clapperboard className="h-4 w-4" />}
                {kind === 'voice' ? (savedScript ? 'Saved' : 'Save reel') : reel?.kind === 'video' && reel.status === 'ready' ? 'Record a new video' : 'Make video'}
              </button>
            </div>
          </section>
        </div>
      )}
    </Modal>
  )
}

function StyleOption({ active, disabled, onClick, title, note, text }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl border-2 p-3 text-left transition disabled:opacity-50 ${active ? 'border-brand bg-brand/10' : 'border-line hover:border-brand/40'}`}
    >
      <span className="flex items-center justify-between gap-2 text-sm font-semibold">
        {title}
        <span className={`rounded-full px-2 py-0.5 text-[10px] ${note === 'Free' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-surface-2 text-muted'}`}>{note}</span>
      </span>
      <span className="mt-1 block text-xs text-muted">{text}</span>
    </button>
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
