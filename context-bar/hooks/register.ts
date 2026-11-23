import type { Register } from 'claude-code'

type Ctx = { tokens?: number; window: number; percent?: number }

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

export const statusLine = (model: string | undefined, c: Ctx): string => {
  const label = modelLabel(model)
  const icon = ICON[label.split(' ')[0] ?? ''] ?? '◆'
  return `${icon} ${label} · ${contextBar(c)}`
}

export const register: Register = on => {
  let model: string | undefined
  let ctx: Ctx | undefined

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    model = await $.session.model()
    ctx = (await $.session.usage()).context
    $.ui.status(statusLine(model, ctx))
    return r
  })

  // The model each main-loop request actually uses (reflects opusplan: Opus in plan mode, Sonnet otherwise).
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined && e.model !== model) {
      model = e.model
      if (ctx) $.ui.status(statusLine(model, ctx))
    }
    return yield* next(e)
  })

  on('session.measure', ($, e, next) => {
    ctx = e.context
    $.ui.status(statusLine(model, ctx))
    return next(e)
  })
}
