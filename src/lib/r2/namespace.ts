/**
 * Environment isolation for R2 archive object keys.
 *
 * Production writes must live under `prod/`; every other environment
 * (Vercel Preview, Vercel Development, local) must live under `dev/`.
 * R2_KEY_PREFIX must be set explicitly and match the expected namespace so a
 * missing or copied env var fails closed instead of writing into the wrong
 * namespace. Unprefixed legacy `archive/...` keys belong to neither.
 */

import { normalizeR2KeyPrefix } from "./object-keys";

export const R2_PRODUCTION_PREFIX = "prod/";
export const R2_NON_PRODUCTION_PREFIX = "dev/";

export type R2NamespaceResolution =
  | { ok: true; prefix: string; production: boolean }
  | { ok: false; error: string; expectedPrefix: string };

type NamespaceEnv = { readonly [key: string]: string | undefined };

export function expectedR2PrefixForEnv(env: NamespaceEnv): string {
  return env.VERCEL_ENV === "production"
    ? R2_PRODUCTION_PREFIX
    : R2_NON_PRODUCTION_PREFIX;
}

export function resolveR2Namespace(
  env: NamespaceEnv = process.env,
): R2NamespaceResolution {
  const production = env.VERCEL_ENV === "production";
  const expectedPrefix = expectedR2PrefixForEnv(env);
  const configured = normalizeR2KeyPrefix(env.R2_KEY_PREFIX);

  if (!configured) {
    return {
      ok: false,
      expectedPrefix,
      error: `R2_KEY_PREFIX is not set. This environment requires "${expectedPrefix}"; refusing R2 writes without environment isolation.`,
    };
  }
  if (configured !== expectedPrefix) {
    return {
      ok: false,
      expectedPrefix,
      error: `R2_KEY_PREFIX "${configured}" does not match this environment. Expected "${expectedPrefix}"; refusing R2 writes across environments.`,
    };
  }
  return { ok: true, prefix: configured, production };
}
