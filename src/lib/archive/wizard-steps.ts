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
