// Optional native addon shim for @ezxomp/gsd-web.
// The full @gsd/native Rust engine is not shipped with this plugin; requiring a
// non-existent path throws synchronously and the caller's try/catch falls back
// to the pure-JS implementation (documented in PROVENANCE.md).
require("@ezxomp/gsd-web-nonexistent-native-addon");
