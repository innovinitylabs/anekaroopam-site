import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SqlExecutor } from "./db";

const here = dirname(fileURLToPath(import.meta.url));

const migrationsDir = join(here, "..", "migrations");

export function migrationSqlPath(): string {
  return join(migrationsDir, "0001_init.sql");
}

/** Every migration file, in the order wrangler applies them. */
export function migrationSqlPaths(): string[] {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => join(migrationsDir, name));
}

export function applyMigration(db: DatabaseSync): void {
  for (const file of migrationSqlPaths()) {
    db.exec(readFileSync(file, "utf8"));
  }
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
    async batch(statements) {
      db.exec("BEGIN");
      try {
        for (const statement of statements) {
          db.prepare(statement.sql).run(...statement.binds);
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

export function openMemoryDb(): { raw: DatabaseSync; db: SqlExecutor } {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  applyMigration(raw);
  return { raw, db: asSqlExecutor(raw) };
}
