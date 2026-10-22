const UNITS = [
  ['y', 365 * 24 * 3600],
  ['w', 7 * 24 * 3600],
  ['d', 24 * 3600],
  ['h', 3600],
  ['m', 60],
]

/** Facebook-style short relative time: "now", "5m", "3h", "2d", "1w". */
export function timeAgo(iso) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 45) return 'now'
  for (const [label, size] of UNITS) {
    if (seconds >= size) return `${Math.floor(seconds / size)}${label}`
  }
  return '1m'
}

export function initials(user) {
  const name = user?.first_name || user?.display_name || user?.email || '?'
  return name.trim()[0].toUpperCase()
}

export function fullName(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.display_name || user?.email || ''
}
