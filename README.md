# AI Myanmar Subtitle System

A static, mobile-first browser studio for generating, editing and rendering Burmese (Myanmar) subtitles without uploading the video to an application server.

## Local setup

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL shown by Vite. Production static files are built with `pnpm build` into `dist/`. Automated checks are `pnpm test`, `pnpm typecheck` and `pnpm test:e2e`.

## Client-side processing and privacy

- The video is held in the page as a local browser `File` and object URL. Transcription and render inputs are processed by bundled FFmpeg WebAssembly; no media API, database or custom application server is used.
- Whisper runs through Transformers.js and ONNX Runtime WebAssembly. M2M100 provides a many-to-many translation route into Myanmar. Translation output, timestamps and cue edits remain client-side and are editable before export.
- First-use Whisper/M2M100 weights download from their Hugging Face model repositories and Transformers.js caches them in browser storage. The browser therefore needs an internet connection for the initial model load (and revalidation may depend on browser cache policy); all inference takes place on-device. FFmpeg core/WASM is bundled with this site's static assets.
- Local model downloads can be hundreds of megabytes. The app also bundles roughly 32 MB of FFmpeg and 21.6 MB of ONNX Runtime WebAssembly assets that are loaded when those engines are first used. The models and video buffers consume device memory; low-memory phones may be slow or run out of browser memory on long/high-resolution videos. Test a short clip first and prefer a recent desktop/tablet for long jobs. This implementation does not upload or persist your videos; closing or refreshing the tab discards current session edits. Browser model cache is managed by the browser.
- Whisper and machine translation can make recognition, timing, names and translation errors. Review and edit every line before distribution. Language-specific model quality depends on the source language and audio.
- Final MP4 export re-encodes video to burn text/masks, while copying the source audio packets with `-c:a copy`. The studio hashes the input/output audio elementary payloads with SHA-256 and reports whether they match. Stream-copy support depends on the source MP4 audio codec and browser FFmpeg build; failures are reported rather than silently re-encoding audio.

## Verification

The standard browser suite covers first render, mobile navigation, portrait MP4 ingestion, correct mask mapping inside the letterboxed picture, both mask effects, Burmese caption editing, SubRip download, FFmpeg MP4 output and exact audio-payload SHA-256 integrity. Chromium in some CI/headless distributions does not bundle proprietary H.264 playback codecs; the export integration therefore exercises FFmpeg directly and supplies the fixture's known dimensions to test the actual content geometry. Supported target browsers must include the MP4 codecs present in their input files for playback.

To download and run the actual browser-local model weights as well, use `RUN_LOCAL_MODEL_TESTS=1 pnpm exec playwright test -g 'M2M100 translates|Whisper tiny' --workers=1`. The model test is excluded from default CI runs because first-use weights may be large; both models have been smoke-tested in a real browser.

## GitHub Pages deployment

The approved public repository (`charlie-svg/ai-myanmar-subtitle-system`) deploys its static `dist/` artifact from `.github/workflows/pages.yml` whenever `main` is updated. The repository's source, docs and test fixtures are public; the workflow installs the pinned pnpm toolchain, runs unit/type checks and browser E2E tests, and builds with `VITE_BASE_PATH=/ai-myanmar-subtitle-system/` for the GitHub project-site URL. This CI job builds/tests the site; runtime video, Whisper inference, translation and rendering still happen in each visitor's browser.

For a deployed end-to-end smoke test after Pages is live, run `PLAYWRIGHT_BASE_URL=https://charlie-svg.github.io/ai-myanmar-subtitle-system/ RUN_LIVE_SMOKE=1 pnpm exec playwright test e2e/live-deploy.spec.ts --workers=1`. This opt-in test downloads the large local model weights and exercises a short speech MP4 through transcription, Burmese translation, masks, SRT/MP4 download, audio SHA-256 equality, and browser error collection.

See [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) for model and distribution notices.
