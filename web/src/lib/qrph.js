// Reads a QR Ph (InstaPay / EMVCo) payment QR so the admin form can fill itself in,
// the way a banking app does when it scans one.

// SWIFT/BIC codes of the banks and e-wallets that issue QR Ph codes.
const INSTITUTIONS = {
  GXCHPHM2: 'GCash',
  PAPHPHM1: 'Maya',
  PYMYPHM2: 'Maya',
  BOPIPHMM: 'BPI',
  BNORPHMM: 'BDO',
  MBTCPHMM: 'Metrobank',
  UBPHPHMM: 'UnionBank',
  PNBMPHMM: 'PNB',
  RCBCPHMM: 'RCBC',
  CHBKPHMM: 'China Bank',
  SETCPHMM: 'Security Bank',
  TLBPPHMM: 'Landbank',
  EWBCPHMM: 'EastWest',
  DBPHPHMM: 'DBP',
  AUBKPHMM: 'AUB',
  PHTBPHMM: 'PSBank',
  SHPHPHM2: 'ShopeePay',
  GOTYPHM2: 'GoTyme',
}

/** Splits an EMV "tag, length, value" string into { tag: value }. */
export function parseTlv(text) {
  const out = {}
  let i = 0
  while (i + 4 <= text.length) {
    const tag = text.slice(i, i + 2)
    const len = Number(text.slice(i + 2, i + 4))
    if (!/^\d{2}$/.test(tag) || Number.isNaN(len) || i + 4 + len > text.length) break
    out[tag] = text.slice(i + 4, i + 4 + len)
    i += 4 + len
  }
  return out
}

/** CRC-16/CCITT-FALSE, as QR Ph uses for its last field (tag 63). */
function crc16(text) {
  let crc = 0xffff
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/** What readers see under the QR: the masked account number, or GCash's masked User ID. */
export function accountLabel({ accountNumber, accountId }) {
  if (accountNumber) return maskAccount(accountNumber)
  if (accountId) return `User ID ••••${accountId.slice(-6)}`
  return ''
}

/** Shows only the last 4 digits, the way banks print account numbers on QR cards. */
export function maskAccount(number) {
  const digits = (number || '').replace(/\s/g, '')
  if (digits.length <= 4) return digits
  return `${'•'.repeat(Math.min(digits.length - 4, 7))} ${digits.slice(-4)}`
}

/**
 * Returns { valid, institution, bic, accountName, accountNumber, accountId, city } for a
 * QR Ph payload, or null when the text isn't a payment QR at all. Banks put the account
 * number in sub-field 04; GCash puts its alphanumeric User ID there instead.
 */
export function parseQrPh(payload) {
  if (!payload || !payload.startsWith('000201')) return null
  const top = parseTlv(payload)
  const crcAt = payload.lastIndexOf('6304')
  const valid = crcAt >= 0 && crc16(payload.slice(0, crcAt + 4)) === (top['63'] || '').toUpperCase()

  // Account details live in one of tags 26-51, identified by a GUID such as "com.p2pqrpay" or "ph.ppmi.p2m".
  let account = null
  for (let t = 26; t <= 51; t++) {
    const value = top[String(t)]
    if (!value) continue
    const sub = parseTlv(value)
    if (/^(com\.p2pqrpay|ph\.ppmi|ph\.qrph)/i.test(sub['00'] || '') || sub['01']) {
      account = sub
      break
    }
  }
  const bic = (account?.['01'] || '').toUpperCase()
  const reference = (account?.['04'] || '').trim()
  return {
    valid,
    bic,
    institution: INSTITUTIONS[bic.slice(0, 8)] || '',
    accountName: (top['59'] || '').trim(),
    accountNumber: /^\d{4,}$/.test(reference) ? reference : '',
    accountId: /^\d{4,}$/.test(reference) ? '' : reference,
    city: (top['60'] || '').trim(),
  }
}

/**
 * The same payment QR with a fixed amount, as GCash makes when you set an amount in Receive:
 * point of initiation 12 ("dynamic"), the amount in tag 54, and a fresh checksum.
 * Returns null if the payload can't be read.
 */
export function withAmount(payload, amount) {
  const fields = parseTlv(payload)
  if (!fields['00'] || !fields['63']) return null
  delete fields['63']
  fields['01'] = '12'
  fields['54'] = Number(amount).toFixed(2)
  const body = Object.keys(fields)
    .sort()
    .map((tag) => `${tag}${String(fields[tag].length).padStart(2, '0')}${fields[tag]}`)
    .join('')
  return `${body}6304${crc16(`${body}6304`)}`
}

/** Finds and reads the QR code in an image file. Resolves to the text inside, or null. */
export async function readQrFromFile(file) {
  const { default: jsQR } = await import('jsqr')
  const bitmap = await createImageBitmap(file) // a File or any Blob
  // Big phone screenshots are slow to scan; QR codes survive downscaling well.
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })?.data ?? null
}
