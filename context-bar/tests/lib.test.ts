// @ts-ignore bun:test has no types in the mod checker
import { describe, expect, test } from 'bun:test'
import { contextBar, modelLabel, monthKey, parseRows, projectName, statusLine, summarize, usd, warnLevel } from '../hooks/lib'

describe('bar and label', () => {
  test('model labels', () => {
    expect(modelLabel('claude-opus-5-5[1m]')).toBe('Opus 5.5')
    expect(modelLabel('sonnet')).toBe('Sonnet')
    expect(modelLabel('opusplan')).toBe('opusplan')
    expect(modelLabel(undefined)).toBe('?')
  })
  test('bar colors', () => {
    expect(contextBar({ tokens: 20000, window: 200000 })).toContain('🟢')
    expect(contextBar({ tokens: 130000, window: 200000 })).toContain('🟡')
    expect(contextBar({ tokens: 180000, window: 200000 })).toContain('🔴')
    expect(contextBar({ window: 200000 })).toContain('—')
  })
})

describe('status line extras', () => {
  test('plain stays as before', () => {
    expect(statusLine('claude-sonnet-5-5', { tokens: 44000, window: 200000 })).toBe('🔵 Sonnet 5.5 · 🟢 ctx ████░░░░░░░░░░░░░░░░ 22% · 44k / 200k')
  })
  test('cost and branch', () => {
    const s = statusLine('claude-opus-5-5', { tokens: 44000, window: 200000 }, { usd: 1.234, branch: 'main' })
    expect(s.endsWith('· $1.23 · ⎇ main')).toBe(true)
  })
  test('zero cost hidden, approx marked', () => {
    expect(statusLine('sonnet', { window: 1 }, { usd: 0 })).not.toContain('$')
    expect(usd(12.34, true)).toBe('~$12.3')
  })
})

describe('warnings', () => {
  test('levels', () => {
    expect([undefined, 10, 59, 60, 79, 80, 99].map(warnLevel)).toEqual([0, 0, 0, 1, 1, 2, 2])
  })
})

describe('ledger', () => {
  const day = 86_400_000
  const now = Date.UTC(2026, 10, 23)
  const rows = [
    { ts: now - 1 * day, project: 'a', models: ['Sonnet 5.5'], usd: 2, peakPct: 40 },
    { ts: now - 2 * day, project: 'a', models: ['Opus 5.5', 'Sonnet 5.5'], usd: 4, peakPct: 85 },
    { ts: now - 30 * day, project: 'b', models: ['Opus 5.5'], usd: 100, peakPct: 90 },
  ]
  test('summary only counts the window', () => {
    const t = summarize(rows, now - 7 * day, 7)
    expect(t).toContain('$6.00 over 2 sessions')
    expect(t).toContain('peak context 85%')
    expect(t).not.toContain('100')
  })
  test('empty window', () => expect(summarize(rows, now + day, 7)).toContain('No sessions'))
  test('parse skips damaged lines', () => {
    expect(parseRows(`${JSON.stringify(rows[0])}\nnot json\n\n`)).toHaveLength(1)
    expect(parseRows(undefined)).toEqual([])
  })
  test('helpers', () => {
    expect(projectName('C:\\a\\b\\myproject\\')).toBe('myproject')
    expect(monthKey(Date.UTC(2026, 10, 3))).toBe('2026-11')
  })
})
