import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computePreparationFingerprint,
  isPreparedValid,
  profileNeedsWebp,
} from "./fingerprint.ts";
import {
  createInitialWorkspaceState,
  expectedFingerprint,
  preparedIsValid,
  workspaceReducer,
} from "./reducer.ts";
import { toWorkspaceSnapshot } from "./snapshot.ts";
import type { ConversionOptions } from "../../image-processing/types.ts";

const baseOptions: ConversionOptions = {
  format: "avif",
  quality: 0.82,
  lossless: false,
  chromaSubsampling: "4:4:4",
  filename: "art",
};

test("fingerprint changes when options or source identity change", () => {
  const a = computePreparationFingerprint({
    workspaceId: "w1",
    source: { fileName: "a.jpg", byteSize: 100, lastModified: 1 },
    options: baseOptions,
    profile: "compatible",
  });
  const b = computePreparationFingerprint({
    workspaceId: "w1",
    source: { fileName: "a.jpg", byteSize: 100, lastModified: 2 },
    options: baseOptions,
    profile: "compatible",
  });
  const c = computePreparationFingerprint({
    workspaceId: "w1",
    source: { fileName: "a.jpg", byteSize: 100, lastModified: 1 },
    options: { ...baseOptions, quality: 0.5 },
    profile: "compatible",
  });
  const d = computePreparationFingerprint({
    workspaceId: "w1",
    source: { fileName: "a.jpg", byteSize: 100, lastModified: 1 },
    options: baseOptions,
    profile: "onchain",
  });
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
  assert.equal(profileNeedsWebp("compatible"), true);
  assert.equal(profileNeedsWebp("onchain"), false);
});

test("isPreparedValid requires avif and webp for compatible profile", () => {
  assert.equal(
    isPreparedValid({
      fingerprint: "fp",
      preparedAvif: { format: "avif" },
      preparedWebp: { format: "webp" },
      expectedFingerprint: "fp",
      profile: "compatible",
    }),
    true,
  );
  assert.equal(
    isPreparedValid({
      fingerprint: "fp",
      preparedAvif: { format: "avif" },
      preparedWebp: null,
      expectedFingerprint: "fp",
      profile: "compatible",
    }),
    false,
  );
  assert.equal(
    isPreparedValid({
      fingerprint: "fp",
      preparedAvif: { format: "avif" },
      preparedWebp: null,
      expectedFingerprint: "fp",
      profile: "onchain",
    }),
    true,
  );
});

test("IMPORT_SOURCE then option change invalidates prepared", () => {
  let state = createInitialWorkspaceState();
  state = workspaceReducer(state, {
    type: "IMPORT_SOURCE",
    source: {
      registryKey: state.workspaceId,
      fileName: "x.png",
      byteSize: 10,
      lastModified: 1,
      objectUrl: "blob:test",
    },
    fileNameForTitle: "x.png",
  });
  assert.ok(state.artwork.imageSrc);
  state = workspaceReducer(state, {
    type: "SET_PREPARED",
    avif: {
      blob: new Blob(),
      dataUrl: "data:image/avif;base64,AA",
      stats: {
        width: 1,
        height: 1,
        byteSize: 2,
        mimeType: "image/avif",
        aspectRatio: 1,
      },
      format: "avif",
      compressionRatio: 0.1,
      processingMs: 1,
    },
    webp: {
      blob: new Blob(),
      dataUrl: "data:image/webp;base64,AA",
      stats: {
        width: 1,
        height: 1,
        byteSize: 2,
        mimeType: "image/webp",
        aspectRatio: 1,
      },
      format: "webp",
      compressionRatio: 0.1,
      processingMs: 1,
    },
    fingerprint: expectedFingerprint(state),
  });
  assert.equal(state.preparation.status, "ready");
  assert.equal(preparedIsValid(state), true);

  state = workspaceReducer(state, {
    type: "SET_OPTIONS",
    options: { ...state.preparation.options, quality: 0.4 },
  });
  assert.equal(state.preparation.status, "stale");
  assert.equal(state.preparation.preparedAvif, null);
  assert.equal(preparedIsValid(state), false);
});

test("CLEAR_SOURCE resets workspace", () => {
  let state = createInitialWorkspaceState();
  state = workspaceReducer(state, {
    type: "IMPORT_SOURCE",
    source: {
      registryKey: state.workspaceId,
      fileName: "x.png",
      byteSize: 10,
      lastModified: 1,
      objectUrl: "blob:test",
    },
  });
  const prevId = state.workspaceId;
  state = workspaceReducer(state, { type: "CLEAR_SOURCE" });
  assert.notEqual(state.workspaceId, prevId);
  assert.equal(state.source, null);
  assert.equal(state.artwork.imageSrc, "");
});

test("snapshot strips imageSrc and omits conversion blobs", () => {
  let state = createInitialWorkspaceState();
  state = workspaceReducer(state, {
    type: "IMPORT_SOURCE",
    source: {
      registryKey: state.workspaceId,
      fileName: "x.png",
      byteSize: 10,
      lastModified: 1,
      objectUrl: "blob:secret",
    },
  });
  state = {
    ...state,
    preparation: {
      ...state.preparation,
      preparedAvif: {
        blob: new Blob(),
        dataUrl: "data:image/avif;base64,SECRET",
        stats: {
          width: 1,
          height: 1,
          byteSize: 2,
          mimeType: "image/avif",
          aspectRatio: 1,
        },
        format: "avif",
        compressionRatio: 1,
        processingMs: 1,
      },
      status: "ready",
      fingerprint: "fp",
    },
  };
  const snap = toWorkspaceSnapshot(state);
  assert.equal(snap.artwork.imageSrc, "");
  assert.equal(snap.version, 1);
  assert.ok(!("preparedAvif" in snap.preparation));
  assert.doesNotMatch(JSON.stringify(snap), /SECRET|blob:secret/);
});

test("journey A/B same-tab: artwork survives option-independent edits", () => {
  let state = createInitialWorkspaceState();
  state = workspaceReducer(state, {
    type: "IMPORT_SOURCE",
    source: {
      registryKey: state.workspaceId,
      fileName: "x.png",
      byteSize: 10,
      lastModified: 1,
      objectUrl: "blob:test",
    },
  });
  state = workspaceReducer(state, {
    type: "PATCH_ARTWORK",
    patch: {
      metadata: { ...state.artwork.metadata, title: "Round trip" },
    },
  });
  state = workspaceReducer(state, { type: "ADD_STATE" });
  assert.equal(state.artwork.metadata.title, "Round trip");
  assert.equal(state.artwork.states.length, 2);
  assert.equal(state.source?.objectUrl, "blob:test");
});
