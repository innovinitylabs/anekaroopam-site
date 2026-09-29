import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createInitialWorkspaceState,
  expectedFingerprint,
  preparedIsValid,
  workspaceReducer,
} from "./reducer.ts";
import { createMemoryBackend } from "./persistence-backend.ts";
import {
  clearLegacyAfterPersist,
  loadPersistedWorkspace,
  persistPreparedBlobs,
  persistWorkspaceBlob,
  persistWorkspaceMetadata,
  replaceSourceBlob,
  resolveHydration,
  type LoadDeps,
} from "./persistence.ts";
import { loadWorkspaceSnapshot } from "./snapshot.ts";
import type { WorkspacePersistenceBackend } from "./persistence-backend.ts";
import type {
  PattaraiWorkspaceRuntime,
  PersistedWorkspaceRecord,
} from "./types.ts";
import type { ConversionResult } from "../../image-processing/types.ts";

async function storedRecord(
  backend: WorkspacePersistenceBackend,
): Promise<PersistedWorkspaceRecord> {
  return structuredClone(await backend.getRecord()) as PersistedWorkspaceRecord;
}

function bytes(n: number, fill: number): Uint8Array {
  return new Uint8Array(n).fill(fill);
}

function makeConversion(format: "avif" | "webp", size: number): ConversionResult {
  const mimeType = `image/${format}`;
  return {
    blob: new Blob([bytes(size, format === "avif" ? 1 : 2)], { type: mimeType }),
    dataUrl: `data:${mimeType};base64,AA`,
    stats: { width: 4, height: 2, byteSize: size, mimeType, aspectRatio: 2 },
    format,
    requestedFormat: format,
    compressionRatio: 50,
    processingMs: 12,
    encodedWithWasm: format === "avif",
  };
}

function makeDeps(): LoadDeps & { created: Array<{ id: string; file: File }> } {
  const created: Array<{ id: string; file: File }> = [];
  let n = 0;
  return {
    created,
    createObjectUrl: (id, file) => {
      created.push({ id, file });
      n += 1;
      return `blob:restored-${n}`;
    },
    blobToDataUrl: async (blob) =>
      `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`,
  };
}

function importSource(
  file: File,
  base: PattaraiWorkspaceRuntime = createInitialWorkspaceState(),
): PattaraiWorkspaceRuntime {
  return workspaceReducer(base, {
    type: "IMPORT_SOURCE",
    source: {
      registryKey: base.workspaceId,
      fileName: file.name,
      mimeType: file.type,
      byteSize: file.size,
      lastModified: file.lastModified,
      objectUrl: "blob:live",
    },
    fileNameForTitle: file.name,
  });
}

function withPrepared(
  state: PattaraiWorkspaceRuntime,
  avif: ConversionResult,
  webp: ConversionResult | null,
): PattaraiWorkspaceRuntime {
  return workspaceReducer(state, {
    type: "SET_PREPARED",
    avif,
    webp,
    fingerprint: expectedFingerprint(state),
  });
}

const sourceFile = () =>
  new File([bytes(64, 7)], "painting.png", {
    type: "image/png",
    lastModified: 1_700_000_000_000,
  });

async function saveFullWorkspace(profile: "compatible" | "onchain" = "compatible") {
  const backend = createMemoryBackend();
  const file = sourceFile();
  let state = importSource(file);
  if (profile !== state.export.profile) {
    state = workspaceReducer(state, { type: "SET_EXPORT_PROFILE", profile });
  }
  state = workspaceReducer(state, {
    type: "PATCH_ARTWORK",
    patch: { metadata: { ...state.artwork.metadata, title: "Saved title" } },
  });
  const avif = makeConversion("avif", 20);
  const webp = profile === "compatible" ? makeConversion("webp", 30) : null;
  state = withPrepared(state, avif, webp);

  assert.equal((await replaceSourceBlob(state.workspaceId, file, backend)).ok, true);
  const prepared = await persistPreparedBlobs(state.workspaceId, avif, webp, backend);
  assert.equal(prepared.result.ok, true);
  const meta = await persistWorkspaceMetadata(state, backend, {
    source: true,
    avif: prepared.avif,
    webp: prepared.webp,
  });
  assert.equal(meta.ok, true);
  return { backend, state, file, avif, webp };
}

test("metadata record round trip stores no binaries or URLs", async () => {
  const { backend, state } = await saveFullWorkspace();
  const record = (await backend.getRecord()) as Record<string, unknown>;
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.workspaceId, state.workspaceId);
  const json = JSON.stringify(record);
  assert.doesNotMatch(json, /blob:live|data:image/);
  assert.deepEqual(record.blobs, { source: true, avif: true, webp: true });
});

test("source, avif and webp blobs restore with identical bytes", async () => {
  const { backend, file, avif, webp } = await saveFullWorkspace();
  const loaded = await loadPersistedWorkspace(backend, makeDeps());
  assert.ok(loaded);
  assert.ok(loaded.sourceFile);
  assert.deepEqual(
    new Uint8Array(await loaded.sourceFile.arrayBuffer()),
    new Uint8Array(await file.arrayBuffer()),
  );
  assert.equal(loaded.sourceFile.name, file.name);
  assert.equal(loaded.sourceFile.lastModified, file.lastModified);
  const p = loaded.state.preparation;
  assert.ok(p.preparedAvif && p.preparedWebp && webp);
  assert.deepEqual(
    new Uint8Array(await p.preparedAvif.blob.arrayBuffer()),
    new Uint8Array(await avif.blob.arrayBuffer()),
  );
  assert.deepEqual(
    new Uint8Array(await p.preparedWebp.blob.arrayBuffer()),
    new Uint8Array(await webp.blob.arrayBuffer()),
  );
  assert.match(p.preparedAvif.dataUrl, /^data:image\/avif;base64,/);
  assert.equal(p.preparedAvif.encodedWithWasm, true);
});

test("object URL is recreated through the injected factory", async () => {
  const { backend, state } = await saveFullWorkspace();
  const deps = makeDeps();
  const loaded = await loadPersistedWorkspace(backend, deps);
  assert.ok(loaded);
  assert.equal(deps.created.length, 1);
  assert.equal(deps.created[0].id, state.workspaceId);
  assert.equal(loaded.state.source?.objectUrl, "blob:restored-1");
  assert.equal(loaded.state.artwork.imageSrc, "blob:restored-1");
});

test("matching fingerprint restores prepared output as ready", async () => {
  const { backend } = await saveFullWorkspace();
  const loaded = await loadPersistedWorkspace(backend, makeDeps());
  assert.ok(loaded);
  assert.equal(loaded.restoredPrepared, true);
  assert.equal(loaded.state.preparation.status, "ready");
  assert.equal(preparedIsValid(loaded.state), true);
});

test("fingerprint mismatch drops prepared output and marks stale", async () => {
  const { backend } = await saveFullWorkspace();
  const record = await storedRecord(backend);
  record.snapshot.preparation.options = {
    ...record.snapshot.preparation.options,
    quality: 0.41,
  };
  backend.records.set("current", record);

  const loaded = await loadPersistedWorkspace(backend, makeDeps());
  assert.ok(loaded);
  assert.equal(loaded.restoredSource, true);
  assert.equal(loaded.restoredPrepared, false);
  assert.equal(loaded.state.preparation.status, "stale");
  assert.equal(loaded.state.preparation.preparedAvif, null);
  assert.equal(loaded.state.preparation.preparedWebp, null);
  assert.equal(preparedIsValid(loaded.state), false);
});

test("reload hydration rebuilds artwork, options and profile", async () => {
  const { backend, state } = await saveFullWorkspace("onchain");
  const loaded = await loadPersistedWorkspace(backend, makeDeps());
  assert.ok(loaded);
  const fresh = createInitialWorkspaceState();
  const next = resolveHydration(fresh, loaded, false);
  assert.ok(next);
  const hydrated = workspaceReducer(fresh, {
    type: "HYDRATE_FROM_PERSISTENCE",
    state: next,
  });
  assert.equal(hydrated.workspaceId, state.workspaceId);
  assert.equal(hydrated.artwork.metadata.title, "Saved title");
  assert.equal(hydrated.export.profile, "onchain");
  assert.deepEqual(hydrated.preparation.options, state.preparation.options);
  assert.equal(hydrated.preparation.preparedWebp, null);
  assert.equal(preparedIsValid(hydrated), true);
});

test("stale async guard keeps user edits made during load", async () => {
  const { backend, state } = await saveFullWorkspace();
  const loaded = await loadPersistedWorkspace(backend, makeDeps());
  assert.ok(loaded);

  // Same-tab reload: sessionStorage snapshot hydrated first (no binaries).
  let current = createInitialWorkspaceState((await storedRecord(backend)).snapshot);
  current = workspaceReducer(current, {
    type: "PATCH_ARTWORK",
    patch: { metadata: { ...current.artwork.metadata, title: "Edited while loading" } },
  });

  const next = resolveHydration(current, loaded, true);
  assert.ok(next);
  assert.equal(next.artwork.metadata.title, "Edited while loading");
  assert.equal(next.source?.objectUrl, loaded.state.source?.objectUrl);
  assert.equal(next.artwork.imageSrc, loaded.state.source?.objectUrl);
  assert.equal(next.workspaceId, state.workspaceId);
  assert.equal(preparedIsValid(next), true);

  // Different workspace, or source already present: nothing is applied.
  assert.equal(resolveHydration(createInitialWorkspaceState(), loaded, true), null);
  const reimported = { ...current, source: { ...current.source!, objectUrl: "blob:user" } };
  assert.equal(resolveHydration(reimported, loaded, true), null);
});

test("stale async guard does not attach prepared output after an option edit", async () => {
  const { backend } = await saveFullWorkspace();
  const loaded = await loadPersistedWorkspace(backend, makeDeps());
  assert.ok(loaded);
  let current = createInitialWorkspaceState((await storedRecord(backend)).snapshot);
  current = workspaceReducer(current, {
    type: "SET_OPTIONS",
    options: { ...current.preparation.options, quality: 0.5 },
  });
  const next = resolveHydration(current, loaded, true);
  assert.ok(next);
  assert.ok(next.source?.objectUrl);
  assert.equal(next.preparation.preparedAvif, null);
  assert.equal(next.preparation.options.quality, 0.5);
});

test("clearAll on clear source removes the restorable workspace", async () => {
  const { backend } = await saveFullWorkspace();
  await backend.clearAll();
  assert.equal(backend.records.size, 0);
  assert.equal(backend.blobs.size, 0);
  assert.equal(await loadPersistedWorkspace(backend, makeDeps()), null);
});

test("new source import deletes old prepared blobs", async () => {
  const { backend, state } = await saveFullWorkspace();
  const next = new File([bytes(10, 9)], "second.jpg", {
    type: "image/jpeg",
    lastModified: 1_800_000_000_000,
  });
  const result = await replaceSourceBlob(state.workspaceId, next, backend);
  assert.equal(result.ok, true);
  assert.equal(backend.blobs.has("avif"), false);
  assert.equal(backend.blobs.has("webp"), false);
  const stored = backend.blobs.get("source") as { fileName: string; blob: Blob };
  assert.equal(stored.fileName, "second.jpg");
  assert.equal(stored.blob.size, 10);
});

test("quota error is reported and metadata still saves", async () => {
  const backend = createMemoryBackend();
  const quota = new DOMException("The quota has been exceeded.", "QuotaExceededError");
  backend.putBlob = async () => {
    throw quota;
  };
  const file = sourceFile();
  const state = importSource(file);

  const blobResult = await persistWorkspaceBlob(
    "source",
    file,
    { workspaceId: state.workspaceId, fileName: file.name, mimeType: file.type },
    backend,
  );
  assert.deepEqual(
    { ok: blobResult.ok, reason: blobResult.ok ? null : blobResult.reason },
    { ok: false, reason: "quota" },
  );

  const meta = await persistWorkspaceMetadata(state, backend, {
    source: false,
    avif: false,
    webp: false,
  });
  assert.equal(meta.ok, true);

  const loaded = await loadPersistedWorkspace(backend, makeDeps());
  assert.ok(loaded);
  assert.equal(loaded.restoredSource, false);
  assert.equal(loaded.state.source?.fileName, "painting.png");
  assert.equal(loaded.state.source?.objectUrl, null);
});

test("corrupt or incompatible record is cleared and returns null", async () => {
  const { backend } = await saveFullWorkspace();
  backend.records.set("current", { schemaVersion: 99, workspaceId: "x" });
  assert.equal(await loadPersistedWorkspace(backend, makeDeps()), null);
  assert.equal(backend.records.size, 0);
  assert.equal(backend.blobs.size, 0);

  backend.records.set("current", "not an object");
  assert.equal(await loadPersistedWorkspace(backend, makeDeps()), null);
  assert.equal(backend.records.size, 0);
});

test("blob belonging to another workspace is not restored", async () => {
  const { backend } = await saveFullWorkspace();
  const entry = backend.blobs.get("source") as Record<string, unknown>;
  backend.blobs.set("source", { ...entry, workspaceId: "someone-else" });
  const loaded = await loadPersistedWorkspace(backend, makeDeps());
  assert.ok(loaded);
  assert.equal(loaded.restoredSource, false);
  assert.equal(loaded.restoredPrepared, false);
});

test("legacy prepare session migrates and is cleared after first persist", async () => {
  const store = new Map<string, string>();
  const g = globalThis as Record<string, unknown>;
  const prevWindow = g.window;
  const prevSession = g.sessionStorage;
  g.window = globalThis;
  g.sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  try {
    store.set(
      "anekaroopam-prepare-session",
      JSON.stringify({
        uploadDraftId: "legacy-1",
        artwork: {
          id: "legacy-1",
          metadata: { title: "Legacy work" },
          imageSrc: "",
          states: [],
          background: "paper",
        },
        sourceFileName: "legacy.png",
        savedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    const snapshot = loadWorkspaceSnapshot();
    assert.ok(snapshot);
    assert.equal(snapshot.workspaceId, "legacy-1");
    assert.equal(snapshot.artwork.metadata.title, "Legacy work");

    const backend = createMemoryBackend();
    const state = createInitialWorkspaceState(snapshot);
    const result = await persistWorkspaceMetadata(state, backend, {
      source: false,
      avif: false,
      webp: false,
    });
    assert.equal(clearLegacyAfterPersist(result), true);
    assert.equal(store.has("anekaroopam-prepare-session"), false);
    assert.equal(loadWorkspaceSnapshot(), null);

    const loaded = await loadPersistedWorkspace(backend, makeDeps());
    assert.ok(loaded);
    assert.equal(loaded.state.artwork.metadata.title, "Legacy work");
  } finally {
    g.window = prevWindow;
    g.sessionStorage = prevSession;
  }
});

test("failed persist does not clear the legacy key", () => {
  assert.equal(
    clearLegacyAfterPersist({ ok: false, reason: "quota", message: "full" }),
    false,
  );
});
