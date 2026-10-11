/**
 * RED fixture for TASK-28. Each scenario runs in a fresh child process so the
 * storage owner, agent directory, and AX_STATE_ROOT are hermetic.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const scenario = process.argv[2];
const agentDir = process.env.PI_CODING_AGENT_DIR;
const experienceRoot = process.env.AX_STATE_ROOT;
const agentLearningSrc = process.env.AL_SRC;
const experienceSrc = process.env.AX_SRC;

if (!scenario) throw new Error("scenario argument is required");
if (!agentDir || !experienceRoot || !agentLearningSrc || !experienceSrc) {
	throw new Error("PI_CODING_AGENT_DIR, AX_STATE_ROOT, AL_SRC, and AX_SRC are required");
}

const project = join(agentDir, "project");
mkdirSync(project, { recursive: true });

const importExperience = (relative: string) => import(join(experienceSrc, relative));
const importLearning = (relative: string) => import(join(agentLearningSrc, relative));

async function createStorage() {
	const { initExperienceStorage } = await importExperience("storage/sqlite.ts");
	return initExperienceStorage(experienceRoot, { allowInit: true, userId: "owner" });
}

function procedureInput(id: string) {
	return {
		id,
		type: "gotcha",
		title: `Procedure ${id}`,
		scope: { languages: ["typescript"] },
		status: "candidate",
		record_kind: "procedure_evidence_v1",
		schema_version: 1,
		confidence_bp: 8_000,
		condition: "when procedure storage is exercised",
		behavior: "persist evidence in one ledger",
		polarity: 1,
		trigger: ["procedure trigger"],
		symptom: ["procedure symptom"],
		root_cause: ["procedure cause"],
		fix: ["procedure fix"],
		verification: ["procedure verification"],
	};
}

function legacyMarkdown(id: string): string {
	return [
		"---",
		`id: ${JSON.stringify(id)}`,
		"type: gotcha",
		`title: ${JSON.stringify("Legacy procedure")}`,
		"scope:",
		'  languages:\n    - "typescript"',
		"confidence: confirmed",
		"hits: 3",
		"created_at: 2026-08-23",
		"updated_at: 2026-08-23",
		"trigger:",
		'  - "legacy trigger"',
		"symptom:",
		'  - "legacy symptom"',
		"root_cause:",
		'  - "legacy cause"',
		"fix:",
		'  - "legacy fix"',
		"verification:",
		'  - "legacy verification"',
		"---",
		"",
	].join("\n");
}

async function freshMigration() {
	const storage = await createStorage();
	try {
		assert.equal(storage.db.prepare("PRAGMA user_version").get().user_version, 7);
		assert(storage.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='procedures'").get());
		assert(storage.db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_procedures_user_status'").get());
		assert.equal(storage.db.prepare("SELECT COUNT(*) AS count FROM migrations WHERE version=7").get().count, 1);
	} finally {
		storage.db.close();
	}
}

async function upgradeAndReplay() {
	const storage = await createStorage();
	const { insertStorageRecord } = await importExperience("storage/sqlite.ts");
	try {
		(insertStorageRecord as any)(storage.db, "habits", {
			id: "v6-habit-preserved",
			userId: "owner",
			data: { record_kind: "habit_candidate_v1", schema_version: 1, status: "candidate", behavior: "preserve this row" },
			now: "2026-08-23T00:00:00.000Z",
		});
		storage.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
		const dbPath = storage.dbPath;
		storage.db.close();

		const { loadSqlite } = await importExperience("storage/sqlite.ts");
		const { DatabaseSync } = await loadSqlite();
		const downgrade = new DatabaseSync(dbPath);
		downgrade.exec("PRAGMA journal_mode=DELETE; DROP INDEX IF EXISTS idx_procedures_user_status; DROP TABLE IF EXISTS procedures; DELETE FROM migrations WHERE version > 6; PRAGMA user_version=6;");
		downgrade.close();

		const upgraded = await createStorage();
		assert.equal(upgraded.db.prepare("PRAGMA user_version").get().user_version, 7);
		assert(upgraded.db.prepare("SELECT id FROM habits WHERE id='v6-habit-preserved'").get());
		assert.equal(upgraded.db.prepare("SELECT COUNT(*) AS count FROM migrations WHERE version=7").get().count, 1);
		upgraded.db.close();

		const replay = await createStorage();
		assert.equal(replay.db.prepare("SELECT COUNT(*) AS count FROM migrations WHERE version=7").get().count, 1);
		assert(replay.db.prepare("SELECT id FROM habits WHERE id='v6-habit-preserved'").get());
		replay.db.close();
	} catch (error) {
		try { storage.db.close(); } catch { /* already closed */ }
		throw error;
	}
}

async function proceduresPartition() {
	const storage = await createStorage();
	const { acquireOwnedLock } = await importExperience("storage/locks.ts");
	const { insertStorageRecord } = await importExperience("storage/sqlite.ts");
	const { saveMemoryEntry } = await importLearning("procedures/memory/capture.ts");
	const { retrieveMemories } = await importLearning("procedures/memory/retrieve.ts");
	try {
		const entry = {
			id: "procedure-partition-entry",
			type: "gotcha",
			title: "Procedure partition entry",
			scope: { languages: ["typescript"] },
			skills: ["target-skill"],
			compatible_skills: [],
			excluded_skills: [],
			confidence: "confirmed",
			hits: 3,
			created_at: "2026-08-23",
			updated_at: "2026-08-23",
			trigger: ["procedure trigger"],
			symptom: ["procedure symptom"],
			root_cause: ["procedure cause"],
			fix: ["procedure fix"],
			verification: ["procedure verification"],
		};
		await saveMemoryEntry(project, entry, { partition: "global" });
		const row = storage.db.prepare("SELECT id, data_json, checksum FROM procedures WHERE id=?").get(entry.id) as any;
		assert.equal(row?.id, entry.id);
		assert.equal(JSON.parse(row.data_json).title, entry.title);
		assert.match(row.checksum, /^[0-9a-f]{64}$/);
		const retrieved = await retrieveMemories(project, { prompt: "typescript procedure partition", activeSkills: ["target-skill"], partition: "global" });
		assert.equal(retrieved[0]?.entry.id, entry.id);

		storage.db.prepare("UPDATE procedures SET data_json=? WHERE id=?").run(JSON.stringify({ title: "tampered" }), entry.id);
		let rejected = false;
		try {
			const afterTamper = await retrieveMemories(project, { prompt: "typescript procedure partition", activeSkills: ["target-skill"], partition: "global" });
			rejected = !afterTamper.some((item: any) => item.entry.id === entry.id);
		} catch (error) {
			rejected = /checksum/i.test(error instanceof Error ? error.message : String(error));
		}
		assert.equal(rejected, true, "stale procedure checksum must fail closed");

		const lock = await acquireOwnedLock(experienceRoot, "procedures", { waitMs: 0 });
		try {
			await assert.rejects(
				() => saveMemoryEntry(project, { ...entry, id: "procedure-lock-contender" }, { partition: "global" }),
				/Could not acquire Agent Experience procedures lock/i,
			);
		} finally {
			await lock.release();
		}

		// Keep direct helper coverage: the new partition must share typed checksum semantics.
		(insertStorageRecord as any)(storage.db, "procedures", { id: "procedure-helper-row", userId: "owner", data: procedureInput("procedure-helper-row"), now: "2026-08-23T00:00:00.000Z" });
		assert.match((storage.db.prepare("SELECT checksum FROM procedures WHERE id='procedure-helper-row'").get() as any).checksum, /^[0-9a-f]{64}$/);
	} finally {
		storage.db.close();
	}
}

async function legacyArchive() {
	const legacyRoot = join(agentDir!, "agent-learning");
	mkdirSync(join(legacyRoot, "memory", "global", "gotchas"), { recursive: true });
	writeFileSync(join(legacyRoot, "index.json"), JSON.stringify({ version: 1, updated_at: "2026-08-23T00:00:00.000Z", entries: [] }) + "\n");
	writeFileSync(join(legacyRoot, "memory", "global", "gotchas", "legacy-procedure.md"), legacyMarkdown("legacy-procedure"));

	const storage = await createStorage();
	const { ensureStore } = await importLearning("procedures/store/storage.ts");
	try {
		await ensureStore(project, "global");
		assert.equal(existsSync(legacyRoot), false, "legacy agent-learning root must be archived");
		const archives = readdirSync(agentDir!).filter((name) => name.startsWith("agent-learning.") && name !== "agent-learning.json");
		assert.equal(archives.length, 1, "legacy root must have exactly one archive");
		assert.equal((storage.db.prepare("SELECT id FROM procedures WHERE id='legacy-procedure'").get() as any)?.id, "legacy-procedure");
		await ensureStore(project, "global");
		assert.equal(readdirSync(agentDir!).filter((name) => name.startsWith("agent-learning.") && name !== "agent-learning.json").length, 1, "legacy migration must be one-shot");
	} finally {
		storage.db.close();
	}
}

async function backupRestore() {
	const storage = await createStorage();
	const { insertStorageRecord } = await importExperience("storage/sqlite.ts");
	const { createBackup, prevalidateBackup, restoreBackup } = await importExperience("storage/backup.ts");
	try {
		(insertStorageRecord as any)(storage.db, "procedures", { id: "backup-procedure", userId: "owner", data: procedureInput("backup-procedure"), now: "2026-08-23T00:00:00.000Z" });
		storage.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
		storage.db.close();
		await createBackup(experienceRoot!, { backupId: "procedures-backup", createdAt: "2026-08-23T00:00:01.000Z" });
		const validated = await prevalidateBackup(experienceRoot!, "procedures-backup");
		assert.equal(validated.storageSchemaVersion, 7);

		const live = await (await importExperience("storage/sqlite.ts")).openExistingExperienceStorage(experienceRoot!, { userId: "owner" });
		live.db.prepare("DELETE FROM procedures WHERE id=?").run("backup-procedure");
		live.db.close();
		await restoreBackup(experienceRoot!, "procedures-backup", { allowOverwrite: true, confirmDatabaseClosed: true });
		const reopened = await (await importExperience("storage/sqlite.ts")).openExistingExperienceStorage(experienceRoot!, { userId: "owner" });
		try {
			assert.equal((reopened.db.prepare("SELECT id FROM procedures WHERE id='backup-procedure'").get() as any)?.id, "backup-procedure");
		} finally {
			reopened.db.close();
		}
	} finally {
		try { storage.db.close(); } catch { /* already closed */ }
	}
}

switch (scenario) {
	case "fresh": await freshMigration(); break;
	case "upgrade": await upgradeAndReplay(); break;
	case "procedures": await proceduresPartition(); break;
	case "legacy": await legacyArchive(); break;
	case "backup": await backupRestore(); break;
	default: throw new Error(`unknown scenario: ${scenario}`);
}

console.log(`TASK-28 RED scenario passed: ${scenario}`);
