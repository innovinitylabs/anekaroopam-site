import assert from "node:assert/strict";
import test from "node:test";
import { deleteR2Objects } from "./delete-objects.ts";

test("deleteR2Objects reports partial failure without swallowing errors", async () => {
  const result = await deleteR2Objects(
    ["a", "b", "c"],
    {
      deleteMany: async (keys) => ({
        deleted: keys.filter((k) => k !== "b"),
        failed: [{ key: "b", error: "AccessDenied" }],
      }),
    },
  );
  assert.deepEqual(result.deleted, ["a", "c"]);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0]?.key, "b");
});

test("deleteR2Objects no-ops on empty key list", async () => {
  const result = await deleteR2Objects([]);
  assert.deepEqual(result, { deleted: [], failed: [] });
});

test("deleteR2Objects only receives the provided exact keys", async () => {
  let seen: string[] = [];
  await deleteR2Objects(["owned-a", "owned-b"], {
    deleteMany: async (keys) => {
      seen = keys;
      return { deleted: keys, failed: [] };
    },
  });
  assert.deepEqual(seen, ["owned-a", "owned-b"]);
});
