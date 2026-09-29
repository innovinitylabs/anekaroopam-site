#!/usr/bin/env node
// Preflight for deploy and remote migration scripts.
// Usage: node scripts/assert-deploy-target.mjs <dev|prod>
// prod additionally requires ARCHIVE_PROD_CONFIRM=anekaroopam-archive-prod.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const env = process.argv[2];
if (env !== "dev" && env !== "prod") {
  console.error("Specify a target environment: dev or prod.");
  process.exit(1);
}

const toml = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "wrangler.toml"),
  "utf8",
);

const block = new RegExp(
  String.raw`\[\[env\.${env}\.d1_databases\]\]([\s\S]*?)(?=\n\[|$)`,
).exec(toml);
if (!block) {
  console.error(`wrangler.toml has no D1 binding for env.${env}.`);
  process.exit(1);
}
const name = /database_name\s*=\s*"([^"]+)"/.exec(block[1])?.[1];
const id = /database_id\s*=\s*"([^"]+)"/.exec(block[1])?.[1];
const expectedName = `anekaroopam-archive-${env}`;

if (name !== expectedName) {
  console.error(`env.${env} D1 must be ${expectedName}, found ${name ?? "none"}.`);
  process.exit(1);
}
if (!id || /^0{8}-0{4}-0{4}-0{4}-/.test(id)) {
  console.error(
    `env.${env} database_id is a placeholder. Create ${expectedName} and set its real id first.`,
  );
  process.exit(1);
}

const prefix = new RegExp(
  String.raw`\[env\.${env}\.vars\][\s\S]*?R2_KEY_PREFIX\s*=\s*"([^"]*)"`,
).exec(toml)?.[1];
if (prefix !== `${env}/`) {
  console.error(`env.${env} R2_KEY_PREFIX must be "${env}/", found "${prefix ?? ""}".`);
  process.exit(1);
}

if (env === "prod" && process.env.ARCHIVE_PROD_CONFIRM !== expectedName) {
  console.error(
    `Refusing to target production. Re-run with ARCHIVE_PROD_CONFIRM=${expectedName}.`,
  );
  process.exit(1);
}

console.log(`Deploy target ok: env.${env} -> ${expectedName}, R2 prefix ${prefix}`);
