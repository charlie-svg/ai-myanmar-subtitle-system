# Delivery outcomes

## 1. Private browser-only architecture and MP4 input/playback
- [x] **Acceptance:** Pure Client-Side Execution: Must run completely inside the browser using WebAssembly / WebCodecs / Client-side JS libraries (Whisper via transformers.js or browser-based ONNX runtimes).
- [x] **Acceptance:** NO External Backend Servers: Absolutely NO Render, Colab, LocalTunnel, or ngrok required. Everything must process locally on the user's device.
- [x] **Acceptance:** Input: User uploads an MP4 video file.
- [x] **Acceptance:** Output: Seamless local video playback inside the browser with custom HTML5 video controls.
- [x] **Evidence:** `src/App.tsx`, `src/local-ai.ts`, static-only configuration; local MP4 upload is covered by Playwright.

## 2. Audio preservation and integrity verification
- [x] **Acceptance:** Audio Preservation: Keep the original audio stream completely intact using stream-copy concept (no unnecessary audio re-encoding), verified via a SHA-256 hash check.
- [x] **Acceptance:** Display clear Input and Output status logs, processing progress bars, and SHA-256 integrity verification results to the user.
- [x] **Evidence:** FFmpeg maps audio using `-c:a copy`; the browser integration export verifies input/output audio elementary-stream payload SHA-256 equality and exposes whole-file hashes/status logs.

## 3. Local speech transcription and Burmese translation
- [x] **Acceptance:** Extract audio and run Whisper speech-to-text to generate initial transcriptions.
- [x] **Acceptance:** Implement an automated translation layer to convert the text directly into accurate Burmese (Myanmar) subtitles.
- [x] **Acceptance:** Use client-side Transformers.js and ONNX/WebAssembly for Whisper speech recognition and Burmese translation; allow first-use weights to be downloaded and browser-cached while inference remains on-device.
- [x] **Evidence:** `src/local-ai.ts` extracts mono 16 kHz audio with bundled FFmpeg, runs `onnx-community/whisper-tiny`, and translates each timestamped segment with the MIT-licensed `Xenova/m2m100_418M` model; browser smoke tests ran both model pipelines on real speech/text and verified timestamped transcript output and Myanmar-script translation.

## 4. Burmese subtitle synchronization and editing
- [x] **Acceptance:** Precisely align Burmese subtitles with the video audio timestamps (Burmese Subtitle Sync).
- [x] **Acceptance:** Provide a fully interactive built-in subtitle editor to modify Burmese texts, adjust start/end timestamps, and export standard .SRT files.
- [x] **Evidence:** ASR timestamped segments feed the editable cue list and timed local preview; cue range validation and UTF-8 SubRip download have unit/browser coverage.

## 5. Burned-in subtitle region blurring and masking
- [x] **Acceptance:** Provide a canvas/overlay tool allowing users to manually select and cover regions over original burned-in subtitles (applying a blur effect or a solid black box mask).
- [x] **Evidence:** Pointer-drawn normalized video regions are relative to the actual contained image, preview as blur/black overlays, and feed FFmpeg blur/drawbox filters; unit and portrait-video E2E coverage verifies letterbox mapping and both effects.

## 6. Local MP4 output
- [x] **Acceptance:** Render and export the final edited video as an MP4 file directly in the browser.
- [x] **Acceptance:** Display clear Input and Output status logs, processing progress bars, and SHA-256 integrity verification results to the user.
- [x] **Evidence:** Playwright uploads a local MP4, edits a Burmese cue, downloads SRT, renders a downloadable MP4 and verifies the copied audio payload hash.

## 7. Mobile-first user experience and code quality
- [x] **Acceptance:** Fully responsive interface optimized for mobile web usage (supporting small screens, bottom navigation bars, clear back/home navigation).
- [x] **Acceptance:** Dark mode by default, featuring deep indigo, electric blue, or emerald green accents.
- [x] **Acceptance:** Ensure all build processes, TypeScript type-checks, and end-to-end tests pass successfully.
- [x] **Evidence:** Responsive dark studio with bottom navigation at 390 px; `pnpm test`, `pnpm typecheck`, `pnpm build`, and `pnpm test:e2e` are run before checkpointing.

## 8. Free public production deployment and URL
- [x] **Decision:** User approved creating the public `ai-myanmar-subtitle-system` repository and deploying it to GitHub Pages.
- [ ] **Acceptance:** App ကို Live တင်ပြီးသွားပါက အများသုံးလို့ရမယ့် တိုက်ရိုက် Web Link (URL) ကို ထုတ်ပေးပါ။
- [ ] **Acceptance:** Deploy to free GitHub Pages (or similar free static hosting) without credit-card requirements.
- [ ] **Evidence:** Public Pages site is configured, workflow completes, and its live URL is checked over HTTPS.

## 9. Live input/output, model, mask, and audio-preservation test
- [ ] **Acceptance:** ဗီဒီယိုဖိုင် ထည့်သွင်းခြင်း (Input) မှစ၍ လုပ်ဆောင်ချက်များကို Live ပေါ်တွင် စမ်းသပ်ပါ။
- [ ] **Acceptance:** မူလစာတန်းဟောင်းများကို သုံးစွဲသူ ကိုယ်တိုင် သတ်မှတ်ဝါးဖျောက်နိုင်ခြင်း (Blur/Masking) ရှိမရှိ စစ်ဆေးပါ။
- [ ] **Acceptance:** Whisper API ဖြင့် မြန်မာစာတန်းများ အချိန်ကိုက် တိကျစွာ ထွက်လာခြင်း ရှိမရှိ စစ်ဆေးပါ။
- [ ] **Acceptance:** ဗီဒီယို၏ မူလအသံ (Original Audio) ကို stream copy ဖြင့် ၁၀၀% မူလအတိုင်း လုံးဝမပျက်ဘဲ ထိန်းသိမ်းထားနိုင်ခြင်း ရှိမရှိ အသေအချာ Test လုပ်ပြပါ။
- [ ] **Evidence:** Opt-in deployed-site Playwright path uploads a short speech MP4, runs local Whisper and M2M100 in the browser, checks timestamped Myanmar cues, both masks, SRT/MP4 downloads, exact audio-payload SHA-256 equality and console/page errors.

## 10. Live console and log inspection
- [ ] **Acceptance:** Live ပေါ်တွင် Console Error သို့မဟုတ် တစုံတရာ ချို့ယွင်းချက် ရှိမရှိ နောက်ဆုံးတစ်ကြိမ် ထပ်မံစစ်ဆေးပြီး အတည်ပြုပေးပါ။
- [ ] **Evidence:** The deployed-page smoke test captures browser console errors and uncaught page exceptions during the full input-to-output flow.
