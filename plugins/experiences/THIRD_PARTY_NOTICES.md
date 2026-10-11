# Third-party notices

`pi-experiences` itself is MIT licensed. Its optional fully managed local duplicate-prevention path uses the following pinned third-party components.

## paraphrase-multilingual-MiniLM-L12-v2

- Base model: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`
- ONNX conversion/source files: `Xenova/paraphrase-multilingual-MiniLM-L12-v2`
- Pinned revision: `2c4055b12046f11709e9df2c122e59ffbdc2f900`
- License: Apache License 2.0
- Capability: multilingual semantic similarity, trained on parallel data for 50+ languages
- ONNX source: https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2
- Official model documentation: https://www.sbert.net/docs/sentence_transformer/pretrained_models.html

Model/tokenizer/WASM assets are vendored at maintainer sign-off under `runtime/assets/local-embedding/multilingual-minilm-l12-int8-v1/`. Bytes/SHA are locked in `runtime/assets/local-embedding.lock.json`. The installed runtime never reaches the network for these bytes. The model asset Apache-2.0 license text and provenance are packed at `runtime/assets/local-embedding/multilingual-minilm-l12-int8-v1/LICENSE.Apache-2.0`.

## ONNX Runtime Web and Common

- Packages: `onnxruntime-web@1.27.0`, `onnxruntime-common@1.27.0`
- License: MIT
- Sources: https://www.npmjs.com/package/onnxruntime-web, https://www.npmjs.com/package/onnxruntime-common

The package vendors runtime copies of:

- `runtime/vendor/onnxruntime-web/ort.node.min.mjs`
- `runtime/vendor/onnxruntime-web/ort-wasm-simd-threaded.mjs`
- `runtime/vendor/onnxruntime-common/dist/esm/*.js`
- `runtime/vendor/onnxruntime-web/LICENSE`
- `runtime/vendor/onnxruntime-common/LICENSE`

The matching `runtime/assets/local-embedding/multilingual-minilm-l12-int8-v1/ort-wasm-simd-threaded.wasm` is vendored alongside the model assets; verified per `runtime/assets/local-embedding.lock.json` on every release.

Copyright (c) Microsoft Corporation. All rights reserved.

## Hugging Face Tokenizers

- Package: `@huggingface/tokenizers@0.1.3`
- License: Apache License 2.0
- Source: https://www.npmjs.com/package/@huggingface/tokenizers

License texts are packed at `runtime/vendor/huggingface-tokenizers/LICENSE`, `runtime/vendor/onnxruntime-web/LICENSE`, `runtime/vendor/onnxruntime-common/LICENSE`, and `runtime/assets/local-embedding/multilingual-minilm-l12-int8-v1/LICENSE.Apache-2.0`.
