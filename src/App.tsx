import { useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent } from 'react'
import {
  ArrowDownToLine, ArrowLeft, ArrowRight, AudioLines, Check, ChevronDown, CircleHelp, Clock3,
  CloudOff, Crop, FileVideo2, Film, Languages, LoaderCircle, LockKeyhole, Maximize2,
  Pause, Play, Plus, Settings2, ShieldCheck, Sparkles, Subtitles, Upload, WandSparkles,
  X, Zap,
} from 'lucide-react'
import { activeSubtitle, clamp, containedFrameRect, downloadBlob, sha256 } from './media-utils'
import { loadFFmpeg, renderLocalMp4, transcribeLocal, translateLocal } from './local-ai'
import { formatClock, formatSrtTime, makeId, toSrt, validSubtitle, type Mask, type StatusLog, type Subtitle } from './types'
import './styles.css'

type WorkspaceTab = 'studio' | 'captions' | 'cover' | 'export'
type ModelState = 'not loaded' | 'loading' | 'ready'

const languages = [
  ['en', 'English'], ['zh', 'Chinese'], ['th', 'Thai'],
  ['vi', 'Vietnamese'], ['ja', 'Japanese'], ['ko', 'Korean'],
  ['fr', 'French'], ['de', 'German'], ['es', 'Spanish'], ['hi', 'Hindi'],
]
const tabs: Array<{ id: WorkspaceTab; label: string; icon: typeof Film }> = [
  { id: 'studio', label: 'Studio', icon: Film }, { id: 'captions', label: 'Captions', icon: Subtitles },
  { id: 'cover', label: 'Cover', icon: Crop }, { id: 'export', label: 'Export', icon: ArrowDownToLine },
]

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [outputUrl, setOutputUrl] = useState('')
  const [outputName, setOutputName] = useState('')
  const [duration, setDuration] = useState(0)
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 })
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [tab, setTab] = useState<WorkspaceTab>('studio')
  const [subtitles, setSubtitles] = useState<Subtitle[]>([])
  const [masks, setMasks] = useState<Mask[]>([])
  const [maskMode, setMaskMode] = useState<'blur' | 'solid'>('blur')
  const [sourceLang, setSourceLang] = useState('en')
  const [modelState, setModelState] = useState<ModelState>('not loaded')
  const [transcribing, setTranscribing] = useState(false)
  const [translating, setTranslating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [inputHash, setInputHash] = useState('')
  const [outputHash, setOutputHash] = useState('')
  const [audioHash, setAudioHash] = useState<{ input: string; output: string; matches: boolean } | null>(null)
  const [logs, setLogs] = useState<StatusLog[]>([])
  const [selection, setSelection] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const selectionRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null)
  const [error, setError] = useState('')
  const [mobileMenu, setMobileMenu] = useState(false)

  const active = useMemo(() => activeSubtitle(subtitles, time), [subtitles, time])
  const invalidCount = useMemo(() => subtitles.filter((item) => !validSubtitle(item, duration || Number.MAX_SAFE_INTEGER)).length, [subtitles, duration])
  const videoFrameRect = useMemo(() => containedFrameRect(16, 9, videoDimensions.width, videoDimensions.height), [videoDimensions])
  const videoFrameStyle = useMemo(() => ({
    left: `${videoFrameRect.x / 16 * 100}%`,
    top: `${videoFrameRect.y / 9 * 100}%`,
    width: `${videoFrameRect.width / 16 * 100}%`,
    height: `${videoFrameRect.height / 9 * 100}%`,
  }), [videoFrameRect])

  function addLog(title: string, detail: string, kind: StatusLog['kind'] = 'info') {
    setLogs((items) => [{ id: makeId(), time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), title, detail, kind }, ...items].slice(0, 12))
  }

  useEffect(() => () => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl)
    if (outputUrl) URL.revokeObjectURL(outputUrl)
  }, [sourceUrl, outputUrl])

  async function acceptFile(selected: File) {
    setError('')
    if (!selected.type.startsWith('video/') && !/\.mp4$/i.test(selected.name)) {
      setError('Choose an MP4 video file to begin.')
      return
    }
    if (!/\.mp4$/i.test(selected.name) && selected.type !== 'video/mp4') {
      setError('This first version accepts MP4 containers only.')
      return
    }
    const nextUrl = URL.createObjectURL(selected)
    setSourceUrl((old) => { if (old) URL.revokeObjectURL(old); return nextUrl })
    if (outputUrl) { URL.revokeObjectURL(outputUrl); setOutputUrl('') }
    setOutputHash('')
    setAudioHash(null)
    setSubtitles([])
    setMasks([])
    setInputHash('')
    setFile(selected)
    setVideoDimensions({ width: 0, height: 0 })
    setTime(0)
    setProgress(0)
    setTab('studio')
    addLog('MP4 opened locally', `${selected.name} · ${formatBytes(selected.size)} · no upload or server processing`)
    try {
      const digest = await sha256(selected)
      setInputHash(digest)
      addLog('Input SHA-256 calculated', digest, 'success')
    } catch {
      addLog('Input hash unavailable', 'This browser does not provide SubtleCrypto in its current context.', 'warning')
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0]
    if (selected) await acceptFile(selected)
    event.target.value = ''
  }

  function updateSubtitle(id: string, patch: Partial<Subtitle>) {
    setSubtitles((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item))
  }

  async function transcribe() {
    if (!file) return
    setError('')
    setTranscribing(true)
    setProgress(0)
    addLog('Whisper transcription started', 'Extracting audio and running ASR locally in WebAssembly.')
    try {
      await loadFFmpeg((value, label) => { setProgress(Math.round(value * 100)); setProgressLabel(label) })
      setModelState('ready')
      const result = await transcribeLocal(file, (value, label) => { setProgress(Math.round(value * 100)); setProgressLabel(label) })
      setSubtitles(result)
      setTab('captions')
      addLog('Transcript ready', `${result.length} timed speech segments created on this device.`, 'success')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught)
      setError(message)
      addLog('Transcription stopped', message, 'error')
    } finally { setTranscribing(false); setProgress(0); setProgressLabel('') }
  }

  async function translate() {
    if (!subtitles.length) return
    setError('')
    setTranslating(true)
    setProgress(0)
    addLog('Burmese translation started', 'M2M100 will run locally in this browser. First-time model download can be large.')
    try {
      const output = await translateLocal(subtitles, sourceLang, (value, label) => { setProgress(Math.round(value * 100)); setProgressLabel(label) })
      setSubtitles(output)
      setModelState('ready')
      addLog('Burmese translation complete', `${output.length} captions translated locally. Review names, idioms, and specialized terms before export.`, 'success')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught)
      setError(message)
      addLog('Translation stopped', message, 'error')
    } finally { setTranslating(false); setProgress(0); setProgressLabel('') }
  }

  async function exportVideo() {
    if (!file) return
    if (invalidCount) {
      setError(`Fix ${invalidCount} invalid caption time range${invalidCount === 1 ? '' : 's'} before rendering.`)
      setTab('captions')
      return
    }
    setError('')
    setExporting(true)
    setProgress(2)
    setProgressLabel('Preparing local render')
    addLog('MP4 render started', 'Subtitle/mask video frames will be encoded locally; the original audio stream is passed through in copy mode.')
    try {
      const result = await renderLocalMp4(file, subtitles, masks,
        (value, label) => { setProgress(Math.min(98, Math.max(3, Math.round(value * 100)))); setProgressLabel(label) },
        (message) => addLog('Render detail', message, 'info'))
      const name = `${file.name.replace(/\.mp4$/i, '')}-myanmar-subtitles.mp4`
      const url = URL.createObjectURL(result.blob)
      setOutputUrl((old) => { if (old) URL.revokeObjectURL(old); return url })
      setOutputName(name)
      const digest = await sha256(result.blob)
      setOutputHash(digest)
      const trackHashes = await verifyAudioCopy(file, result.blob)
      setAudioHash(trackHashes)
      addLog('Final MP4 ready', `${name} · ${formatBytes(result.blob.size)} · output SHA-256 ${digest}`, 'success')
      if (trackHashes) addLog('Audio integrity verified', trackHashes.matches ? `Extracted audio stream SHA-256 matches: ${trackHashes.input}` : `Audio hash mismatch. Input ${trackHashes.input}; output ${trackHashes.output}`, trackHashes.matches ? 'success' : 'error')
      else addLog('Audio hash verification unavailable', 'The MP4 video was rendered, but this FFmpeg build could not produce a stream-payload hash. The export command requested -c:a copy.', 'warning')
      setTab('export')
      setProgress(100)
      setProgressLabel('Export ready')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught)
      setError(message)
      addLog('MP4 export stopped', message, 'error')
    } finally { setExporting(false); window.setTimeout(() => { setProgress(0); setProgressLabel('') }, 1600) }
  }

  function seekTo(value: number) {
    const next = clamp(value, 0, duration || 0)
    if (videoRef.current) videoRef.current.currentTime = next
    setTime(next)
  }

  function togglePlayback() {
    if (!videoRef.current) return
    if (videoRef.current.paused) void videoRef.current.play().catch(() => undefined)
    else videoRef.current.pause()
  }

  function saveSrt() {
    if (!subtitles.length) return
    const stem = file?.name.replace(/\.mp4$/i, '') || 'subtitles'
    downloadBlob(new Blob([toSrt(subtitles)], { type: 'text/srt;charset=utf-8' }), `${stem}-my.srt`)
    addLog('SRT downloaded', 'Standard UTF-8 SubRip file saved by your browser.', 'success')
  }

  function addSubtitle() {
    const start = clamp(time, 0, Math.max(0, duration - 1))
    const item: Subtitle = { id: makeId(), start, end: clamp(start + 2.5, start + 0.5, duration || start + 2.5), source: '', text: '' }
    setSubtitles((items) => [...items, item].sort((a, b) => a.start - b.start))
    setTab('captions')
  }

  function beginMask(event: PointerEvent<HTMLDivElement>) {
    if (tab !== 'cover' || !file) return
    const box = event.currentTarget.getBoundingClientRect()
    const x = clamp((event.clientX - box.left) / box.width, 0, 1)
    const y = clamp((event.clientY - box.top) / box.height, 0, 1)
    const start = { x, y }
    const nextSelection = { x, y, width: 0, height: 0 }
    dragStartRef.current = start
    selectionRef.current = nextSelection
    setSelection(nextSelection)
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function moveMask(event: PointerEvent<HTMLDivElement>) {
    const start = dragStartRef.current
    if (!start) return
    const box = event.currentTarget.getBoundingClientRect()
    const x = clamp((event.clientX - box.left) / box.width, 0, 1)
    const y = clamp((event.clientY - box.top) / box.height, 0, 1)
    const nextSelection = { x: Math.min(x, start.x), y: Math.min(y, start.y), width: Math.abs(x - start.x), height: Math.abs(y - start.y) }
    selectionRef.current = nextSelection
    setSelection(nextSelection)
  }
  function endMask() {
    const current = selectionRef.current
    if (current && current.width > 0.015 && current.height > 0.015) {
      setMasks((items) => [...items, { id: makeId(), ...current, effect: maskMode }])
      addLog('Subtitle cover added', `${maskMode === 'blur' ? 'Blur' : 'Black box'} mask region selected on the local video.`, 'success')
    }
    selectionRef.current = null
    dragStartRef.current = null
    setSelection(null)
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#home" onClick={(event) => { event.preventDefault(); setTab('studio') }} aria-label="Subly home">
          <span className="brand-mark"><Subtitles size={19} strokeWidth={2.2} /></span>
          <span className="brand-word">subly<span>.</span></span>
          <span className="brand-divider" />
          <span className="brand-product">Myanmar Studio</span>
        </a>
        <div className="topbar-right">
          <span className="privacy-pill"><span className="privacy-dot" /><LockKeyhole size={13} /> Private by design</span>
          <button className="icon-button help-button" aria-label="About local processing" title="Your video never leaves this browser"><CircleHelp size={18} /></button>
          <button className="avatar" aria-label="Settings" onClick={() => setMobileMenu((value) => !value)}><Settings2 size={16} /></button>
        </div>
      </header>

      <div className="app-body">
        <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`} aria-label="Workspace navigation">
          <div className="side-heading">WORKSPACE</div>
          <button className="back-button" onClick={() => setTab('studio')}><ArrowLeft size={16} /><span>Home</span></button>
          <div className="side-nav">
            {tabs.map(({ id, label, icon: Icon }, index) => (
              <button key={id} className={`nav-item ${tab === id ? 'active' : ''}`} onClick={() => { setTab(id); setMobileMenu(false) }}>
                <span className="nav-icon"><Icon size={17} /></span><span>{label}</span><span className="nav-key">{String(index + 1).padStart(2, '0')}</span>
              </button>
            ))}
          </div>
          <div className="sidebar-bottom">
            <div className="local-card"><span className="local-icon"><CloudOff size={15} /></span><div><strong>Runs on your device</strong><span>No account. No upload.</span></div><Check size={15} className="local-check" /></div>
            <div className="side-version">LOCAL STUDIO <span>v1.0</span></div>
          </div>
        </aside>

        <section className="main-panel">
          <div className="page-head">
            <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{tabs.find((item) => item.id === tab)?.label}</strong></div>
            <div className="project-title-row">
              <div><div className="eyebrow"><span className="eyebrow-line" />PRIVATE VIDEO WORKSPACE</div><h1>{file ? 'Your subtitle studio.' : 'Give your video a voice.'}</h1><p className="page-subtitle">Transcribe, translate, and burn Burmese subtitles — without sending a single frame away.</p></div>
              {file && <div className="duration-badge"><Clock3 size={14} /> {formatClock(duration)} <span className="badge-sep">·</span> MP4</div>}
            </div>
          </div>

          <div className="workspace-layout">
            <div className="workspace-main">
              <div className={`video-card ${!file ? 'empty-video-card' : ''}`}>
                {!file ? (
                  <div className="drop-zone">
                    <div className="upload-icon"><Upload size={23} /></div>
                    <h2>Start with an MP4</h2>
                    <p>Your video stays on this device from start to finish.</p>
                    <button className="primary-button upload-button" onClick={() => inputRef.current?.click()}><Upload size={16} /> Choose a video <span className="button-key">MP4</span></button>
                    <div className="drop-hint"><LockKeyhole size={12} /> Nothing is uploaded to a server</div>
                  </div>
                ) : (
                  <>
                    <div className="video-stage" style={{ aspectRatio: '16 / 9' }}>
                      <video ref={videoRef} src={sourceUrl} playsInline preload="metadata" onLoadedMetadata={(event) => {
                        const video = event.currentTarget
                        setDuration(video.duration || 0)
                        setVideoDimensions({ width: video.videoWidth, height: video.videoHeight })
                      }} onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
                      <div className="video-frame-layer" style={videoFrameStyle}>
                        {masks.map((mask) => <div key={mask.id} className={`mask-overlay ${mask.effect}`} style={{ left: `${mask.x * 100}%`, top: `${mask.y * 100}%`, width: `${mask.width * 100}%`, height: `${mask.height * 100}%` }} />)}
                        {selection && <div className="mask-selection" style={{ left: `${selection.x * 100}%`, top: `${selection.y * 100}%`, width: `${selection.width * 100}%`, height: `${selection.height * 100}%` }} />}
                        {active && <div className="subtitle-preview" lang="my">{active.text || active.source}</div>}
                        {tab === 'cover' && <div className="mask-capture" onPointerDown={beginMask} onPointerMove={moveMask} onPointerUp={endMask} aria-label="Draw a cover region over the video" />}
                      </div>
                      <div className="video-status"><span className="live-dot" /> LOCAL PREVIEW</div>
                    </div>
                    <div className="player-controls">
                      <button className="play-control" aria-label={playing ? 'Pause video' : 'Play video'} onClick={togglePlayback}>{playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
                      <span className="time-readout">{formatClock(time)} <span>/</span> {formatClock(duration)}</span>
                      <input aria-label="Seek video" className="seek-slider" type="range" min="0" max={duration || 1} step="0.05" value={Math.min(time, duration || 0)} onChange={(event) => seekTo(Number(event.target.value))} style={{ '--seek': `${duration ? time / duration * 100 : 0}%` } as React.CSSProperties} />
                      <button className="fullscreen-control" aria-label="Fullscreen video" onClick={() => void videoRef.current?.requestFullscreen?.()}><Maximize2 size={16} /></button>
                    </div>
                    <div className="file-strip"><span className="file-icon"><FileVideo2 size={15} /></span><span className="file-name">{file.name}</span><span className="file-size">{formatBytes(file.size)}</span><button className="change-file" onClick={() => inputRef.current?.click()}>Replace</button></div>
                  </>
                )}
              </div>

              <div className="mobile-tabs" role="tablist" aria-label="Subtitle editing tools">
                {tabs.map(({ id, label, icon: Icon }) => <button role="tab" aria-selected={tab === id} key={id} className={tab === id ? 'selected' : ''} onClick={() => setTab(id)}><Icon size={17} /><span>{label}</span></button>)}
              </div>

              <div className="tool-card">
                <div className="tool-header">
                  <div><div className="section-kicker">{tab === 'cover' ? 'CLEAN UP' : tab === 'captions' ? 'CAPTION WORKBENCH' : tab === 'export' ? 'OUTPUT FILE' : 'LOCAL AI WORKFLOW'}</div><h2>{tab === 'cover' ? 'Cover existing subtitles' : tab === 'captions' ? 'Edit your subtitles' : tab === 'export' ? 'Your finished export' : 'From speech to Burmese'}</h2></div>
                  {tab === 'captions' && subtitles.length > 0 && <span className="count-pill">{subtitles.length} cues</span>}
                  {tab === 'cover' && masks.length > 0 && <span className="count-pill">{masks.length} regions</span>}
                </div>

                {tab === 'studio' && (
                  <>
                    <div className="workflow-steps"><div className="step completed"><span><Check size={13} /></span><div><strong>Open video</strong><small>On this device</small></div></div><div className="step-connector" /><div className={`step ${subtitles.length ? 'completed' : ''}`}><span>{subtitles.length ? <Check size={13} /> : '2'}</span><div><strong>Transcribe</strong><small>Whisper · local</small></div></div><div className="step-connector" /><div className={`step ${subtitles.some((item) => item.text) ? 'completed' : ''}`}><span>{subtitles.some((item) => item.text) ? <Check size={13} /> : '3'}</span><div><strong>Translate</strong><small>Myanmar · local</small></div></div></div>
                    <div className="ai-action-row"><div className="ai-copy"><span className="ai-icon"><AudioLines size={17} /></span><div><strong>Whisper speech recognition</strong><span>Whisper tiny · runs in browser WebAssembly</span></div></div><button className="secondary-button" disabled={!file || transcribing || translating || exporting} onClick={() => void transcribe()}>{transcribing ? <><LoaderCircle size={15} className="spin" /> Working</> : <><Sparkles size={15} /> {subtitles.length ? 'Run again' : 'Transcribe'}</>}</button></div>
                    <div className="translation-box"><div className="translation-top"><div className="ai-copy"><span className="myanmar-glyph">က</span><div><strong>Translate captions into Burmese</strong><span>M2M100 · local model, cached in browser after first use</span></div></div></div><div className="translation-controls"><label className="language-select"><span>Spoken language</span><select value={sourceLang} onChange={(event) => setSourceLang(event.target.value)}>{languages.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select><ChevronDown size={13} /></label><button className="primary-button translate-button" disabled={!subtitles.length || translating || transcribing || exporting} onClick={() => void translate()}>{translating ? <><LoaderCircle size={15} className="spin" /> Translating</> : <><Languages size={15} /> Translate to မြန်မာ</>}</button></div></div>
                    {subtitles.length > 0 && <div className="transcript-ready"><Check size={15} /><span>{subtitles.length} speech segments are ready to review.</span><button onClick={() => setTab('captions')}>Open editor <ArrowRight size={13} /></button></div>}
                    <div className="model-footnote"><ShieldCheck size={14} /><span>Models execute on this device. Model files are fetched on first use and may be large; video and transcript stay local.</span></div>
                  </>
                )}

                {tab === 'captions' && (
                  <>
                    <div className="editor-toolbar"><div className="editor-hint"><span className="keyboard-dot" /> Click a cue to jump to its start time</div><div className="editor-actions"><button className="text-action" disabled={!subtitles.length} onClick={saveSrt}><ArrowDownToLine size={14} /> Export .SRT</button><button className="add-cue" disabled={!file} onClick={addSubtitle}><Plus size={15} /> Add cue</button></div></div>
                    {subtitles.length === 0 ? <div className="empty-editor"><div className="empty-editor-icon"><Subtitles size={22} /></div><strong>No captions yet</strong><span>Run Whisper transcription, then translate your speech to Burmese.</span><button className="primary-button" disabled={!file} onClick={() => setTab('studio')}>Go to transcription <ArrowRight size={15} /></button></div> : <div className="cue-list">{subtitles.map((item, index) => <article key={item.id} className={`cue-row ${active?.id === item.id ? 'cue-active' : ''}`}>
                      <button className="cue-index" onClick={() => seekTo(item.start)} aria-label={`Play caption ${index + 1}`}>{String(index + 1).padStart(2, '0')}<Play size={10} fill="currentColor" /></button>
                      <div className="cue-content"><div className="cue-times"><label><span>IN</span><input aria-label={`Caption ${index + 1} start time in seconds`} type="number" min="0" max={duration || undefined} step="0.05" value={item.start.toFixed(2)} onChange={(event) => updateSubtitle(item.id, { start: Number(event.target.value) })} /></label><span className="time-arrow">→</span><label><span>OUT</span><input aria-label={`Caption ${index + 1} end time in seconds`} type="number" min="0" max={duration || undefined} step="0.05" value={item.end.toFixed(2)} onChange={(event) => updateSubtitle(item.id, { end: Number(event.target.value) })} /></label><span className="cue-time-preview">{formatSrtTime(item.start)}</span></div><textarea aria-label={`Burmese caption ${index + 1}`} lang="my" rows={1} placeholder="မြန်မာစာတန်းထိုး..." value={item.text} onChange={(event) => updateSubtitle(item.id, { text: event.target.value })} /><div className="source-text">{item.source || 'Source transcript not available'}</div></div>
                      <button className="remove-cue" aria-label={`Remove caption ${index + 1}`} onClick={() => setSubtitles((items) => items.filter((caption) => caption.id !== item.id))}><X size={15} /></button>
                    </article>)}</div>}
                    {invalidCount > 0 && <div className="validation-message"><CircleHelp size={14} /> {invalidCount} cue{invalidCount > 1 ? 's have' : ' has'} an invalid time range.</div>}
                  </>
                )}

                {tab === 'cover' && (
                  <>
                    <div className="cover-intro"><span className="cover-icon"><Crop size={18} /></span><p>Draw over burned-in subtitles on the video. The cover is baked into the final MP4.</p></div>
                    <div className="mask-picker"><div><span className="picker-label">COVER STYLE</span><div className="mask-options"><button className={maskMode === 'blur' ? 'mask-option active' : 'mask-option'} onClick={() => setMaskMode('blur')}><span className="blur-swatch" /> Blur <span className="option-check">{maskMode === 'blur' && <Check size={12} />}</span></button><button className={maskMode === 'solid' ? 'mask-option active' : 'mask-option'} onClick={() => setMaskMode('solid')}><span className="solid-swatch" /> Black box <span className="option-check">{maskMode === 'solid' && <Check size={12} />}</span></button></div></div><span className="draw-hint"><span className="draw-cursor" /> Drag on the video to select</span></div>
                    {masks.length > 0 && <div className="mask-list">{masks.map((mask, index) => <div className="mask-list-row" key={mask.id}><span className={`mask-mini ${mask.effect}`} /><span>Region {index + 1} · {mask.effect === 'blur' ? 'Blur' : 'Black box'}</span><button aria-label={`Remove mask ${index + 1}`} onClick={() => setMasks((items) => items.filter((item) => item.id !== mask.id))}><X size={14} /></button></div>)}<button className="clear-masks" onClick={() => setMasks([])}>Remove all masks</button></div>}
                    {!file && <div className="empty-hint">Open a video first to place a cover region.</div>}
                    <div className="cover-note"><LockKeyhole size={14} /> Covers exist only in this project session until you export.</div>
                  </>
                )}

                {tab === 'export' && (
                  <div className="output-panel">{outputUrl ? <><div className="output-preview"><video src={outputUrl} controls playsInline /><div className="output-check"><Check size={15} /> Render complete</div></div><div className="output-file-row"><span className="output-file-icon"><FileVideo2 size={17} /></span><div className="output-file-name"><strong>{outputName}</strong><span>MP4 · {file ? formatBytes(file.size) : ''} source · video encoded locally</span></div><a className="primary-button download-output" href={outputUrl} download={outputName}><ArrowDownToLine size={15} /> Download</a></div><div className="integrity-grid"><div className="integrity-item"><span>INPUT FILE SHA-256</span><code>{inputHash || 'Calculating…'}</code></div><div className="integrity-item"><span>OUTPUT FILE SHA-256</span><code>{outputHash || 'Calculating…'}</code></div>{audioHash && <div className={`integrity-item audio-integrity ${audioHash.matches ? 'hash-pass' : 'hash-fail'}`}><span>AUDIO ELEMENTARY STREAM SHA-256</span><code>IN {audioHash.input}</code><code>OUT {audioHash.output}</code><strong>{audioHash.matches ? '✓ Exact stream payload match' : 'Mismatch — inspect the source codec/browser log'}</strong></div>}</div></> : <div className="empty-editor output-empty"><div className="empty-editor-icon"><ArrowDownToLine size={21} /></div><strong>Your MP4 is still in the studio</strong><span>Export will render captions and masks in-browser and copy the original audio stream without audio re-encoding.</span><button className="primary-button" disabled={!file || exporting} onClick={() => void exportVideo()}><Zap size={15} /> Render final MP4</button><small>Video encoding uses WebAssembly. Long videos can take several minutes.</small></div>}</div>
                )}
              </div>

              {(transcribing || translating || exporting || progress > 0) && <div className="progress-card"><div className="progress-copy"><span className="spin-ring"><LoaderCircle size={15} /></span><div><strong>{progressLabel || 'Working locally'}</strong><span>{exporting ? 'Rendering in browser memory' : transcribing ? 'Transcribing on this device' : 'Translating on this device'}</span></div></div><strong className="progress-percent">{progress}%</strong><div className="progress-track"><span style={{ width: `${progress}%` }} /></div></div>}
              {error && <div className="error-banner" role="alert"><CircleHelp size={16} /><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={15} /></button></div>}
            </div>

            <aside className="details-column">
              <div className="details-card privacy-card"><div className="card-title-row"><div><div className="section-kicker">YOUR PRIVACY</div><h3>Private from frame one.</h3></div><div className="privacy-shield"><ShieldCheck size={17} /></div></div><p>Video and captions are processed inside this browser. Nothing gets uploaded to our servers.</p><div className="privacy-seal"><LockKeyhole size={13} /><span>DEVICE-ONLY PROCESSING</span><span className="seal-dot" /></div><div className="model-status"><span className={`status-led ${modelState === 'ready' ? 'ready' : ''}`} /><div><strong>AI models</strong><span>{modelState === 'ready' ? 'Loaded in browser memory' : 'Download on first use'}</span></div><span className={`model-label ${modelState === 'ready' ? 'loaded' : ''}`}>{modelState === 'ready' ? 'READY' : 'LOCAL'}</span></div></div>

              <div className="details-card file-card"><div className="details-card-heading"><div><div className="section-kicker">PROJECT FILES</div><h3>Input & output</h3></div><span className="file-count">{(file ? 1 : 0) + (outputUrl ? 1 : 0)}</span></div><div className="file-status-row"><span className={`file-status-icon ${file ? 'has-file' : ''}`}><FileVideo2 size={15} /></span><div className="file-status-info"><strong>{file?.name || 'No video selected'}</strong><span>{file ? `Input · ${formatBytes(file.size)}` : 'Choose an MP4 to begin'}</span></div>{file && <Check size={15} className="file-status-check" />}</div>{outputUrl ? <div className="file-status-row"><span className="file-status-icon output"><Check size={15} /></span><div className="file-status-info"><strong>{outputName}</strong><span>Output · {outputHash ? 'SHA-256 calculated' : 'Ready'}</span></div></div> : <div className="output-placeholder"><span className="output-placeholder-icon"><Plus size={13} /></span><span>Final MP4 appears here after export</span></div>}
              <div className="hash-block"><div className="hash-label"><span>INPUT SHA-256</span>{inputHash && <Check size={12} />}</div><code>{inputHash ? `${inputHash.slice(0, 16)}…${inputHash.slice(-8)}` : 'Waiting for input video'}</code>{outputHash && <><div className="hash-label output-label"><span>OUTPUT SHA-256</span></div><code>{outputHash.slice(0, 16)}…{outputHash.slice(-8)}</code></>}</div>
              </div>

              <div className="details-card log-card"><div className="details-card-heading"><div><div className="section-kicker">ACTIVITY</div><h3>Process log</h3></div><span className="log-live"><span /> LIVE</span></div>{logs.length ? <div className="log-list">{logs.slice(0, 5).map((log) => <div className="log-item" key={log.id}><span className={`log-dot ${log.kind}`} /><div className="log-content"><strong>{log.title}</strong><span>{log.detail}</span><time>{log.time}</time></div></div>)}</div> : <div className="log-empty"><span className="log-empty-icon"><WandSparkles size={15} /></span><span>Your steps will appear here as you work.</span></div>}</div>
              <div className="help-strip"><Zap size={13} /><span>First model load needs an internet connection.<br /><strong>Afterward, models are cached in this browser.</strong></span></div>
            </aside>
          </div>
          <footer className="page-footer"><span>SUBLY · BROWSER-LOCAL VIDEO TOOLS</span><span><span className="footer-dot" /> Your video never leaves this tab</span></footer>
        </section>
      </div>

      <nav className="bottom-nav" aria-label="Bottom navigation">{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={19} /><span>{label}</span></button>)}</nav>
      <input ref={inputRef} className="visually-hidden" type="file" accept="video/mp4,.mp4" onChange={(event) => void handleFile(event)} />
    </main>
  )
}

async function verifyAudioCopy(input: File, output: Blob): Promise<{ input: string; output: string; matches: boolean } | null> {
  try {
    const ffmpeg = await loadFFmpeg()
    await ffmpeg.writeFile('verify_input.mp4', new Uint8Array(await input.arrayBuffer()))
    await ffmpeg.writeFile('verify_output.mp4', new Uint8Array(await output.arrayBuffer()))
    await ffmpeg.exec(['-y', '-i', 'verify_input.mp4', '-map', '0:a:0', '-c:a', 'copy', '-f', 'hash', '-hash', 'sha256', 'input_audio.sha256'])
    await ffmpeg.exec(['-y', '-i', 'verify_output.mp4', '-map', '0:a:0', '-c:a', 'copy', '-f', 'hash', '-hash', 'sha256', 'output_audio.sha256'])
    const original = await ffmpeg.readFile('input_audio.sha256')
    const rendered = await ffmpeg.readFile('output_audio.sha256')
    const inputDigest = parseHash(original)
    const outputDigest = parseHash(rendered)
    return inputDigest && outputDigest ? { input: inputDigest, output: outputDigest, matches: inputDigest === outputDigest } : null
  } catch {
    return null
  }
}
function parseHash(value: Uint8Array | string): string {
  const text = typeof value === 'string' ? value : new TextDecoder().decode(value)
  return text.match(/(?:SHA256=)?([a-f\d]{64})/i)?.[1]?.toLowerCase() ?? ''
}
function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
