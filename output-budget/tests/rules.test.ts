// @ts-ignore bun:test has no types in the mod checker
import { describe, expect, test } from 'bun:test'
import { countLines, DEFAULTS, isRenderedByRead, mergeConfig, readDenyReason, trimMcpContent } from '../hooks/rules'

describe('config', () => {
  test('later layer overrides, junk ignored', () => {
    expect(mergeConfig(DEFAULTS, { readMaxLines: 1000, grepMaxLines: -1, mcpMaxChars: 'x' })).toEqual({ ...DEFAULTS, readMaxLines: 1000 })
    expect(mergeConfig(DEFAULTS, null)).toBe(DEFAULTS)
  })
})

describe('read', () => {
  test('countLines', () => {
    expect(countLines('')).toBe(0)
    expect(countLines('a')).toBe(1)
    expect(countLines('a\nb\n')).toBe(3)
  })
  test('rendered files skipped', () => {
    expect(isRenderedByRead('a/b.PNG')).toBe(true)
    expect(isRenderedByRead('a/b.ts')).toBe(false)
  })
  test('deny text mentions the way out', () => {
    expect(readDenyReason('x.ts', 900, 600)).toContain('offset+limit')
  })
})

describe('trimMcpContent', () => {
  test('under the limit: untouched', () => expect(trimMcpContent([{ type: 'text', text: 'abc' }], 10)).toBeUndefined())
  test('cuts and marks', () => {
    const out = trimMcpContent([{ type: 'text', text: 'a'.repeat(100) }, { type: 'text', text: 'b'.repeat(100) }], 50)!
    expect(out).toHaveLength(1)
    expect(out[0]!.text!.startsWith('a'.repeat(50))).toBe(true)
    expect(out[0]!.text).toContain('150 chars omitted')
  })
  test('keeps non-text blocks', () => {
    const out = trimMcpContent([{ type: 'image', data: 'z' }, { type: 'text', text: 'a'.repeat(100) }], 10)!
    expect(out[0]).toEqual({ type: 'image', data: 'z' })
  })
  test('not an array', () => expect(trimMcpContent('x', 1)).toBeUndefined())
})
