import type { Subtitle } from './types'

export type FrameRect = { x: number; y: number; width: number; height: number }

export function containedFrameRect(containerWidth: number, containerHeight: number, frameWidth: number, frameHeight: number): FrameRect {
  if (![containerWidth, containerHeight].every((value) => Number.isFinite(value) && value > 0)) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  if (![frameWidth, frameHeight].every((value) => Number.isFinite(value) && value > 0)) {
    return { x: 0, y: 0, width: containerWidth, height: containerHeight }
  }
  const scale = Math.min(containerWidth / frameWidth, containerHeight / frameHeight)
  const width = frameWidth * scale
  const height = frameHeight * scale
  return { x: (containerWidth - width) / 2, y: (containerHeight - height) / 2, width, height }
}

export async function sha256(blob: Blob): Promise<string> {
  const bytes = await blob.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function activeSubtitle(items: Subtitle[], time: number): Subtitle | undefined {
  return items.find((item) => time >= item.start && time < item.end)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
