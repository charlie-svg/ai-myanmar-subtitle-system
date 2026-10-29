import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

test('loads the local Myanmar subtitle studio and exposes primary tools', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Give your video a voice.' })).toBeVisible()
  await expect(page.getByText('Nothing is uploaded to a server')).toBeVisible()
  await expect(page.getByRole('button', { name: /Choose a video/ })).toBeVisible()
  await expect(page.getByText('Private by design')).toBeVisible()
})

test('subtitle editing navigation remains available at a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  const bottomNav = page.getByRole('navigation', { name: 'Bottom navigation' })
  await expect(bottomNav).toBeVisible()
  await bottomNav.getByRole('button', { name: 'Captions' }).click()
  await expect(page.getByRole('heading', { name: 'Edit your subtitles' })).toBeVisible()
  await expect(page.getByText('No captions yet')).toBeVisible()
})

test('accepts an MP4, draws blur and black masks, exports SRT and renders MP4 with intact audio', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('./')
  const fixture = await readFile(join(process.cwd(), 'e2e/fixtures/portrait.mp4'))
  await page.locator('input[type="file"]').setInputFiles({ name: 'portrait.mp4', mimeType: 'video/mp4', buffer: fixture })
  await expect(page.getByText('portrait.mp4', { exact: true }).first()).toBeVisible()
  await page.locator('.video-stage video').evaluate((video) => {
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 180 })
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 320 })
    Object.defineProperty(video, 'duration', { configurable: true, value: 2 })
    video.dispatchEvent(new Event('loadedmetadata'))
  })
  const pictureFit = await page.locator('.video-frame-layer').evaluate((layer) => {
    const stage = layer.parentElement!.getBoundingClientRect()
    const picture = layer.getBoundingClientRect()
    return { left: picture.left - stage.left, width: picture.width, stageWidth: stage.width, height: picture.height, stageHeight: stage.height }
  })
  expect(pictureFit.width / pictureFit.stageWidth).toBeCloseTo(0.3164, 2)
  expect(pictureFit.left / pictureFit.stageWidth).toBeCloseTo(0.3418, 2)
  expect(pictureFit.height / pictureFit.stageHeight).toBeCloseTo(1, 2)

  await page.locator('.side-nav').getByRole('button', { name: 'Cover' }).click()
  await page.getByRole('button', { name: 'Blur' }).click()
  const area = page.locator('.mask-capture')
  await area.scrollIntoViewIfNeeded()
  const bounds = await area.boundingBox()
  if (!bounds) throw new Error('Video mask selection overlay did not appear.')
  const start = { x: bounds.x + 30, y: bounds.y + 100 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(bounds.x + 140, bounds.y + 168)
  await page.mouse.up()
  await expect(page.getByText('Region 1 · Blur')).toBeVisible()
  await page.getByRole('button', { name: 'Black box' }).click()
  await page.mouse.move(bounds.x + 80, bounds.y + 110)
  await page.mouse.down()
  await page.mouse.move(bounds.x + 180, bounds.y + 184)
  await page.mouse.up()
  await expect(page.getByText('Region 2 · Black box')).toBeVisible()

  await page.locator('.side-nav').getByRole('button', { name: 'Captions' }).click()
  await page.getByRole('button', { name: 'Add cue' }).click()
  await page.getByLabel('Burmese caption 1').fill('မင်္ဂလာပါ')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Export .SRT/ }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toContain('.srt')
  await page.locator('.side-nav').getByRole('button', { name: 'Export' }).click()
  await page.getByRole('button', { name: 'Render final MP4' }).click()
  await expect(page.getByRole('link', { name: 'Download' })).toBeVisible({ timeout: 150_000 })
  await expect(page.getByText('Exact stream payload match')).toBeVisible({ timeout: 20_000 })
})

test('M2M100 translates a sample into Myanmar script locally', async ({ page }) => {
  test.skip(process.env.RUN_LOCAL_MODEL_TESTS !== '1', 'Optional network-backed model smoke test downloads the browser-local weights.')
  test.setTimeout(240_000)
  await page.goto('./')
  const translation = await page.evaluate(async () => {
    const { translateLocal } = await import(new URL('/src/local-ai.ts', location.origin).href)
    const result = await translateLocal([{ id: 'smoke', start: 0, end: 2, source: 'Good morning. Thank you for your help.', text: '' }], 'en', () => undefined)
    return result[0]?.text ?? ''
  })
  expect(translation).toMatch(/\p{Script=Myanmar}/u)
})

test('Whisper tiny transcribes a speech fixture locally with usable timestamps', async ({ page }) => {
  test.skip(process.env.RUN_LOCAL_MODEL_TESTS !== '1', 'Optional network-backed model smoke test downloads the browser-local weights.')
  test.setTimeout(240_000)
  await page.goto('./')
  const speech = await readFile(join(process.cwd(), 'e2e/fixtures/jfk.flac'))
  const segments = await page.evaluate(async (audioBase64) => {
    const bytes = Uint8Array.from(atob(audioBase64), (char) => char.charCodeAt(0))
    const file = new File([bytes], 'speech.mp4', { type: 'video/mp4' })
    const { transcribeLocal } = await import(new URL('/src/local-ai.ts', location.origin).href)
    return await transcribeLocal(file, () => undefined) as Array<{ source: string; start: number; end: number }>
  }, speech.toString('base64'))
  const transcript = segments.map((segment) => segment.source).join(' ')
  expect(transcript).toMatch(/ask not|country/i)
  expect(segments.every((segment) => segment.start >= 0 && segment.end > segment.start)).toBe(true)
})
