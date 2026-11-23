// Pure helpers for `output-budget`: no engine API, unit-testable with `bun test`.

export type Config = {
  /** A Read with no offset/limit on a file longer than this is refused once, with a hint. */
  readMaxLines: number
  /** Grep `head_limit: 0` (unlimited) is rewritten to this many lines/entries. */
  grepMaxLines: number
  /** MCP text results longer than this are cut, with a marker. */
  mcpMaxChars: number
}

export const DEFAULTS: Config = { readMaxLines: 600, grepMaxLines: 300, mcpMaxChars: 20000 }

const positive = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : undefined)

/** Later layers override earlier ones; invalid numbers are ignored. */
export const mergeConfig = (base: Config, raw: unknown): Config => {
  if (typeof raw !== 'object' || raw === null) return base
  const r = raw as Record<string, unknown>
  return {
    readMaxLines: positive(r.readMaxLines) ?? base.readMaxLines,
    grepMaxLines: positive(r.grepMaxLines) ?? base.grepMaxLines,
    mcpMaxChars: positive(r.mcpMaxChars) ?? base.mcpMaxChars,
  }
}

export const parseJson = (text: string | undefined): unknown => {
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** Files the Read tool renders itself (images, PDFs, notebooks): line counts mean nothing. */
export const isRenderedByRead = (path: string): boolean => /\.(png|jpe?g|gif|webp|bmp|pdf|ipynb|svg)$/i.test(path)

export const countLines = (text: string): number => {
  if (text === '') return 0
  let n = 1
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++
  return n
}

export const readDenyReason = (path: string, lines: number | undefined, max: number): string =>
  `output-budget: ${path} has ${lines === undefined ? 'more than 4 MiB' : `${lines} lines`}, over the ${max}-line limit for a whole-file Read. ` +
  `Use Grep to find what you need, or Read with offset+limit. If you really need the whole file, repeat the same Read once and it will go through.`

type Block = { type?: string; text?: string; [k: string]: unknown }

/**
 * Cuts the text blocks of an MCP result to `max` chars in total, appending a marker to the block where it cut.
 * Returns undefined when nothing needed cutting (so the caller keeps the original).
 */
export const trimMcpContent = (content: unknown, max: number): Block[] | undefined => {
  if (!Array.isArray(content)) return undefined
  const total = content.reduce((n: number, b: Block) => n + (b?.type === 'text' && typeof b.text === 'string' ? b.text.length : 0), 0)
  if (total <= max) return undefined
  let left = max
  const out: Block[] = []
  for (const b of content as Block[]) {
    if (b?.type !== 'text' || typeof b.text !== 'string') {
      out.push(b)
      continue
    }
    if (left <= 0) continue
    if (b.text.length <= left) {
      out.push(b)
      left -= b.text.length
    } else {
      const omitted = total - max
      out.push({ ...b, text: `${b.text.slice(0, left)}\n[output-budget: ${omitted} chars omitted. Narrow the query, add filters or paging.]` })
      left = 0
    }
  }
  return out
}
