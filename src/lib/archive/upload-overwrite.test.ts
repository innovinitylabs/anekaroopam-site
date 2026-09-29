import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideExistingObjectOverwrite } from "./upload-overwrite";

const KEY = "dev/archive/AR-2026-0003/r2/derivatives/thumb.jpg";

describe("decideExistingObjectOverwrite (Worker mode)", () => {
  it("rejects overwriting an object referenced by a frozen revision", () => {
    const decision = decideExistingObjectOverwrite({
      key: KEY,
      existingSize: 100,
      incomingSize: 100,
      workingRevision: 3,
      ownedAssets: [
        { object_key: KEY, revision: 2 },
        { object_key: KEY, revision: 3 },
      ],
      retrySameRevision: true,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.match(decision.error, /frozen revision r2/);
  });

  it("rejects a differently sized object not registered to this artwork", () => {
    const decision = decideExistingObjectOverwrite({
      key: KEY,
      existingSize: 100,
      incomingSize: 250,
      workingRevision: 2,
      ownedAssets: [],
      retrySameRevision: true,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.match(decision.error, /not registered to this artwork/);
  });

  it("allows only a same-size retry of an unregistered partial upload", () => {
    const decision = decideExistingObjectOverwrite({
      key: KEY,
      existingSize: 100,
      incomingSize: 100,
      workingRevision: 2,
      ownedAssets: [],
      retrySameRevision: false,
    });
    assert.deepEqual(decision, { ok: true });
  });

  it("replaces a working-revision object only on same size or explicit retry", () => {
    const owned = [{ object_key: KEY, revision: 2 }];
    assert.equal(
      decideExistingObjectOverwrite({
        key: KEY,
        existingSize: 100,
        incomingSize: 250,
        workingRevision: 2,
        ownedAssets: owned,
        retrySameRevision: false,
      }).ok,
      false,
    );
    assert.equal(
      decideExistingObjectOverwrite({
        key: KEY,
        existingSize: 100,
        incomingSize: 250,
        workingRevision: 2,
        ownedAssets: owned,
        retrySameRevision: true,
      }).ok,
      true,
    );
  });
});

describe("decideExistingObjectOverwrite (legacy mode)", () => {
  it("keeps the previous size/retry rule", () => {
    assert.equal(
      decideExistingObjectOverwrite({
        key: KEY,
        existingSize: 1,
        incomingSize: 2,
        workingRevision: 1,
        ownedAssets: null,
        retrySameRevision: false,
      }).ok,
      false,
    );
    assert.equal(
      decideExistingObjectOverwrite({
        key: KEY,
        existingSize: 1,
        incomingSize: 2,
        workingRevision: 1,
        ownedAssets: null,
        retrySameRevision: true,
      }).ok,
      true,
    );
  });
});
