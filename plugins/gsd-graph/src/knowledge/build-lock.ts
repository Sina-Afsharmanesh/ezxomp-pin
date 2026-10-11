/**
 * Cross-process build lock for knowledge-graph writes.
 *
 * Atomic O_EXCL create with stale-owner takeover: a lock file holding the pid
 * of a dead owner is reclaimed; a live owner (or EPERM-ambiguous owner)
 * refuses the build. Returns a release() that unlinks best-effort.
 */
import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { dirname } from "node:path";

export async function acquireBuildLock(lockPath: string): Promise<() => void> {
 // The lock lives inside .gsd/ — create the parent or O_EXCL always ENOENTs
 // and the loop below spins forever.
 mkdirSync(dirname(lockPath), { recursive: true });
 for (;;) {
  let fd: number;
  try {
   fd = openSync(lockPath, "wx");
  } catch {
   // Exists — stale-owner takeover when the pid is dead.
   let ownerPid: number | null = null;
   try {
    const raw = readFileSync(lockPath, "utf-8").trim();
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed > 0) ownerPid = parsed;
   } catch {
    /* unreadable lock — treat as stale */
   }
   if (ownerPid !== null) {
    try {
     process.kill(ownerPid, 0);
     throw new Error("another process is building the graph; retry shortly");
    } catch (error) {
     if ((error as NodeJS.ErrnoException).code === "EPERM") {
      throw new Error("another process is building the graph; retry shortly");
     }
     if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
     // dead owner — reclaim below
    }
   }
   try {
    unlinkSync(lockPath);
    continue;
   } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") continue; // raced reclaim
    throw error;
   }
  }
  try {
   const buf = Buffer.from(String(process.pid), "utf-8");
   writeSync(fd, buf, 0, buf.length);
  } finally {
   closeSync(fd);
  }
  let released = false;
  return () => {
   if (released) return;
   released = true;
   try {
    unlinkSync(lockPath);
   } catch {
    /* best-effort */
   }
  };
 }
}
