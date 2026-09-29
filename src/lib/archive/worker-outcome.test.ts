import assert from "node:assert/strict";
import test from "node:test";
import { ArchiveWorkerError } from "./worker-client.ts";
import {
  classifyWorkerError,
  isWorkerInfrastructureFailure,
} from "./worker-outcome.ts";

test("404 is not infrastructure failure", () => {
  const outcome = classifyWorkerError(new ArchiveWorkerError(404, "missing"));
  assert.equal(outcome.kind, "not_found");
  assert.equal(isWorkerInfrastructureFailure(new ArchiveWorkerError(404, "x")), false);
});

test("502/503/504 and network errors allow fallback", () => {
  assert.equal(
    classifyWorkerError(new ArchiveWorkerError(503, "down")).kind,
    "unavailable",
  );
  assert.equal(
    classifyWorkerError(new TypeError("fetch failed")).kind,
    "unavailable",
  );
  assert.equal(isWorkerInfrastructureFailure(new ArchiveWorkerError(502, "bad")), true);
});
