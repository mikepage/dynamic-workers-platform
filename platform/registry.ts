import { DurableObject } from "cloudflare:workers";
import type { Files, Modules } from "./compile.ts";

export type AppRecord = { name: string; version: number; mainModule: string; modules: Modules };
export type AppSummary = { name: string; version: number; updated: string };

// Every deployed app, in SQLite on local disk. One instance holds the whole registry.
export class Registry extends DurableObject {
  sql = this.ctx.storage.sql;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS apps (
      name TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      main TEXT NOT NULL,
      files TEXT NOT NULL,
      modules TEXT NOT NULL,
      updated TEXT NOT NULL
    )`);
  }

  put(name: string, files: Files, mainModule: string, modules: Modules): number {
    const row = this.sql
      .exec<{ version: number }>(
        `INSERT INTO apps (name, version, main, files, modules, updated)
         VALUES (?, 1, ?, ?, ?, datetime('now'))
         ON CONFLICT (name) DO UPDATE SET version = version + 1, main = excluded.main,
           files = excluded.files, modules = excluded.modules, updated = excluded.updated
         RETURNING version`,
        name, mainModule, JSON.stringify(files), JSON.stringify(modules),
      )
      .one();
    return row.version;
  }

  get(name: string): AppRecord | null {
    const rows = [
      ...this.sql.exec<{ version: number; main: string; modules: string }>(
        "SELECT version, main, modules FROM apps WHERE name = ?", name,
      ),
    ];
    if (rows.length === 0) return null;
    return { name, version: rows[0].version, mainModule: rows[0].main, modules: JSON.parse(rows[0].modules) };
  }

  source(name: string): Files | null {
    const rows = [...this.sql.exec<{ files: string }>("SELECT files FROM apps WHERE name = ?", name)];
    return rows.length ? JSON.parse(rows[0].files) : null;
  }

  list(): AppSummary[] {
    return [...this.sql.exec<AppSummary>("SELECT name, version, updated FROM apps ORDER BY updated DESC")];
  }
}
