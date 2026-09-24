import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DURABLE_WIZARD_STEPS,
  finalCommitLabel,
  footerPrimaryLabel,
  isFinalVisibleStep,
  LOCAL_WIZARD_STEPS,
  resolveFooterPrimaryAction,
  WIZARD_DONE_HREF,
  wizardStepsForMode,
} from "./wizard-steps.ts";

describe("wizard final visible step", () => {
  it("durable mode ends on Review, not Provenance", () => {
    const steps = wizardStepsForMode(true);
    assert.equal(steps[steps.length - 1], "Review");
    assert.equal(isFinalVisibleStep(steps, "Provenance"), false);
    assert.equal(isFinalVisibleStep(steps, "Review"), true);
    assert.equal(
      footerPrimaryLabel({
        steps,
        step: "Provenance",
        isRevision: false,
        completed: false,
      }),
      "Next",
    );
    assert.equal(
      footerPrimaryLabel({
        steps,
        step: "Review",
        isRevision: false,
        completed: false,
      }),
      "Commit Accession",
    );
    assert.equal(
      footerPrimaryLabel({
        steps,
        step: "Review",
        isRevision: true,
        completed: false,
      }),
      "Commit Revision",
    );
  });

  it("local mode still ends on Provenance with Done", () => {
    const steps = wizardStepsForMode(false);
    assert.deepEqual(steps, [...LOCAL_WIZARD_STEPS]);
    assert.equal(isFinalVisibleStep(steps, "Provenance"), true);
    assert.equal(
      footerPrimaryLabel({
        steps,
        step: "Provenance",
        isRevision: false,
        completed: false,
      }),
      "Done",
    );
  });

  it("labels distinguish accession vs revision", () => {
    assert.equal(finalCommitLabel(false), "Commit Accession");
    assert.equal(finalCommitLabel(true), "Commit Revision");
  });

  it("durable step list includes Visibility before Review", () => {
    assert.deepEqual([...DURABLE_WIZARD_STEPS], [
      "Upload",
      "Prepare",
      "Orientation",
      "Metadata",
      "SEO",
      "Provenance",
      "Visibility",
      "Review",
    ]);
  });

  it("completed state enables Done navigation and never re-commits", () => {
    const steps = wizardStepsForMode(true);
    assert.equal(
      footerPrimaryLabel({
        steps,
        step: "Review",
        isRevision: false,
        completed: true,
      }),
      "Done",
    );
    assert.equal(WIZARD_DONE_HREF, "/admin");
    assert.deepEqual(
      resolveFooterPrimaryAction({
        durableStorage: true,
        step: "Review",
        steps,
        commitCompleted: true,
        reviewBusy: true,
        reviewReady: false,
      }),
      { action: "done", disabled: false },
    );
    assert.deepEqual(
      resolveFooterPrimaryAction({
        durableStorage: true,
        step: "Review",
        steps,
        commitCompleted: false,
        reviewBusy: false,
        reviewReady: true,
      }),
      { action: "commit", disabled: false },
    );
  });
});
