import type { Register } from 'claude-code'
import { checkCommand, checkPath, DEFAULTS, gitAskReason, mcpAskReason, mergeConfig, parseJson, type Config } from './rules'

type Args = Record<string, unknown>
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

export const register: Register = on => {
  // Built at session start: defaults -> ~/.claude/guards.json (trusted) -> <project>/.claude/guards.json (additions only).
  let config: Config = DEFAULTS

  on('session.start', async ($, e, next) => {
    const readJson = async (path: string): Promise<unknown> => {
      try {
        return parseJson(await $.fs.read(path))
      } catch {
        return undefined
      }
    }
    const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
    const cwd = await $.session.cwd()
    let cfg = DEFAULTS
    if (home) cfg = mergeConfig(cfg, await readJson(`${home}/.claude/guards.json`), true)
    cfg = mergeConfig(cfg, await readJson(`${cwd}/.claude/guards.json`), false)
    config = cfg
    return next(e)
  })

  // secret-guard: refuse (the model gets the reason and the safe alternative).
  on('tool.call', ($, e, next) => {
    const a = e as unknown as Args & { tool: string }
    let reason: string | undefined
    switch (a.tool) {
      case 'Read':
      case 'Edit':
        reason = checkPath(str(a.file_path), config)
        break
      case 'Grep':
        reason = checkPath(str(a.path), config) ?? checkPath(str(a.glob), config)
        break
      case 'Glob':
        reason = checkPath(str(a.pattern), config) ?? checkPath(str(a.path), config)
        break
      case 'Bash':
      case 'PowerShell':
        reason = checkCommand(str(a.command) ?? '', config)
        break
    }
    return reason ? { deny: reason } : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'guards: the check failed, so the call is refused. Ask the user.' }))

  // commit-gate + mcp-confirm: put the call to the person.
  on('tool.check', ($, e, next) => {
    let reason: string | undefined
    if (e.tool === 'Bash' || e.tool === 'PowerShell') reason = gitAskReason(str((e.input as Args | undefined)?.command) ?? '', config)
    else reason = mcpAskReason(e.tool, config)
    return reason ? { decision: 'ask', reason } : next(e)
  }).catch(() => ({ decision: 'ask', reason: 'guards: the check failed; confirm this call.' }))
}
