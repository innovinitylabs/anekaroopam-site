import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveR2Namespace } from "./namespace";
import { buildAllRevisionKeys, isAllowedArchiveObjectKey } from "./object-keys";

describe("resolveR2Namespace", () => {
  it("accepts prod/ only in Vercel production", () => {
    const ok = resolveR2Namespace({
      VERCEL_ENV: "production",
      R2_KEY_PREFIX: "prod/",
    });
    assert.deepEqual(ok, { ok: true, prefix: "prod/", production: true });

    for (const prefix of ["dev/", "", undefined, "archive/"]) {
      const res = resolveR2Namespace({
        VERCEL_ENV: "production",
        R2_KEY_PREFIX: prefix,
      });
      assert.equal(res.ok, false, `production must reject prefix ${prefix}`);
      if (!res.ok) assert.equal(res.expectedPrefix, "prod/");
    }
  });

  it("requires dev/ in preview, development, and local", () => {
    for (const vercelEnv of ["preview", "development", undefined]) {
      const ok = resolveR2Namespace({
        VERCEL_ENV: vercelEnv,
        R2_KEY_PREFIX: "dev/",
      });
      assert.equal(ok.ok, true);
      if (ok.ok) assert.equal(ok.prefix, "dev/");

      const crossed = resolveR2Namespace({
        VERCEL_ENV: vercelEnv,
        R2_KEY_PREFIX: "prod/",
      });
      assert.equal(crossed.ok, false, `${vercelEnv} must reject prod/`);

      const missing = resolveR2Namespace({ VERCEL_ENV: vercelEnv });
      assert.equal(missing.ok, false, `${vercelEnv} must fail closed when unset`);
    }
  });

  it("normalizes slashes before comparing", () => {
    const res = resolveR2Namespace({ VERCEL_ENV: "preview", R2_KEY_PREFIX: "/dev" });
    assert.equal(res.ok, true);
    if (res.ok) assert.equal(res.prefix, "dev/");
  });
});

describe("environment-scoped archive keys", () => {
  const devKeys = buildAllRevisionKeys({
    accessionId: "AR-2026-0007",
    revision: 2,
    storedFilename: "original.png",
    keyPrefix: "dev/",
  });
  const prodKeys = buildAllRevisionKeys({
    accessionId: "AR-2026-0007",
    revision: 2,
    storedFilename: "original.png",
    keyPrefix: "prod/",
  });

  it("accepts keys inside their own namespace", () => {
    for (const key of devKeys.all) {
      assert.equal(isAllowedArchiveObjectKey(key, "AR-2026-0007", 2, "dev/"), true);
    }
    for (const key of prodKeys.all) {
      assert.equal(isAllowedArchiveObjectKey(key, "AR-2026-0007", 2, "prod/"), true);
    }
  });

  it("rejects cross-environment and unprefixed keys", () => {
    for (const key of devKeys.all) {
      assert.equal(isAllowedArchiveObjectKey(key, "AR-2026-0007", 2, "prod/"), false);
    }
    for (const key of prodKeys.all) {
      assert.equal(isAllowedArchiveObjectKey(key, "AR-2026-0007", 2, "dev/"), false);
    }
    const legacy = "archive/AR-2026-0007/r2/derivatives/thumb.jpg";
    assert.equal(isAllowedArchiveObjectKey(legacy, "AR-2026-0007", 2, "dev/"), false);
    assert.equal(isAllowedArchiveObjectKey(legacy, "AR-2026-0007", 2, "prod/"), false);
    assert.equal(
      isAllowedArchiveObjectKey(
        "dev/prod/archive/AR-2026-0007/r2/derivatives/thumb.jpg",
        "AR-2026-0007",
        2,
        "dev/",
      ),
      false,
    );
  });
});
