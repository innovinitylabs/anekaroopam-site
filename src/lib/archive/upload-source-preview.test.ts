import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSourcePreviewMeta,
  deriveSourcePipelineStatus,
} from "./upload-source-preview.ts";

test("buildSourcePreviewMeta formats file facts", () => {
  const file = new File([new Uint8Array(2048)], "master.png", {
    type: "image/png",
  });
  const meta = buildSourcePreviewMeta(file, { width: 2000, height: 1500 });
  assert.equal(meta.name, "master.png");
  assert.equal(meta.typeLabel, "image/png");
  assert.equal(meta.width, 2000);
  assert.equal(meta.height, 1500);
  assert.match(meta.sizeLabel, /KB|MB|B/);
});

test("deriveSourcePipelineStatus maps local and archive states", () => {
  assert.deepEqual(
    deriveSourcePipelineStatus({
      hasSourceFile: true,
      hasPreparedLocal: false,
    }),
    {
      selectedLocally: true,
      preparedLocally: false,
      uploadedToR2: false,
      published: false,
    },
  );

  assert.deepEqual(
    deriveSourcePipelineStatus({
      hasSourceFile: true,
      hasPreparedLocal: true,
      serverSourceKind: "original",
      archiveStatus: "ready",
    }),
    {
      selectedLocally: true,
      preparedLocally: true,
      uploadedToR2: true,
      published: false,
    },
  );

  assert.deepEqual(
    deriveSourcePipelineStatus({
      hasSourceFile: true,
      hasPreparedLocal: true,
      serverSourceKind: "original",
      archiveStatus: "published",
      commitCompleted: true,
    }),
    {
      selectedLocally: true,
      preparedLocally: true,
      uploadedToR2: true,
      published: true,
    },
  );
});
