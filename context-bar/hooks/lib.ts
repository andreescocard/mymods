// Pure helpers for `context-bar`: no engine API, unit-testable with `bun test`.

export type Ctx = { tokens?: number; window: number; percent?: number }
export type Extras = { usd?: number; isApprox?: boolean; branch?: string }

const WIDTH = 20

const k = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}k`)

export const contextBar = (c: Ctx): string => {
  if (c.tokens === undefined) return `ctx ${'░'.repeat(WIDTH)} — / ${k(c.window)}`
  const pct = c.percent ?? Math.round((c.tokens / c.window) * 100)
  const filled = Math.min(WIDTH, Math.round((pct / 100) * WIDTH))
  const mark = pct >= 80 ? '🔴' : pct >= 60 ? '🟡' : '🟢'
  return `${mark} ctx ${'█'.repeat(filled)}${'░'.repeat(WIDTH - filled)} ${pct}% · ${k(c.tokens)} / ${k(c.window)}`
}

/** "claude-opus-5-5[1m]" → "Opus 5.5"; aliases like "sonnet" → "Sonnet"; "opusplan" kept. */
export const modelLabel = (id: string | undefined): string => {
  if (!id) return '?'
  if (id === 'opusplan') return 'opusplan'
  const m = id.match(/(opus|sonnet|haiku|fable)(?:-(\d+)(?:-(\d+))?)?/i)
  const fam = m?.[1]
  if (!m || !fam) return id
  const name = fam.charAt(0).toUpperCase() + fam.slice(1).toLowerCase()
  const ver = m[2] ? ` ${m[2]}${m[3] && m[3].length <= 2 ? `.${m[3]}` : ''}` : ''
  return name + ver
}

const ICON: Record<string, string> = { Opus: '🟣', Sonnet: '🔵', Haiku: '⚪', Fable: '🟠' }

export const usd = (n: number, isApprox = false): string => `${isApprox ? '~' : ''}$${n < 10 ? n.toFixed(2) : n.toFixed(1)}`

export const statusLine = (model: string | undefined, c: Ctx, x: Extras = {}): string => {
  const label = modelLabel(model)
  const icon = ICON[label.split(' ')[0] ?? ''] ?? '◆'
  const parts = [`${icon} ${label}`, contextBar(c)]
  if (x.usd !== undefined && x.usd > 0) parts.push(usd(x.usd, x.isApprox))
  if (x.branch) parts.push(`⎇ ${x.branch}`)
  return parts.join(' · ')
}

/** 0 below 60%, 1 from 60%, 2 from 80%. */
export const warnLevel = (pct: number | undefined): 0 | 1 | 2 => (pct === undefined ? 0 : pct >= 80 ? 2 : pct >= 60 ? 1 : 0)

export const warnText = (level: 1 | 2, pct: number): string =>
  level === 2
    ? `Context at ${pct}%: finish this step, then /compact or hand off (/handoff).`
    : `Context at ${pct}%: good moment to /compact before the next big read.`

// ---------- ledger ----------

export type LedgerRow = { ts: number; project: string; models: string[]; usd: number; isApprox?: boolean; peakPct: number }

export const projectName = (cwd: string): string => cwd.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() || cwd

export const monthKey = (ts: number): string => new Date(ts).toISOString().slice(0, 7)

export const parseRows = (text: string | undefined): LedgerRow[] => {
  const out: LedgerRow[] = []
  for (const line of (text ?? '').split('\n')) {
    if (!line.trim()) continue
    try {
      const r = JSON.parse(line) as LedgerRow
      if (typeof r.ts === 'number' && typeof r.usd === 'number') out.push(r)
    } catch {
      // skip a damaged line
    }
  }
  return out
}

export const summarize = (rows: LedgerRow[], sinceMs: number, days: number): string => {
  const mine = rows.filter(r => r.ts >= sinceMs)
  if (mine.length === 0) return `No sessions in the ledger for the last ${days} days.`
  const total = mine.reduce((n, r) => n + r.usd, 0)
  const by = (key: (r: LedgerRow) => string[]) => {
    const m = new Map<string, { usd: number; n: number }>()
    for (const r of mine) {
      const keys = key(r)
      for (const kk of keys) {
        const cur = m.get(kk) ?? { usd: 0, n: 0 }
        m.set(kk, { usd: cur.usd + r.usd / keys.length, n: cur.n + 1 })
      }
    }
    return [...m.entries()].sort((a, b) => b[1].usd - a[1].usd)
  }
  const line = ([name, v]: [string, { usd: number; n: number }]) => `  ${name.padEnd(22)} ${usd(v.usd).padStart(8)}  ${v.n} session${v.n === 1 ? '' : 's'}`
  const peak = Math.max(...mine.map(r => r.peakPct))
  return [
    `Last ${days} days: ${usd(total, mine.some(r => r.isApprox))} over ${mine.length} sessions (peak context ${peak}%)`,
    'By project:',
    ...by(r => [r.project]).slice(0, 8).map(line),
    'By model (a session counts toward each model it used, cost split evenly):',
    ...by(r => (r.models.length ? r.models : ['?'])).map(line),
  ].join('\n')
}
