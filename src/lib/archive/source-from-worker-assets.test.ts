import assert from "node:assert/strict";
import test from "node:test";
import {
  filenameFromObjectKey,
  mapProcessingFromWorkerAssets,
  mapSourceFromWorkerAssets,
  previewImageSrcFromWorkerAssets,
  workingTipHasOriginal,
  type WorkerAssetRow,
} from "./source-from-worker-assets";

function asset(
  role: string,
  key: string,
  extras: Partial<WorkerAssetRow> = {},
): WorkerAssetRow {
  return {
    role,
    object_key: key,
    mime_type: extras.mime_type ?? "image/jpeg",
    byte_size: extras.byte_size ?? 1000,
    verified_at: extras.verified_at ?? "2026-01-01T00:00:00.000Z",
    width: extras.width ?? 100,
    height: extras.height ?? 100,
  };
}

test("mapSourceFromWorkerAssets uses original only", () => {
  const withOriginal = mapSourceFromWorkerAssets([
    asset("thumb", "a/thumb.jpg"),
    asset("original", "acc/r1/original/original.jpg", {
      mime_type: "image/jpeg",
      byte_size: 2048,
    }),
  ]);
  assert.equal(withOriginal.kind, "original");
  assert.equal(withOriginal.storedFilename, "original.jpg");
  assert.equal(withOriginal.mimeType, "image/jpeg");
  assert.equal(withOriginal.byteSize, 2048);

  const derivativesOnly = [
    asset("artwork", "a/artwork.avif"),
    asset("preview", "a/preview.avif"),
    asset("thumb", "a/thumb.jpg"),
  ];
  assert.equal(mapSourceFromWorkerAssets(derivativesOnly).kind, "migration-required");
  assert.equal(workingTipHasOriginal(derivativesOnly), false);
  assert.equal(
    workingTipHasOriginal([asset("original", "a/original/x.bin")]),
    true,
  );
});

test("mapProcessingFromWorkerAssets reads prepared role", () => {
  assert.deepEqual(mapProcessingFromWorkerAssets([]), {});
  const processing = mapProcessingFromWorkerAssets([
    asset("prepared", "acc/r1/prepared/prepared.avif", {
      verified_at: "2026-02-01T00:00:00.000Z",
    }),
  ]);
  assert.equal(processing.preparedSource, "prepared.avif");
  assert.equal(processing.preparedAt, "2026-02-01T00:00:00.000Z");
});

test("previewImageSrcFromWorkerAssets never uses original key", () => {
  const url = previewImageSrcFromWorkerAssets(
    [
      asset("original", "acc/r1/original/secret.jpg"),
      asset("thumb", "acc/r1/thumb/thumb.jpg"),
    ],
    "https://media.example.com",
  );
  assert.equal(url, "https://media.example.com/acc/r1/thumb/thumb.jpg");
  assert.ok(!url.includes("secret"));
  assert.equal(
    previewImageSrcFromWorkerAssets(
      [asset("original", "acc/r1/original/secret.jpg")],
      "https://media.example.com",
    ),
    "",
  );
});

test("filenameFromObjectKey takes basename", () => {
  assert.equal(
    filenameFromObjectKey("prefix/r2/original/original.png"),
    "original.png",
  );
});
