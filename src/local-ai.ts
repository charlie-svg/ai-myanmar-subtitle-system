import { FFmpeg } from '@ffmpeg/ffmpeg'
import coreURL from '@ffmpeg/core?url'
import wasmURL from '@ffmpeg/core/wasm?url'
import type { Mask, Subtitle } from './types'
import { makeId } from './types'

export type ProgressHandler = (progress: number, label: string) => void
export type LogHandler = (message: string) => void

type TranscriptionOutput = {
  text?: string
  chunks?: Array<{ text?: string; timestamp?: [number | null, number | null] }>
}

type TranslationOutput = Array<{ translation_text?: string }>
type ASRPipeline = (audio: Float32Array, options: Record<string, unknown>) => Promise<TranscriptionOutput>
type TranslationRunner = (text: string, options: Record<string, unknown>) => Promise<TranslationOutput>

let ffmpegInstance: FFmpeg | null = null
let ffmpegLoadPromise: Promise<FFmpeg> | null = null
let asrPipeline: ASRPipeline | null = null
let translationPipeline: TranslationRunner | null = null

const WHISPER_MODEL = 'onnx-community/whisper-tiny'
const TRANSLATION_MODEL = 'Xenova/m2m100_418M'

export async function loadFFmpeg(progress?: ProgressHandler): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance
  if (ffmpegLoadPromise) return ffmpegLoadPromise

  const instance = new FFmpeg()
  const loadProgress = ({ progress: value }: { progress: number }) => progress?.(Math.min(1, Math.max(0, value)), 'Loading local media engine')
  instance.on('progress', loadProgress)
  ffmpegLoadPromise = (async () => {
    progress?.(0.05, 'Loading the browser-local media engine')
    await instance.load({
      coreURL,
      wasmURL,
    })
    instance.off('progress', loadProgress)
    ffmpegInstance = instance
    progress?.(1, 'Browser-local media engine ready')
    return instance
  })()
  try {
    return await ffmpegLoadPromise
  } catch (error) {
    ffmpegLoadPromise = null
    throw error
  }
}

async function getTransformersPipeline(): Promise<((task: string, model: string, options?: Record<string, unknown>) => Promise<unknown>)> {
  const module = await import('@huggingface/transformers')
  module.env.useBrowserCache = true
  module.env.allowRemoteModels = true
  module.env.allowLocalModels = false
  return module.pipeline as unknown as (task: string, model: string, options?: Record<string, unknown>) => Promise<unknown>
}

export async function transcribeLocal(file: File, onProgress: ProgressHandler): Promise<Subtitle[]> {
  onProgress(0.02, 'Preparing local audio extraction')
  const ffmpeg = await loadFFmpeg((progress, label) => onProgress(0.02 + progress * 0.18, label))
  await ffmpeg.writeFile('input_media.mp4', new Uint8Array(await file.arrayBuffer()))
  await ffmpeg.exec(['-i', 'input_media.mp4', '-map', '0:a:0', '-ac', '1', '-ar', '16000', '-f', 'wav', 'speech.wav'])
  const decoded = await ffmpeg.readFile('speech.wav')
  if (typeof decoded === 'string') throw new Error('The local audio decoder returned an unexpected text file.')
  const wav = parsePcmWav(decoded)
  if (wav.samples.length === 0) throw new Error('No speech audio was found in this MP4.')

  onProgress(0.22, 'Loading Whisper tiny model (first run downloads it to this browser)')
  const pipeline = await getTransformersPipeline()
  if (!asrPipeline) {
    asrPipeline = await pipeline('automatic-speech-recognition', WHISPER_MODEL, {
      device: 'wasm', dtype: 'q8',
      progress_callback: (status: { progress?: number; file?: string }) => {
        if (typeof status?.progress === 'number') onProgress(0.22 + Math.min(1, status.progress / 100) * 0.32, `Downloading local Whisper weights${status.file ? ` · ${status.file.split('/').pop()}` : ''}`)
      },
    }) as ASRPipeline
  }
  onProgress(0.55, 'Transcribing speech on this device')
  const asr = asrPipeline
  if (!asr) throw new Error('The local speech model failed to initialize.')
  const result = await asr(wav.samples, { chunk_length_s: 30, stride_length_s: 5, return_timestamps: true })
  const chunks = result.chunks?.filter((chunk) => chunk.text?.trim()) ?? []
  const words = chunks.length ? chunks : result.text?.trim() ? [{ text: result.text.trim(), timestamp: [0, wav.duration] as [number, number] }] : []
  if (!words.length) throw new Error('Whisper did not detect speech. Try a clearer audio track or a larger Whisper model.')

  const subtitles = words.map((chunk, index) => {
    const timestamp = chunk.timestamp ?? [null, null]
    const start = Math.max(0, timestamp[0] ?? index * 3)
    const end = Math.max(start + 0.5, timestamp[1] ?? Math.min(wav.duration, start + 3))
    return { id: makeId(), start, end: Math.min(wav.duration || end, end), source: chunk.text?.trim() ?? '', text: '' }
  }).filter((item) => item.source)
  onProgress(1, `${subtitles.length} timestamped transcript segments ready`)
  return subtitles
}

export async function translateLocal(
  subtitles: Subtitle[], sourceLang: string, onProgress: ProgressHandler,
): Promise<Subtitle[]> {
  if (!subtitles.length) throw new Error('Transcribe the video before translating.')
  onProgress(0.02, 'Loading the local Burmese translation model')
  const pipeline = await getTransformersPipeline()
  if (!translationPipeline) {
    translationPipeline = await pipeline('translation', TRANSLATION_MODEL, {
      device: 'wasm', dtype: 'q8',
      progress_callback: (status: { progress?: number; file?: string }) => {
        if (typeof status?.progress === 'number') onProgress(Math.min(0.45, status.progress / 100 * 0.45), `Downloading Burmese translation weights${status.file ? ` · ${status.file.split('/').pop()}` : ''}`)
      },
    }) as TranslationRunner
  }
  const translated = [...subtitles]
  for (let index = 0; index < translated.length; index += 1) {
    const item = translated[index]
    if (!item) continue
    const translator = translationPipeline
    if (!translator) throw new Error('The local translation model failed to initialize.')
    const response = await translator(item.source, { src_lang: sourceLang, tgt_lang: 'my' })
    item.text = response[0]?.translation_text?.trim() || item.source
    onProgress((index + 1) / translated.length, `Translating caption ${index + 1} of ${translated.length} locally`)
  }
  return translated
}

export type ExportResult = { blob: Blob; audioCopy: boolean }

export async function renderLocalMp4(
  file: File,
  subtitles: Subtitle[],
  masks: Mask[],
  onProgress: ProgressHandler,
  onLog: LogHandler,
): Promise<ExportResult> {
  const ffmpeg = await loadFFmpeg((value, label) => onProgress(value * 0.08, label))
  onProgress(0.1, 'Preparing subtitle and mask filters')
  const sourceBytes = new Uint8Array(await file.arrayBuffer())
  await ffmpeg.writeFile('input_media.mp4', sourceBytes)
  const captions = subtitles.filter((item) => item.text.trim() || item.source.trim())
    .map((item, index) => `${index + 1}\n${srtTime(item.start)} --> ${srtTime(item.end)}\n${escapeSrtText(item.text.trim() || item.source.trim())}\n`).join('\n')
  await ffmpeg.writeFile('captions.srt', new TextEncoder().encode(captions))

  const filters: string[] = []
  let current = '0:v'
  masks.forEach((mask, index) => {
    const next = `masked${index}`
    const crop = `crop=iw*${decimal(mask.width)}:ih*${decimal(mask.height)}:iw*${decimal(mask.x)}:ih*${decimal(mask.y)}`
    if (mask.effect === 'solid') {
      filters.push(`[${current}]drawbox=x=iw*${decimal(mask.x)}:y=ih*${decimal(mask.y)}:w=iw*${decimal(mask.width)}:h=ih*${decimal(mask.height)}:color=black:t=fill[${next}]`)
    } else {
      const base = `base${index}`
      const cropOut = `crop${index}`
      const blur = `blur${index}`
      filters.push(`[${current}]split[${base}][${cropOut}]`)
      filters.push(`[${cropOut}]${crop},boxblur=4:2[${blur}]`)
      filters.push(`[${base}][${blur}]overlay=x=main_w*${decimal(mask.x)}:y=main_h*${decimal(mask.y)}[${next}]`)
    }
    current = next
  })
  const subtitleEsc = 'captions.srt'
  filters.push(`[${current}]subtitles=${subtitleEsc}:force_style='FontName=Arial,FontSize=26,PrimaryColour=&H00FFFFFF,OutlineColour=&H90000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=42'[vout]`)
  const graph = filters.join(';')
  onLog('Encoding subtitle and mask layers in browser-local FFmpeg; audio is mapped with stream copy.')
  onProgress(0.14, 'Rendering video frames in the browser')
  const renderLogs: string[] = []
  const renderLog = ({ message }: { message: string }) => {
    renderLogs.push(message)
    if (renderLogs.length > 40) renderLogs.shift()
  }
  ffmpeg.on('log', renderLog)
  const renderProgress = ({ progress: value }: { progress: number }) => onProgress(0.15 + Math.min(1, Math.max(0, value)) * 0.72, 'Rendering video and subtitle frames')
  ffmpeg.on('progress', renderProgress)
  const args = ['-y', '-i', 'input_media.mp4', '-filter_complex', graph, '-map', '[vout]', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-c:a', 'copy', '-movflags', '+faststart', 'subtitle_export.mp4']
  try {
    const exitCode = await ffmpeg.exec(args)
    if (exitCode !== 0) throw new Error(`FFmpeg exited with code ${exitCode}. ${renderLogs.slice(-8).join(' | ')}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`The local MP4 renderer could not complete. This browser build may lack a required video filter/codec. ${message}`)
  } finally {
    ffmpeg.off('progress', renderProgress)
    ffmpeg.off('log', renderLog)
  }
  const output = await ffmpeg.readFile('subtitle_export.mp4')
  if (typeof output === 'string') throw new Error('The browser renderer returned an invalid MP4 output.')
  if (output.byteLength === 0) throw new Error(`FFmpeg completed without producing a non-empty MP4 file. ${renderLogs.slice(-8).join(' | ')}`)
  onProgress(0.94, 'Finalizing local MP4 and audio-copy status')
  const audioCopy = true
  onLog('Original audio stream mapped using -c:a copy (no audio re-encoding requested). Video frames were re-encoded to H.264 to burn captions and masks.')
  return { blob: new Blob([new Uint8Array(output).buffer as ArrayBuffer], { type: 'video/mp4' }), audioCopy }
}

function parsePcmWav(bytes: Uint8Array): { samples: Float32Array; duration: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, false) !== 0x52494646 || view.getUint32(8, false) !== 0x57415645) {
    throw new Error('Audio extraction did not produce a valid WAV file.')
  }
  let cursor = 12
  let channels = 1
  let sampleRate = 16_000
  let bitsPerSample = 16
  let dataOffset = -1
  let dataSize = 0
  while (cursor + 8 <= view.byteLength) {
    const chunk = view.getUint32(cursor + 4, true)
    const id = view.getUint32(cursor, false)
    if (id === 0x666d7420 && cursor + 24 <= view.byteLength) {
      channels = view.getUint16(cursor + 10, true)
      sampleRate = view.getUint32(cursor + 12, true)
      bitsPerSample = view.getUint16(cursor + 22, true)
    } else if (id === 0x64617461) {
      dataOffset = cursor + 8
      dataSize = Math.min(chunk, view.byteLength - dataOffset)
      break
    }
    cursor += chunk + 8 + (chunk % 2)
  }
  if (dataOffset < 0 || bitsPerSample !== 16) throw new Error('Whisper audio must be 16-bit PCM; local extraction returned another format.')
  const sampleCount = Math.floor(dataSize / 2 / channels)
  const samples = new Float32Array(sampleCount)
  for (let index = 0; index < sampleCount; index += 1) {
    let mono = 0
    for (let channel = 0; channel < channels; channel += 1) mono += view.getInt16(dataOffset + (index * channels + channel) * 2, true) / 32768
    samples[index] = mono / channels
  }
  return { samples, duration: sampleCount / sampleRate }
}

function srtTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000))
  const hrs = Math.floor(ms / 3_600_000)
  const mins = Math.floor(ms % 3_600_000 / 60_000)
  const secs = Math.floor(ms % 60_000 / 1000)
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`
}
function escapeSrtText(text: string): string { return text.replace(/\r/g, '').replace(/\0/g, '') }
function decimal(value: number): string { return Math.min(0.99, Math.max(0, value)).toFixed(5) }
