import type { Register } from 'claude-code'
import { contextBar, modelLabel, monthKey, parseRows, projectName, statusLine, summarize, warnLevel, warnText, type Ctx, type Extras, type LedgerRow } from './lib'

export { contextBar, modelLabel, statusLine }

const DAY = 86_400_000

export const register: Register = on => {
  let model: string | undefined
  let ctx: Ctx | undefined
  const extras: Extras = {}
  const models = new Set<string>()
  let peakPct = 0
  let warned: 0 | 1 | 2 = 0
  let cwd = ''
  let home: string | undefined

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    model = await $.session.model()
    const usage = await $.session.usage()
    ctx = usage.context
    extras.usd = usage.cost?.usd
    extras.isApprox = usage.cost?.hasUnknownPrice
    cwd = await $.session.cwd()
    home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
    try {
      const git = await $.process.run(['git', 'branch', '--show-current'])
      extras.branch = git.exitCode === 0 ? git.stdout.trim() || undefined : undefined
    } catch {
      extras.branch = undefined
    }
    if (model) models.add(modelLabel(model))
    await $.command.register({ name: 'ledger', description: 'Spend per project and model from the session ledger (/ledger [days], default 7)' })
    $.ui.status(statusLine(model, ctx, extras))
    return r
  })

  // The model each main-loop request actually uses (reflects opusplan: Opus in plan mode, Sonnet otherwise).
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      models.add(modelLabel(e.model))
      if (e.model !== model) {
        model = e.model
        if (ctx) $.ui.status(statusLine(model, ctx, extras))
      }
    }
    return yield* next(e)
  })

  on('session.measure', ($, e, next) => {
    ctx = e.context
    const pct = ctx.percent ?? (ctx.tokens === undefined ? undefined : Math.round((ctx.tokens / ctx.window) * 100))
    if (pct !== undefined) {
      peakPct = Math.max(peakPct, pct)
      const level = warnLevel(pct)
      if (level > warned && level > 0) $.ui.toast(warnText(level as 1 | 2, pct))
      warned = level // a /compact that drops the fill re-arms the warnings
    }
    $.ui.status(statusLine(model, ctx, extras))
    return next(e)
  })

  // Cost and branch move between turns, not between measures.
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId !== undefined) return r
    try {
      const usage = await $.session.usage()
      extras.usd = usage.cost?.usd
      extras.isApprox = usage.cost?.hasUnknownPrice
      const git = await $.process.run(['git', 'branch', '--show-current'])
      extras.branch = git.exitCode === 0 ? git.stdout.trim() || undefined : undefined
      if (ctx) $.ui.status(statusLine(model, ctx, extras))
    } catch {
      // a status refresh must never break a turn
    }
    return r
  })

  // Ledger: one JSONL row per session, ~/.claude/ledger/YYYY-MM.jsonl.
  on('session.end', async ($, e, next) => {
    try {
      const usage = await $.session.usage()
      const usdNow = usage.cost?.usd ?? 0
      if (home && usdNow > 0) {
        const row: LedgerRow = { ts: Date.now(), project: projectName(cwd), models: [...models], usd: usdNow, isApprox: usage.cost?.hasUnknownPrice, peakPct }
        const file = `${home}/.claude/ledger/${monthKey(row.ts)}.jsonl`
        let before = ''
        try {
          before = await $.fs.read(file)
        } catch {
          // first row of the month
        }
        await $.fs.write(file, `${before}${before && !before.endsWith('\n') ? '\n' : ''}${JSON.stringify(row)}\n`)
      }
    } catch {
      // never block exit
    }
    return next(e)
  })

  on('command.run', { command: 'ledger' }, async ($, e) => {
    const days = Math.min(365, Math.max(1, Number.parseInt(e.args.trim(), 10) || 7))
    const now = Date.now()
    const h = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
    if (!h) return { text: 'No home directory found for the ledger.' }
    const months = [...new Set([monthKey(now), monthKey(now - days * DAY)])]
    const rows: LedgerRow[] = []
    for (const m of months) {
      try {
        rows.push(...parseRows(await $.fs.read(`${h}/.claude/ledger/${m}.jsonl`)))
      } catch {
        // no file for that month
      }
    }
    return { text: summarize(rows, now - days * DAY, days) }
  })
}
