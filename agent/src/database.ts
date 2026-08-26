import { execFile as execFileCallback } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export const databasePath = path.resolve(
  process.env.DEVLAUNCH_DATABASE_PATH ??
    path.join(homedir(), "Library", "Application Support", "DevLaunch", "devlaunch.sqlite"),
);

let initialized = false;

async function sqlite(sql: string, json = false) {
  const { stdout } = await execFile(
    "/usr/bin/sqlite3",
    [...(json ? ["-json"] : []), databasePath, sql],
    { timeout: 5000, maxBuffer: 2 * 1024 * 1024 },
  );
  return stdout;
}

type TableColumn = { name: string };

export function sqlText(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

export async function initializeDatabase() {
  if (initialized) return;
  await mkdir(path.dirname(databasePath), { recursive: true });
  await sqlite("PRAGMA journal_mode = WAL");
  await sqlite(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      folder_name TEXT NOT NULL UNIQUE,
      local_path TEXT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL CHECK (category IN ('work', 'personal')),
      stack_json TEXT,
      repository_paths_json TEXT,
      github_url TEXT,
      local_url TEXT,
      live_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await sqlite(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  const columnsOutput = await sqlite("PRAGMA table_info(projects)", true);
  const columns = new Set(
    ((columnsOutput.trim() ? JSON.parse(columnsOutput) : []) as TableColumn[]).map(
      (column) => column.name,
    ),
  );
  const migrations = [
    ["local_path", "ALTER TABLE projects ADD COLUMN local_path TEXT"],
    ["stack_json", "ALTER TABLE projects ADD COLUMN stack_json TEXT"],
    ["repository_paths_json", "ALTER TABLE projects ADD COLUMN repository_paths_json TEXT"],
    ["github_url", "ALTER TABLE projects ADD COLUMN github_url TEXT"],
    ["local_url", "ALTER TABLE projects ADD COLUMN local_url TEXT"],
    ["live_url", "ALTER TABLE projects ADD COLUMN live_url TEXT"],
  ] as const;
  for (const [column, migration] of migrations) {
    if (!columns.has(column)) await sqlite(migration);
  }
  await sqlite("CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category)");
  await sqlite(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_local_path ON projects(local_path) WHERE local_path IS NOT NULL",
  );
  await sqlite("PRAGMA optimize");
  initialized = true;
}

export async function queryDatabase<T>(sql: string) {
  await initializeDatabase();
  const output = await sqlite(sql, true);
  return (output.trim() ? JSON.parse(output) : []) as T[];
}

export async function runDatabase(sql: string) {
  await initializeDatabase();
  await sqlite(sql);
}
