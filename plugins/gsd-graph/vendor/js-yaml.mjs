// vendor/js-yaml.mjs — ESM wrapper for the vendored CommonJS js-yaml package.
// js-yaml@4.3.1 ships CJS only. The original .mjs build (dist/js-yaml.mjs, 103KB) was
// dropped to keep the vendor tree small. We instead load the CJS entry via createRequire
// and re-export its named bindings. Bun + Node 22 both support this.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// js-yaml's CJS index.js does `module.exports = require('./lib/loader');`
// Re-export the default and the named helpers we actually use in evo.
const yaml = require("./js-yaml/index.js");
export const load = yaml.load;
export const dump = yaml.dump;
export default yaml;
