import { DurableObject } from "cloudflare:workers";
import type { Files, LoaderModules } from "./bundle.ts";

// hash identifies the built code. It's the Worker Loader id, so a deploy that changes
// nothing reuses the isolate the smoke test already started.
export type AppRecord = { name: string; version: number; hash: string; mainModule: string; modules: LoaderModules };
export type AppSummary = { name: string; version: number; updated: string };

// Every deployed app, in SQLite. One instance holds the whole registry.
export class Registry extends DurableObject {
  sql = this.ctx.storage.sql;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS apps (
      name TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      hash TEXT NOT NULL,
      main TEXT NOT NULL,
      files TEXT NOT NULL,
      modules TEXT NOT NULL,
      updated TEXT NOT NULL
    )`);
  }

  put(name: string, files: Files, hash: string, mainModule: string, modules: LoaderModules): number {
    const row = this.sql
      .exec<{ version: number }>(
        `INSERT INTO apps (name, version, hash, main, files, modules, updated)
         VALUES (?, 1, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT (name) DO UPDATE SET version = version + 1, hash = excluded.hash, main = excluded.main,
           files = excluded.files, modules = excluded.modules, updated = excluded.updated
         RETURNING version`,
        name, hash, mainModule, JSON.stringify(files), JSON.stringify(modules),
      )
      .one();
    return row.version;
  }

  get(name: string): AppRecord | null {
    const rows = [
      ...this.sql.exec<{ version: number; hash: string; main: string; modules: string }>(
        "SELECT version, hash, main, modules FROM apps WHERE name = ?", name,
      ),
    ];
    if (rows.length === 0) return null;
    const r = rows[0];
    return { name, version: r.version, hash: r.hash, mainModule: r.main, modules: JSON.parse(r.modules) };
  }

  source(name: string): Files | null {
    const rows = [...this.sql.exec<{ files: string }>("SELECT files FROM apps WHERE name = ?", name)];
    return rows.length ? JSON.parse(rows[0].files) : null;
  }

  remove(name: string): boolean {
    return this.sql.exec("DELETE FROM apps WHERE name = ?", name).rowsWritten > 0;
  }

  list(): AppSummary[] {
    return [...this.sql.exec<AppSummary>("SELECT name, version, updated FROM apps ORDER BY updated DESC")];
  }
}
