/**
 * Stage client static assets into the Next standalone output.
 *
 * `next build` emits client chunks to .next/static but the standalone server
 * tree (.next/standalone/web) only gets server-side assets — requests to
 * /_next/static/* 404 unless the static dir is copied in. This runs as the
 * postbuild half of `npm run build` so the committed/produced standalone
 * server is complete out of the box.
 */

import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const webRoot = join(import.meta.dirname, "..");
const source = join(webRoot, ".next", "static");
const target = join(webRoot, ".next", "standalone", "web", ".next", "static");

if (!existsSync(source)) {
 console.error("stage-standalone-static: no .next/static found — run `next build` first");
 process.exit(1);
}

mkdirSync(join(target, ".."), { recursive: true });
cpSync(source, target, { recursive: true });
console.log(`stage-standalone-static: staged .next/static → ${target.replace(webRoot, ".")}`);
