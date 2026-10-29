# Implementation and design plan

## Product and implementation decisions

Build a static, browser-only React/TypeScript single-page studio. The app uses local `File` objects and object URLs for MP4 upload and playback; client-side SHA-256 checks use `crypto.subtle`; Transformers.js loads Whisper tiny and a Burmese-capable M2M100 ONNX translation model for browser-local inference; and a bundled, same-origin FFmpeg WebAssembly core extracts audio and renders masked/subtitled video. FFmpeg maps the source audio with `-c:a copy` and separately hashes extracted input/output audio payloads. The subtitle editor owns cue text and time ranges in page memory and exports UTF-8 SubRip `.srt`; normalized cover regions are previewed as overlays and rendered with FFmpeg video filters. No API, application server, database, Render deployment, tunnel, or user account is needed for media processing.

Model weights download from the upstream model host on first use and are cached in browser storage; the computation and media bytes remain local. An internet connection is therefore needed for first-time model download, and initial weight downloads plus browser memory/runtime limits should be clearly disclosed. The M2M100 model supports a selectable spoken-language code and Myanmar (`my`) target. Subtitle translations and Whisper timings remain editable and should be human-reviewed, especially names and idioms. FFmpeg is bundled into the static app; it does not upload media.

### Project structure

- `src/App.tsx` — responsive workspace, custom player, progress/log/status panels, cue editor, language selection, masking controls and export flow.
- `src/local-ai.ts` — FFmpeg WASM, Whisper ASR, M2M100 Myanmar translation and rendered MP4 processing.
- `src/media-utils.ts` — object URL downloads, file hashes, audio elementary-stream SHA-256 verification and small media helpers.
- `src/types.ts` — shared caption/mask/log types and timecode, validation and SRT utilities.
- `src/styles.css` — dark, mobile-first interface and custom player/masking overlays.
- `src/subtitle-utils.test.ts` — deterministic cue validation and SubRip tests.
- `e2e/` — Playwright smoke, mobile-navigation, mask, caption-download and actual FFmpeg export/audio-integrity browser coverage, plus an opt-in full live-site speech/transcription/translation/export run.
- `public/manus-routes.json` — route manifest for the single studio route.
- `.github/workflows/pages.yml` — least-privilege CI checks and static GitHub Pages artifact deployment.

The static publish build is pinned by `package.json` and `pnpm-lock.yaml`; WebDev's managed application-server and database features remain disabled. The approved public `charlie-svg/ai-myanmar-subtitle-system` repository uses `VITE_BASE_PATH=/ai-myanmar-subtitle-system/` to generate correct project-site asset URLs; GitHub Actions builds and serves static files while all visitor media work stays browser-local.

## Design

**Style candidates (tail probabilities):** Dark audio post-production deck (0.08); archival technical notebook (0.05); midnight broadcast-control room (0.03). Chosen: **Dark audio post-production deck**, a disciplined editor for people who want to subtitle videos privately on their own device.

- **Design Movement:** Contemporary dark digital-audio-workstation controls fused with Swiss editorial typography and the restraint of a film finishing suite.
- **Core Principles:** Show the video as the central object; make every processing stage and privacy boundary legible; keep high-frequency editing controls close to the content; let error/progress/integrity states be explicit rather than decorative.
- **Color Philosophy:** Deep blue-black surfaces make the picture feel present without competing with it. A bright ice-blue signal color denotes action and focus; restrained emerald confirms successful integrity checks; warm slate keeps long editing sessions calm.
- **Layout Paradigm:** A left-hand tool rail and a broad, asymmetrical working plane: large video and controls first, transcript tools beside it, status and integrity details to the far edge. On narrow screens the rail collapses to a fixed bottom dock.
- **Signature Elements:** A compact “MY”/Myanmar-script studio stamp; a thin luminous transport-progress line; small mono-spaced timestamps and checksum readouts.
- **Interaction Philosophy:** Direct manipulation: upload to begin, drag across the picture to mask, edit in place, and export only when the user asks. Long local processing reports each stage and gives explicit status feedback.
- **Animation:** Use brief opacity/position transitions for navigation and feedback, a steady indeterminate spinner only during work, and a restrained pulse on the live local-preview signal. Respect `prefers-reduced-motion`; do not animate the video canvas, checksum, or subtitle content.
- **Typography System:** Use the system UI sans stack for English interface text, device-local Noto Sans Myanmar/Myanmar Text fallbacks for Burmese and a local system-monospace stack for timestamps, hashes and technical status. Use a compact all-caps eyebrow, a strong editorial page title, and quiet but legible body labels.
- **Brand Essence:** A private, on-device Burmese subtitling studio for filmmakers and everyday editors; precise, private, approachable.
- **Brand Voice:** Headlines are direct and creator-oriented; controls name concrete actions; microcopy explains processing and privacy without making AI accuracy promises. Examples: “Give your video a voice.” and “Nothing is uploaded to a server.”
- **Wordmark & Logo:** The compact custom “subly.” wordmark, framed by a transcription glyph and separated from the “Myanmar Studio” descriptor by a thin transport-rule; the wordmark is the brand, not the browser title.
- **Signature Brand Color:** Electric periwinkle blue `#6A8BFF`.
