import assert from "node:assert/strict";
import test from "node:test";
import { buildStoreZip } from "./zip-store.ts";

test("buildStoreZip produces a recognizable ZIP with stored files", () => {
  const zip = buildStoreZip([
    { path: "perception.html", data: Buffer.from("<html>ok</html>") },
    { path: "metadata.json", data: Buffer.from('{"a":1}') },
  ]);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.ok(zip.includes(Buffer.from("perception.html")));
  assert.ok(zip.includes(Buffer.from("<html>ok</html>")));
  assert.ok(zip.includes(Buffer.from("metadata.json")));
  // End of central directory signature
  const endSig = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  assert.ok(zip.includes(endSig));
});
