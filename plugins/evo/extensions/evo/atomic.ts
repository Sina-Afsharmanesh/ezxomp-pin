/**
 * Atomic file write helper. Writes to a tmp name in the target directory then
 * renames over the destination. POSIX rename is atomic on the same filesystem,
 * so a crash between write and rename can't leave a partial file.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

export async function atomicWriteFile(target: string, content: string): Promise<void> {
  const dir = path.dirname(target);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(
    dir,
    `.evo-tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  try {
    await fs.writeFile(tmp, content, "utf-8");
    await fs.rename(tmp, target);
  } finally {
    await fs.unlink(tmp).catch(() => undefined);
  }
}
