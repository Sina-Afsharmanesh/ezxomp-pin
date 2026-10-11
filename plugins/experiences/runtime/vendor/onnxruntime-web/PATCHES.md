# ONNX Runtime Web patches

## `ort.node.min.mjs`

- Upstream package: `onnxruntime-web@1.27.0`
- Upstream tarball: `https://registry.npmjs.org/onnxruntime-web/-/onnxruntime-web-1.27.0.tgz`
- Upstream integrity: `sha512-ogDLsqIozHZwifPuN37OproAo0byX6t43/bP8GzeZWBWD6MOGExswFAx3up4NS/vvWBOg2u2PXomDt3rMmdQSg==`
- Upstream file: tarball path `package/dist/ort.node.min.mjs`
- Paired runtime package: `onnxruntime-common@1.27.0`
- Paired runtime integrity: `sha512-3KxL5wIVqa8Ex08jxSzncm9CMgw8CjOFyOQ7SxvG9o0cVLlhTNKXyIQuTbtX4tGPJEf73OER2xrjt4HJSBL4ow==`

Patch: bare `onnxruntime-common` imports in `ort.node.min.mjs` are rewritten to the sibling vendored package path `../onnxruntime-common/dist/esm/index.js`.

Why: marketplace and `npm pack --ignore-scripts` installs preserve tracked package files, not workspace `node_modules`. The sibling path keeps ONNX Runtime self-contained inside `runtime/vendor/` without lifecycle hooks or dependency installation.

Refresh:

1. Copy fresh `dist/ort.node.min.mjs`, `dist/ort-wasm-simd-threaded.mjs`, and `LICENSE` from `onnxruntime-web@1.27.0`.
2. Copy matching `onnxruntime-common@1.27.0` `LICENSE`, `package.json`, and needed `dist/esm/` files into `runtime/vendor/onnxruntime-common/`.
3. Reapply only the bare-import rewrite above to `ort.node.min.mjs`.
4. Update `scripts/check-agent-experience-source.mjs` expected runtime hashes if bytes intentionally changed.
5. Validate with:
   - `npm run check:source`
   - `scripts/verify-packed-install.mjs` against an `npm pack --ignore-scripts` tarball
