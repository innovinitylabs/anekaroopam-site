/**
 * Wizard step lists and final-action labels for accession ingestion.
 */

export const LOCAL_WIZARD_STEPS = [
  "Upload",
  "Prepare",
  "Orientation",
  "Metadata",
  "Generate",
  "Publish",
  "Provenance",
] as const;

export const DURABLE_WIZARD_STEPS = [
  "Upload",
  "Prepare",
  "Orientation",
  "Metadata",
  "SEO",
  "Provenance",
  "Visibility",
  "Review",
] as const;

export type LocalWizardStep = (typeof LOCAL_WIZARD_STEPS)[number];
export type DurableWizardStep = (typeof DURABLE_WIZARD_STEPS)[number];
export type WizardStep = LocalWizardStep | DurableWizardStep;

export function wizardStepsForMode(durableStorage: boolean): readonly WizardStep[] {
  return durableStorage ? DURABLE_WIZARD_STEPS : LOCAL_WIZARD_STEPS;
}

export function isFinalVisibleStep(
  steps: readonly string[],
  step: string,
): boolean {
  if (steps.length === 0) return false;
  return steps[steps.length - 1] === step;
}

export function finalCommitLabel(isRevision: boolean): string {
  return isRevision ? "Commit Revision" : "Commit Accession";
}

export function footerPrimaryLabel(input: {
  steps: readonly string[];
  step: string;
  isRevision: boolean;
  completed: boolean;
}): string {
  if (input.completed) return "Done";
  if (isFinalVisibleStep(input.steps, input.step) && input.step === "Review") {
    return finalCommitLabel(input.isRevision);
  }
  if (isFinalVisibleStep(input.steps, input.step)) {
    return "Done";
  }
  return "Next";
}

/** Post-commit destination for the durable wizard Done control. */
export const WIZARD_DONE_HREF = "/admin";

export type FooterPrimaryAction = "commit" | "next" | "done" | "noop";

/**
 * Resolve footer primary click/disabled behavior for the ingestion wizard.
 * Completed durable commits use Done → navigate; never re-commit.
 */
export function resolveFooterPrimaryAction(input: {
  durableStorage: boolean;
  step: string;
  steps: readonly string[];
  commitCompleted: boolean;
  reviewBusy: boolean;
  reviewReady: boolean;
}): { action: FooterPrimaryAction; disabled: boolean } {
  if (input.commitCompleted) {
    return { action: "done", disabled: false };
  }
  if (input.durableStorage && input.step === "Review") {
    return {
      action: "commit",
      disabled: input.reviewBusy || !input.reviewReady,
    };
  }
  if (!isFinalVisibleStep(input.steps, input.step)) {
    return { action: "next", disabled: false };
  }
  return { action: "noop", disabled: true };
}
