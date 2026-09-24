import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SqlExecutor } from "./db";

const here = dirname(fileURLToPath(import.meta.url));

export function migrationSqlPath(): string {
  return join(here, "..", "migrations", "0001_init.sql");
}

export function applyMigration(db: DatabaseSync): void {
  const sql = readFileSync(migrationSqlPath(), "utf8");
  db.exec(sql);
}

/** Adapt node:sqlite DatabaseSync to the async SqlExecutor used by db.ts */
export function asSqlExecutor(db: DatabaseSync): SqlExecutor {
  return {
    prepare(query: string) {
      const stmt = db.prepare(query);
      return {
        bind(...values: unknown[]) {
          return {
            async first<T = Record<string, unknown>>() {
              const row = stmt.get(...values);
              return (row as T | undefined) ?? null;
            },
            async all<T = Record<string, unknown>>() {
              return { results: stmt.all(...values) as T[] };
            },
            async run() {
              const info = stmt.run(...values);
              return {
                success: true,
                meta: { changes: Number(info.changes ?? 0) },
              };
            },
          };
        },
      };
    },
  };
}

export function openMemoryDb(): { raw: DatabaseSync; db: SqlExecutor } {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  applyMigration(raw);
  return { raw, db: asSqlExecutor(raw) };
}
