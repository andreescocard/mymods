// @ts-ignore bun:test has no types in the mod checker
import { describe, expect, test } from 'bun:test'
import { checkCommand, checkPath, DEFAULTS, gitAskReason, mcpAskReason, mergeConfig } from '../hooks/rules'

const cfg = DEFAULTS
const denied = (c: string) => expect(checkCommand(c, cfg)).toBeDefined()
const allowed = (c: string) => expect(checkCommand(c, cfg)).toBeUndefined()

describe('secret paths', () => {
  test.each(['.env', 'apps/api/.env.local', 'C:\\proj\\.env.production', 'keys/server.pem', 'a/b/credentials.json', '~/.aws/credentials', 'x/.docker/config.json', 'serviceAccount-prod.json', 'gradle.properties'])(
    'denies %s',
    (p: string) => expect(checkPath(p, cfg)).toBeDefined(),
  )
  test.each(['src/environment.ts', 'README.md', 'envelope.txt', 'docker/config.yaml', 'a/.envrc.md'])('allows %s', (p: string) =>
    expect(checkPath(p, cfg)).toBeUndefined(),
  )
})

describe('dumps', () => {
  test('denies dump files and dump dirs', () => {
    expect(checkPath('db/sistema10032023.sql', cfg)).toBeDefined()
    expect(checkPath('backup/notes.txt', cfg)).toBeDefined()
    expect(checkPath('src/backup.ts', cfg)).toBeUndefined()
  })
  test('bash: counts and names allowed, rows denied', () => {
    allowed('ls -la db/x.sql')
    allowed('wc -l db/x.sql')
    allowed('grep -c INSERT db/x.sql')
    allowed('grep -o "CREATE TABLE" db/x.sql | wc -l')
    allowed('cat db/x.sql | wc -l')
    denied('cat db/x.sql')
    denied('head -3 db/x.sql')
    denied('grep INSERT db/x.sql')
    denied('sed -n 1,5p backup/db.dump')
  })
})

describe('bash secrets and env', () => {
  test('denies', () => {
    denied('cat .env')
    denied('source .env.local')
    denied('cat < .env')
    denied('grep KEY apps/api/.env')
    denied('node app.js --file=.env')
    denied('printenv')
    denied('printenv PATH')
    denied('env')
    denied('export')
    denied('set')
    denied('Get-ChildItem Env:')
    denied('gci env:')
    denied('echo hi && env')
  })
  test('allows', () => {
    allowed('ls src')
    allowed('env FOO=bar node x.js')
    allowed('export FOO=bar')
    allowed('curl -H "Authorization: $API_TOKEN" https://x')
    allowed('git status')
    allowed('echo environment')
  })
})

describe('git gate', () => {
  test('asks for history-changing subcommands', () => {
    for (const c of ['git commit -m x', 'git push', 'rtk git push origin main', 'git -C repo tag v1', 'cd x && git merge dev', 'git commit --amend'])
      expect(gitAskReason(c, cfg)).toBeDefined()
  })
  test('passes read-only', () => {
    for (const c of ['git status', 'git log -3', 'git diff', 'git -c a=b status', 'echo git commit'])
      expect(gitAskReason(c, cfg)).toBeUndefined()
  })
  test('disable switch', () => {
    expect(gitAskReason('git push', { ...cfg, disable: ['git'] })).toBeUndefined()
  })
})

describe('mcp gate', () => {
  test('asks unless allowlisted', () => {
    expect(mcpAskReason('mcp__serena__find_symbol', cfg)).toBeDefined()
    expect(mcpAskReason('Read', cfg)).toBeUndefined()
    const c = mergeConfig(cfg, { mcpAllow: ['mcp__obsidian__*'] }, false)
    expect(mcpAskReason('mcp__obsidian__obsidian_get_file_contents', c)).toBeUndefined()
    expect(mcpAskReason('mcp__serena__find_symbol', c)).toBeDefined()
  })
})

describe('config merge', () => {
  test('project file adds patterns, cannot disable rules or widen count commands', () => {
    const c = mergeConfig(cfg, { secretGlobs: ['config.php'], disable: ['git'], countCommands: ['cat'] }, false)
    expect(checkPath('a/config.php', c)).toBeDefined()
    expect(c.disable).toEqual([])
    expect(c.countCommands).toEqual(cfg.countCommands)
  })
  test('trusted global may disable and widen', () => {
    const c = mergeConfig(cfg, { disable: ['mcp'], countCommands: ['md5sum'] }, true)
    expect(c.disable).toEqual(['mcp'])
    expect(c.countCommands).toContain('md5sum')
  })
  test('garbage is ignored', () => {
    expect(mergeConfig(cfg, 'nope', true)).toBe(cfg)
    expect(mergeConfig(cfg, { secretGlobs: 5 }, true).secretGlobs).toEqual(cfg.secretGlobs)
  })
})
