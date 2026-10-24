import { BarChart3, Check, ChevronDown, Download, Table2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'

const PERIODS = [
  ['day', 'Daily', 30],
  ['week', 'Weekly', 7 * 12],
  ['month', 'Monthly', 365],
  ['year', 'Yearly', 365 * 5],
]
const peso = (n) => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function defaultRange(period) {
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - (PERIODS.find((p) => p[0] === period)[2] - 1))
  if (period === 'month') from.setDate(1)
  if (period === 'year') from.setMonth(0, 1)
  return { from: iso(from), to: iso(to) }
}

/** Start of the period containing `date` (weeks start on Monday, as the server counts them). */
function periodStart(date, period) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  if (period === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  if (period === 'month') d.setDate(1)
  if (period === 'year') d.setMonth(0, 1)
  return d
}

function nextPeriod(d, period) {
  const n = new Date(d)
  if (period === 'day') n.setDate(n.getDate() + 1)
  if (period === 'week') n.setDate(n.getDate() + 7)
  if (period === 'month') n.setMonth(n.getMonth() + 1)
  if (period === 'year') n.setFullYear(n.getFullYear() + 1)
  return n
}

function periodLabel(start, period, short = false) {
  const d = parse(start)
  if (period === 'year') return String(d.getFullYear())
  if (period === 'month') return d.toLocaleDateString('en-PH', { month: short ? 'short' : 'long', year: short ? '2-digit' : 'numeric' })
  if (period === 'week') return `${short ? '' : 'Week of '}${d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`
  return d.toLocaleDateString('en-PH', short ? { month: 'short', day: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

/** Every period in the range, with zero where nothing sold, so quiet days show as gaps. */
function fillSeries(series, period, from, to) {
  const byStart = Object.fromEntries(series.map((s) => [s.start, s]))
  const out = []
  for (let d = periodStart(parse(from), period); d <= parse(to) && out.length < 400; d = nextPeriod(d, period)) {
    const key = iso(d)
    out.push(byStart[key] || { start: key, count: 0, amount: '0.00' })
  }
  return out
}

function niceMax(value) {
  if (value <= 0) return 100
  const step = 10 ** Math.floor(Math.log10(value))
  return Math.ceil(value / step) * step
}

/** Money per period: one series, thin rounded bars on a recessive grid, hover for exact values. */
function SalesChart({ rows, period }) {
  const [hover, setHover] = useState(null)
  const W = 720
  const H = 240
  const pad = { l: 56, r: 8, t: 12, b: 28 }
  const max = niceMax(Math.max(...rows.map((r) => Number(r.amount)), 0))
  const plotW = W - pad.l - pad.r
  const plotH = H - pad.t - pad.b
  const slot = plotW / Math.max(rows.length, 1)
  const barW = Math.max(2, Math.min(28, slot - 2))
  const labelEvery = Math.ceil(rows.length / 8)
  const y = (v) => pad.t + plotH - (v / max) * plotH

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Money received per period">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" strokeWidth="1" />
            <text x={pad.l - 6} y={y(max * f) + 4} textAnchor="end" className="fill-muted" fontSize="11">
              {f === 0 ? '₱0' : `₱${(max * f).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const value = Number(r.amount)
          const x = pad.l + i * slot + (slot - barW) / 2
          const h = Math.max(0, pad.t + plotH - y(value))
          return (
            <g key={r.start} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {/* Hit target: the whole column, so thin bars are easy to hover */}
              <rect x={pad.l + i * slot} y={pad.t} width={slot} height={plotH} fill="transparent" />
              {value > 0 && (
                <path
                  d={`M${x},${pad.t + plotH} v${-Math.max(h - 4, 0)} q0,-4 4,-4 h${barW - 8} q4,0 4,4 v${Math.max(h - 4, 0)} z`}
                  fill="var(--brand)"
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              )}
              {i % labelEvery === 0 && (
                <text x={pad.l + i * slot + slot / 2} y={H - 8} textAnchor="middle" className="fill-muted" fontSize="11">
                  {periodLabel(r.start, period, true)}
                </text>
              )}
            </g>
          )
        })}
        <line x1={pad.l} x2={W - pad.r} y1={pad.t + plotH} y2={pad.t + plotH} stroke="var(--muted)" strokeWidth="1" />
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-2 rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-xl"
          style={{ left: `${Math.min(80, Math.max(2, ((pad.l + hover * slot) / W) * 100))}%` }}
        >
          <p className="font-semibold">{periodLabel(rows[hover].start, period)}</p>
          <p>{peso(rows[hover].amount)}</p>
          <p className="text-muted">
            {rows[hover].count} sale{rows[hover].count === 1 ? '' : 's'}
          </p>
        </div>
      )}
    </div>
  )
}

function StoryPicker({ stories, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false)
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  const label = !selected.length ? 'All stories' : selected.length === 1 ? stories.find((s) => s.id === selected[0])?.title || '1 story' : `${selected.length} stories`
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  return (
    <div ref={ref} className="relative">
      <button type="button" className="input flex !w-56 items-center justify-between !py-2 text-left" onClick={() => setOpen(!open)}>
        <span className="truncate">{label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
      </button>
      {open && (
        <div className="card absolute z-20 mt-1 max-h-72 w-72 overflow-y-auto p-1 shadow-2xl">
          <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2" onClick={() => onChange([])}>
            <span className="grid h-4 w-4 place-items-center rounded border border-line">{!selected.length && <Check className="h-3 w-3" />}</span>
            All stories
          </button>
          {stories.map((s) => (
            <button key={s.id} type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2" onClick={() => toggle(s.id)}>
              <span className="grid h-4 w-4 shrink-0 place-items-center rounded border border-line">{selected.includes(s.id) && <Check className="h-3 w-3" />}</span>
              <span className="truncate">{s.title}</span>
              <span className="ml-auto shrink-0 text-xs text-muted">{s.is_free ? 'free' : `₱${Number(s.price).toFixed(0)}`}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Tile({ label, value, sub, hero = false }) {
  return (
    <div className="card p-4">
      <p className="text-xs tracking-wide text-muted uppercase">{label}</p>
      <p className={`mt-1 font-display ${hero ? 'text-4xl' : 'text-2xl'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  )
}

function downloadCsv(report, rows) {
  const lines = [
    ['Period', 'Sales', 'Amount (PHP)'],
    ...rows.map((r) => [periodLabel(r.start, report.period), r.count, r.amount]),
    [],
    ['Story', 'Sales', 'Amount (PHP)'],
    ...report.by_story.map((s) => [s.title, s.count, s.amount]),
    [],
    ['Total', report.totals.count, report.totals.amount],
  ]
  const csv = lines.map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  link.download = `sales-${report.period}-${report.from}-to-${report.to}.csv`
  link.click()
}

/** Money received: daily, weekly, monthly or yearly, for all stories or the ones picked. */
export function SalesReport() {
  const [period, setPeriod] = useState('day')
  const [range, setRange] = useState(() => defaultRange('day'))
  const [storyIds, setStoryIds] = useState([])
  const [view, setView] = useState('chart')
  const stories = useAsync(() => api.get('admin/stories/', { status: 'published' }).then((d) => d.results.filter((s) => !s.is_free)), [])
  const report = useAsync(
    () => api.get('admin/sales/', { period, from: range.from, to: range.to, story: storyIds.join(',') }),
    [period, range.from, range.to, storyIds.join(',')],
  )
  const data = report.data
  const rows = useMemo(() => (data ? fillSeries(data.series, data.period, data.from, data.to) : []), [data])
  const best = data?.by_story[0]
  const totalAmount = Number(data?.totals.amount || 0)

  return (
    <div>
      <h1 className="flex items-center gap-2 font-display text-3xl">
        <BarChart3 className="h-7 w-7 text-brand" /> Sales report
      </h1>
      <p className="mt-1 text-sm text-muted">Money received from readers, by day, week, month or year. Revoked payments are left out.</p>

      {/* Filters, one row */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl border border-line p-1">
          {PERIODS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => {
                setPeriod(id)
                setRange(defaultRange(id))
              }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${period === id ? 'bg-brand text-white shadow' : 'text-muted hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <input type="date" className="input !w-auto !py-2" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} aria-label="From" />
        <span className="text-muted">to</span>
        <input type="date" className="input !w-auto !py-2" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} aria-label="To" />
        <StoryPicker stories={stories.data || []} selected={storyIds} onChange={setStoryIds} />
        {data && (
          <button className="btn-ghost !py-2 sm:ml-auto" onClick={() => downloadCsv(data, rows)}>
            <Download className="h-4 w-4" /> Export CSV
          </button>
        )}
      </div>

      {!data ? (
        <Spinner />
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile hero label="Total earned" value={peso(data.totals.amount)} sub={`${data.totals.count} sale${data.totals.count === 1 ? '' : 's'}`} />
            <Tile
              label="Average per sale"
              value={data.totals.count ? peso(totalAmount / data.totals.count) : '—'}
              sub={best ? `Top story: ${best.title}` : 'No sales in this range'}
            />
            <Tile label="Not yet checked" value={peso(data.totals.unchecked_amount)} sub={`${data.totals.unchecked_count} QR payment${data.totals.unchecked_count === 1 ? '' : 's'} to confirm`} />
            <Tile label="Revoked" value={peso(data.revoked.amount)} sub={`${data.revoked.count} not received (not counted)`} />
          </div>

          <section className="card mt-5 p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-semibold">
                {PERIODS.find((p) => p[0] === data.period)[1]} sales
                <span className="ml-2 text-sm font-normal text-muted">
                  {periodLabel(data.from, 'day')} – {periodLabel(data.to, 'day')}
                </span>
              </h2>
              <div className="flex gap-1 rounded-lg border border-line p-0.5">
                <button className={`rounded-md p-1.5 ${view === 'chart' ? 'bg-surface-2 text-ink' : 'text-muted'}`} onClick={() => setView('chart')} aria-label="Chart view">
                  <BarChart3 className="h-4 w-4" />
                </button>
                <button className={`rounded-md p-1.5 ${view === 'table' ? 'bg-surface-2 text-ink' : 'text-muted'}`} onClick={() => setView('table')} aria-label="Table view">
                  <Table2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            {view === 'chart' ? (
              totalAmount > 0 ? (
                <SalesChart rows={rows} period={data.period} />
              ) : (
                <p className="py-16 text-center text-sm text-muted">No sales in this range yet.</p>
              )
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface text-left text-xs text-muted uppercase">
                    <tr>
                      <th className="py-2">Period</th>
                      <th className="py-2 text-right">Sales</th>
                      <th className="py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {[...rows].reverse().map((r) => (
                      <tr key={r.start} className={r.count ? '' : 'text-muted'}>
                        <td className="py-1.5">{periodLabel(r.start, data.period)}</td>
                        <td className="py-1.5 text-right tabular-nums">{r.count}</td>
                        <td className="py-1.5 text-right tabular-nums">{peso(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card mt-5 p-5">
            <h2 className="font-semibold">By story</h2>
            {!data.by_story.length ? (
              <p className="py-6 text-center text-sm text-muted">No sales in this range yet.</p>
            ) : (
              <table className="mt-2 w-full text-sm">
                <thead className="text-left text-xs text-muted uppercase">
                  <tr>
                    <th className="py-2">Story</th>
                    <th className="py-2 text-right">Sales</th>
                    <th className="py-2 text-right">Amount</th>
                    <th className="hidden w-40 py-2 sm:table-cell" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.by_story.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2">{s.title}</td>
                      <td className="py-2 text-right tabular-nums">{s.count}</td>
                      <td className="py-2 text-right font-semibold tabular-nums">{peso(s.amount)}</td>
                      <td className="hidden py-2 pl-3 sm:table-cell">
                        <div className="h-2 rounded-full bg-surface-2">
                          <div className="h-2 rounded-full bg-brand" style={{ width: `${(Number(s.amount) / totalAmount) * 100}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  )
}
