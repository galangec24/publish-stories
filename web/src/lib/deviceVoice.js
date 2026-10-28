// The reader's own device voice (the browser's speech synthesis): free, no account, and the
// text never leaves the device. Used for "Listen" and for the free reels.

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function'

const PREFERRED = /natural|neural|online|siri|samantha|ava|allison|aria|jenny|google us english|google uk english/i

// Voice language tags for the site's language codes (Filipino voices are tagged fil-PH or tl-PH).
const VOICE_CODES = { fil: ['fil', 'tl'], tl: ['fil', 'tl'] }

/** The language the page is shown in (the translator sets it), e.g. "en", "fil", "ceb". */
export const pageLanguage = () => (document.documentElement.lang || 'en').toLowerCase().split('-')[0]

/** The device's voices for a language, most natural-sounding first. */
export function voicesFor(language = pageLanguage()) {
  const codes = VOICE_CODES[language] || [language]
  const matching = window.speechSynthesis
    .getVoices()
    .filter((v) => codes.some((code) => new RegExp(`^${code}([-_]|$)`, 'i').test(v.lang)))
  const score = (v) => (PREFERRED.test(v.name) ? 4 : 0) + (/[-_](us|gb|ph|au)$/i.test(v.lang) ? 1 : 0) + (v.default ? 1 : 0)
  return matching.sort((a, b) => score(b) - score(a))
}

export const englishVoices = () => voicesFor('en')

/**
 * The voice to read with: the reader's pick (by id) if it speaks the language, else the most
 * natural one for the language, else English (a device without, say, a Bisaya voice).
 */
export function readingVoice(voiceURI, language = pageLanguage()) {
  const voices = voicesFor(language)
  const pool = voices.length ? voices : englishVoices()
  return pool.find((v) => v.voiceURI === voiceURI) || pool[0] || null
}

/**
 * iPhones and iPads only let a page speak if speaking starts inside a tap. Call this in the tap
 * handler (a silent utterance); reading can then start a moment later.
 */
export function unlockSpeech() {
  if (!canSpeak()) return
  const silent = new SpeechSynthesisUtterance(' ')
  silent.volume = 0
  window.speechSynthesis.speak(silent)
}

/** Some browsers (Chrome) list their voices a moment after the page loads. */
export function voicesReady() {
  return new Promise((resolve) => {
    if (window.speechSynthesis.getVoices().length) return resolve()
    window.speechSynthesis.addEventListener('voiceschanged', () => resolve(), { once: true })
    setTimeout(resolve, 1500)
  })
}

// Only one reading at a time on the whole site: each new one takes over, and an older one never
// continues (some browsers report a cancelled sentence as "finished", which would start its next one).
let currentReading = 0

/** Stop whatever is being read aloud. */
export function stopSpeaking() {
  currentReading++
  if (canSpeak()) window.speechSynthesis.cancel()
}

const SENTENCE_END = /[.!?…]["'”’)\]]*$/
const WORDS_PER_MINUTE = 165

/**
 * Read `words` aloud starting at `from`, a sentence or two per utterance (long utterances get
 * cut off on some browsers). `onWord(i)` fires as each word starts; when the voice gives no
 * word events (some Android voices) it is estimated from the speaking pace.
 * Returns a function that stops reading.
 */
export function speakWords(words, { from = 0, rate = 1, volume = 1, voiceURI, language = pageLanguage(), onWord, onEnd }) {
  const synth = window.speechSynthesis
  const voice = readingVoice(voiceURI, language)
  const id = ++currentReading
  const live = () => id === currentReading
  let i = from

  const next = () => {
    if (!live()) return
    if (i >= words.length) return onEnd?.()
    const first = i
    const offsets = [] // where each word starts in the utterance text
    let length = 0
    while (i < words.length) {
      offsets.push(length)
      length += words[i].length + 1
      i++
      const count = i - first
      if ((count >= 12 && SENTENCE_END.test(words[i - 1])) || count >= 40) break
    }
    const utterance = new SpeechSynthesisUtterance(words.slice(first, i).join(' '))
    if (voice) utterance.voice = voice
    utterance.lang = voice?.lang || language
    utterance.rate = rate
    utterance.volume = volume

    let heardWords = false
    let pace
    utterance.onstart = () => {
      onWord?.(first)
      let k = first
      pace = setInterval(() => {
        if (heardWords || !live() || ++k >= i) return clearInterval(pace)
        onWord?.(k)
      }, 60000 / (WORDS_PER_MINUTE * rate))
    }
    utterance.onboundary = (event) => {
      if (!live() || (event.name && event.name !== 'word')) return
      heardWords = true
      let w = 0
      while (w + 1 < offsets.length && offsets[w + 1] <= event.charIndex) w++
      onWord?.(first + w)
    }
    utterance.onend = () => {
      clearInterval(pace)
      next()
    }
    utterance.onerror = (event) => {
      clearInterval(pace)
      if (live() && event.error !== 'interrupted' && event.error !== 'canceled') next()
    }
    synth.speak(utterance)
  }

  synth.cancel()
  setTimeout(next, 60) // Chrome drops an utterance queued right after cancel()
  return () => {
    if (live()) stopSpeaking()
  }
}

/** Rough reading time in seconds. */
export const speakingSeconds = (wordCount, rate = 1) => (wordCount * 60) / (WORDS_PER_MINUTE * rate)
