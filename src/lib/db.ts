import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

export const dataDir = path.resolve(process.env.DEVLAUNCH_DATA_DIR ?? path.join(process.cwd(), "data"));
export const keysDir = path.join(dataDir, "keys");

const schema = `
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    section TEXT NOT NULL CHECK (section IN ('work', 'personal')),
    path TEXT NOT NULL UNIQUE,
    local_url TEXT,
    testing_url TEXT,
    live_url TEXT,
    compose_file TEXT,
    start_command TEXT,
    stop_command TEXT,
    restart_command TEXT,
    rebuild_command TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 22,
    username TEXT NOT NULL,
    private_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS deployments (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    server_id TEXT NOT NULL REFERENCES servers(id),
    name TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('image', 'commands')),
    image_name TEXT,
    image_tag TEXT,
    build_context TEXT,
    dockerfile TEXT,
    remote_path TEXT NOT NULL,
    commands TEXT NOT NULL,
    platform TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS deploy_runs (
    id TEXT PRIMARY KEY,
    deployment_id TEXT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'success', 'error', 'cancelled')),
    log TEXT NOT NULL DEFAULT '',
    started_at TEXT NOT NULL,
    finished_at TEXT
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    pin_hash TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS pipelines (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    steps_json TEXT NOT NULL DEFAULT '[]',
    schedule TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_deployments_project ON deployments(project_id);
  CREATE INDEX IF NOT EXISTS idx_runs_deployment ON deploy_runs(deployment_id, started_at);
`;

// One connection per process. Next.js keeps module state across requests in
// production and reloads modules in development, so cache on globalThis.
const globalState = globalThis as unknown as { devlaunchDb?: Database.Database };

export function db() {
  if (globalState.devlaunchDb) return globalState.devlaunchDb;
  mkdirSync(keysDir, { recursive: true, mode: 0o700 });
  const connection = new Database(path.join(dataDir, "devlaunch.sqlite"));
  connection.pragma("journal_mode = WAL");
  connection.pragma("foreign_keys = ON");
  connection.exec(schema);
  const columns = (connection.prepare("PRAGMA table_info(deployments)").all() as Array<{ name: string }>).map((c) => c.name);
  if (!columns.includes("platform")) connection.exec("ALTER TABLE deployments ADD COLUMN platform TEXT");
  const projectColumns = (connection.prepare("PRAGMA table_info(projects)").all() as Array<{ name: string }>).map((c) => c.name);
  for (const column of ["testing_url", "compose_file", "start_command", "stop_command", "restart_command", "rebuild_command", "notes"]) {
    if (!projectColumns.includes(column)) connection.exec(`ALTER TABLE projects ADD COLUMN ${column} TEXT`);
  }
  const deploymentColumns = (connection.prepare("PRAGMA table_info(deployments)").all() as Array<{ name: string }>).map((c) => c.name);
  for (const column of ["env_path", "env_encrypted", "require_clean_git"]) {
    if (!deploymentColumns.includes(column)) connection.exec(`ALTER TABLE deployments ADD COLUMN ${column} TEXT`);
  }
  const runColumns = (connection.prepare("PRAGMA table_info(deploy_runs)").all() as Array<{ name: string }>).map((c) => c.name);
  for (const column of ["kind", "username"]) {
    if (!runColumns.includes(column)) connection.exec(`ALTER TABLE deploy_runs ADD COLUMN ${column} TEXT`);
  }
  globalState.devlaunchDb = connection;
  return connection;
}

export function now() {
  return new Date().toISOString();
}
