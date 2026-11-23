import type { Register } from 'claude-code'
import { countLines, DEFAULTS, isRenderedByRead, mergeConfig, parseJson, readDenyReason, trimMcpContent, type Config } from './rules'

type Args = Record<string, unknown>
const FOUR_MIB = 4 * 1024 * 1024
const SMALL = 2000 // bytes: a file this small can't be over the line limit

export const register: Register = on => {
  // defaults -> ~/.claude/output-budget.json -> <project>/.claude/output-budget.json
  let config: Config = DEFAULTS
  // Paths already refused once this session: the same Read again goes through.
  const warned = new Set<string>()

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
    if (home) cfg = mergeConfig(cfg, await readJson(`${home}/.claude/output-budget.json`))
    config = mergeConfig(cfg, await readJson(`${cwd}/.claude/output-budget.json`))
    warned.clear()
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const a = e as unknown as Args & { tool: string }

    // large-file-guard
    if (a.tool === 'Read' && typeof a.file_path === 'string') {
      const path = a.file_path
      const whole = a.offset === undefined && a.limit === undefined && a.pages === undefined && a.allow_large !== true
      if (!whole || isRenderedByRead(path) || warned.has(path)) return next(e)
      let lines: number | undefined
      try {
        const st = await $.fs.stat(path)
        if (st.kind !== 'file' || st.size < SMALL) return next(e)
        lines = st.size > FOUR_MIB ? undefined : countLines(await $.fs.read(path))
      } catch {
        return next(e) // missing or unreadable: let the tool report it
      }
      if (lines === undefined || lines > config.readMaxLines) {
        warned.add(path)
        return { deny: readDenyReason(path, lines, config.readMaxLines) }
      }
      return next(e)
    }

    // Grep with head_limit 0 means "everything": cap it.
    if (a.tool === 'Grep' && a.head_limit === 0) return next({ ...e, head_limit: config.grepMaxLines } as typeof e)

    return next(e)
  })

  // Huge MCP results: keep the head, say what was cut.
  on('tool.run', async ($, e, next) => {
    const r = await next(e)
    if (!e.tool.startsWith('mcp__') || r.deny !== undefined || r.isError === true) return r
    try {
      const result = r.result as { content?: unknown } | undefined
      const content = trimMcpContent(result?.content, config.mcpMaxChars)
      return content ? { result: { ...result, content }, context: r.context } : r
    } catch {
      return r
    }
  })
}
