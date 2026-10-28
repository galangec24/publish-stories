// The reader's own device voice (the browser's speech synthesis): free, no account, and the
// text never leaves the device. Used for "Listen" and for the free reels.

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function'

const PREFERRED = /natural|neural|online|siri|samantha|ava|allison|aria|jenny|google us english|google uk english/i

/** The device's English voices, most natural-sounding first. */
export function englishVoices() {
  const voices = window.speechSynthesis.getVoices()
  const english = voices.filter((v) => /^en([-_]|$)/i.test(v.lang))
  const score = (v) => (PREFERRED.test(v.name) ? 4 : 0) + (/en[-_](us|gb|ph|au)/i.test(v.lang) ? 1 : 0) + (v.default ? 1 : 0)
  return english.sort((a, b) => score(b) - score(a))
}

/** The voice the reader picked (by its id), or else the most natural-sounding English one. */
export function englishVoice(voiceURI) {
  const voices = englishVoices()
  return voices.find((v) => v.voiceURI === voiceURI) || voices[0] || null
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

const SENTENCE_END = /[.!?…]["'”’)\]]*$/
const WORDS_PER_MINUTE = 165

/**
 * Read `words` aloud starting at `from`, a sentence or two per utterance (long utterances get
 * cut off on some browsers). `onWord(i)` fires as each word starts; when the voice gives no
 * word events (some Android voices) it is estimated from the speaking pace.
 * Returns a function that stops reading.
 */
export function speakWords(words, { from = 0, rate = 1, volume = 1, voiceURI, onWord, onEnd }) {
  const synth = window.speechSynthesis
  const voice = englishVoice(voiceURI)
  let stopped = false
  let i = from

  const next = () => {
    if (stopped) return
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
    utterance.lang = voice?.lang || 'en-US'
    utterance.rate = rate
    utterance.volume = volume

    let heardWords = false
    let pace
    utterance.onstart = () => {
      onWord?.(first)
      let k = first
      pace = setInterval(() => {
        if (heardWords || stopped || ++k >= i) return clearInterval(pace)
        onWord?.(k)
      }, 60000 / (WORDS_PER_MINUTE * rate))
    }
    utterance.onboundary = (event) => {
      if (event.name && event.name !== 'word') return
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
      if (!stopped && event.error !== 'interrupted' && event.error !== 'canceled') next()
    }
    synth.speak(utterance)
  }

  synth.cancel()
  setTimeout(next, 60) // Chrome drops an utterance queued right after cancel()
  return () => {
    stopped = true
    synth.cancel()
  }
}

/** Rough reading time in seconds. */
export const speakingSeconds = (wordCount, rate = 1) => (wordCount * 60) / (WORDS_PER_MINUTE * rate)
