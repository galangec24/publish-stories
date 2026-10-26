// Warns readers while they type, before the server refuses it. Same lists and tricks as
// backend/accounts/profanity.py (keep them in step).

const PREFIXES = [
  'fuck', 'fck', 'fuk', 'motherfuck', 'shit', 'bullshit', 'bitch', 'cunt', 'asshole', 'bastard',
  'nigger', 'nigga', 'faggot', 'retard', 'whore', 'slut', 'dickhead',
  'putangina', 'putanginamo', 'tangina', 'tanginamo', 'pakyu', 'pakshet', 'punyeta', 'puñeta',
  'tarantado', 'kantot', 'kantutan', 'hindot', 'jakol', 'kupal', 'hayop ka',
]
const WORDS = [
  'puta', 'gago', 'gaga', 'ulol', 'olol', 'tanga', 'bobo', 'inutil', 'dick', 'cock', 'pussy', 'fag',
  'titi', 'puke', 'pekpek', 'burat', 'bilat', 'oten', 'yawa', 'piste', 'pisti', 'buang', 'wtf', 'stfu',
]
const ALLOWED = new Set(['shitake', 'shiitake', 'scunthorpe', 'cockatoo', 'cockatiel', 'dickens'])
const LEET = { 0: 'o', 1: 'i', '!': 'i', 3: 'e', 4: 'a', '@': 'a', $: 's', 5: 's', 7: 't', '*': 'u' }

const escape = (ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const stretch = (word) => [...word].map((ch) => (ch === ' ' ? '\\s*' : `${escape(ch)}+`)).join('')
const PATTERN = new RegExp(
  `\\b(?:${[...PREFIXES].sort((a, b) => b.length - a.length).map(stretch).join('|')})` +
    `|\\b(?:${WORDS.map(stretch).join('|')})s?\\b`,
  'gi',
)

function normalize(text) {
  const swapped = [...text.toLowerCase()].map((ch) => LEET[ch] ?? ch).join('')
  // "p u t a" / "f.u.c.k" → "puta" / "fuck"
  return swapped.replace(/\b(?:[a-z][\s._-]+){2,}[a-z]\b/g, (m) => m.replace(/[\s._-]+/g, ''))
}

/** The bad word found in `text`, or null. */
export function findBadWord(text) {
  if (!text) return null
  const s = normalize(String(text))
  for (const match of s.matchAll(PATTERN)) {
    let start = match.index
    let end = start + match[0].length
    while (start > 0 && /\p{L}/u.test(s[start - 1])) start--
    while (end < s.length && /\p{L}/u.test(s[end])) end++
    if (!ALLOWED.has(s.slice(start, end))) return match[0]
  }
  return null
}

export const KIND_MESSAGE = "Please keep it kind: that word isn't allowed here."
