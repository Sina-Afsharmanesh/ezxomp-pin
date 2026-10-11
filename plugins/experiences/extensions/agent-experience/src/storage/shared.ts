/**
 * Shared SQLite runtime helpers for the agent-experience storage layer.
 *
 * Lives outside sqlite.ts/backup.ts so the storage backup module and the
 * sqlite connection module can both depend on it without forming an
 * import cycle (fallow TASK-40.5).
 */

export async function loadSqlite() {
	// node:sqlite and bun:sqlite are platform-specific built-ins absent on some runtimes,
	// so they must be loaded dynamically. Try node:sqlite first (Node 22+), then fall back
	// to bun:sqlite (Bun does not ship node:sqlite), wrapping Bun's Database to match the
	// DatabaseSync surface the storage layer relies on.
	try {
		const sqlite = await import("node:sqlite");
		if (typeof sqlite.DatabaseSync !== "function") throw new Error("node:sqlite DatabaseSync unavailable");
		return sqlite;
	} catch (nodeError: any) {
		try {
			const bunSqlite = await import("bun:sqlite");
			if (typeof bunSqlite.Database !== "function") throw new Error("bun:sqlite Database unavailable");
			class BunDatabaseSync {
				#db: InstanceType<typeof bunSqlite.Database>;
				constructor(path: string, options: { open?: boolean; readOnly?: boolean; timeout?: number } = {}) {
					const bunOpts: { readonly?: boolean; create?: boolean } = {};
					if (options.readOnly) { bunOpts.readonly = true; bunOpts.create = false; }
					this.#db = options.readOnly ? new bunSqlite.Database(path, bunOpts) : new bunSqlite.Database(path);
				}
				prepare(sql: string) { return this.#db.prepare(sql); }
				exec(sql: string) { return this.#db.exec(sql); }
				close() { return this.#db.close(); }
			}
			return { DatabaseSync: BunDatabaseSync, backup: bunSqliteBackup } as unknown as {
				DatabaseSync: new (path: string, options?: { open?: boolean; readOnly?: boolean; timeout?: number }) => SqliteDbHandle;
				backup: typeof bunSqliteBackup;
			};
		} catch (bunError: any) {
			throw new Error(`Agent Experience SQLite unavailable: node:${nodeError?.message || nodeError}; bun:${bunError?.message || bunError}`);
		}
	}
}



export interface SqliteDbHandle {
	prepare(sql: string): { get(...params: unknown[]): Record<string, unknown> | undefined; all(...params: unknown[]): Record<string, unknown>[]; run(...params: unknown[]): unknown };
	exec(sql: string): void;
	close(): void;
}



export async function bunSqliteBackup(sourceDb: SqliteDbHandle, sourcePath: string, destPath: string): Promise<void> {
	const { copyFile, mkdir } = await import("node:fs/promises");
	const { dirname } = await import("node:path");
	try { sourceDb.exec("PRAGMA wal_checkpoint(TRUNCATE)"); } catch { /* checkpoint best-effort */ }
	await mkdir(dirname(destPath), { recursive: true });
	await copyFile(sourcePath, destPath);
}



export async function isBunSqliteRuntime(): Promise<boolean> {
	try { await import("node:sqlite"); return false; } catch { return true; }
}
