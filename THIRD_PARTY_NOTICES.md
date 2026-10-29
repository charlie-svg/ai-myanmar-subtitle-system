# Third-party software and model notices

This static client downloads a bundled FFmpeg WebAssembly core, uses Transformers.js/ONNX Runtime, and loads public model weights in the user's browser. Verify notices against the exact package/model versions before redistributing a modified build.

## FFmpeg WebAssembly

- Package: `@ffmpeg/core` 0.12.10; package declares **GPL-2.0-or-later**.
- Package source: [ffmpeg.wasm source repository](https://github.com/ffmpegwasm/ffmpeg.wasm); package [license/version](https://www.npmjs.com/package/@ffmpeg/core).
- GPLv2 text is included in [`LICENSES/GPL-2.0-or-later.txt`](./LICENSES/GPL-2.0-or-later.txt). The FFmpeg core's corresponding source and build configuration are published by the upstream FFmpeg WebAssembly project.
- The core is a separately loaded browser WebAssembly asset. Before using this bundle in a proprietary/closed-source distribution, review the applicable GPL obligations with counsel and ensure recipients can obtain the corresponding source for the exact distributed binary.

## Speech and translation models

- Whisper ASR: `onnx-community/whisper-tiny`, an ONNX/Transformers.js conversion of [`openai/whisper-tiny`](https://huggingface.co/openai/whisper-tiny); [ONNX model card](https://huggingface.co/onnx-community/whisper-tiny). Upstream Whisper is MIT-licensed; see [OpenAI Whisper license](https://github.com/openai/whisper/blob/main/LICENSE).
- Translation: `Xenova/m2m100_418M`, the Transformers.js/ONNX conversion of [`facebook/m2m100_418M`](https://huggingface.co/facebook/m2m100_418M). Upstream model card declares MIT and lists Burmese (`my`) among its languages. [Converted model card](https://huggingface.co/Xenova/m2m100_418M).
- Model weights are downloaded by the browser from their upstream repositories on first use, then cached locally subject to browser storage policy. They are not inference APIs; no video or transcript is sent to them.

## JavaScript and ONNX libraries

- [`@huggingface/transformers`](https://github.com/huggingface/transformers.js) provides client-side model pipelines and ONNX Runtime Web.
- [`@ffmpeg/ffmpeg`](https://github.com/ffmpegwasm/ffmpeg.wasm) provides the local FFmpeg Worker API. See `package.json` and `pnpm-lock.yaml` for exact pinned versions.


## E2E speech fixture

`e2e/fixtures/jfk.flac` is a short speech fixture from [`openai/whisper/tests/jfk.flac`](https://github.com/openai/whisper/blob/main/tests/jfk.flac). It is used only in the optional local Whisper inference smoke test, not shipped as model data or used by the application workflow. The OpenAI Whisper repository is MIT-licensed; see the upstream [`LICENSE`](https://github.com/openai/whisper/blob/main/LICENSE).
