// Pure rule logic for the `guards` mod: no engine API here, so it is unit-testable with `bun test`.

export type Config = {
  /** Globs of files that hold credentials. Basename match, or path-suffix match when the glob has a `/`. */
  secretGlobs: string[]
  /** Globs of database dumps / data extracts. */
  dumpGlobs: string[]
  /** Directory names that signal a data extract (`backup`, `dumps`). */
  dumpDirs: string[]
  /** `git` subcommands that need a human yes. */
  gitAsk: string[]
  /** Globs of MCP tool names that run without a prompt, e.g. `mcp__obsidian__*`. */
  mcpAllow: string[]
  /** Commands that only count or name (never print rows) and may touch a dump. */
  countCommands: string[]
  /** Turn a rule off: only honored from the user's own global file. */
  disable: Array<'git' | 'mcp'>
}

export const DEFAULTS: Config = {
  secretGlobs: [
    '.env', '.env.*', '*.env', 'local.properties', 'secrets.*', 'credentials*', '*.pem', '*.key', '*.p12',
    '*.pfx', '*.keystore', '*.jks', 'id_rsa*', 'id_ed25519*', 'id_ecdsa*', '.npmrc', '.pypirc', '.netrc',
    '.git-credentials', '.aws/credentials', '.docker/config.json', 'gradle.properties', 'serviceAccount*.json',
  ],
  dumpGlobs: ['*.sql', '*.dump', '*.bak', '*.bacpac', '*.mdf', '*.ibd', '*.sql.gz', '*.sql.zip'],
  dumpDirs: ['backup', 'backups', 'dumps'],
  gitAsk: ['commit', 'push', 'merge', 'tag'],
  mcpAllow: [],
  countCommands: ['ls', 'dir', 'stat', 'du', 'wc', 'file', 'test', 'get-item', 'get-childitem', 'gci'],
  disable: [],
}

// ---------- config merge ----------

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/**
 * Layers a parsed config file over `base`. Arrays only ever grow, so a file can add protection but never remove it.
 * `trusted` (the user's global file) may also add `countCommands` and `disable` rules; a project file may not.
 */
export const mergeConfig = (base: Config, raw: unknown, trusted: boolean): Config => {
  if (typeof raw !== 'object' || raw === null) return base
  const r = raw as Record<string, unknown>
  const union = (a: string[], b: string[]) => [...new Set([...a, ...b])]
  return {
    secretGlobs: union(base.secretGlobs, strings(r.secretGlobs)),
    dumpGlobs: union(base.dumpGlobs, strings(r.dumpGlobs)),
    dumpDirs: union(base.dumpDirs, strings(r.dumpDirs)),
    gitAsk: union(base.gitAsk, strings(r.gitAsk)),
    mcpAllow: union(base.mcpAllow, strings(r.mcpAllow)),
    countCommands: trusted ? union(base.countCommands, strings(r.countCommands)) : base.countCommands,
    disable: trusted ? [...new Set([...base.disable, ...strings(r.disable).filter((x): x is 'git' | 'mcp' => x === 'git' || x === 'mcp')])] : base.disable,
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

// ---------- paths ----------

const reCache = new Map<string, RegExp>()

export const globRe = (glob: string, anchored: boolean): RegExp => {
  const key = `${anchored ? 'a' : 'b'}:${glob}`
  const hit = reCache.get(key)
  if (hit) return hit
  const body = glob
    .toLowerCase()
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\/?/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '(?:.*/)?')
    .replace(/\?/g, '[^/]')
  const re = new RegExp(anchored ? `(?:^|/)${body}$` : `^${body}$`)
  reCache.set(key, re)
  return re
}

export const normPath = (p: string): string => p.trim().replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase()

const matchesGlob = (path: string, globs: string[]): boolean => {
  const norm = normPath(path)
  const base = norm.slice(norm.lastIndexOf('/') + 1)
  return globs.some(g => (g.includes('/') ? globRe(g, true).test(norm) : globRe(g, false).test(base)))
}

export const isSecretPath = (path: string, cfg: Config): boolean => matchesGlob(path, cfg.secretGlobs)

export const isDumpPath = (path: string, cfg: Config): boolean => {
  if (matchesGlob(path, cfg.dumpGlobs)) return true
  const dirs = normPath(path).split('/').slice(0, -1)
  return dirs.some(d => cfg.dumpDirs.includes(d))
}

const SECRET_MSG = (what: string) =>
  `guards: "${what}" is a secret-bearing file and is never read. Reference the variable in the command ($VAR) or ask the user to run it themselves (! <command>).`
const DUMP_MSG = (what: string) =>
  `guards: "${what}" is a data dump/extract and row content is never read. Counts, names and positions are fine (ls, wc -l, grep -c); for anything else ask the user to run the query and paste the aggregate.`

/** Deny reason for a file-tool path/glob argument, or undefined. */
export const checkPath = (path: string | undefined, cfg: Config): string | undefined => {
  if (!path) return undefined
  if (isSecretPath(path, cfg)) return SECRET_MSG(path)
  if (isDumpPath(path, cfg)) return DUMP_MSG(path)
  return undefined
}

// ---------- shell commands ----------

export const segments = (command: string): string[] =>
  command.split(/\|\||&&|[;|&\n]/).map(s => s.trim()).filter(Boolean)

/** Whitespace split that keeps quoted strings whole, then strips quotes and shell sigils from each token. */
export const tokens = (segment: string): string[] => {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  for (const m of segment.matchAll(re)) out.push((m[1] ?? m[2] ?? m[3] ?? '').replace(/^[$(<>`]+|[)<>`]+$/g, ''))
  return out.filter(Boolean)
}

const ENV_PREFIX = /^[A-Za-z_][A-Za-z0-9_]*=/

/** Words of a segment without leading `VAR=x`, `sudo`, `rtk`, `command`, `time`, `nohup`. */
const words = (segment: string): string[] => {
  const w = segment.split(/\s+/).filter(Boolean)
  while (w.length > 0 && (ENV_PREFIX.test(w[0] ?? '') || ['sudo', 'rtk', 'command', 'time', 'nohup', 'exec'].includes((w[0] ?? '').toLowerCase()))) w.shift()
  return w
}

const ENV_DUMP_MSG =
  'guards: dumping the environment prints every secret in the shell. Reference a single variable inside the command ($VAR) or ask the user.'

const isEnvDump = (segment: string): boolean => {
  const w = words(segment)
  const cmd = (w[0] ?? '').toLowerCase()
  const rest = w.slice(1)
  if (cmd === 'printenv') return true
  if (cmd === 'env') return rest.every(a => a.startsWith('-') && !a.includes('='))
  if (cmd === 'export') return rest.length === 0 || rest.every(a => a === '-p')
  if (cmd === 'set') return rest.length === 0
  if (cmd === 'declare' || cmd === 'typeset') return rest.length === 0 || rest.every(a => /^-[px]+$/.test(a))
  if (cmd === 'compgen') return rest.some(a => /^-[ev]$/.test(a))
  if (['get-childitem', 'gci', 'ls', 'dir', 'get-item', 'gi'].includes(cmd)) return rest.some(a => /^env:/i.test(a.replace(/^-path[:=]?/i, '')))
  return false
}

const grepCounts = (w: string[]): boolean => w.some(a => /^-[a-zA-Z]*[cqlL]|^--(count|quiet|files-with-matches|files-without-match)$/.test(a) && !a.startsWith('--no'))

/** True when the pipeline ends in something that only counts (`| wc -l`, `| Measure-Object`). */
const endsInCounter = (segs: string[]): boolean => {
  const last = words(segs[segs.length - 1] ?? '')
  const cmd = (last[0] ?? '').toLowerCase()
  return cmd === 'wc' || cmd === 'measure-object' || cmd === 'measure'
}

/** Deny reason for a Bash/PowerShell command line, or undefined. */
export const checkCommand = (command: string, cfg: Config): string | undefined => {
  const segs = segments(command)
  for (const seg of segs) if (isEnvDump(seg)) return ENV_DUMP_MSG

  const counter = endsInCounter(segs)
  for (const seg of segs) {
    const w = words(seg)
    const cmd = (w[0] ?? '').toLowerCase().replace(/^.*[\\/]/, '')
    for (const full of tokens(seg)) {
      // `--file=.env` and `KEY=path` forms: judge the value after the last `=` too.
      const t = full.includes('=') && !isSecretPath(full, cfg) && !isDumpPath(full, cfg) ? (full.split('=').pop() ?? full) : full
      if (isSecretPath(t, cfg)) return SECRET_MSG(t)
      if (isDumpPath(t, cfg)) {
        if (counter || cfg.countCommands.includes(cmd) || (cmd === 'grep' && grepCounts(w))) continue
        return DUMP_MSG(t)
      }
    }
  }
  return undefined
}

// ---------- git / mcp asks ----------

/** `git <sub>` for a subcommand in `cfg.gitAsk`, skipping global flags; also catches `rtk git push`. */
export const gitAskReason = (command: string, cfg: Config): string | undefined => {
  if (cfg.disable.includes('git')) return undefined
  for (const seg of segments(command)) {
    const w = words(seg)
    if ((w[0] ?? '').toLowerCase().replace(/^.*[\\/]/, '').replace(/\.exe$/, '') !== 'git') continue
    let i = 1
    while (i < w.length) {
      const a = w[i] ?? ''
      if (a === '-C' || a === '-c' || a === '--git-dir' || a === '--work-tree') i += 2
      else if (a.startsWith('-')) i += 1
      else break
    }
    const sub = w[i]
    if (sub && cfg.gitAsk.includes(sub.toLowerCase())) return `guards: \`git ${sub}\` changes history or the remote; it needs your explicit yes.`
  }
  return undefined
}

export const mcpAskReason = (tool: string, cfg: Config): string | undefined => {
  if (cfg.disable.includes('mcp') || !tool.startsWith('mcp__')) return undefined
  if (cfg.mcpAllow.some(g => globRe(g, false).test(tool.toLowerCase()))) return undefined
  return `guards: MCP tool ${tool} may point at a different environment than this project; confirm before it runs.`
}
