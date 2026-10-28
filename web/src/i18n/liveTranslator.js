// Live page translator.
//
// Rather than keeping string tables, this translates whatever text is on screen:
// it walks the DOM's text nodes (plus placeholder/title/aria-label/alt attributes),
// sends unseen English strings to /api/translate/ in batches, and swaps the words
// in place. A MutationObserver re-runs it whenever React renders something new
// (navigation, toasts, a new chapter), so every word stays translated as the app
// changes. The original text is remembered per node, so switching back to
// English, or React re-rendering a node, always starts from the source text.
//
// Opt out with translate="no" or class "notranslate" (brand name, emails, the
// Studio editor, form inputs).

import { api } from '../lib/api'

// Never touched: code, the Studio editor, anything marked translate="no" / .notranslate.
const SKIP = 'script,style,noscript,code,pre,svg,[translate="no"],.notranslate,.ql-editor,[contenteditable="true"]'
// Text inside a textarea is what the user typed; its placeholder is still translated.
const SKIP_TEXT = `${SKIP},textarea`
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt']
const BATCH = 100
const HAS_LETTERS = /\p{L}/u

const textState = new WeakMap() // Text node → { src, out }
const attrState = new WeakMap() // Element → { [attr]: { src, out } }
const memory = new Map() // `${lang}\u0000${text}` → translation

let lang = 'en'
let observer = null
let scheduled = 0
let running = false
let rerun = false
const listeners = new Set()
let failedOnce = false

function cacheKey(target) {
  return `tr-cache:${target}`
}

function loadCache(target) {
  try {
    const stored = JSON.parse(localStorage.getItem(cacheKey(target)) || '{}')
    for (const [src, out] of Object.entries(stored)) memory.set(`${target}\u0000${src}`, out)
  } catch {
    /* ignore */
  }
}

function saveCache(target) {
  try {
    const entries = {}
    let n = 0
    for (const [key, value] of memory) {
      const [l, src] = key.split('\u0000')
      if (l === target && n++ < 4000) entries[src] = value
    }
    localStorage.setItem(cacheKey(target), JSON.stringify(entries))
  } catch {
    /* storage full or blocked: memory cache still works */
  }
}

function skipped(el, selector = SKIP) {
  return !el || el.closest(selector)
}

/** Split leading/trailing whitespace so layout spacing survives translation. */
function parts(text) {
  const m = text.match(/^(\s*)([\s\S]*?)(\s*)$/)
  return { lead: m[1], core: m[2], trail: m[3] }
}

function collect(root) {
  const jobs = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!HAS_LETTERS.test(node.data) || skipped(node.parentElement, SKIP_TEXT)) continue
    let state = textState.get(node)
    if (!state || (node.data !== state.out && node.data !== state.src)) {
      state = { src: node.data, out: null } // new node, or React replaced the text
      textState.set(node, state)
    }
    jobs.push({ kind: 'text', node, state })
  }
  for (const el of root.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(','))) {
    if (skipped(el)) continue
    let states = attrState.get(el)
    if (!states) attrState.set(el, (states = {}))
    for (const attr of ATTRS) {
      const value = el.getAttribute(attr)
      if (!value || !HAS_LETTERS.test(value)) continue
      let state = states[attr]
      if (!state || (value !== state.out && value !== state.src)) states[attr] = state = { src: value, out: null }
      jobs.push({ kind: 'attr', el, attr, state })
    }
  }
  return jobs
}

function apply(job, target) {
  const { lead, core, trail } = parts(job.state.src)
  const translated = target === 'en' ? core : memory.get(`${target}\u0000${core}`)
  if (translated === undefined) return
  const next = lead + translated + trail
  job.state.out = next
  if (job.kind === 'text') {
    if (job.node.data !== next) job.node.data = next
  } else if (job.el.getAttribute(job.attr) !== next) {
    job.el.setAttribute(job.attr, next)
  }
}

async function fetchMissing(jobs, target) {
  const missing = [
    ...new Set(
      jobs.map((j) => parts(j.state.src).core).filter((core) => core && !memory.has(`${target}\u0000${core}`)),
    ),
  ]
  for (let i = 0; i < missing.length; i += BATCH) {
    const chunk = missing.slice(i, i + BATCH)
    const { translations } = await api.post('translate/', { target, texts: chunk })
    chunk.forEach((src, k) => memory.set(`${target}\u0000${src}`, translations[k]))
  }
  if (missing.length) saveCache(target)
}

async function pass() {
  if (running) {
    rerun = true
    return
  }
  running = true
  const target = lang
  try {
    observer?.disconnect()
    const jobs = collect(document.body)
    if (target !== 'en') {
      notify(true)
      await fetchMissing(jobs, target)
    }
    if (target === lang) jobs.forEach((job) => apply(job, target))
  } catch (e) {
    if (!failedOnce) {
      failedOnce = true
      console.warn('Live translation failed:', e)
      listeners.forEach((fn) => fn({ busy: false, error: e.message || 'Translation is unavailable right now.' }))
    }
  } finally {
    running = false
    notify(false)
    observe()
    if (rerun) {
      rerun = false
      schedule()
    }
  }
}

function notify(busy) {
  listeners.forEach((fn) => fn({ busy }))
}

function schedule() {
  clearTimeout(scheduled)
  scheduled = setTimeout(pass, 80)
}

function observe() {
  if (lang === 'en' && !observer) return
  observer ??= new MutationObserver(schedule)
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS })
}

/** Switch the whole page to `target` ("en" restores the original text). */
export function setLanguage(target) {
  lang = target
  failedOnce = false
  document.documentElement.lang = target === 'fil' ? 'fil' : target
  document.documentElement.dir = target === 'ar' ? 'rtl' : 'ltr'
  if (target !== 'en') loadCache(target)
  schedule()
  if (target === 'en') {
    // One pass restores originals, then stop watching.
    setTimeout(() => {
      observer?.disconnect()
      observer = null
    }, 200)
  }
}

/** The language the page is shown in ("en" means the original text). */
export const currentLanguage = () => lang

/**
 * Translate some texts into the page's language (cached like the page's own text). Used for text
 * that isn't on the page as it is, e.g. a reel's script and chapter while they are read aloud.
 */
export async function translateTexts(texts) {
  const target = lang
  if (target === 'en') return texts
  const missing = [...new Set(texts.filter((t) => HAS_LETTERS.test(t) && !memory.has(`${target}\u0000${t}`)))]
  for (let i = 0; i < missing.length; i += BATCH) {
    const chunk = missing.slice(i, i + BATCH)
    const { translations } = await api.post('translate/', { target, texts: chunk })
    chunk.forEach((src, k) => memory.set(`${target}\u0000${src}`, translations[k]))
  }
  if (missing.length) saveCache(target)
  return texts.map((t) => memory.get(`${target}\u0000${t}`) ?? t)
}

export function onTranslatorStatus(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
