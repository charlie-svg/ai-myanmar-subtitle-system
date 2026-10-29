export type Subtitle = {
  id: string
  start: number
  end: number
  source: string
  text: string
}

export type Mask = {
  id: string
  x: number
  y: number
  width: number
  height: number
  effect: 'blur' | 'solid'
}

export type StatusLog = {
  id: string
  time: string
  title: string
  detail: string
  kind: 'success' | 'info' | 'warning' | 'error'
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
  const minutes = Math.floor(safe / 60)
  const secs = safe % 60
  return `${String(minutes).padStart(2, '0')}:${secs.toFixed(2).padStart(5, '0')}`
}

export function formatSrtTime(seconds: number): string {
  const ms = Math.max(0, Math.round((Number.isFinite(seconds) ? seconds : 0) * 1000))
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  const secs = Math.floor((ms % 60_000) / 1000)
  const milli = ms % 1000
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(milli).padStart(3, '0')}`
}

export function toSrt(subtitles: Subtitle[]): string {
  return subtitles.map((item, index) => `${index + 1}\n${formatSrtTime(item.start)} --> ${formatSrtTime(item.end)}\n${item.text.trim() || item.source.trim()}\n`).join('\n')
}

export function validSubtitle(item: Subtitle, duration: number): boolean {
  return Number.isFinite(item.start) && Number.isFinite(item.end) && item.start >= 0 && item.end > item.start && item.end <= duration + 0.01
}

export function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
