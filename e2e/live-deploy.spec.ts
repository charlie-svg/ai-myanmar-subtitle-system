import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Opt-in because the real browser-local Whisper and M2M100 weights may total hundreds of MB.
test('live deployment processes a speech MP4 locally from input through verified output', async ({ page }) => {
  test.skip(process.env.RUN_LIVE_SMOKE !== '1', 'Opt-in production test downloads browser-local ASR and translation weights.')
  test.setTimeout(900_000)

  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })

  const response = await page.goto('./', { waitUntil: 'domcontentloaded' })
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Give your video a voice.' })).toBeVisible()

  const fixture = await readFile(join(process.cwd(), 'e2e/fixtures/jfk_portrait.mp4'))
  await page.locator('input[type="file"]').setInputFiles({ name: 'jfk-portrait.mp4', mimeType: 'video/mp4', buffer: fixture })
  await expect(page.getByText('jfk-portrait.mp4', { exact: true }).first()).toBeVisible()
  const video = page.locator('.video-stage video')
  await expect(video).toHaveAttribute('src', /^blob:/)
  // Headless CI Chromium may not include H.264 playback codecs; provide known frame metadata
  // so the test still exercises the true contain/letterbox masking geometry and real MP4 bytes.
  await video.evaluate((element) => {
    Object.defineProperty(element, 'videoWidth', { configurable: true, value: 180 })
    Object.defineProperty(element, 'videoHeight', { configurable: true, value: 320 })
    Object.defineProperty(element, 'duration', { configurable: true, value: 18 })
    element.dispatchEvent(new Event('loadedmetadata'))
  })

  await page.getByRole('button', { name: 'Transcribe' }).click()
  const cueTextareas = page.locator('textarea[aria-label^="Burmese caption"]')
  await expect(cueTextareas.first()).toBeVisible({ timeout: 600_000 })
  const sourceText = (await page.locator('.source-text').allInnerTexts()).join(' ')
  expect(sourceText).toMatch(/ask not|country/i)
  const start = Number(await page.getByLabel('Caption 1 start time in seconds').inputValue())
  const end = Number(await page.getByLabel('Caption 1 end time in seconds').inputValue())
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)

  await page.locator('.side-nav').getByRole('button', { name: 'Studio' }).click()
  await page.getByRole('button', { name: /Translate to/ }).click()
  await expect(page.getByText(/captions translated locally/)).toBeVisible({ timeout: 600_000 })
  await page.locator('.side-nav').getByRole('button', { name: 'Captions' }).click()
  const captions = await cueTextareas.evaluateAll((elements) => elements.map((element) => (element as HTMLTextAreaElement).value))
  expect(captions.length).toBeGreaterThan(0)
  expect(captions.join(' ')).toMatch(/\p{Script=Myanmar}/u)

  await page.locator('.side-nav').getByRole('button', { name: 'Cover' }).click()
  await page.getByRole('button', { name: 'Blur' }).click()
  const maskArea = page.locator('.mask-capture')
  await maskArea.scrollIntoViewIfNeeded()
  const bounds = await maskArea.boundingBox()
  if (!bounds) throw new Error('Live video cover layer did not appear.')
  await page.mouse.move(bounds.x + 30, bounds.y + 100)
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
  const srtPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Export .SRT/ }).click()
  const srtDownload = await srtPromise
  const srtPath = await srtDownload.path()
  if (!srtPath) throw new Error('The live SRT download did not produce a file.')
  const srt = await readFile(srtPath, 'utf8')
  expect(srt).toMatch(/\d{2}:\d{2}:\d{2},\d{3} -->/)
  expect(srt).toMatch(/\p{Script=Myanmar}/u)

  await page.locator('.side-nav').getByRole('button', { name: 'Export' }).click()
  await page.getByRole('button', { name: 'Render final MP4' }).click()
  await expect(page.getByRole('link', { name: 'Download' })).toBeVisible({ timeout: 600_000 })
  await expect(page.getByText('Exact stream payload match')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('Output · SHA-256 calculated')).toBeVisible()
  const mp4Promise = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Download' }).click()
  const mp4Download = await mp4Promise
  const mp4Path = await mp4Download.path()
  if (!mp4Path) throw new Error('The live MP4 download did not produce a file.')
  const rendered = await readFile(mp4Path)
  expect(rendered.length).toBeGreaterThan(1_024)
  expect(rendered.subarray(4, 8).toString('ascii')).toBe('ftyp')

  expect(pageErrors, `Uncaught page errors: ${pageErrors.join('\n')}`).toEqual([])
  expect(consoleErrors, `Console errors: ${consoleErrors.join('\n')}`).toEqual([])
})
