import { describe, expect, it } from 'vitest'
import { activeSubtitle, containedFrameRect } from './media-utils'
import { formatSrtTime, toSrt, validSubtitle, type Subtitle } from './types'

const cues: Subtitle[] = [
  { id: 'a', start: 1.25, end: 3, source: 'hello', text: 'မင်္ဂလာပါ' },
  { id: 'b', start: 4, end: 6, source: 'there', text: 'ဟိုင်း' },
]

describe('subtitle timing and SRT', () => {
  it('formats SRT timestamps with millisecond precision', () => {
    expect(formatSrtTime(3661.007)).toBe('01:01:01,007')
  })
  it('exports ordered UTF-8 subtitle cues using SubRip syntax', () => {
    expect(toSrt(cues)).toContain('00:00:01,250 --> 00:00:03,000\nမင်္ဂလာပါ')
    expect(toSrt(cues).startsWith('1\n')).toBe(true)
  })
  it('rejects negative and inverted timing and accepts valid ranges', () => {
    expect(validSubtitle(cues[0]!, 10)).toBe(true)
    expect(validSubtitle({ ...cues[0]!, start: 4, end: 2 }, 10)).toBe(false)
    expect(validSubtitle({ ...cues[0]!, start: -1 }, 10)).toBe(false)
  })
  it('resolves the active caption and leaves gaps empty', () => {
    expect(activeSubtitle(cues, 2)?.id).toBe('a')
    expect(activeSubtitle(cues, 3.5)).toBeUndefined()
    expect(activeSubtitle(cues, 6)).toBeUndefined()
  })
})

describe('contained video frame geometry', () => {
  it('fills a matching 16:9 stage without letterboxing', () => {
    expect(containedFrameRect(16, 9, 16, 9)).toEqual({ x: 0, y: 0, width: 16, height: 9 })
  })

  it('centers portrait frames inside a 16:9 stage', () => {
    const frame = containedFrameRect(16, 9, 9, 16)
    expect(frame.x).toBeCloseTo(5.46875)
    expect(frame.y).toBe(0)
    expect(frame.width).toBeCloseTo(5.0625)
    expect(frame.height).toBe(9)
  })

  it('centers ultrawide frames inside a 16:9 stage', () => {
    const frame = containedFrameRect(16, 9, 21, 9)
    expect(frame.x).toBe(0)
    expect(frame.y).toBeCloseTo(1.07142857)
    expect(frame.width).toBe(16)
    expect(frame.height).toBeCloseTo(6.85714286)
  })
})
